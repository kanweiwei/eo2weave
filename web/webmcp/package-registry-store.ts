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
 * localStorage (with an in-memory fallback where storage is unavailable —
 * private mode) so the list survives reloads; manifests themselves stay in
 * the 5-minute in-memory cache of the registry client.
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

/**
 * In-memory mirror of the persisted registry list. When localStorage is
 * unavailable (private mode, storage quota) the session keeps working: a
 * registry the user just added stays listed until the tab closes instead of
 * silently vanishing (finding: "Registry addition disappears in private
 * mode"). Reads merge the mirror OVER storage so nothing is lost in either
 * direction.
 */
let sessionRegistries: StoredRegistry[] | null = null

function storageAvailable(): boolean {
  try {
    const probe = '__webmcp_registry_probe__'
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

function loadStoredRegistries(): StoredRegistry[] {
  const fromStorage = (): StoredRegistry[] => {
    try {
      const raw = localStorage.getItem(REGISTRIES_STORAGE_KEY)
      if (!raw) return []
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as StoredRegistry[]) : []
    } catch {
      return []
    }
  }
  const persisted = fromStorage()
  if (!sessionRegistries) return persisted
  // Merge: union by manifestUrl, session additions win (they may not have
  // landed in storage), persisted entries the session deleted stay deleted.
  const byUrl = new Map(persisted.map(entry => [entry.manifestUrl, entry]))
  for (const entry of sessionRegistries) byUrl.set(entry.manifestUrl, entry)
  return [...byUrl.values()]
}

function saveStoredRegistries(registries: StoredRegistry[]): boolean {
  sessionRegistries = registries
  try {
    localStorage.setItem(REGISTRIES_STORAGE_KEY, JSON.stringify(registries))
    return true
  } catch {
    // localStorage unavailable (private mode) — the session mirror above
    // keeps the list usable for this tab; report the persistence gap so the
    // UI can tell the user the registry will not survive a reload.
    return false
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
 * Whether the LAST write reached localStorage. False in private mode — the
 * UI surfaces this so the user knows the registry list is session-only.
 */
let lastWritePersisted = true
export function registriesPersisted(): boolean {
  return lastWritePersisted && storageAvailable()
}

/**
 * Parse a loose registry URL and persist it. Throws on unparseable input
 * (the raw `Error` message from `parseRegistryInput` is user-presentable).
 * The addition is MERGED against the latest persisted list (fresh read just
 * before the write), so two settings tabs adding different registries
 * concurrently do not overwrite each other (finding: "Concurrent registry
 * additions are lost").
 */
export function addRegistry(input: string): PackageRegistry {
  const registry = parseRegistryInput(input)
  const fresh = loadStoredRegistries().filter(entry => entry.manifestUrl !== registry.manifestUrl)
  fresh.push({ input: input.trim(), label: registry.label, rawBase: registry.rawBase, manifestUrl: registry.manifestUrl })
  lastWritePersisted = saveStoredRegistries(fresh)
  return registry
}

/** Remove a registry from the list (installed packages are NOT uninstalled). */
export function removeRegistry(manifestUrl: string): void {
  lastWritePersisted = saveStoredRegistries(loadStoredRegistries().filter(entry => entry.manifestUrl !== manifestUrl))
  invalidateRegistryCache()
}

/** Fetch the catalog of one registry (5-min cache; `force` re-fetches). */
export async function loadRegistryCatalog(
  registry: PackageRegistry,
  options?: { force?: boolean },
): Promise<RegistryManifest> {
  return fetchRegistryManifest(registry, options)
}

/** True when a directory on the mount does NOT hold a readable, valid manifest. */
async function directoryHasValidManifest(mount: string, directory: string): Promise<boolean> {
  try {
    const provider = await providerRegistry.get(mount)
    const bytes = await provider.readFile(`${directory}/manifest.json`)
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { id?: unknown }
    return typeof parsed.id === 'string'
  } catch {
    return false
  }
}

/**
 * Reject an install whose package id collides with an EXISTING package.
 *
 * A registry package id doubles as the directory name on the mount, so a
 * collision would silently delete (and replace) a builtin package, another
 * installed package, or a user-created package. The catalog then marks the
 * survivors as conflicting and the colliding package becomes unusable.
 *
 * Three distinct collisions are checked across BOTH mounts:
 *   1. the target directory already exists and holds a DIFFERENT package
 *      (its manifest id differs from the incoming one);
 *   2. the target directory exists but holds NO readable manifest — it is
 *      nonetheless OCCUPIED (user data the installer must not erase);
 *   3. another directory on any mount already publishes the SAME manifest
 *      id (duplicate namespace — the catalog would withdraw both).
 *
 * Returns the conflicting package description, or null when the install may
 * proceed. A mount that cannot be LISTED fails the check (fail closed):
 * proceeding could create a duplicate namespace on a mount that is only
 * temporarily unreadable (finding: "Unreadable mount permits duplicate
 * package").
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
    let provider: Awaited<ReturnType<typeof providerRegistry.get>>
    try {
      provider = await providerRegistry.get(mount)
      entries = await provider.readdir('')
    } catch {
      // Fail closed: a mount we cannot inspect may already hold the id.
      return `The ${mount} storage could not be inspected; try again later`
    }
    for (const entry of entries) {
      if (entry.kind !== 'directory' || entry.name.startsWith('.')) continue
      const manifestId = await manifestIdOf(mount, entry.name)
      if (!manifestId) {
        if (entry.name === packageId) {
          // The target directory exists but holds no readable manifest —
          // treat it as occupied anyway: the installer must never delete
          // data it cannot interpret (finding: "Existing data is
          // overwritten").
          return `${entry.name} on ${mount} already exists but is not a valid package; remove or rename it first`
        }
        // An invalid directory under a DIFFERENT name cannot collide.
        continue
      }
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
 * not packages, and are skipped. A directory WITHOUT a valid manifest is
 * also skipped: the settings UI must not offer install/uninstall actions
 * for data it cannot interpret (finding: "Existing data is overwritten" —
 * the actions half).
 */
export async function listInstalledPackageIds(): Promise<Set<string>> {
  try {
    const provider = await providerRegistry.get('webmcp')
    const entries = await provider.readdir('')
    const ids = new Set<string>()
    for (const entry of entries) {
      if (entry.kind !== 'directory' || entry.name.startsWith('.')) continue
      if (await directoryHasValidManifest('webmcp', entry.name)) ids.add(entry.name)
    }
    return ids
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
