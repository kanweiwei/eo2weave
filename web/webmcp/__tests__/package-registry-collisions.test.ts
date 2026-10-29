import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryProvider } from '@creatorweave/fs-provider/memory'

/**
 * Package-id collision guard for the registry installer (issue #117).
 *
 * A registry package id doubles as the directory name on the mount, so an
 * install whose id collides with an existing package would DELETE and
 * replace that package. The install must be rejected instead.
 */

const providers = vi.hoisted(() => ({
  webmcp: { current: null as unknown },
  builtin: { current: null as unknown },
}))

vi.mock('@/vfs/provider-registry', () => ({
  providerRegistry: {
    get: async (mount: string) => {
      const provider = mount === 'builtin-webmcp' ? providers.builtin.current : providers.webmcp.current
      if (!provider) throw new Error(`Mount ${mount} is unavailable`)
      return provider
    },
  },
}))

import { findPackageIdCollision, installRegistryPackage } from '../package-registry-store'

const MANIFEST = (id: string) => new TextEncoder().encode(JSON.stringify({ id, version: '1.0.0', description: '', tools: [] }))

async function seed(provider: ReturnType<typeof memoryProvider>, directory: string, manifestId: string) {
  await provider.mkdir(directory, { recursive: true })
  await provider.writeFile(`${directory}/manifest.json`, MANIFEST(manifestId))
}

beforeEach(() => {
  providers.webmcp.current = memoryProvider()
  providers.builtin.current = memoryProvider()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('findPackageIdCollision', () => {
  it('reports no collision for a fresh id', async () => {
    expect(await findPackageIdCollision('com.example.new')).toBeNull()
  })

  it('allows a RE-install of the same package (same directory, same manifest id)', async () => {
    await seed(providers.webmcp.current as ReturnType<typeof memoryProvider>, 'com.example.pkg', 'com.example.pkg')
    expect(await findPackageIdCollision('com.example.pkg')).toBeNull()
  })

  it('detects a directory holding a DIFFERENT package (the id would replace it)', async () => {
    await seed(providers.webmcp.current as ReturnType<typeof memoryProvider>, 'com.example.pkg', 'com.other.pkg')
    expect(await findPackageIdCollision('com.example.pkg')).toMatch(/already holds the package com\.other\.pkg/)
  })

  it('detects a duplicate manifest id in ANOTHER directory (duplicate namespace)', async () => {
    await seed(providers.webmcp.current as ReturnType<typeof memoryProvider>, 'com.example.copy', 'com.example.pkg')
    expect(await findPackageIdCollision('com.example.pkg')).toMatch(/already publishes the package id/)
  })

  it('detects a collision with a BUILTIN package', async () => {
    await seed(providers.builtin.current as ReturnType<typeof memoryProvider>, 'com.builtin.pkg', 'com.builtin.pkg')
    expect(await findPackageIdCollision('com.builtin.pkg')).toMatch(/builtin-webmcp/)
  })

  it('ignores the installer-internal dot-directories', async () => {
    const provider = providers.webmcp.current as ReturnType<typeof memoryProvider>
    await provider.mkdir('.com.example.pkg.installing', { recursive: true })
    await provider.writeFile('.com.example.pkg.installing/manifest.json', MANIFEST('com.example.pkg'))
    expect(await findPackageIdCollision('com.example.pkg')).toBeNull()
  })
})

describe('installRegistryPackage', () => {
  it('refuses to install over an existing package with a different manifest id', async () => {
    const provider = providers.webmcp.current as ReturnType<typeof memoryProvider>
    await seed(provider, 'com.example.pkg', 'com.other.pkg')
    const registry = { rawBase: 'https://raw.githubusercontent.com/o/r/main', manifestUrl: 'https://raw.githubusercontent.com/o/r/main/manifest.json', label: 'o/r' }
    const pkg = { id: 'com.example.pkg', version: '1.0.0', description: '', toolCount: 0, files: [] }

    await expect(installRegistryPackage(registry, pkg)).rejects.toThrow(/Cannot install com\.example\.pkg/)
    // The existing package is untouched.
    await expect(provider.stat('com.example.pkg/manifest.json')).resolves.toMatchObject({ kind: 'file' })
  })
})
