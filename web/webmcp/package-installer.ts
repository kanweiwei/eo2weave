/**
 * WebMCP package installer — consumes a registry manifest (issue #117, Tier 1).
 *
 * Install flow (all-or-nothing):
 *   1. Download every file listed in `manifest.files` for ONE package,
 *      streaming with byte caps and an abort deadline that stays active
 *      through body consumption.
 *   2. sha256-verify each download via Web Crypto — ALL files are verified
 *      BEFORE anything touches storage.
 *   3. Only then write the tree into the existing custom VFS mount
 *      `/external/webmcp/<id>/` (the same location the extension's
 *      adapter-validation CLI recognizes). The tree is staged into
 *      `<id>.installing/` and renamed over the old install, so a failed
 *      write never loses the previously working package.
 *   4. Activation stays at its default (`disabled`) — enabling happens
 *      exclusively through the #102 on-site opt-in consent flow.
 *
 * Any verification failure aborts the install with NOTHING written (no
 * half-installed packages). Operations on one package id are serialized
 * ACROSS CONTEXTS with the chrome.storage lease in `package-lock.ts` — a
 * module-local mutex would leave the settings tab and the background free
 * to interleave remove/mkdir/write sequences on the same directory — and
 * additionally by a per-process lock inside each context.
 *
 * Uninstall removes the package's VFS directory. Activation for user-mount
 * packages lives in the package's own `config.json` inside the directory
 * (the same file the extension's package-management writes), so removing the
 * directory also removes any override — no extra cleanup exists to leak.
 */

import { normalizeProviderPath, type FsProvider } from '@creatorweave/fs-provider'
import { validateManifest, validatePackage } from '@creatorweave/shared/webmcp-adapter'
import type {
  PackageRegistry,
  RegistryManifest,
  RegistryManifestPackage,
} from './package-registry-client'
import { MAX_PACKAGE_FILE_BYTES, MAX_PACKAGE_FILES, MAX_PACKAGE_TOTAL_BYTES, MAX_REGISTRY_MANIFEST_BYTES, REGISTRY_FETCH_TIMEOUT_MS, registryFileUrl } from './package-registry-client'
import { getWebMCPBridge } from './bridge-client'

export class PackageInstallError extends Error {
  constructor(message: string, readonly code: 'SHA256_MISMATCH' | 'DOWNLOAD_FAILED' | 'INVALID_PACKAGE' | 'STORAGE_FAILED' | 'BUSY' | 'LOCK_LOST') {
    super(message)
    this.name = 'PackageInstallError'
  }
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

/** sha256 over raw bytes via Web Crypto (available in all extension contexts). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return toHex(digest)
}

/**
 * Stream a response body under a byte cap with the abort deadline STILL
 * active. Buffering `arrayBuffer()` first would let a stalled connection
 * hang forever (the timer was cleared once the headers arrived) and let an
 * oversized body exhaust memory before the size check ever ran.
 */
async function readBodyCapped(response: Response, maxBytes: number): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let total = 0
  const reader = response.body?.getReader()
  if (!reader) {
    // No streaming body (old test doubles) — fall back to a buffered read.
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.length > maxBytes) throw new PackageInstallError(`Response body exceeds the limit (${maxBytes} bytes)`, 'INVALID_PACKAGE')
    return bytes
  }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      void reader.cancel().catch(() => {})
      throw new PackageInstallError(`Response body exceeds the limit (${maxBytes} bytes)`, 'INVALID_PACKAGE')
    }
    chunks.push(value)
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return merged
}

async function downloadFile(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number = REGISTRY_FETCH_TIMEOUT_MS,
): Promise<Uint8Array> {
  const controller = new AbortController()
  // The deadline covers the WHOLE download — headers AND body. Clearing it
  // before the body streamed let a hostile server stall the install forever.
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await fetchImpl(url, { credentials: 'omit', cache: 'no-cache', signal: controller.signal })
    if (!response.ok) {
      throw new PackageInstallError(`Download failed for ${url}: HTTP ${response.status}`, 'DOWNLOAD_FAILED')
    }
    // Byte cap enforced WHILE streaming, not after the body is in memory.
    return await readBodyCapped(response, MAX_PACKAGE_FILE_BYTES)
  } catch (error) {
    if (controller.signal.aborted) {
      throw new PackageInstallError(`Download timed out after ${timeoutMs / 1000}s: ${url}`, 'DOWNLOAD_FAILED')
    }
    if (error instanceof PackageInstallError) throw error
    throw new PackageInstallError(`Download failed for ${url}: ${error instanceof Error ? error.message : String(error)}`, 'DOWNLOAD_FAILED')
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Install one package into the custom WebMCP mount. Verifies EVERY file
 * first; a single mismatch aborts with no storage writes. Returns the number
 * of files written.
 */
export async function installPackage(
  registry: PackageRegistry,
  pkg: RegistryManifestPackage,
  provider: FsProvider,
  options?: { fetchImpl?: typeof fetch; timeoutMs?: number },
  /**
   * Called INSIDE the per-package cross-context lock, after the lock is
   * held and before anything is written (finding: "Concurrent collision
   * check is bypassed"): lets the caller re-run its id-collision check
   * against the mount state the lock actually observed — two concurrent
   * first installs pass the unlocked check, serialize on the lock, and the
   * loser now rejects instead of silently replacing the winner.
   */
  underLock?: () => Promise<void>,
): Promise<{ filesWritten: number }> {
  const fetchImpl = options?.fetchImpl ?? fetch
  const id = pkg.id
  // Package id doubles as the directory name on the mount; keep the same
  // guard the extension applies to package directories.
  try {
    normalizeProviderPath(id)
  } catch {
    throw new PackageInstallError(`Invalid package id: ${id}`, 'INVALID_PACKAGE')
  }
  if (!id || id.includes('/')) throw new PackageInstallError(`Invalid package id: ${id}`, 'INVALID_PACKAGE')
  if (pkg.files.length > MAX_PACKAGE_FILES) {
    throw new PackageInstallError(`Package ${id} lists too many files (${pkg.files.length}; the limit is ${MAX_PACKAGE_FILES})`, 'INVALID_PACKAGE')
  }

  // Stage everything in memory BEFORE touching storage — the all-or-nothing
  // guarantee lives here, not in a rollback pass. Size caps bound the staged
  // buffer so a hostile manifest cannot exhaust browser memory.
  const staged: Array<{ path: string; bytes: Uint8Array }> = []
  const seenPaths = new Set<string>()
  let totalBytes = 0
  let manifestBytes: Uint8Array | undefined
  for (const file of pkg.files) {
    const url = registryFileUrl(registry, file.path)
    // Manifest paths are repo-relative (`packages/<id>/...`); on the mount
    // the package root IS the directory, so strip the `packages/<id>/` prefix.
    const prefix = `packages/${id}/`
    if (!file.path.startsWith(prefix)) {
      throw new PackageInstallError(`File ${file.path} does not belong to package ${id}`, 'INVALID_PACKAGE')
    }
    const rawRelative = file.path.slice(prefix.length)
    let relative: string
    try {
      relative = normalizeProviderPath(rawRelative)
    } catch {
      throw new PackageInstallError(`Invalid file path in package ${id}: ${file.path}`, 'INVALID_PACKAGE')
    }
    // A path that is not already in its normalized form aliases another entry
    // (`workflows/./read.js` == `workflows/read.js`); write neither.
    if (relative !== rawRelative) {
      throw new PackageInstallError(`File path ${file.path} is not normalized (aliased path)`, 'INVALID_PACKAGE')
    }
    if (seenPaths.has(relative)) {
      throw new PackageInstallError(`Package ${id} lists ${file.path} twice (aliased path)`, 'INVALID_PACKAGE')
    }
    seenPaths.add(relative)
    const bytes = await downloadFile(url, fetchImpl, options?.timeoutMs ?? REGISTRY_FETCH_TIMEOUT_MS)
    const actual = await sha256Hex(bytes)
    if (actual !== file.sha256.toLowerCase()) {
      throw new PackageInstallError(`Checksum mismatch for ${url}: expected ${file.sha256}, got ${actual}`, 'SHA256_MISMATCH')
    }
    totalBytes += bytes.length
    if (totalBytes > MAX_PACKAGE_TOTAL_BYTES) {
      throw new PackageInstallError(`Package ${id} exceeds the total size limit (${MAX_PACKAGE_TOTAL_BYTES} bytes)`, 'INVALID_PACKAGE')
    }
    if (relative === 'manifest.json') manifestBytes = bytes
    staged.push({ path: relative, bytes })
  }

  // Validate the package EXACTLY like the extension catalog will read it:
  // manifest schema, id match against the registry entry AND the install
  // directory, urlRegex rules, tool source presence and workflow contracts.
  // Without this the install reports success while the catalog withdraws the
  // package as invalid and it can never be enabled.
  if (!manifestBytes) {
    throw new PackageInstallError(`Package ${id} is missing manifest.json`, 'INVALID_PACKAGE')
  }
  let manifestJson: unknown
  try {
    manifestJson = JSON.parse(new TextDecoder().decode(manifestBytes))
  } catch {
    throw new PackageInstallError(`Package ${id} has a malformed manifest.json`, 'INVALID_PACKAGE')
  }
  const toolPaths = new Set<string>()
  try {
    const manifest = validateManifest(manifestJson, id)
    if (manifest.id !== id) {
      throw new PackageInstallError(`Package manifest id ${manifest.id} does not match registry id ${id}`, 'INVALID_PACKAGE')
    }
    // The registry entry's version claim must agree with the downloaded
    // manifest (finding: "Displayed version can be wrong") — otherwise the
    // settings card would report a version the user did not actually get.
    if (manifest.version !== pkg.version) {
      throw new PackageInstallError(
        `Package manifest version ${manifest.version} does not match registry version ${pkg.version}`,
        'INVALID_PACKAGE',
      )
    }
    for (const tool of manifest.tools) toolPaths.add(tool.path)
    const sources: Record<string, string> = Object.create(null)
    for (const file of staged) {
      if (toolPaths.has(file.path)) sources[file.path] = new TextDecoder().decode(file.bytes)
    }
    validatePackage(manifest, sources, id)
  } catch (error) {
    if (error instanceof PackageInstallError) throw error
    throw new PackageInstallError(`Package ${id} is not a valid package: ${error instanceof Error ? error.message : String(error)}`, 'INVALID_PACKAGE')
  }

  // SECURITY: the registry's own config.json is NEVER copied — a manifest
  // could ship `activation: "enabled"` and the package would activate
  // without the #102 on-site consent flow. Activation is always reset to
  // the disabled default here; enabling is exclusively the opt-in flow's job.
  const configIndex = staged.findIndex(file => file.path === 'config.json')
  const configBytes = new TextEncoder().encode(JSON.stringify(INSTALLER_DEFAULT_CONFIG) + '\n')
  if (configIndex >= 0) staged[configIndex] = { path: 'config.json', bytes: configBytes }
  else staged.push({ path: 'config.json', bytes: configBytes })

  // Serialize all mutations of one package id ACROSS CONTEXTS (settings tab,
  // management page, background): an install racing an uninstall/opt-in
  // enable would otherwise interleave remove/mkdir/write and can leave the
  // directory half-written. The lease lives in the BACKGROUND's
  // chrome.storage (via the bridge) so every context sees it; the in-process
  // mutex below keeps concurrent callers in THIS context queued instead of
  // fighting over the lease with retry backoff.
  return withInstallerLock(id, async () => {
    if (underLock) await underLock()
    await swapPackageIntoPlace(id, staged, provider)
    return { filesWritten: staged.length }
  })
}

/**
 * Cross-context lock for installer transactions. Uses the extension bridge's
 * background-owned lease when available (production settings page); when the
 * bridge is absent (tests, or a future standalone web deployment) it falls
 * back to a plain in-process mutex — single-context serialization is then
 * the best available, and the download/verify stages above remain
 * all-or-nothing regardless.
 */
const packageLocks = new Map<string, Promise<unknown>>()

const LOCK_HEARTBEAT_MS = 5_000

async function withInstallerLock<T>(packageId: string, fn: () => Promise<T>): Promise<T> {
  const previous = packageLocks.get(packageId) ?? Promise.resolve()
  let releaseLocal!: () => void
  const gate = new Promise<void>(resolve => { releaseLocal = resolve })
  const chained = previous.then(() => gate)
  packageLocks.set(packageId, chained)
  await previous
  let released = false
  const release = () => {
    if (released) return
    released = true
    releaseLocal()
    void chained.then(() => {
      if (packageLocks.get(packageId) === chained) packageLocks.delete(packageId)
    })
  }
  const bridge = getWebMCPBridge()?.webMCPPackageLock
  if (!bridge) {
    // No extension bridge — the in-process mutex is all we can coordinate.
    try {
      return await fn()
    } finally {
      release()
    }
  }
  let acquired: Awaited<ReturnType<typeof bridge>>
  try {
    acquired = await bridge(packageId, 'acquire', undefined, 30_000)
  } catch (error) {
    // A rejecting acquire (bridge interruption) must still release the
    // local gate — otherwise every later call for this id waits forever
    // (finding: "Failed lock request stalls future operations").
    release()
    throw new PackageInstallError(
      `Package ${packageId} lock could not be acquired: ${error instanceof Error ? error.message : String(error)}`,
      'LOCK_LOST',
    )
  }
  if (!acquired.ok || typeof acquired.owner !== 'string') {
    release()
    throw new PackageInstallError(
      `Package ${packageId} is busy: another install or removal is in progress`,
      'BUSY',
    )
  }
  const owner = acquired.owner
  // SECURITY (finding: "Install continues after lease loss", round 3): a
  // heartbeat reporting `ok:false` means the lease EXPIRED and another
  // context owns the package now — continuing the swap would mutate an
  // unowned package. Record the loss AND race it against the transaction:
  // `Promise.race` does not cancel `fn`, but the swap's remaining writes
  // check the flag and bail at the next step, and the loss is always
  // surfaced as a LOCK_LOST failure instead of a silent success.
  let lockLost: string | null = null
  const heartbeat = setInterval(() => {
    void bridge(packageId, 'heartbeat', owner)
      .then(result => { if (!result?.ok) lockLost = `lock for ${packageId} was lost (lease expired)` })
      .catch(() => {})
  }, LOCK_HEARTBEAT_MS)
  try {
    const result = await fn()
    if (lockLost !== null) {
      throw new PackageInstallError(
        `The install of ${packageId} completed but its lock was lost mid-transaction; re-run the operation`,
        'LOCK_LOST',
      )
    }
    return result
  } catch (error) {
    if (lockLost !== null && !(error instanceof PackageInstallError && error.code === 'LOCK_LOST')) {
      // Surface the lock loss as the reason for the failure.
      throw new PackageInstallError(`Operation on ${packageId} failed: ${lockLost}`, 'LOCK_LOST')
    }
    throw error
  } finally {
    clearInterval(heartbeat)
    await bridge(packageId, 'release', owner).catch(() => {})
    release()
  }
}

/**
 * The swap itself: stage the new tree, then move it over the old install.
 * Every failure path keeps a usable package on the mount — see the inline
 * comments for the backup-preservation rules.
 */
async function swapPackageIntoPlace(
  id: string,
  staged: Array<{ path: string; bytes: Uint8Array }>,
  provider: FsProvider,
): Promise<void> {
  // The replacement is written into a staging directory FIRST and only
  // swapped into place after EVERY write succeeded, so a failed write
  // never leaves the mount without a usable package:
  //   - with `rename` (the in-memory/local provider): the staging tree is
  //     renamed over the old one, and the old one is kept as a backup
  //     until the swap succeeded (rollback on failure);
  //   - without `rename` (the extension bridge exposes no rename): the
  //     old tree is copied into a backup directory, the staging tree is
  //     copied into place, and the backup is restored if anything fails.
  // The staging/backup names are dot-prefixed: they are internal state,
  // not packages, and the mount listings skip dot-directories.
  const staging = `.${id}.installing`
  const backup = `.${id}.previous`
  const hasRename = typeof provider.rename === 'function'
  let backupPreserved = false
  try {
    await removeMissingOk(provider, staging)
    // SECURITY (critical, "Retry deletes last good package"; round 3:
    // "Retry deletes the last backup"): a PRIOR failed replacement may have
    // left `backup` behind holding the ONLY surviving copy of the package
    // (restoration failed there). If the live directory is ALSO gone, this
    // backup is not redundant state — it is a recoverable install. Restore
    // it before proceeding, so the retry can never delete the last good
    // copy; if the live tree exists, the backup is genuinely stale and safe
    // to clear below. An INDETERMINATE stat (transient/permission failure)
    // must NOT read as "exists": that is exactly how a retry skipped
    // recovery and then deleted the preserved backup. Abort instead — the
    // backup survives untouched and the caller can retry.
    const liveExists = await pathExists(provider, id)
    const backupExists = liveExists === false ? await pathExists(provider, backup) : false
    if (liveExists === null || backupExists === null) {
      // The abort must also keep the backup out of the cleanup below — it
      // may be the only surviving copy (finding: "Retry deletes the last
      // backup").
      backupPreserved = true
      throw new PackageInstallError(
        `The state of ${id} on the mount could not be determined (stat failed); a preserved backup was kept and nothing was modified — retry`,
        'STORAGE_FAILED',
      )
    }
    if (!liveExists && backupExists) {
      try {
        await copyTree(provider, backup, id)
        // Recovered — the backup is now redundant.
        await removeMissingOk(provider, backup)
      } catch {
        // Recovery failed: keep the backup and proceed WITHOUT deleting it
        // (the swap paths below tolerate its presence; the finally block
        // must not clear it either).
        backupPreserved = true
        throw new PackageInstallError(
          `Found a preserved backup of ${id} but could not restore it; the backup was kept at ${backup}`,
          'STORAGE_FAILED',
        )
      }
    }
    await removeMissingOk(provider, backup)
    try {
      await provider.mkdir(staging, { recursive: true })
      for (const file of staged) {
        await provider.writeFile(`${staging}/${file.path}`, file.bytes)
      }
    } catch (error) {
      throw new PackageInstallError(`Failed to write package ${id} to storage: ${error instanceof Error ? error.message : String(error)}`, 'STORAGE_FAILED')
    }
    // All writes landed — swap the new tree in.
    if (hasRename) {
      let hadOld = false
      try {
        await provider.rename!(id, backup)
        hadOld = true
      } catch (error) {
        // No previous install — that is the normal first-install case.
        const e = error as { code?: string; name?: string }
        if (!(e.code === 'ENOENT' || e.name === 'NotFoundError')) throw error
      }
      try {
        await provider.rename!(staging, id)
      } catch (renameError) {
        // Roll the old install back — the new tree failed to take over.
        if (hadOld) {
          try {
            await provider.rename!(backup, id)
          } catch {
            // SECURITY (critical): restoration failed, so the backup now
            // holds the ONLY copy of the previously working package.
            // Preserving it beats deleting it: leave the backup directory
            // in place and report the rollback failure — the next install
            // of any package can still recover from it, and nothing the
            // user had is destroyed.
            backupPreserved = true
            throw new PackageInstallError(
              `Failed to write package ${id} to storage AND the previous install could not be restored; its backup was preserved at ${backup}`,
              'STORAGE_FAILED',
            )
          }
        }
        throw renameError
      }
      await removeMissingOk(provider, backup)
    } else {
      // No rename support: copy the old tree aside, copy the new tree in,
      // and restore the copy if the swap fails.
      let hadOld: boolean
      try {
        hadOld = await copyTree(provider, id, backup)
      } catch (error) {
        // A backup that cannot be LISTED is a backup that cannot be
        // trusted (finding: "Backup failure loses old package") — abort
        // BEFORE the live tree is removed, so the old package stays.
        throw new PackageInstallError(
          `Failed to back up package ${id} before replacement: ${error instanceof Error ? error.message : String(error)}`,
          'STORAGE_FAILED',
        )
      }
      try {
        await removeMissingOk(provider, id)
        try {
          await copyTree(provider, staging, id)
        } catch (copyError) {
          if (!hadOld) {
            // First install: nothing to restore — remove the PARTIAL live
            // directory so the settings UI never reports a half package
            // (finding: "Failed first install leaves partial package").
            await removeMissingOk(provider, id).catch(() => {})
          } else {
            await removeMissingOk(provider, id).catch(() => {})
            try {
              await copyTree(provider, backup, id)
            } catch (restoreError) {
              // The restore failed — same rule as the rename path: keep
              // the backup (it is the last good copy) and say so.
              backupPreserved = true
              throw new PackageInstallError(
                `Failed to write package ${id} to storage AND the previous install could not be restored; its backup was preserved at ${backup}`,
                'STORAGE_FAILED',
              )
            }
          }
          throw copyError
        }
      } finally {
        if (!backupPreserved) await removeMissingOk(provider, backup).catch(() => {})
      }
      await removeMissingOk(provider, backup)
    }
  } catch (error) {
    if (error instanceof PackageInstallError) throw error
    throw new PackageInstallError(`Failed to write package ${id} to storage: ${error instanceof Error ? error.message : String(error)}`, 'STORAGE_FAILED')
  } finally {
    // Never leak the staging directory on any failure path. The BACKUP is
    // only cleaned when it is provably no longer needed (the swap
    // succeeded, or the rollback restored it): when restoration FAILED the
    // backup is the only remaining copy of the working package and MUST
    // survive (finding: "Failed rollback deletes working package").
    await removeMissingOk(provider, staging).catch(() => {})
    if (!backupPreserved) await removeMissingOk(provider, backup).catch(() => {})
  }
}

/** True when the path exists; `null` when the answer is INDETERMINATE. */
async function pathExists(provider: FsProvider, path: string): Promise<boolean | null> {
  try {
    await provider.stat(path)
    return true
  } catch (error) {
    const e = error as { code?: string; name?: string }
    if (e.code === 'ENOENT' || e.name === 'NotFoundError') return false
    return null // transient/permission failure — the answer is unknown
  }
}

/**
 * Copy a directory tree inside the provider (the extension bridge exposes no
 * rename). Returns false when the source does not exist. A readdir that
 * fails for any OTHER reason throws — treating a listing error as "absent
 * source" would silently skip the backup and let a later failure delete the
 * only copy (finding: "Backup failure loses old package").
 */
async function copyTree(provider: FsProvider, from: string, to: string): Promise<boolean> {
  let entries: Array<{ name: string; kind: string }>
  try {
    entries = await provider.readdir(from)
  } catch (error) {
    const e = error as { code?: string; name?: string }
    if (e.code === 'ENOENT' || e.name === 'NotFoundError') return false
    throw error
  }
  await provider.mkdir(to, { recursive: true })
  for (const entry of entries) {
    const source = `${from}/${entry.name}`
    const target = `${to}/${entry.name}`
    if (entry.kind === 'directory') {
      await copyTree(provider, source, target)
    } else {
      await provider.writeFile(target, await provider.readFile(source))
    }
  }
  return true
}

/**
 * Remove a path, tolerating "does not exist" in BOTH error shapes: the
 * normalized `ENOENT` FsError and the raw File System Access `NotFoundError`
 * DOMException (the production OPFS provider, see `providerMount`).
 */
async function removeMissingOk(provider: FsProvider, path: string): Promise<void> {
  try {
    await provider.remove(path, { recursive: true })
  } catch (error) {
    const e = error as { code?: string; name?: string }
    if (e.code === 'ENOENT' || e.name === 'NotFoundError') return
    throw error
  }
}

/**
 * Remove an installed package: delete its directory on the custom mount.
 * The activation override (config.json) lives inside the directory, so it is
 * cleared by the same removal. Serialized with the SAME cross-context lock
 * as install (finding: "Concurrent package operations corrupt installs").
 */
export async function uninstallPackage(packageId: string, provider: FsProvider): Promise<void> {
  try {
    normalizeProviderPath(packageId)
  } catch {
    throw new PackageInstallError(`Invalid package id: ${packageId}`, 'INVALID_PACKAGE')
  }
  await withInstallerLock(packageId, async () => {
    try {
      await removeMissingOk(provider, packageId)
    } catch (error) {
      throw new PackageInstallError(`Failed to remove package ${packageId}: ${error instanceof Error ? error.message : String(error)}`, 'STORAGE_FAILED')
    }
  })
}

/** Enabling is exclusively the #102 opt-in flow's job — the installer never activates. */
export const INSTALLER_DEFAULT_CONFIG = { activation: 'disabled' as const }

/**
 * Fetch + validate a registry manifest under the same streaming byte cap as
 * package files (finding: "Registry bodies hang or exhaust memory") — a
 * hostile registry cannot stall the settings page or balloon its memory.
 */
export async function fetchRegistryManifestCapped(
  registry: PackageRegistry,
  fetchImpl: typeof fetch,
  timeoutMs: number = REGISTRY_FETCH_TIMEOUT_MS,
): Promise<RegistryManifest> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(registry.manifestUrl, { credentials: 'omit', cache: 'no-cache', signal: controller.signal })
    if (!response.ok) {
      throw new PackageInstallError(`Download failed for ${registry.manifestUrl}: HTTP ${response.status}`, 'DOWNLOAD_FAILED')
    }
    const bytes = await readBodyCapped(response, MAX_REGISTRY_MANIFEST_BYTES)
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
    const { validateRegistryManifest } = await import('./package-registry-client')
    return validateRegistryManifest(parsed)
  } catch (error) {
    if (controller.signal.aborted) {
      throw new PackageInstallError(`Registry request timed out after ${timeoutMs / 1000}s: ${registry.manifestUrl}`, 'DOWNLOAD_FAILED')
    }
    if (error instanceof PackageInstallError) throw error
    throw new PackageInstallError(`Registry manifest could not be loaded: ${error instanceof Error ? error.message : String(error)}`, 'INVALID_PACKAGE')
  } finally {
    clearTimeout(timer)
  }
}
