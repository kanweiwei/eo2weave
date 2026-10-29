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
const getSkillsMock = vi.fn(() => [] as Array<{ id: string; source: string }>)

vi.mock('@/skills/skill-manager', () => ({
  getSkillManager: () => ({
    refreshUserSkills: refreshUserSkillsMock,
    getSkills: getSkillsMock,
  }),
}))

const checkAiReadinessMock = vi.fn()

vi.mock('@/lib/skill-install-flow', () => ({
  checkAiReadiness: (...args: unknown[]) => checkAiReadinessMock(...(args as [])),
  buildPrefillText: (name: string, prompt?: string | null) =>
    prompt ? `/${name} ${prompt}` : `/${name}`,
  mergePrefillText: (existing: string | null | undefined, prefill: string) =>
    (existing ?? '').trim() ? `${prefill}\n${existing!.trim()}` : prefill,
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
const inputDraftPeekMock = vi.fn<() => InputDraft | null>(() => null)

const { setActiveProjectMock, useProjectStoreMock, projectState } = vi.hoisted(() => {
  const projectState = {
    initialized: true,
    activeProjectId: 'proj-1',
    projects: [] as Array<{ id: string }>,
    setActiveProject: null as unknown as (id: string) => Promise<boolean>,
  }
  const useProjectStoreMock = { getState: () => projectState }
  // Mirrors the real store: switching projects updates activeProjectId.
  const setActiveProjectMock = vi.fn(async (id: string) => {
    projectState.activeProjectId = id
    return true
  })
  projectState.setActiveProject = setActiveProjectMock
  return { setActiveProjectMock, useProjectStoreMock, projectState }
})

vi.mock('@/store/input-draft.store', () => ({
  useInputDraftStore: { getState: () => ({ saveDraft: saveDraftMock, peekDraft: () => inputDraftPeekMock() }) },
}))

type InputDraft = { text: string; mentionedAgentIds: string[]; selectedFiles: string[] }

vi.mock('@/store/project.store', () => ({
  useProjectStore: useProjectStoreMock,
}))

vi.mock('@/store/conversation-context.store', () => ({
  useConversationContextStore: {
    getState: () => ({
      initialized: true,
      workspaces: [{ id: 'recent-conv', lastAccessedAt: 99 }],
    }),
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
    projectState.initialized = true
    projectState.activeProjectId = 'proj-1'
    projectState.projects = []
    fetchSkillStoreManifestMock.mockResolvedValue({ skills: [ENTRY] })
    // The installed-dir scan runs at load (not installed yet).
    scanInstalledDirNamesMock.mockResolvedValue(new Set<string>())
    installSkillFromUrlMock.mockResolvedValue({ count: 4, manifest: ENTRY })
    // After install, refreshUserSkills registers the skill — the page
    // verifies registration against getSkills() before navigating.
    refreshUserSkillsMock.mockImplementation(async () => {
      getSkillsMock.mockReturnValue([
        { id: `user:${ENTRY.dirName}`, source: 'user' },
      ])
    })
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
    // Deferred installer: the page must NOT start registration or navigate
    // until installSkillFromUrl actually resolves (a real download takes
    // time — an un-awaited call would navigate with the skill missing).
    let resolveInstall!: () => void
    installSkillFromUrlMock.mockReturnValue(
      new Promise((resolve) => {
        resolveInstall = () => resolve({ count: 4, manifest: ENTRY })
      }),
    )
    render(<SkillInstallPage />)
    // Details render first.
    await waitFor(() => expect(screen.getByText('cw-legal-evidence-chain')).toBeInTheDocument())
    const installButton = screen.getByText('skillInstall.installButton')
    fireEvent.click(installButton)

    await waitFor(() => {
      expect(installSkillFromUrlMock).toHaveBeenCalledWith('/skills/cw-legal-evidence-chain.zip', expect.any(Function))
    })
    // While the download is pending, the page must neither register nor navigate.
    expect(refreshUserSkillsMock).not.toHaveBeenCalled()
    expect(routerReplaceMock).not.toHaveBeenCalled()

    resolveInstall()
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
    // Ordering: installation MUST be awaited before registration — refresh
    // may only start after the installer promise resolved.
    expect(refreshUserSkillsMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      installSkillFromUrlMock.mock.invocationCallOrder[0],
    )
    // Ordering: registration MUST complete before navigation — otherwise a
    // visitor arrives at the conversation before the slash command is ready.
    expect(refreshUserSkillsMock.mock.invocationCallOrder[0]).toBeLessThan(
      routerReplaceMock.mock.invocationCallOrder[0],
    )
    // Ordering: the draft write MUST precede router.replace — otherwise a
    // visitor can arrive at the conversation without the prefill (the
    // mocked router does not unmount the page, so "eventually" checks
    // alone would not catch a reordering).
    const draftOrder = saveDraftMock.mock.invocationCallOrder[0]
    const replaceOrder = routerReplaceMock.mock.invocationCallOrder[0]
    expect(draftOrder).toBeLessThan(replaceOrder)
  })

  it('install failure surfaces the error message in the details view', async () => {
    installSkillFromUrlMock.mockRejectedValue(new Error('Download timed out'))
    render(<SkillInstallPage />)
    await waitFor(() => expect(screen.getByText('cw-legal-evidence-chain')).toBeInTheDocument())
    fireEvent.click(screen.getByText('skillInstall.installButton'))
    await waitFor(() => expect(screen.getByText('Download timed out')).toBeInTheDocument())
    // Back on the details view with a retry-able button.
    expect(screen.getByText('skillInstall.installButton')).toBeInTheDocument()
  })

  it('treats an unregistered skill as a failed install (no navigation with a dead slash command)', async () => {
    // refreshUserSkills "succeeds" but the scan failed silently — the skill
    // never shows up in getSkills(), so the page must abort with the
    // registration error instead of navigating.
    refreshUserSkillsMock.mockImplementation(async () => {
      getSkillsMock.mockReturnValue([])
    })
    render(<SkillInstallPage />)
    await waitFor(() => expect(screen.getByText('cw-legal-evidence-chain')).toBeInTheDocument())
    fireEvent.click(screen.getByText('skillInstall.installButton'))
    await waitFor(() => expect(screen.getByText('skillInstall.registerFailed')).toBeInTheDocument())
    expect(routerReplaceMock).not.toHaveBeenCalled()
  })

  it('zero-credit readiness shows the hint in the details view instead of navigating', async () => {
    checkAiReadinessMock.mockResolvedValue({ ready: true, creditExhausted: true })
    render(<SkillInstallPage />)
    await waitFor(() => expect(screen.getByText('cw-legal-evidence-chain')).toBeInTheDocument())
    fireEvent.click(screen.getByText('skillInstall.installButton'))
    await waitFor(() => expect(screen.getByText('skillInstall.creditExhausted')).toBeInTheDocument())
    expect(routerReplaceMock).not.toHaveBeenCalled()
    // A follow-up start proceeds to the conversation.
    fireEvent.click(screen.getByText('skillInstall.starting'))
    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalledWith('/projects/proj-1/workspaces/recent-conv')
    })
  })

  it('fresh session with no active project: falls back to the first project and still navigates', async () => {
    projectState.activeProjectId = ''
    projectState.projects = [{ id: 'auto-default' }]
    render(<SkillInstallPage />)
    await waitFor(() => expect(screen.getByText('cw-legal-evidence-chain')).toBeInTheDocument())
    fireEvent.click(screen.getByText('skillInstall.installButton'))
    await waitFor(() => expect(setActiveProjectMock).toHaveBeenCalledWith('auto-default'))
    await waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalledWith('/projects/auto-default/workspaces/recent-conv')
    })
  })

  it('appends the prefill below an existing unsent draft instead of clobbering it', async () => {
    saveDraftMock.mockImplementation(() => {})
    // Pre-seed an existing draft via peekDraft.
    inputDraftPeekMock.mockReturnValue({
      text: 'my unsent question',
      mentionedAgentIds: ['agent-1'],
      selectedFiles: ['a.md'],
    })
    render(<SkillInstallPage />)
    await waitFor(() => expect(screen.getByText('cw-legal-evidence-chain')).toBeInTheDocument())
    fireEvent.click(screen.getByText('skillInstall.installButton'))
    await waitFor(() => {
      expect(saveDraftMock).toHaveBeenCalledWith('recent-conv', {
        text: '/cw-legal-evidence-chain\nmy unsent question',
        mentionedAgentIds: ['agent-1'],
        selectedFiles: ['a.md'],
      })
    })
    inputDraftPeekMock.mockReturnValue(null)
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
