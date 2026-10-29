import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Settings-section behaviour for the WebMCP package registry installer
 * (issue #117 Tier 1). Covers the states the registry card must render:
 *   - the tool count comes from the package's OWN manifest (verified), not
 *     from the registry's claim;
 *   - an ENABLED package is labelled active, not inactive;
 *   - a late installed-id refresh never overwrites a newer one.
 */

const store = vi.hoisted(() => ({
  listRegistries: vi.fn(() => [] as unknown[]),
  listInstalledPackageIds: vi.fn(async () => new Set<string>()),
  readInstalledPackageActivation: vi.fn(async (_id: string) => 'disabled' as 'enabled' | 'disabled'),
  loadRegistryCatalog: vi.fn(async () => ({ packages: [] as unknown[] })),
  addRegistry: vi.fn(),
  removeRegistry: vi.fn(),
  installRegistryPackage: vi.fn(async () => ({ filesWritten: 1 })),
  uninstallRegistryPackage: vi.fn(async () => undefined),
}))

vi.mock('@/webmcp/package-registry-store', () => store)

import { WebMCPPackageRegistrySection } from '@/components/webmcp/WebMCPPackageRegistrySection'

const REGISTRY = {
  rawBase: 'https://raw.githubusercontent.com/owner/repo/main',
  manifestUrl: 'https://raw.githubusercontent.com/owner/repo/main/manifest.json',
  label: 'owner/repo',
}

const PKG = {
  id: 'com.example.pkg',
  version: '1.0.0',
  description: 'Example package.',
  // The registry CLAIMS two tools; the package manifest actually has one.
  toolCount: 2,
  files: [],
}

/**
 * t() renders the key so assertions can look for stable markers. The tool
 * count key keeps its `{count}` placeholder so the rendered count (the
 * VERIFIED manifest count) is visible in the text.
 */
const t = (key: string) => (key === 'settings.webmcpPackages.toolsCount' ? '{count} tools' : key)

/** Serve the package manifest.json (with `toolCount` tools) to the section. */
function serveManifest(toolCount = 1) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      id: PKG.id,
      version: PKG.version,
      description: PKG.description,
      tools: Array.from({ length: toolCount }, (_, i) => ({
        name: `tool_${i}`, description: `Tool ${i}`, urlRegex: '^https://example\\.com/.*$', path: `t${i}.js`,
      })),
    }),
  })))
}

beforeEach(() => {
  vi.resetAllMocks()
  store.listRegistries.mockReturnValue([REGISTRY])
  store.listInstalledPackageIds.mockResolvedValue(new Set())
  store.readInstalledPackageActivation.mockResolvedValue('disabled')
  store.loadRegistryCatalog.mockResolvedValue({ packages: [PKG] })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('WebMCPPackageRegistrySection', () => {
  it('shows the VERIFIED tool count from the package manifest, not the registry claim', async () => {
    serveManifest(1)
    render(<WebMCPPackageRegistrySection t={t} />)

    await waitFor(() => expect(screen.getByText('com.example.pkg')).toBeTruthy())
    // The registry claims 2 tools; the package manifest has exactly 1.
    await waitFor(() => expect(screen.getByText(/1 tools/)).toBeTruthy())
    expect(screen.queryByText(/2 tools/)).toBeNull()
  })

  it('labels an ENABLED installed package as active and drops the enable hint', async () => {
    serveManifest(1)
    store.listInstalledPackageIds.mockResolvedValue(new Set([PKG.id]))
    store.readInstalledPackageActivation.mockResolvedValue('enabled')
    render(<WebMCPPackageRegistrySection t={t} />)

    await waitFor(() => expect(screen.getByText('settings.webmcpPackages.installedActive')).toBeTruthy())
    expect(screen.queryByText('settings.webmcpPackages.installedInactive')).toBeNull()
    expect(screen.queryByText('settings.webmcpPackages.installedInactiveHint')).toBeNull()
  })

  it('labels a DISABLED installed package as inactive and keeps the enable hint', async () => {
    serveManifest(1)
    store.listInstalledPackageIds.mockResolvedValue(new Set([PKG.id]))
    store.readInstalledPackageActivation.mockResolvedValue('disabled')
    render(<WebMCPPackageRegistrySection t={t} />)

    await waitFor(() => expect(screen.getByText('settings.webmcpPackages.installedInactive')).toBeTruthy())
    expect(screen.getByText('settings.webmcpPackages.installedInactiveHint')).toBeTruthy()
    expect(screen.queryByText('settings.webmcpPackages.installedActive')).toBeNull()
  })

  it('ignores a STALE installed-id refresh that resolves after a newer one', async () => {
    serveManifest(1)
    // The FIRST read (mount effect) resolves LAST with the OLD (empty) set;
    // the SECOND read (triggered by the install below) resolves first with
    // the new set. The stale result must be dropped, otherwise the package
    // would appear uninstalled and could be installed again.
    let resolveFirst: (value: Set<string>) => void = () => {}
    let call = 0
    store.listInstalledPackageIds.mockImplementation(() => {
      call += 1
      if (call === 1) {
        return new Promise<Set<string>>(resolve => { resolveFirst = resolve })
      }
      return Promise.resolve(new Set([PKG.id]))
    })
    render(<WebMCPPackageRegistrySection t={t} />)
    await waitFor(() => expect(screen.getByText('com.example.pkg')).toBeTruthy())

    // Install the package — this triggers the SECOND (newer) refresh.
    fireEvent.click(screen.getByText('settings.webmcpPackages.install'))
    await waitFor(() => expect(screen.getByText('settings.webmcpPackages.confirmInstallConfirm')).toBeTruthy())
    fireEvent.click(screen.getByText('settings.webmcpPackages.confirmInstallConfirm'))

    // The newer read landed: the package is shown as installed.
    await waitFor(() => expect(screen.getByText('settings.webmcpPackages.installedInactive')).toBeTruthy())
    // The stale read finishes now — it must NOT wipe the installed state.
    resolveFirst(new Set())
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(screen.queryByText('settings.webmcpPackages.installedInactive')).toBeTruthy()
  })
})
