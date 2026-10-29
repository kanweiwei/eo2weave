/**
 * WebMCP package installer — consumes a registry manifest (issue #117, Tier 1).
 *
 * Install flow (all-or-nothing):
 *   1. Download every file listed in `manifest.files` for ONE package.
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
 * with a per-package lock so overlapping install/uninstall calls cannot
 * interleave storage mutations.
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
  RegistryManifestPackage,
} from './package-registry-client'
import { MAX_PACKAGE_FILE_BYTES, MAX_PACKAGE_FILES, MAX_PACKAGE_TOTAL_BYTES, REGISTRY_FETCH_TIMEOUT_MS, registryFileUrl } from './package-registry-client'

export class PackageInstallError extends Error {
  constructor(message: string, readonly code: 'SHA256_MISMATCH' | 'DOWNLOAD_FAILED' | 'INVALID_PACKAGE' | 'STORAGE_FAILED') {
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

async function downloadFile(
  url: string,
  expectedSha256: string,
  fetchImpl: typeof fetch,
  timeoutMs: number = REGISTRY_FETCH_TIMEOUT_MS,
): Promise<Uint8Array> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await fetchImpl(url, { credentials: 'omit', cache: 'no-cache', signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new PackageInstallError(`Download timed out after ${REGISTRY_FETCH_TIMEOUT_MS / 1000}s: ${url}`, 'DOWNLOAD_FAILED')
    }
    throw new PackageInstallError(`Download failed for ${url}: ${error instanceof Error ? error.message : String(error)}`, 'DOWNLOAD_FAILED')
  } finally {
    clearTimeout(timer)
  }
  if (!response.ok) {
    throw new PackageInstallError(`Download failed for ${url}: HTTP ${response.status}`, 'DOWNLOAD_FAILED')
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.length > MAX_PACKAGE_FILE_BYTES) {
    throw new PackageInstallError(`File ${url} is too large (${bytes.length} bytes; the limit is ${MAX_PACKAGE_FILE_BYTES})`, 'INVALID_PACKAGE')
  }
  const actual = await sha256Hex(bytes)
  if (actual !== expectedSha256.toLowerCase()) {
    throw new PackageInstallError(`Checksum mismatch for ${url}: expected ${expectedSha256}, got ${actual}`, 'SHA256_MISMATCH')
  }
  return bytes
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
    const bytes = await downloadFile(url, file.sha256, fetchImpl, options?.timeoutMs ?? REGISTRY_FETCH_TIMEOUT_MS)
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

  // Serialize all mutations of one package id: an install racing an
  // uninstall/opt-in enable would otherwise interleave remove/mkdir/write
  // and can leave the directory half-written. The lock is per process
  // (settings tab / background worker); cross-context races are already
  // serialized extension-side by the provider handler's mutation queue.
  const release = await acquirePackageLock(id)
  try {
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
    try {
      await removeMissingOk(provider, staging)
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
        try {
          await provider.rename!(id, backup)
        } catch (error) {
          // No previous install — that is the normal first-install case.
          const e = error as { code?: string; name?: string }
          if (!(e.code === 'ENOENT' || e.name === 'NotFoundError')) throw error
        }
        try {
          await provider.rename!(staging, id)
        } catch (renameError) {
          // Roll the old install back — the new tree failed to take over.
          try { await provider.rename!(backup, id) } catch { /* both failed; report the original */ }
          throw renameError
        }
        await removeMissingOk(provider, backup)
      } else {
        // No rename support: copy the old tree aside, copy the new tree in,
        // and restore the copy if the swap fails.
        const hadOld = await copyTree(provider, id, backup)
        try {
          await removeMissingOk(provider, id)
          await copyTree(provider, staging, id)
        } catch (swapError) {
          if (hadOld) {
            await removeMissingOk(provider, id).catch(() => {})
            await copyTree(provider, backup, id).catch(() => {})
          }
          throw swapError
        }
        await removeMissingOk(provider, backup)
      }
    } catch (error) {
      if (error instanceof PackageInstallError) throw error
      throw new PackageInstallError(`Failed to write package ${id} to storage: ${error instanceof Error ? error.message : String(error)}`, 'STORAGE_FAILED')
    } finally {
      // Never leak the staging or backup directories on any failure path.
      await removeMissingOk(provider, staging).catch(() => {})
      await removeMissingOk(provider, backup).catch(() => {})
    }
  } finally {
    release()
  }
  return { filesWritten: staged.length }
}

/**
 * Copy a directory tree inside the provider (the extension bridge exposes no
 * rename). Returns false when the source does not exist.
 */
async function copyTree(provider: FsProvider, from: string, to: string): Promise<boolean> {
  let entries: Array<{ name: string; kind: string }>
  try {
    entries = await provider.readdir(from)
  } catch {
    return false
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
 * Per-package operation locks. Installs, uninstalls and activation writes
 * for the same package id are serialized so overlapping operations cannot
 * interleave directory removal and file writes.
 */
const packageLocks = new Map<string, Promise<unknown>>()

async function acquirePackageLock(id: string): Promise<() => void> {
  const previous = packageLocks.get(id) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const chained = previous.then(() => gate)
  packageLocks.set(id, chained)
  await previous
  let released = false
  return () => {
    if (released) return
    released = true
    release()
    // Drop the map entry once this lock holder has drained, so the map does
    // not grow with every id ever installed.
    void chained.then(() => {
      if (packageLocks.get(id) === chained) packageLocks.delete(id)
    })
  }
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
 * cleared by the same removal.
 */
export async function uninstallPackage(packageId: string, provider: FsProvider): Promise<void> {
  try {
    normalizeProviderPath(packageId)
  } catch {
    throw new PackageInstallError(`Invalid package id: ${packageId}`, 'INVALID_PACKAGE')
  }
  // Same per-package lock as install: an uninstall racing an install must
  // not remove the directory the installer is writing.
  const release = await acquirePackageLock(packageId)
  try {
    await removeMissingOk(provider, packageId)
  } catch (error) {
    throw new PackageInstallError(`Failed to remove package ${packageId}: ${error instanceof Error ? error.message : String(error)}`, 'STORAGE_FAILED')
  } finally {
    release()
  }
}

/** Enabling is exclusively the #102 opt-in flow's job — the installer never activates. */
export const INSTALLER_DEFAULT_CONFIG = { activation: 'disabled' as const }
