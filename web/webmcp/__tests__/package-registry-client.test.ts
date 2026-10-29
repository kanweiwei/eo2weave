import { beforeEach, describe, expect, it } from 'vitest'
import {
  fetchRegistryManifest,
  parseRegistryInput,
  registryFileUrl,
  registryFromManifestUrl,
  validateRegistryManifest,
  RegistryError,
  type RegistryManifest,
} from '../package-registry-client'

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

const VALID_MANIFEST: RegistryManifest = {
  generatedAt: '2026-10-29T00:00:00Z',
  packages: [
    {
      id: 'com.discord.main',
      version: '0.1.0',
      description: 'Discord tools.',
      toolCount: 2,
      files: [
        { path: 'packages/com.discord.main/manifest.json', sha256: 'a'.repeat(64) },
        { path: 'packages/com.discord.main/config.json', sha256: 'b'.repeat(64) },
        { path: 'packages/com.discord.main/workflows/read.js', sha256: 'c'.repeat(64) },
      ],
    },
  ],
}

describe('parseRegistryInput — loose URL forms', () => {
  it('accepts a full GitHub URL and derives the raw base on main', () => {
    const registry = parseRegistryInput('https://github.com/kanweiwei/eo2weave-webmcp-packages')
    expect(registry.rawBase).toBe('https://raw.githubusercontent.com/kanweiwei/eo2weave-webmcp-packages/main')
    expect(registry.manifestUrl).toBe('https://raw.githubusercontent.com/kanweiwei/eo2weave-webmcp-packages/main/manifest.json')
    expect(registry.label).toBe('kanweiwei/eo2weave-webmcp-packages')
  })

  it('accepts owner/repo shorthand', () => {
    const registry = parseRegistryInput('kanweiwei/eo2weave-webmcp-packages')
    expect(registry.rawBase).toBe('https://raw.githubusercontent.com/kanweiwei/eo2weave-webmcp-packages/main')
    expect(registry.manifestUrl).toBe('https://raw.githubusercontent.com/kanweiwei/eo2weave-webmcp-packages/main/manifest.json')
  })

  it('accepts a direct raw manifest URL as-is', () => {
    const url = 'https://raw.githubusercontent.com/owner/repo/main/manifest.json'
    const registry = parseRegistryInput(url)
    expect(registry.manifestUrl).toBe(url)
    expect(registry.rawBase).toBe('https://raw.githubusercontent.com/owner/repo/main')
  })

  it('accepts a deep raw URL and anchors the base at the file directory', () => {
    const registry = parseRegistryInput('https://raw.githubusercontent.com/owner/repo/dev/packages/manifest.json')
    expect(registry.rawBase).toBe('https://raw.githubusercontent.com/owner/repo/dev/packages')
    expect(registry.manifestUrl).toBe('https://raw.githubusercontent.com/owner/repo/dev/packages/manifest.json')
  })

  it('honors a github.com/tree/<branch> URL including subdirectory', () => {
    const registry = parseRegistryInput('https://github.com/owner/repo/tree/nightly/sub/dir')
    expect(registry.rawBase).toBe('https://raw.githubusercontent.com/owner/repo/nightly/sub/dir')
    expect(registry.manifestUrl).toBe('https://raw.githubusercontent.com/owner/repo/nightly/sub/dir/manifest.json')
  })

  it('rejects an empty input explicitly', () => {
    expect(() => parseRegistryInput('   ')).toThrow(RegistryError)
  })

  it('rejects a bare owner without repo', () => {
    expect(() => parseRegistryInput('kanweiwei')).toThrow(RegistryError)
  })

  it('rejects unsupported GitHub paths', () => {
    expect(() => parseRegistryInput('https://github.com/owner/repo/blob/main/manifest.json')).toThrow(RegistryError)
  })

  it('rejects non-GitHub hosts explicitly', () => {
    expect(() => parseRegistryInput('https://gitlab.com/owner/repo')).toThrow(RegistryError)
  })
})

describe('registryFileUrl', () => {
  it('joins package paths onto the raw base', () => {
    const registry = parseRegistryInput('kanweiwei/eo2weave-webmcp-packages')
    expect(registryFileUrl(registry, 'packages/com.discord.main/manifest.json'))
      .toBe('https://raw.githubusercontent.com/kanweiwei/eo2weave-webmcp-packages/main/packages/com.discord.main/manifest.json')
  })

  it('rejects traversal paths', () => {
    const registry = parseRegistryInput('owner/repo')
    expect(() => registryFileUrl(registry, '../secret')).toThrow(RegistryError)
  })
})

describe('validateRegistryManifest', () => {
  it('accepts the registry-side format', () => {
    expect(validateRegistryManifest(VALID_MANIFEST).packages[0].id).toBe('com.discord.main')
  })

  it('rejects non-objects and missing packages', () => {
    expect(() => validateRegistryManifest(null)).toThrow(RegistryError)
    expect(() => validateRegistryManifest([])).toThrow(RegistryError)
    expect(() => validateRegistryManifest({})).toThrow(RegistryError)
  })

  it('rejects a file escaping the package directory', () => {
    const bad = {
      packages: [{
        id: 'com.x', version: '1.0.0', description: '', toolCount: 1,
        files: [{ path: 'packages/com.other/a.js', sha256: 'a'.repeat(64) }],
      }],
    }
    expect(() => validateRegistryManifest(bad)).toThrow(RegistryError)
  })

  it('rejects a missing per-package manifest.json entry', () => {
    const bad = {
      packages: [{
        id: 'com.x', version: '1.0.0', description: '', toolCount: 1,
        files: [{ path: 'packages/com.x/a.js', sha256: 'a'.repeat(64) }],
      }],
    }
    expect(() => validateRegistryManifest(bad)).toThrow(RegistryError)
  })

  it('rejects malformed sha256 values', () => {
    const bad = {
      packages: [{
        id: 'com.x', version: '1.0.0', description: '', toolCount: 1,
        files: [{ path: 'packages/com.x/manifest.json', sha256: 'not-a-hash' }],
      }],
    }
    expect(() => validateRegistryManifest(bad)).toThrow(RegistryError)
  })

  it('rejects duplicate package ids', () => {
    const bad = {
      packages: [VALID_MANIFEST.packages[0], { ...VALID_MANIFEST.packages[0] }],
    }
    expect(() => validateRegistryManifest(bad)).toThrow(RegistryError)
  })
})

describe('fetchRegistryManifest', () => {
  beforeEach(() => {
    // Isolate the module-level cache between tests via unique manifest URLs.
  })

  it('fetches, validates and caches a manifest (5-min session cache)', async () => {
    let calls = 0
    const fetchImpl = (async () => { calls += 1; return jsonResponse(VALID_MANIFEST) }) as typeof fetch
    const registry = registryFromManifestUrl('https://raw.githubusercontent.com/o/r/main/manifest.json')
    const first = await fetchRegistryManifest(registry, { fetchImpl })
    const second = await fetchRegistryManifest(registry, { fetchImpl })
    expect(first.packages).toHaveLength(1)
    expect(second).toBe(first)
    expect(calls).toBe(1)
  })

  it('re-fetches on force', async () => {
    let calls = 0
    const fetchImpl = (async () => { calls += 1; return jsonResponse(VALID_MANIFEST) }) as typeof fetch
    const registry = registryFromManifestUrl('https://raw.githubusercontent.com/o/r2/main/manifest.json')
    await fetchRegistryManifest(registry, { fetchImpl })
    await fetchRegistryManifest(registry, { fetchImpl, force: true })
    expect(calls).toBe(2)
  })

  it('surfaces 404 as a registry error with the manifest URL', async () => {
    const fetchImpl = (async () => jsonResponse({ message: 'Not Found' }, 404)) as unknown as typeof fetch
    const registry = registryFromManifestUrl('https://raw.githubusercontent.com/o/missing/main/manifest.json')
    await expect(fetchRegistryManifest(registry, { fetchImpl })).rejects.toThrow(/manifest\.json/)
  })

  it('rejects structurally invalid manifests', async () => {
    const fetchImpl = (async () => jsonResponse({ packages: 'nope' })) as unknown as typeof fetch
    const registry = registryFromManifestUrl('https://raw.githubusercontent.com/o/bad/main/manifest.json')
    await expect(fetchRegistryManifest(registry, { fetchImpl })).rejects.toThrow(RegistryError)
  })

  it('wraps network failures', async () => {
    const fetchImpl = (async () => { throw new TypeError('network down') }) as unknown as typeof fetch
    const registry = registryFromManifestUrl('https://raw.githubusercontent.com/o/net/main/manifest.json')
    await expect(fetchRegistryManifest(registry, { fetchImpl })).rejects.toThrow(/unreachable/i)
  })
})
