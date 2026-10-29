/**
 * Tests for the /skill-install promotion landing page (issue #126):
 * param validation (missing / unknown skill → friendly error), the details
 * → install → navigate happy path, and installed-idempotency ("already
 * installed" shows without re-installing).
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────

const routerReplaceMock = vi.fn()

const searchParamsMock = vi.fn<() => URLSearchParams>(() => new URLSearchParams('skill=cw-legal-evidence-chain'))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplaceMock, push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/skill-install',
  useParams: () => ({}),
  useSearchParams: () => searchParamsMock(),
}))

vi.mock('@/i18n', () => ({
  useT: () => (key: string, params?: Record<string, string | number>) =>
    params && 'count' in params ? `${key}:${params.count}` : key,
}))

const fetchSkillStoreManifestMock = vi.fn()
const installSkillFromUrlMock = vi.fn()
const scanInstalledDirNamesMock = vi.fn()

vi.mock('@/skills/skill-store', () => ({
  fetchSkillStoreManifest: (...args: unknown[]) => fetchSkillStoreManifestMock(...(args as [])),
  installSkillFromUrl: (...args: unknown[]) => installSkillFromUrlMock(...(args as [])),
  scanInstalledDirNames: (...args: unknown[]) => scanInstalledDirNamesMock(...(args as [])),
}))

const refreshUserSkillsMock = vi.fn(async () => {})

vi.mock('@/skills/skill-manager', () => ({
  getSkillManager: () => ({ refreshUserSkills: refreshUserSkillsMock }),
}))

const checkAiReadinessMock = vi.fn()

vi.mock('@/lib/skill-install-flow', () => ({
  checkAiReadiness: (...args: unknown[]) => checkAiReadinessMock(...(args as [])),
  buildPrefillText: (name: string, prompt?: string | null) =>
    prompt ? `/${name} ${prompt}` : `/${name}`,
  pickConversationTarget: vi.fn(() => ({ id: 'recent-conv', created: false })),
  waitForCondition: vi.fn(async () => true),
}))

vi.mock('@/lib/jianguoyun-ai-console', () => ({
  getNutstoreAIConsoleURL: () => 'https://ai.jianguoyun.com',
}))

vi.mock('@/hooks/useGatewayLogin', () => ({
  useGatewayLogin: () => ({
    authState: { status: 'idle' as const },
    isRunning: false,
    login: vi.fn(async () => true),
    reset: vi.fn(),
  }),
}))

const saveDraftMock = vi.fn()

vi.mock('@/store/input-draft.store', () => ({
  useInputDraftStore: { getState: () => ({ saveDraft: saveDraftMock }) },
}))

vi.mock('@/store/project.store', () => ({
  useProjectStore: { getState: () => ({ initialized: true, activeProjectId: 'proj-1' }) },
}))

vi.mock('@/store/conversation-context.store', () => ({
  useConversationContextStore: {
    getState: () => ({ workspaces: [{ id: 'recent-conv', lastAccessedAt: 99 }] }),
  },
}))

vi.mock('@/store/conversation.store', () => ({
  useConversationStore: {
    getState: () => ({ createNew: vi.fn(() => ({ id: 'new-conv' })) }),
  },
}))

vi.mock('@/lib/route-paths', () => ({
  projectWorkspacePath: (projectId: string, workspaceId?: string) =>
    workspaceId ? `/projects/${projectId}/workspaces/${workspaceId}` : `/projects/${projectId}`,
}))

import SkillInstallPage from '@/app/(app)/skill-install/page'

const ENTRY = {
  id: 'cw-legal-evidence-chain',
  name: 'cw-legal-evidence-chain',
  dirName: 'cw-legal-evidence-chain',
  description: "Lawyers' evidence-chain analysis",
  category: 'general',
  tags: ['legal'],
  version: '1.1.2',
  zipUrl: '/skills/cw-legal-evidence-chain.zip',
  fileCount: 4,
}

describe('SkillInstallPage (issue #126)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchSkillStoreManifestMock.mockResolvedValue({ skills: [ENTRY] })
    scanInstalledDirNamesMock.mockResolvedValue(new Set<string>())
    installSkillFromUrlMock.mockResolvedValue({ count: 4, manifest: ENTRY })
    checkAiReadinessMock.mockResolvedValue({ ready: true, creditExhausted: false })
    searchParamsMock.mockReturnValue(new URLSearchParams('skill=cw-legal-evidence-chain'))
  })

  it('unknown skill param shows the friendly error', async () => {
    fetchSkillStoreManifestMock.mockResolvedValue({ skills: [] })
    render(<SkillInstallPage />)
    await waitFor(() => expect(screen.getByText('skillInstall.errorTitle')).toBeInTheDocument())
    expect(screen.getByText('skillInstall.notFound')).toBeInTheDocument()
    expect(screen.getByText('skillInstall.openSkillManager')).toBeInTheDocument()
  })

  it('missing skill param shows the missing-param error (no manifest fetch)', async () => {
    searchParamsMock.mockReturnValue(new URLSearchParams())
    render(<SkillInstallPage />)
    await waitFor(() => expect(screen.getByText('skillInstall.missingParam')).toBeInTheDocument())
    expect(fetchSkillStoreManifestMock).not.toHaveBeenCalled()
  })

  it('manifest fetch failure shows load-failed with a retry entry', async () => {
    fetchSkillStoreManifestMock.mockRejectedValue(new Error('HTTP 500'))
    render(<SkillInstallPage />)
    await waitFor(() => expect(screen.getByText('HTTP 500')).toBeInTheDocument())
    expect(screen.getByText('skillInstall.retry')).toBeInTheDocument()
  })

  it('happy path: details → Install (user click) → refreshUserSkills → navigate with prefill', async () => {
    render(<SkillInstallPage />)
    // Details render first.
    await waitFor(() => expect(screen.getByText('cw-legal-evidence-chain')).toBeInTheDocument())
    const installButton = screen.getByText('skillInstall.installButton')
    fireEvent.click(installButton)

    await waitFor(() => {
      expect(installSkillFromUrlMock).toHaveBeenCalledWith('/skills/cw-legal-evidence-chain.zip', expect.any(Function))
    })
    // Slash command registers immediately after install.
    await waitFor(() => expect(refreshUserSkillsMock).toHaveBeenCalled())
    // Navigates to the most recent conversation (lastAccessedAt: 99).
    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalledWith('/projects/proj-1/workspaces/recent-conv')
    })
    // Prefill was written before navigation.
    expect(saveDraftMock).toHaveBeenCalledWith('recent-conv', {
      text: '/cw-legal-evidence-chain',
      mentionedAgentIds: [],
      selectedFiles: [],
    })
  })

  it('idempotent for installed skills: no re-install, "already installed" badge', async () => {
    scanInstalledDirNamesMock.mockResolvedValue(new Set([ENTRY.dirName]))
    render(<SkillInstallPage />)
    await waitFor(() => expect(screen.getByText('skillInstall.installedBadge')).toBeInTheDocument())

    // The single click (start) runs readiness only — never a re-install.
    fireEvent.click(screen.getByText('skillInstall.starting'))
    await waitFor(() => expect(checkAiReadinessMock).toHaveBeenCalled())
    expect(installSkillFromUrlMock).not.toHaveBeenCalled()
    expect(refreshUserSkillsMock).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalledWith('/projects/proj-1/workspaces/recent-conv')
    })
  })

  it('prompt param is appended to the prefill', async () => {
    searchParamsMock.mockReturnValue(
      new URLSearchParams('skill=cw-legal-evidence-chain&prompt=整理本案证据'),
    )
    render(<SkillInstallPage />)
    await waitFor(() => expect(screen.getByText('cw-legal-evidence-chain')).toBeInTheDocument())
    fireEvent.click(screen.getByText('skillInstall.installButton'))
    await waitFor(() => {
      expect(saveDraftMock).toHaveBeenCalledWith(
        'recent-conv',
        expect.objectContaining({ text: '/cw-legal-evidence-chain 整理本案证据' }),
      )
    })
  })
})
