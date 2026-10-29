import { describe, expect, it } from 'vitest'
import { memoryProvider } from '@creatorweave/fs-provider/memory'
import { installPackage, uninstallPackage, sha256Hex, PackageInstallError } from '../package-installer'
import { registryFromManifestUrl } from '../package-registry-client'
import type { RegistryManifestPackage } from '../package-registry-client'

const RAW = 'https://raw.githubusercontent.com/owner/repo/main'

async function sha256Of(text: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(text))
}

async function pkgWithFiles(files: Record<string, string>): Promise<RegistryManifestPackage> {
  const entries = await Promise.all(Object.entries(files).map(async ([path, content]) => ({
    path: `packages/com.example.pkg/${path}`,
    sha256: await sha256Of(content),
  })))
  return {
    id: 'com.example.pkg',
    version: '1.0.0',
    description: 'Test package.',
    toolCount: 1,
    files: entries,
  }
}

function fetchServing(files: Record<string, string>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input)
    const key = Object.keys(files).find(path => url.endsWith(`/${path}`))
    if (key && url.includes(RAW)) {
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => new TextEncoder().encode(files[key]!).buffer as ArrayBuffer,
      } as unknown as Response
    }
    return { ok: false, status: 404 } as unknown as Response
  }) as typeof fetch
}

describe('installPackage', () => {
  it('downloads, verifies and writes the whole tree into the mount', async () => {
    const files = {
      'manifest.json': '{"id":"com.example.pkg"}',
      'config.json': '{}',
      'workflows/read.js': 'export default {}',
    }
    const pkg = await pkgWithFiles(files)
    const provider = memoryProvider()
    const registry = registryFromManifestUrl(`${RAW}/manifest.json`)

    const result = await installPackage(registry, pkg, provider, { fetchImpl: fetchServing(files) })

    expect(result.filesWritten).toBe(3)
    expect(await provider.readFile('com.example.pkg/manifest.json'))
      .toEqual(new TextEncoder().encode(files['manifest.json']))
    expect(await provider.readFile('com.example.pkg/workflows/read.js'))
      .toEqual(new TextEncoder().encode(files['workflows/read.js']))
  })

  it('leaves NOTHING on the mount when one file fails verification', async () => {
    const files = {
      'manifest.json': '{"id":"com.example.pkg"}',
      'config.json': '{}',
      'workflows/read.js': 'export default {}',
    }
    const pkg = await pkgWithFiles(files)
    // Corrupt one checksum — as if the registry or the download was tampered.
    const tampered: RegistryManifestPackage = {
      ...pkg,
      files: pkg.files.map(file =>
        file.path.endsWith('read.js') ? { ...file, sha256: '0'.repeat(64) } : file,
      ),
    }
    const provider = memoryProvider()
    const registry = registryFromManifestUrl(`${RAW}/manifest.json`)

    await expect(installPackage(registry, tampered, provider, { fetchImpl: fetchServing(files) }))
      .rejects.toMatchObject({ code: 'SHA256_MISMATCH' })
    await expect(provider.stat('com.example.pkg')).rejects.toThrow()
  })

  it('forces the registry config.json to the disabled default (never trusts a shipped activation)', async () => {
    const files = {
      'manifest.json': '{"id":"com.example.pkg"}',
      // A malicious registry could ship activation:enabled to bypass the
      // on-site opt-in consent flow.
      'config.json': '{"activation":"enabled"}',
      'workflows/read.js': 'export default {}',
    }
    const pkg = await pkgWithFiles(files)
    const provider = memoryProvider()
    const registry = registryFromManifestUrl(`${RAW}/manifest.json`)
    await installPackage(registry, pkg, provider, { fetchImpl: fetchServing(files) })
    // The installed config.json is ALWAYS the disabled default.
    expect(JSON.parse(new TextDecoder().decode(await provider.readFile('com.example.pkg/config.json'))))
      .toEqual({ activation: 'disabled' })
  })

  it('rejects aliased registry paths that would overwrite each other', async () => {
    const files = { 'manifest.json': '{}', 'workflows/read.js': 'export default {}' }
    const pkg = await pkgWithFiles(files)
    const aliased: RegistryManifestPackage = {
      ...pkg,
      files: [
        ...pkg.files,
        { path: 'packages/com.example.pkg/workflows/./read.js', sha256: await sha256Of('export default {}') },
      ],
    }
    const provider = memoryProvider()
    const registry = registryFromManifestUrl(`${RAW}/manifest.json`)
    await expect(installPackage(registry, aliased, provider, { fetchImpl: fetchServing(files) }))
      .rejects.toMatchObject({ code: 'INVALID_PACKAGE' })
  })

  it('replaces a previous install (removes the old directory first)', async () => {
    const v1 = { 'manifest.json': '{"id":"com.example.pkg","version":1}' }
    const v2 = { 'manifest.json': '{"id":"com.example.pkg","version":2}', 'extra.js': 'x' }
    const provider = memoryProvider()
    const registry = registryFromManifestUrl(`${RAW}/manifest.json`)

    await installPackage(registry, await pkgWithFiles(v1), provider, { fetchImpl: fetchServing(v1) })
    await installPackage(registry, await pkgWithFiles(v2), provider, { fetchImpl: fetchServing(v2) })

    await expect(provider.stat('com.example.pkg/extra.js')).resolves.toMatchObject({ kind: 'file' })
    const listed = await provider.readdir('com.example.pkg')
    // The installer always appends the disabled-default config.json.
    expect(listed.map(entry => entry.name).sort()).toEqual(['config.json', 'extra.js', 'manifest.json'])
  })

  it('fails with DOWNLOAD_FAILED when a file 404s and writes nothing', async () => {
    const pkg = await pkgWithFiles({ 'manifest.json': '{}' })
    const missing: RegistryManifestPackage = {
      ...pkg,
      files: [{ path: 'packages/com.example.pkg/gone.js', sha256: 'a'.repeat(64) }],
    }
    const provider = memoryProvider()
    const registry = registryFromManifestUrl(`${RAW}/manifest.json`)

    await expect(installPackage(registry, missing, provider, { fetchImpl: fetchServing({}) }))
      .rejects.toMatchObject({ code: 'DOWNLOAD_FAILED' })
    await expect(provider.stat('com.example.pkg')).rejects.toThrow()
  })
})

describe('uninstallPackage', () => {
  it('removes the package directory including the activation override', async () => {
    const files = { 'manifest.json': '{}', 'config.json': '{"activation":"enabled"}' }
    const pkg = await pkgWithFiles(files)
    const provider = memoryProvider()
    const registry = registryFromManifestUrl(`${RAW}/manifest.json`)
    await installPackage(registry, pkg, provider, { fetchImpl: fetchServing(files) })

    await uninstallPackage('com.example.pkg', provider)

    await expect(provider.stat('com.example.pkg')).rejects.toThrow()
  })

  it('is idempotent for a package that was never installed', async () => {
    const provider = memoryProvider()
    await expect(uninstallPackage('com.never.installed', provider)).resolves.toBeUndefined()
  })
})

describe('sha256Hex', () => {
  it('matches the sha256 of the empty string', async () => {
    expect(await sha256Hex(new Uint8Array(0)))
      .toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })
})

describe('PackageInstallError', () => {
  it('carries a structured code', () => {
    expect(new PackageInstallError('x', 'INVALID_PACKAGE').code).toBe('INVALID_PACKAGE')
  })
})
