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
 * Install one package from its manifest entry into the `webmcp` VFS mount.
 * Verifies every file's sha256 BEFORE writing anything (all-or-nothing).
 */
export async function installRegistryPackage(
  registry: PackageRegistry,
  pkg: RegistryManifestPackage,
): Promise<{ filesWritten: number }> {
  const provider = await providerRegistry.get('webmcp')
  return installPackage(registry, pkg, provider)
}

/** Uninstall: remove the package directory from the `webmcp` mount. */
export async function uninstallRegistryPackage(packageId: string): Promise<void> {
  const provider = await providerRegistry.get('webmcp')
  return uninstallPackage(packageId, provider)
}

/** Directories currently present on the `webmcp` mount (= installed ids). */
export async function listInstalledPackageIds(): Promise<Set<string>> {
  try {
    const provider = await providerRegistry.get('webmcp')
    return new Set((await provider.readdir('')).filter(entry => entry.kind === 'directory').map(entry => entry.name))
  } catch {
    // Extension bridge unavailable / mount not announced — nothing installed.
    return new Set()
  }
}
