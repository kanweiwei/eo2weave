/**
 * Cross-context advisory lock for WebMCP package operations (issue #117).
 *
 * Package transactions — install, uninstall, enable/disable — must run one
 * at a time per package id across EVERY context that can mutate the mount:
 * the settings page (through the provider bridge), the extension management
 * page and the background service worker. A module-local mutex only
 * serializes within one JS context, so an install in the settings tab and
 * an uninstall in the background could interleave and leave a torn package
 * behind.
 *
 * The lock lives in `chrome.storage.local` (visible to every extension
 * context) and uses a lease-and-heartbeat protocol:
 *
 *   1. Acquire writes `{ owner, expiresAt }` for the package id when no
 *      live lease exists; a stale lease (expired heartbeat) is stolen.
 *   2. The holder heartbeats the `expiresAt` forward while it works, so a
 *      crashed context's lease is detectably dead instead of blocking
 *      everyone forever.
 *   3. Release clears the key only when the caller still owns it — a lock
 *      that was stolen mid-transaction is never released by its loser.
 *
 * `chrome.storage.local` reads/writes are individually atomic, and acquire
 * retries on conflict with jittered backoff. The residual race window (two
 * acquirers read the same free slot between get and set) is closed by the
 * read-back verification: the last writer owns the lease, the loser retries.
 */

export { USER_PACKAGE_LOCK_KEY_PREFIX } from './package-lock-protocol'

import { USER_PACKAGE_LOCK_KEY_PREFIX } from './package-lock-protocol'

/** A lease must be heartbeated at least this often to stay alive. */
export const PACKAGE_LOCK_LEASE_TTL_MS = 15_000
const HEARTBEAT_INTERVAL_MS = 5_000
/** Conflict backoff bounds (jittered in between). */
const RETRY_MIN_MS = 40
const RETRY_MAX_MS = 200
/** Give up acquiring after this long — the operation fails with EBUSY. */
const ACQUIRE_TIMEOUT_MS = 30_000

interface LockLease {
  owner: string
  expiresAt: number
}

function lockKey(packageId: string): string {
  return `${USER_PACKAGE_LOCK_KEY_PREFIX}${packageId}`
}

function randomOwner(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `lock_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function readLease(raw: unknown): LockLease | null {
  if (
    typeof raw === 'object' && raw !== null &&
    typeof (raw as LockLease).owner === 'string' &&
    typeof (raw as LockLease).expiresAt === 'number'
  ) {
    return raw as LockLease
  }
  return null
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Low-level acquire: returns the owner token, or null on timeout. */
async function acquireLease(packageId: string, timeoutMs: number = ACQUIRE_TIMEOUT_MS): Promise<string | null> {
  const owner = randomOwner()
  const key = lockKey(packageId)
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const stored = await chrome.storage.local.get(key)
    const existing = readLease(stored[key])
    if (!existing || existing.expiresAt <= Date.now()) {
      await chrome.storage.local.set({ [key]: { owner, expiresAt: Date.now() + PACKAGE_LOCK_LEASE_TTL_MS } satisfies LockLease })
      // Read-back: the last writer wins; if we are not the owner any more,
      // another acquirer overwrote us and we must wait for it instead.
      const verify = readLease((await chrome.storage.local.get(key))[key])
      if (verify?.owner === owner) return owner
    }
    if (Date.now() > deadline) return null
    await delay(RETRY_MIN_MS + Math.random() * (RETRY_MAX_MS - RETRY_MIN_MS))
  }
}

/** Extend OUR lease (heartbeat). Never resurrects a stolen lease. */
async function heartbeatLease(packageId: string, owner: string): Promise<void> {
  const key = lockKey(packageId)
  const stored = readLease((await chrome.storage.local.get(key))[key])
  if (stored?.owner === owner) {
    await chrome.storage.local.set({ [key]: { owner, expiresAt: Date.now() + PACKAGE_LOCK_LEASE_TTL_MS } satisfies LockLease })
  }
}

/** Release the lease only if we still own it. */
async function releaseLease(packageId: string, owner: string): Promise<void> {
  const key = lockKey(packageId)
  try {
    const stored = readLease((await chrome.storage.local.get(key))[key])
    if (stored?.owner === owner) await chrome.storage.local.remove(key)
  } catch {
    // A leftover lease expires on its own via the TTL.
  }
}

/** Run `fn` while holding the cross-context lock for one package id. */
export async function withPackageLock<T>(packageId: string, fn: () => Promise<T>): Promise<T> {
  const owner = await acquireLease(packageId)
  if (owner === null) {
    throw Object.assign(new Error(`Package ${packageId} is busy: another operation is in progress`), { code: 'EBUSY' })
  }
  const heartbeat = setInterval(() => {
    void heartbeatLease(packageId, owner).catch(() => {
      // Storage hiccups are tolerated; a missed heartbeat can let the lease
      // expire, which releases the lock (fail-safe direction).
    })
  }, HEARTBEAT_INTERVAL_MS)
  try {
    return await fn()
  } finally {
    clearInterval(heartbeat)
    await releaseLease(packageId, owner)
  }
}

/**
 * Bridge-side lease used by pages that cannot touch chrome.storage
 * themselves (the settings page talks to the extension through the
 * content-script relay): acquire returns an owner token, and the page
 * heartbeats and releases with it. The token is unguessable (crypto UUID),
 * so another page cannot release or extend someone else's lease.
 */

/** Acquire on behalf of a bridge caller. Returns the owner token. */
export async function bridgeAcquirePackageLock(packageId: string, timeoutMs?: number): Promise<{ ok: boolean; owner?: string; code?: string }> {
  const owner = await acquireLease(packageId, timeoutMs)
  return owner === null ? { ok: false, code: 'EBUSY' } : { ok: true, owner }
}

/** Heartbeat a bridge-held lease. */
export async function bridgeHeartbeatPackageLock(packageId: string, owner: string): Promise<{ ok: boolean }> {
  await heartbeatLease(packageId, owner)
  return { ok: true }
}

/** Release a bridge-held lease (owner-verified). */
export async function bridgeReleasePackageLock(packageId: string, owner: string): Promise<{ ok: boolean }> {
  await releaseLease(packageId, owner)
  return { ok: true }
}
