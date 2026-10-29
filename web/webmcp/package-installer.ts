/**
 * WebMCP package installer — consumes a registry manifest (issue #117, Tier 1).
 *
 * Install flow (all-or-nothing):
 *   1. Download every file listed in `manifest.files` for ONE package.
 *   2. sha256-verify each download via Web Crypto — ALL files are verified
 *      BEFORE anything touches storage.
 *   3. Only then write the tree into the existing custom VFS mount
 *      `/external/webmcp/<id>/` (the same location the extension's
 *      adapter-validation CLI recognizes), one `writeFile` per file.
 *   4. Activation stays at its default (`disabled`) — enabling happens
 *      exclusively through the #102 on-site opt-in consent flow.
 *
 * Any verification failure aborts the install with NOTHING written (no
 * half-installed packages). The target directory is cleared first so a
 * re-install replaces a previous version cleanly.
 *
 * Uninstall removes the package's VFS directory. Activation for user-mount
 * packages lives in the package's own `config.json` inside the directory
 * (the same file the extension's package-management writes), so removing the
 * directory also removes any override — no extra cleanup exists to leak.
 */

import { normalizeProviderPath, type FsProvider } from '@creatorweave/fs-provider'
import type { PackageRegistry, RegistryManifestPackage } from './package-registry-client'
import { registryFileUrl } from './package-registry-client'

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
): Promise<Uint8Array> {
  let response: Response
  try {
    response = await fetchImpl(url, { credentials: 'omit', cache: 'no-cache' })
  } catch (error) {
    throw new PackageInstallError(`Download failed for ${url}: ${error instanceof Error ? error.message : String(error)}`, 'DOWNLOAD_FAILED')
  }
  if (!response.ok) {
    throw new PackageInstallError(`Download failed for ${url}: HTTP ${response.status}`, 'DOWNLOAD_FAILED')
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
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
  options?: { fetchImpl?: typeof fetch },
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

  // Stage everything in memory BEFORE touching storage — the all-or-nothing
  // guarantee lives here, not in a rollback pass.
  const staged: Array<{ path: string; bytes: Uint8Array }> = []
  const seenPaths = new Set<string>()
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
    if (seenPaths.has(relative)) {
      throw new PackageInstallError(`Package ${id} lists ${file.path} twice (aliased path)`, 'INVALID_PACKAGE')
    }
    seenPaths.add(relative)
    staged.push({ path: relative, bytes: await downloadFile(url, file.sha256, fetchImpl) })
  }

  // SECURITY: the registry's own config.json is NEVER copied — a manifest
  // could ship `activation: "enabled"` and the package would activate
  // without the #102 on-site consent flow. Activation is always reset to
  // the disabled default here; enabling is exclusively the opt-in flow's job.
  const configIndex = staged.findIndex(file => file.path === 'config.json')
  const configBytes = new TextEncoder().encode(JSON.stringify(INSTALLER_DEFAULT_CONFIG) + '\n')
  if (configIndex >= 0) staged[configIndex] = { path: 'config.json', bytes: configBytes }
  else staged.push({ path: 'config.json', bytes: configBytes })

  // Everything verified — replace any previous install, then write the tree.
  try {
    await removeMissingOk(provider, id)
    await provider.mkdir(id, { recursive: true })
    for (const file of staged) {
      await provider.writeFile(`${id}/${file.path}`, file.bytes)
    }
  } catch (error) {
    throw new PackageInstallError(`Failed to write package ${id} to storage: ${error instanceof Error ? error.message : String(error)}`, 'STORAGE_FAILED')
  }
  return { filesWritten: staged.length }
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
  try {
    await removeMissingOk(provider, packageId)
  } catch (error) {
    throw new PackageInstallError(`Failed to remove package ${packageId}: ${error instanceof Error ? error.message : String(error)}`, 'STORAGE_FAILED')
  }
}

/** Enabling is exclusively the #102 opt-in flow's job — the installer never activates. */
export const INSTALLER_DEFAULT_CONFIG = { activation: 'disabled' as const }
