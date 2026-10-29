import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findPackageOptInCandidate } from '../../../browser-extension/entrypoints/webmcp/package-optin'
import {
  createPackageOptInHandler,
  CONSENT_TOKEN_MIN_AGE_MS,
} from '../../../browser-extension/entrypoints/webmcp/package-optin-handler'
import { memoryProvider } from '@creatorweave/fs-provider/memory'
import type { WebMCPPackageEntry } from '@creatorweave/shared/webmcp-package-catalog'

vi.mock('../../../browser-extension/entrypoints/webmcp/package-repository', () => ({
  readBuiltinWebMCPCatalog: vi.fn(),
  readWebMCPCatalog: vi.fn(),
  readWebMCPCatalogDetailed: vi.fn(),
}))
vi.mock('../../../browser-extension/entrypoints/webmcp/builtin-storage', () => ({
  setBuiltinConfig: vi.fn(),
  readBuiltinConfig: vi.fn(),
  getBuiltinStorage: vi.fn(),
}))

// The user mount (`getAdapterStorage`) is real OPFS in production; tests back
// it with a deterministic in-memory provider behind the same lazy-singleton
// seam so the enable write for EXTERNAL packages is exercised end to end.
let userStorage = memoryProvider()
vi.mock('../../../browser-extension/entrypoints/webmcp/provider-storage', () => ({
  getAdapterStorage: () => Promise.resolve(userStorage),
}))

import { readWebMCPCatalog, readWebMCPCatalogDetailed } from '../../../browser-extension/entrypoints/webmcp/package-repository'

const READ_ONLY_SOURCE = 'export default { inputSchema: {}, outputSchema: {}, tree: { type: "action", run: async () => { const t = await browser.eval("() => document.title"); return t; } }, result: () => ({}) }'

const DISCORD_MANIFEST = {
  id: 'com.discord.main',
  version: '0.1.0',
  description: 'Discord tools.',
  tools: [
    { name: 'read_messages', description: 'Read messages.', urlRegex: '^https://discord\\.com/.*$', path: 'workflows/read_messages.js' },
  ],
}

/** A registry-installed package living on the custom `webmcp` mount. */
function externalEntry(overrides: Partial<WebMCPPackageEntry> = {}): WebMCPPackageEntry {
  return {
    directory: 'com.discord.main',
    mount: 'webmcp',
    uri: 'vfs://external/webmcp/com.discord.main/',
    access: 'read-write',
    config: {},
    activation: 'disabled',
    diagnostics: [],
    package: {
      manifest: DISCORD_MANIFEST,
      sources: { 'workflows/read_messages.js': READ_ONLY_SOURCE },
    },
    ...overrides,
  }
}

describe('opt-in candidates — external packages (issue #117 Tier 1)', () => {
  it('matches an installed external package by tool urlRegex', () => {
    const candidate = findPackageOptInCandidate([externalEntry()], 'https://discord.com/channels/1/2')
    expect(candidate).not.toBeNull()
    expect(candidate?.id).toBe('com.discord.main')
    expect(candidate?.mount).toBe('webmcp')
    expect(candidate?.activation).toBe('disabled')
    expect(candidate?.tools.map(tool => tool.name)).toEqual(['read_messages'])
  })

  it('labels an external read-only tool as read-only', () => {
    const candidate = findPackageOptInCandidate([externalEntry()], 'https://discord.com/')
    expect(candidate?.tools[0].readOnly).toBe(true)
  })

  it('still prefers a disabled package over an enabled one across mounts', () => {
    const builtinEnabled = externalEntry({
      directory: 'com.builtin.enabled',
      mount: 'builtin-webmcp',
      activation: 'enabled',
      package: {
        manifest: { ...DISCORD_MANIFEST, id: 'com.builtin.enabled', tools: DISCORD_MANIFEST.tools },
        sources: { 'workflows/read_messages.js': READ_ONLY_SOURCE },
      },
    })
    const candidate = findPackageOptInCandidate([builtinEnabled, externalEntry()], 'https://discord.com/')
    expect(candidate?.id).toBe('com.discord.main')
    expect(candidate?.activation).toBe('disabled')
  })

  it('never offers an external package with blocking diagnostics', () => {
    const broken = externalEntry({ diagnostics: ['Invalid manifest'] })
    expect(findPackageOptInCandidate([broken], 'https://discord.com/')).toBeNull()
  })
})

describe('opt-in handler — external package on-site enable (issue #117 Tier 1)', () => {
  const reload = vi.fn()
  const get = vi.fn()

  const enablePath = 'com.discord.main/config.json'

  beforeEach(() => {
    vi.resetAllMocks()
    userStorage = memoryProvider()
    reload.mockResolvedValue(undefined)
    get.mockResolvedValue({ id: 7, url: 'https://discord.com/channels/1/2' })
    vi.stubGlobal('chrome', {
      tabs: { get, reload },
      alarms: { create: vi.fn(), getAll: vi.fn(async () => []), clear: vi.fn() },
      // The user-mount enable bounces a sentinel through storage.local so the
      // adapter background's onChanged listener refreshes the catalog.
      storage: { local: { set: vi.fn(async () => {}), remove: vi.fn(async () => {}) } },
    })
    vi.mocked(readWebMCPCatalog).mockResolvedValue([externalEntry()])
    vi.mocked(readWebMCPCatalogDetailed).mockResolvedValue([[externalEntry()], { userMountComplete: true }])
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** Mint a token through the status probe, then wait out the minimum age. */
  async function mintToken(): Promise<string> {
    const respond = vi.fn()
    const handle = createPackageOptInHandler({ resolveBoundTab: async () => 7 })
    await handle({ type: 'webmcp_package_optin_status' }, respond)
    const token = (respond.mock.calls[0][0] as { consentToken?: string }).consentToken
    expect(typeof token).toBe('string')
    await new Promise(resolve => setTimeout(resolve, CONSENT_TOKEN_MIN_AGE_MS + 50))
    return token as string
  }

  it('status probe reports an EXTERNAL disabled package with a consent token', async () => {
    const respond = vi.fn()
    const handle = createPackageOptInHandler({ resolveBoundTab: async () => 7 })
    await handle({ type: 'webmcp_package_optin_status' }, respond)
    const body = respond.mock.calls[0][0] as Record<string, unknown>
    expect(body).toEqual(expect.objectContaining({
      ok: true,
      applicable: true,
      enabled: false,
      package: expect.objectContaining({ id: 'com.discord.main', mount: 'webmcp' }),
    }))
    expect(typeof body.consentToken).toBe('string')
  })

  it('enable writes activation:enabled into the EXTERNAL package config on the user mount', async () => {
    const token = await mintToken()
    const respond = vi.fn()
    const handle = createPackageOptInHandler({ resolveBoundTab: async () => 7 })
    await handle({ type: 'webmcp_package_optin_enable', packageId: 'com.discord.main', consentToken: token }, respond)
    expect(respond.mock.calls[0][0]).toEqual(expect.objectContaining({ ok: true, packageId: 'com.discord.main' }))

    // The write landed on the USER mount (the same file package-management
    // reads) — not in the builtin override storage.
    const stored = JSON.parse(new TextDecoder().decode(await userStorage.readFile(enablePath)))
    expect(stored).toEqual({ activation: 'enabled' })
  })

  it('enable verifies against the user-mount config after the write', async () => {
    const token = await mintToken()
    const respond = vi.fn()
    const handle = createPackageOptInHandler({ resolveBoundTab: async () => 7 })
    await handle({ type: 'webmcp_package_optin_enable', packageId: 'com.discord.main', consentToken: token }, respond)
    expect(respond.mock.calls[0][0]).toMatchObject({ ok: true })
    expect(reload).toHaveBeenCalled()
  })

  it('rejects a consent token minted for ANOTHER package (protocol identical across mounts)', async () => {
    const other = externalEntry({
      directory: 'com.other.pkg',
      package: {
        manifest: { ...DISCORD_MANIFEST, id: 'com.other.pkg' },
        sources: { 'workflows/read_messages.js': READ_ONLY_SOURCE },
      },
    })
    vi.mocked(readWebMCPCatalog).mockResolvedValue([externalEntry(), other])
    vi.mocked(readWebMCPCatalogDetailed).mockResolvedValue([[externalEntry(), other], { userMountComplete: true }])

    const respond0 = vi.fn()
    const handle0 = createPackageOptInHandler({ resolveBoundTab: async () => 7 })
    await handle0({ type: 'webmcp_package_optin_status' }, respond0)
    const token = (respond0.mock.calls[0][0] as { consentToken?: string }).consentToken as string
    await new Promise(resolve => setTimeout(resolve, CONSENT_TOKEN_MIN_AGE_MS + 50))

    const respond = vi.fn()
    const handle = createPackageOptInHandler({ resolveBoundTab: async () => 7 })
    // Token was minted for com.discord.main; using it for com.other.pkg fails.
    await handle({ type: 'webmcp_package_optin_enable', packageId: 'com.other.pkg', consentToken: token }, respond)
    expect(respond.mock.calls[0][0]).toMatchObject({ ok: false, errorCode: 'CONSENT_REQUIRED' })
  })

  it('rejects the enable when the external package no longer matches the tab URL', async () => {
    const token = await mintToken()
    // The tab navigated away from the package's supported site.
    get.mockResolvedValue({ id: 7, url: 'https://example.com/other' })
    const respond = vi.fn()
    const handle = createPackageOptInHandler({ resolveBoundTab: async () => 7 })
    await handle({ type: 'webmcp_package_optin_enable', packageId: 'com.discord.main', consentToken: token }, respond)
    expect(respond.mock.calls[0][0]).toMatchObject({ ok: false, errorCode: 'PACKAGE_MISMATCH' })
  })
})
