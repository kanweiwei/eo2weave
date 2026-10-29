/**
 * WebMCP package registry client (issue #117, Tier 1).
 *
 * A registry is ANY repo hosting a `manifest.json` catalog of site packages:
 *
 *   { generatedAt, packages: [{ id, version, description, toolCount,
 *                               files: [{ path, sha256 }] }] }
 *
 * There is deliberately NO built-in/preloaded registry: every registry —
 * including the pilot `eo2weave-webmcp-packages` repo — is added by the user
 * through the settings UI ("add custom package repository"). The official
 * registry concept is deferred until the packages repo moves into the
 * nutstore organization.
 *
 * Users only paste a repo URL; `parseRegistryInput` derives the raw manifest
 * URL from the three accepted forms:
 *   1. full GitHub URL   github.com/<owner>/<repo>[/tree/<branch>][/sub/dir]
 *   2. owner/repo shorthand
 *   3. direct raw URL    raw.githubusercontent.com/... (manifest or any file)
 *
 * Manifests are cached in memory for 5 minutes per registry (session-level,
 * same pattern as the skill store) so re-opening the settings section does
 * not re-fetch.
 */

/** Manifest shape served by the packages registry (CI-validated source side). */
export interface RegistryManifestFile {
  /** Repo-relative package file path, e.g. `packages/<id>/manifest.json`. */
  path: string
  sha256: string
}

export interface RegistryManifestPackage {
  id: string
  version: string
  description: string
  toolCount: number
  files: RegistryManifestFile[]
}

export interface RegistryManifest {
  generatedAt?: string
  packages: RegistryManifestPackage[]
}

/** A registry the user added; everything needed to fetch files is derived. */
export interface PackageRegistry {
  /**
   * Raw base able to serve any REPO-RELATIVE path (`.../<branch>`). For a
   * subdirectory manifest URL this stays at the repo root — manifest paths
   * are repo-relative — while `manifestUrl` keeps the subdirectory.
   */
  rawBase: string
  /** The full raw URL of the registry manifest. */
  manifestUrl: string
  /** Human label (owner/repo, or the host for non-GitHub raw inputs). */
  label: string
}

export class RegistryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RegistryError'
  }
}

const GITHUB_HOST = 'github.com'
const RAW_HOST = 'raw.githubusercontent.com'
/** Default branch when the input does not carry one (issue #117 decision). */
const DEFAULT_BRANCH = 'main'
/** Session-level manifest cache TTL (skill-store pattern). */
const CACHE_TTL_MS = 5 * 60 * 1000

const manifestCache = new Map<string, { data: RegistryManifest; ts: number }>()

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
}

/**
 * Loose registry URL resolution (issue #117 design). Accepts:
 *   - `https://github.com/<owner>/<repo>` (optionally `/tree/<branch>[/dir]`)
 *   - `<owner>/<repo>`
 *   - `https://raw.githubusercontent.com/<owner>/<repo>/<branch>/...` (any
 *     file — the manifest path itself, or one file deeper in the tree)
 * and returns the derived raw base + manifest URL. Non-GitHub raw URLs are
 * taken as-is (path = the given directory). Anything unparseable throws a
 * `RegistryError` with an explicit reason — never a silent guess.
 */
export function parseRegistryInput(input: string): PackageRegistry {
  const raw = typeof input === 'string' ? input.trim() : ''
  if (!raw) throw new RegistryError('Registry URL is required')

  // owner/repo shorthand: no scheme, exactly one slash, both segments clean.
  if (/^[a-zA-Z0-9-]+\/[a-zA-Z0-9._-]+$/.test(raw)) {
    const rawBase = `https://${RAW_HOST}/${raw}/${DEFAULT_BRANCH}`
    return { rawBase, manifestUrl: `${rawBase}/manifest.json`, label: raw }
  }

  let url: URL
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`)
  } catch {
    throw new RegistryError(`Invalid registry URL: ${input}`)
  }
  // Plain HTTP would let an interceptor replace the manifest, its checksums
  // AND the package files in transit — sha256 verification verifies against
  // the tampered manifest and passes. Registries are HTTPS-only.
  if (url.protocol !== 'https:') {
    throw new RegistryError(`Registry URLs must use HTTPS (got ${url.protocol})`)
  }

  if (url.hostname === RAW_HOST) {
    // raw.githubusercontent.com/<owner>/<repo>/<branch>[/dir...]/<file>
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 3) {
      throw new RegistryError('Raw registry URL must include owner, repo and branch')
    }
    const [owner, repo, branch, ...rest] = parts
    const label = `${owner}/${repo}`
    // The raw base stays at the REPO ROOT: manifest file paths are
    // repo-relative even when the manifest itself lives in a subdirectory.
    const rawBase = `${url.protocol}//${RAW_HOST}/${owner}/${repo}/${branch}`
    const dir = rest.slice(0, -1)
    return {
      rawBase,
      manifestUrl: dir.length ? `${rawBase}/${dir.join('/')}/manifest.json` : `${rawBase}/manifest.json`,
      label,
    }
  }

  if (url.hostname === GITHUB_HOST || url.hostname === 'www.github.com') {
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 2) {
      throw new RegistryError('GitHub registry URL must include owner and repository')
    }
    const [owner, repo, keyword, branch, ...dir] = parts
    if (keyword !== undefined && keyword !== 'tree') {
      throw new RegistryError(`Unsupported GitHub URL path: /${keyword}`)
    }
    const effectiveBranch = branch ?? DEFAULT_BRANCH
    // Same as the raw form: file base at the repo root, manifest URL keeps
    // the optional subdirectory.
    const rawBase = `${url.protocol}//${RAW_HOST}/${owner}/${repo}/${effectiveBranch}`
    return {
      rawBase,
      manifestUrl: dir.length ? `${rawBase}/${dir.join('/')}/manifest.json` : `${rawBase}/manifest.json`,
      label: `${owner}/${repo}`,
    }
  }

  throw new RegistryError(`Unsupported registry host: ${url.hostname}. Use a github.com repository URL or a raw.githubusercontent.com URL.`)
}

/** Build a registry from an already-resolved raw manifest URL (tests, power users). */
export function registryFromManifestUrl(manifestUrl: string, label?: string): PackageRegistry {
  let url: URL
  try {
    url = new URL(manifestUrl)
  } catch {
    throw new RegistryError(`Invalid manifest URL: ${manifestUrl}`)
  }
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length < 2) throw new RegistryError('Manifest URL must include at least owner/repo')
  // Everything up to the last segment is the raw base (the final segment is
  // conventionally the manifest file name). Subdirectory manifests keep their
  // directory in the manifest URL; file paths stay repo-relative.
  const base = parts.slice(0, -1).join('/')
  return { rawBase: `${url.protocol}//${url.host}/${base}`, manifestUrl, label: label ?? parts.slice(0, 2).join('/') }
}

/** Raw URL for one manifest-listed package file. */
export function registryFileUrl(registry: PackageRegistry, path: string): string {
  const clean = path.replace(/^\/+/, '')
  if (!clean || clean.includes('..')) throw new RegistryError(`Invalid package file path: ${path}`)
  return `${registry.rawBase}/${clean}`
}

/** Fetch + validate a registry manifest (5-minute session cache per URL). */
export async function fetchRegistryManifest(
  registry: PackageRegistry,
  options?: { force?: boolean; fetchImpl?: typeof fetch },
): Promise<RegistryManifest> {
  const doFetch = options?.fetchImpl ?? fetch
  const cached = manifestCache.get(registry.manifestUrl)
  if (!options?.force && cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data

  let response: Response
  try {
    response = await doFetch(registry.manifestUrl, { credentials: 'omit', cache: options?.force ? 'no-cache' : 'default' })
  } catch (error) {
    throw new RegistryError(`Registry unreachable: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (response.status === 404) {
    throw new RegistryError(`Registry manifest not found: ${registry.manifestUrl}`)
  }
  if (!response.ok) {
    throw new RegistryError(`Failed to fetch registry manifest: HTTP ${response.status}`)
  }

  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new RegistryError('Registry manifest is not valid JSON')
  }
  const manifest = validateRegistryManifest(data)
  manifestCache.set(registry.manifestUrl, { data: manifest, ts: Date.now() })
  return manifest
}

/**
 * Structural validation — the installer reads `packages[].files[].{path,sha256}`
 * to decide what to download, so every entry must be well-formed. Extra
 * manifest fields are tolerated (forward compatibility); a malformed entry
 * rejects the WHOLE manifest rather than installing a half-readable catalog.
 */
export function validateRegistryManifest(data: unknown): RegistryManifest {
  if (!isPlainObject(data)) throw new RegistryError('Registry manifest must be a JSON object')
  if (!Array.isArray(data.packages)) throw new RegistryError('Registry manifest is missing the packages array')
  const packages: RegistryManifestPackage[] = data.packages.map((entry, index) => {
    if (!isPlainObject(entry)) throw new RegistryError(`Package #${index} is not an object`)
    const { id, version, description, toolCount, files } = entry
    if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id)) {
      throw new RegistryError(`Package #${index} has an invalid id`)
    }
    if (typeof version !== 'string' || !version) throw new RegistryError(`Package ${id}: missing version`)
    if (typeof description !== 'string') throw new RegistryError(`Package ${id}: missing description`)
    if (typeof toolCount !== 'number' || !Number.isInteger(toolCount) || toolCount < 0) {
      throw new RegistryError(`Package ${id}: invalid toolCount`)
    }
    if (!Array.isArray(files) || files.length === 0) throw new RegistryError(`Package ${id}: files must be a non-empty array`)
    const seen = new Set<string>()
    const validatedFiles = files.map((file, fileIndex) => {
      if (!isPlainObject(file)) throw new RegistryError(`Package ${id}: file #${fileIndex} is not an object`)
      const { path, sha256 } = file
      if (typeof path !== 'string' || !path || path.startsWith('/') || path.split('/').includes('..')) {
        throw new RegistryError(`Package ${id}: invalid file path ${JSON.stringify(path)}`)
      }
      // Every file of a package must live under the package's own directory.
      if (!path.startsWith(`packages/${id}/`)) {
        throw new RegistryError(`Package ${id}: file ${path} escapes the package directory`)
      }
      if (!isSha256(sha256)) throw new RegistryError(`Package ${id}: file ${path} has no valid sha256`)
      if (seen.has(path)) throw new RegistryError(`Package ${id}: duplicate file ${path}`)
      seen.add(path)
      return { path, sha256 }
    })
    if (!validatedFiles.some(file => file.path === `packages/${id}/manifest.json`)) {
      throw new RegistryError(`Package ${id}: manifest.json is missing from files`)
    }
    return { id, version, description, toolCount, files: validatedFiles }
  })
  const ids = new Set<string>()
  for (const pkg of packages) {
    if (ids.has(pkg.id)) throw new RegistryError(`Duplicate package id in manifest: ${pkg.id}`)
    ids.add(pkg.id)
  }
  return { generatedAt: typeof data.generatedAt === 'string' ? data.generatedAt : undefined, packages }
}

/** Drop cached manifests (settings "refresh" button). */
export function invalidateRegistryCache(registry?: PackageRegistry): void {
  if (registry) manifestCache.delete(registry.manifestUrl)
  else manifestCache.clear()
}
