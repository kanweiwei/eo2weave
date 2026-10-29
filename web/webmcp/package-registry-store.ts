/**
 * Settings-side client for the WebMCP package registry installer
 * (issue #117, Tier 1).
 *
 * Wires the pure registry client + installer to the web app's VFS provider
 * for the `webmcp` mount — the extension-owned OPFS directory exposed through
 * the injected provider (`/external/webmcp/`, the same location the extension
 * adapter-validation recognizes). Registry catalogs are listed, one package
 * is installed at a time, and installed packages are matched against the
 * mount's directories to render the "installed" state.
 *
 * There is deliberately NO built-in registry URL: every registry is added by
 * the user (loose URL input). Registries added in this session are kept in
 * localStorage so the list survives reloads; manifests themselves stay in the
 * 5-minute in-memory cache of the registry client.
 */

import { providerRegistry } from '@/vfs/provider-registry'
import {
  fetchRegistryManifest,
  parseRegistryInput,
  invalidateRegistryCache,
  type PackageRegistry,
  type RegistryManifest,
  type RegistryManifestPackage,
} from './package-registry-client'
import { installPackage, uninstallPackage } from './package-installer'

const REGISTRIES_STORAGE_KEY = 'webmcp_package_registries'

interface StoredRegistry {
  input: string
  label: string
  rawBase: string
  manifestUrl: string
}

function loadStoredRegistries(): StoredRegistry[] {
  try {
    const raw = localStorage.getItem(REGISTRIES_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as StoredRegistry[]) : []
  } catch {
    return []
  }
}

function saveStoredRegistries(registries: StoredRegistry[]): void {
  try {
    localStorage.setItem(REGISTRIES_STORAGE_KEY, JSON.stringify(registries))
  } catch {
    // localStorage unavailable (private mode) — session-only registry list.
  }
}

/** Registries added by the user this browser profile (order preserved). */
export function listRegistries(): PackageRegistry[] {
  return loadStoredRegistries().map(entry => ({
    rawBase: entry.rawBase,
    manifestUrl: entry.manifestUrl,
    label: entry.label,
  }))
}

/**
 * Parse a loose registry URL and persist it. Throws on unparseable input
 * (the raw `Error` message from `parseRegistryInput` is user-presentable).
 */
export function addRegistry(input: string): PackageRegistry {
  const registry = parseRegistryInput(input)
  const stored = loadStoredRegistries().filter(entry => entry.manifestUrl !== registry.manifestUrl)
  stored.push({ input: input.trim(), label: registry.label, rawBase: registry.rawBase, manifestUrl: registry.manifestUrl })
  saveStoredRegistries(stored)
  return registry
}

/** Remove a registry from the list (installed packages are NOT uninstalled). */
export function removeRegistry(manifestUrl: string): void {
  saveStoredRegistries(loadStoredRegistries().filter(entry => entry.manifestUrl !== manifestUrl))
  invalidateRegistryCache()
}

/** Fetch the catalog of one registry (5-min cache; `force` re-fetches). */
export async function loadRegistryCatalog(
  registry: PackageRegistry,
  options?: { force?: boolean },
): Promise<RegistryManifest> {
  return fetchRegistryManifest(registry, options)
}

/**
 * Reject an install whose package id collides with an EXISTING package.
 *
 * A registry package id doubles as the directory name on the mount, so a
 * collision would silently delete (and replace) a builtin package, another
 * installed package, or a user-created package. The catalog then marks the
 * survivors as conflicting and the colliding package becomes unusable.
 *
 * Two distinct collisions are checked across BOTH mounts:
 *   1. the target directory already exists and holds a DIFFERENT package
 *      (its manifest id differs from the incoming one);
 *   2. another directory on any mount already publishes the SAME manifest
 *      id (duplicate namespace — the catalog would withdraw both).
 *
 * Returns the conflicting package description, or null when the install may
 * proceed.
 */
export async function findPackageIdCollision(packageId: string): Promise<string | null> {
  const mounts = ['webmcp', 'builtin-webmcp']
  const manifestIdOf = async (mount: string, directory: string): Promise<string | null> => {
    try {
      const provider = await providerRegistry.get(mount)
      const bytes = await provider.readFile(`${directory}/manifest.json`)
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { id?: unknown }
      return typeof parsed.id === 'string' ? parsed.id : null
    } catch {
      return null
    }
  }
  for (const mount of mounts) {
    let entries: Array<{ name: string; kind: string }>
    try {
      const provider = await providerRegistry.get(mount)
      entries = await provider.readdir('')
    } catch {
      // Mount unavailable — nothing to collide with.
      continue
    }
    for (const entry of entries) {
      if (entry.kind !== 'directory' || entry.name.startsWith('.')) continue
      const manifestId = await manifestIdOf(mount, entry.name)
      if (!manifestId) continue
      if (entry.name === packageId) {
        // The target directory already exists.
        if (manifestId !== packageId) {
          return `${entry.name} on ${mount} already holds the package ${manifestId}`
        }
        if (mount !== 'webmcp') {
          // Same id on ANOTHER mount (a builtin): installing it here would
          // create a duplicate namespace and the catalog would withdraw
          // BOTH packages.
          return `${entry.name} on ${mount} already publishes the package id ${manifestId}`
        }
        // Same directory on the target mount with the same id — a
        // re-install of the very same package, which is allowed.
        continue
      }
      if (manifestId === packageId) {
        return `${entry.name} on ${mount} already publishes the package id ${manifestId}`
      }
    }
  }
  return null
}

/**
 * Install one package from its manifest entry into the `webmcp` VFS mount.
 * Verifies every file's sha256 BEFORE writing anything (all-or-nothing).
 */
export async function installRegistryPackage(
  registry: PackageRegistry,
  pkg: RegistryManifestPackage,
): Promise<{ filesWritten: number }> {
  const collision = await findPackageIdCollision(pkg.id)
  if (collision) {
    throw new Error(
      `Cannot install ${pkg.id}: ${collision}. Remove or rename it first — installing would replace it.`,
    )
  }
  const provider = await providerRegistry.get('webmcp')
  return installPackage(registry, pkg, provider)
}

/** Uninstall: remove the package directory from the `webmcp` mount. */
export async function uninstallRegistryPackage(packageId: string): Promise<void> {
  const provider = await providerRegistry.get('webmcp')
  return uninstallPackage(packageId, provider)
}

/**
 * Directories currently present on the `webmcp` mount (= installed ids).
 * Dot-prefixed directories are internal installer state (staging/backup),
 * not packages, and are skipped.
 */
export async function listInstalledPackageIds(): Promise<Set<string>> {
  try {
    const provider = await providerRegistry.get('webmcp')
    const entries = await provider.readdir('')
    return new Set(
      entries
        .filter(entry => entry.kind === 'directory' && !entry.name.startsWith('.'))
        .map(entry => entry.name),
    )
  } catch {
    // Extension bridge unavailable / mount not announced — nothing installed.
    return new Set()
  }
}

/**
 * Activation state of one installed package, read from its `config.json` on
 * the mount (the same file the extension's opt-in enable writes). Absence of
 * a config (or of the package entirely) reads as disabled. The settings
 * section uses this to show "active" only for packages actually enabled via
 * the on-site opt-in flow.
 */
export async function readInstalledPackageActivation(packageId: string): Promise<'enabled' | 'disabled'> {
  try {
    const provider = await providerRegistry.get('webmcp')
    const bytes = await provider.readFile(`${packageId}/config.json`)
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { activation?: unknown }
    return parsed.activation === 'enabled' ? 'enabled' : 'disabled'
  } catch {
    return 'disabled'
  }
}
