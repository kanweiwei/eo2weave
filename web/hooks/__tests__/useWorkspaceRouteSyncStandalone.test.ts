import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// ── Mocks ────────────────────────────────────────────────────────────
const routerReplaceMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplaceMock, push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    loading: vi.fn(),
  },
}))

vi.mock('@/i18n', () => ({
  useT: () => (key: string) => key,
}))

import { useWorkspaceRouteSyncStandalone } from '@/hooks/useWorkspaceRouteSyncStandalone'
import { useProjectStore } from '@/store/project.store'
import { useConversationContextStore } from '@/store/conversation-context.store'
import { useConversationStore } from '@/store/conversation.store'

// ── Fixtures ─────────────────────────────────────────────────────────
const PROJECT_A = {
  id: 'project-a',
  name: 'Project A',
  status: 'active' as const,
  createdAt: 1_000,
  updatedAt: 1_000,
}

/** Action spies, re-installed into the real stores before each test. */
let switchWorkspaceSpy: ReturnType<typeof vi.fn>
let refreshPendingChangesSpy: ReturnType<typeof vi.fn>
let setActiveConversationSpy: ReturnType<typeof vi.fn>
let setActiveProjectSpy: ReturnType<typeof vi.fn>

function setupStores(opts: {
  activeProjectId?: string
  activeWorkspaceId?: string | null
  conversations?: Array<{ id: string; kind?: 'direct' | 'project' }>
  activeConversationId?: string | null
}) {
  switchWorkspaceSpy = vi.fn(async () => {})
  refreshPendingChangesSpy = vi.fn(async () => {})
  setActiveConversationSpy = vi.fn(async () => {})
  setActiveProjectSpy = vi.fn(async () => true)

  useProjectStore.setState({
    projects: [PROJECT_A],
    projectStats: {},
    activeProjectId: opts.activeProjectId ?? PROJECT_A.id,
    initialized: true,
    isLoading: false,
    error: null,
    // Test-only action spy replacing the real implementation.
    setActiveProject: setActiveProjectSpy as never,
  })

  useConversationContextStore.setState({
    workspaces: [] as never,
    activeWorkspaceId: opts.activeWorkspaceId ?? null,
    initialized: true,
    // Test-only action spies replacing the real implementations.
    switchWorkspace: switchWorkspaceSpy as never,
    refreshPendingChanges: refreshPendingChangesSpy as never,
  })

  useConversationStore.setState({
    conversations: (opts.conversations ?? []) as never,
    activeConversationId: opts.activeConversationId ?? null,
    loaded: true,
    setActive: setActiveConversationSpy as never,
  })
}

describe('useWorkspaceRouteSyncStandalone', () => {
  beforeEach(() => {
    routerReplaceMock.mockClear()
  })

  it('redirects to /chats when the conversation does not exist', async () => {
    setupStores({ conversations: [{ id: 'chat-1', kind: 'direct' }] })
    renderHook(() => useWorkspaceRouteSyncStandalone('chat-missing'))

    await waitFor(() => expect(routerReplaceMock).toHaveBeenCalledWith('/chats'))
    expect(switchWorkspaceSpy).not.toHaveBeenCalled()
    expect(setActiveConversationSpy).not.toHaveBeenCalled()
  })

  it('redirects to /chats when the conversation is not standalone (kind !== direct)', async () => {
    setupStores({ conversations: [{ id: 'chat-1', kind: 'project' }] })
    renderHook(() => useWorkspaceRouteSyncStandalone('chat-1'))

    await waitFor(() => expect(routerReplaceMock).toHaveBeenCalledWith('/chats'))
    expect(switchWorkspaceSpy).not.toHaveBeenCalled()
  })

  it('activates the URL chat: switches workspace then sets the conversation active', async () => {
    setupStores({
      conversations: [{ id: 'chat-1', kind: 'direct' }],
    })
    // Interleaving log: switchWorkspace records on COMPLETION (it is
    // awaited by the hook), setActive records on CALL. Ordering must be
    // [switchWorkspace:done, setActive:call] — if the hook ever fired
    // setActive before the switch finished, the log would invert and this
    // test would fail.
    const eventLog: string[] = []
    switchWorkspaceSpy.mockImplementation(async (id: string) => {
      await Promise.resolve()
      eventLog.push(`switchWorkspace:done:${id}`)
    })
    setActiveConversationSpy.mockImplementation(async (id: string) => {
      eventLog.push(`setActive:call:${id}`)
    })

    renderHook(() => useWorkspaceRouteSyncStandalone('chat-1'))

    await waitFor(() => expect(setActiveConversationSpy).toHaveBeenCalledWith('chat-1'))
    expect(eventLog).toEqual(['switchWorkspace:done:chat-1', 'setActive:call:chat-1'])
    expect(routerReplaceMock).not.toHaveBeenCalled()
  })

  it('drops a stale route-sync completion: a slow sync for chat A never activates chat A after a newer sync to chat B', async () => {
    // Route navigation A → B while A's sync is still inside its switchWorkspace
    // await: when A's await resolves, its generation check must discard the
    // run — setActive('chat-a') must NEVER be called, and the active
    // conversation must remain chat B (the newest sync's choice).
    let releaseSwitchA: (() => void) | null = null
    const switchAGate = new Promise<void>((resolve) => {
      releaseSwitchA = resolve
    })

    setupStores({
      conversations: [
        { id: 'chat-a', kind: 'direct' },
        { id: 'chat-b', kind: 'direct' },
      ],
    })
    switchWorkspaceSpy.mockImplementation(async (id: string) => {
      if (id === 'chat-a') await switchAGate
    })
    // Mirror the real setActive: commit synchronously when called.
    setActiveConversationSpy.mockImplementation(async (id: string) => {
      useConversationStore.setState({ activeConversationId: id })
    })

    const { rerender } = renderHook(({ chatId }) => useWorkspaceRouteSyncStandalone(chatId), {
      initialProps: { chatId: 'chat-a' },
    })
    // Let sync A reach its switchWorkspace await (blocked on the gate).
    await waitFor(() => expect(switchWorkspaceSpy).toHaveBeenCalledWith('chat-a'))
    // Navigate to chat B: effect cleanup bumps A's generation; sync B starts.
    rerender({ chatId: 'chat-b' })
    await waitFor(() => expect(useConversationStore.getState().activeConversationId).toBe('chat-b'))

    // NOW A's slow switchWorkspace resolves — the stale completion must be
    // dropped before it can touch the stores.
    releaseSwitchA!()
    // Flush A's continuation past its awaited call.
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(setActiveConversationSpy).not.toHaveBeenCalledWith('chat-a')
    expect(useConversationStore.getState().activeConversationId).toBe('chat-b')
  })

  it('drops a stale setActive continuation: a newer sync landing while the older setActive is suspended keeps chat B active', async () => {
    // The inverse interleaving of the test above: sync A has CLEARED its
    // pre-await cancelled() check and is suspended inside setActive('chat-a')
    // when sync B (chat-b) runs to completion. When A's setActive resolves,
    // the post-await generation check must discard the run — the store must
    // end on chat B, never chat A.
    let settleSetActiveA: (() => void) | null = null
    const setActiveAGate = new Promise<void>((resolve) => {
      settleSetActiveA = resolve
    })

    setupStores({
      conversations: [
        { id: 'chat-a', kind: 'direct' },
        { id: 'chat-b', kind: 'direct' },
      ],
    })
    setActiveConversationSpy.mockImplementation(async (id: string) => {
      if (id === 'chat-a') await setActiveAGate
      // Mirror the real setActive: commit synchronously when called —
      // INCLUDING chat-a after its gate resumes. If the guard under test is
      // removed, the stale continuation would commit chat-a here and the
      // final assertion would catch it; a mock that never commits chat-a
      // would pass vacuously.
      useConversationStore.setState({ activeConversationId: id })
    })

    const { rerender } = renderHook(({ chatId }) => useWorkspaceRouteSyncStandalone(chatId), {
      initialProps: { chatId: 'chat-a' },
    })
    // Let sync A enter setActive('chat-a') and suspend on the gate.
    await waitFor(() => expect(setActiveConversationSpy).toHaveBeenCalledWith('chat-a'))
    // B's sync starts and completes while A is inside setActive.
    rerender({ chatId: 'chat-b' })
    await waitFor(() => expect(useConversationStore.getState().activeConversationId).toBe('chat-b'))

    // A's suspended setActive resumes: with the stale-activation guard, the
    // run must discard itself instead of committing chat A.
    settleSetActiveA!()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(routerReplaceMock).not.toHaveBeenCalled()
    expect(useConversationStore.getState().activeConversationId).toBe('chat-b')
  })

  it('skips stale-completion repair after the hook unmounts (user left /chats/:id)', async () => {
    // A's sync is suspended inside setActive('chat-a') when the user leaves
    // the route entirely (unmount). When A's setActive resolves there is no
    // newest route target anymore — the repair must NOT read the old ref and
    // re-activate the chat the user just left.
    let settleSetActiveA: (() => void) | null = null
    const setActiveAGate = new Promise<void>((resolve) => {
      settleSetActiveA = resolve
    })

    setupStores({
      conversations: [{ id: 'chat-a', kind: 'direct' }],
    })
    setActiveConversationSpy.mockImplementation(async (id: string) => {
      if (id === 'chat-a') await setActiveAGate
      useConversationStore.setState({ activeConversationId: id })
    })

    const { unmount } = renderHook(() => useWorkspaceRouteSyncStandalone('chat-a'))
    await waitFor(() => expect(setActiveConversationSpy).toHaveBeenCalledWith('chat-a'))

    // Leave /chats/:chat-a while setActive is still pending.
    unmount()
    settleSetActiveA!()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    // The committed setActive inside the store cannot be undone by the hook,
    // but the stale completion must not fire ANY further activation: no
    // repair call re-asserts the abandoned chat.
    expect(setActiveConversationSpy).toHaveBeenCalledTimes(1)
    expect(routerReplaceMock).not.toHaveBeenCalled()
  })

  it('stale-completion repair targets the latest route even when its effect early-returned on loading', async () => {
    // A's sync is suspended inside setActive('chat-a'); the user navigates to
    // /chats/chat-b while project state is loading, so chat-b's effect
    // early-returns BEFORE syncing. The repair must still pick up the
    // chat-b target (tracked before the loading guards) and re-assert chat-b
    // — never re-activate the abandoned chat-a.
    let settleSetActiveA: (() => void) | null = null
    const setActiveAGate = new Promise<void>((resolve) => {
      settleSetActiveA = resolve
    })

    setupStores({
      conversations: [
        { id: 'chat-a', kind: 'direct' },
        { id: 'chat-b', kind: 'direct' },
      ],
    })
    setActiveConversationSpy.mockImplementation(async (id: string) => {
      if (id === 'chat-a') await setActiveAGate
      useConversationStore.setState({ activeConversationId: id })
    })

    const { rerender } = renderHook(({ chatId }) => useWorkspaceRouteSyncStandalone(chatId), {
      initialProps: { chatId: 'chat-a' },
    })
    await waitFor(() => expect(setActiveConversationSpy).toHaveBeenCalledWith('chat-a'))

    // Navigate to chat-b while project state is loading: the new effect
    // returns early, so no sync B ever runs — only the ref tracking
    // (placed before the guards) learns the new target.
    useProjectStore.setState({ isLoading: true })
    rerender({ chatId: 'chat-b' })
    // Give the (early-returning) effect a tick; nothing should have synced.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(switchWorkspaceSpy).not.toHaveBeenCalledWith('chat-b')

    // A's suspended setActive resumes: the repair must re-assert the LATEST
    // route target (chat-b), not the abandoned chat-a.
    settleSetActiveA!()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(useConversationStore.getState().activeConversationId).toBe('chat-b')
    // Exactly two activations: the original chat-a call and the repair to
    // the latest route target — the repair went to chat-b, not chat-a.
    expect(setActiveConversationSpy).toHaveBeenCalledTimes(2)
    expect(setActiveConversationSpy).toHaveBeenNthCalledWith(2, 'chat-b')
  })

  it('stale-completion repair goes through the workspace-switch path (workspace and conversation move together)', async () => {
    // Finding: the repair called setActive(newest) WITHOUT switching the
    // workspace, so when navigation reached chat-b while project state was
    // loading (chat-b's effect early-returned) the conversation store could
    // point at chat-b while the workspace store still pointed at chat-a.
    // The repair must run the FULL sync — switchWorkspace included.
    let settleSetActiveA: (() => void) | null = null
    const setActiveAGate = new Promise<void>((resolve) => {
      settleSetActiveA = resolve
    })

    setupStores({
      conversations: [
        { id: 'chat-a', kind: 'direct' },
        { id: 'chat-b', kind: 'direct' },
      ],
      activeWorkspaceId: null,
    })
    setActiveConversationSpy.mockImplementation(async (id: string) => {
      if (id === 'chat-a') await setActiveAGate
      useConversationStore.setState({ activeConversationId: id })
    })
    // First sync switches to chat-a; the repair must switch to chat-b.
    switchWorkspaceSpy.mockImplementation(async (id: string) => {
      useConversationContextStore.setState({ activeWorkspaceId: id })
    })

    const { rerender } = renderHook(({ chatId }) => useWorkspaceRouteSyncStandalone(chatId), {
      initialProps: { chatId: 'chat-a' },
    })
    await waitFor(() => expect(setActiveConversationSpy).toHaveBeenCalledWith('chat-a'))
    expect(useConversationContextStore.getState().activeWorkspaceId).toBe('chat-a')

    // Navigate to chat-b while project state is loading: its effect
    // early-returns, so without a full-sync repair chat-b would never get
    // its workspace switch.
    useProjectStore.setState({ isLoading: true })
    rerender({ chatId: 'chat-b' })
    await new Promise((resolve) => setTimeout(resolve, 0))

    settleSetActiveA!()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    // The repair switched the workspace to chat-b (not a bare setActive):
    expect(switchWorkspaceSpy).toHaveBeenCalledWith('chat-b')
    expect(useConversationContextStore.getState().activeWorkspaceId).toBe('chat-b')
    expect(useConversationStore.getState().activeConversationId).toBe('chat-b')
    expect(routerReplaceMock).not.toHaveBeenCalled()
  })

  it('a navigation that lands DURING the repair is not overwritten: newer route wins', async () => {
    // Finding: the repair committed setActive(newest) after its await
    // without re-checking the route target, so a navigation that happened
    // while the repair was suspended could be overwritten by the older
    // repair. The repair must re-check the ref after every await.
    let settleSetActiveB: (() => void) | null = null
    const setActiveBGate = new Promise<void>((resolve) => {
      settleSetActiveB = resolve
    })

    setupStores({
      conversations: [
        { id: 'chat-a', kind: 'direct' },
        { id: 'chat-b', kind: 'direct' },
        { id: 'chat-c', kind: 'direct' },
      ],
    })
    switchWorkspaceSpy.mockImplementation(async (id: string) => {
      useConversationContextStore.setState({ activeWorkspaceId: id })
    })
    setActiveConversationSpy.mockImplementation(async (id: string) => {
      if (id === 'chat-b') await setActiveBGate
      useConversationStore.setState({ activeConversationId: id })
    })

    const { rerender } = renderHook(({ chatId }) => useWorkspaceRouteSyncStandalone(chatId), {
      initialProps: { chatId: 'chat-a' },
    })
    await waitFor(() => expect(useConversationStore.getState().activeConversationId).toBe('chat-a'))

    // Navigate to chat-b; its sync suspends inside setActive (gated).
    rerender({ chatId: 'chat-b' })
    await waitFor(() => expect(setActiveConversationSpy).toHaveBeenCalledWith('chat-b'))
    // While chat-b's setActive is suspended, navigate AGAIN to chat-c. This
    // bumps chat-b's effect away (the whole hook effect re-runs for chat-c,
    // whose sync now races the repair).
    rerender({ chatId: 'chat-c' })
    await waitFor(() => expect(useConversationStore.getState().activeConversationId).toBe('chat-c'))

    // Chat-b's suspended setActive resumes and commits — that internal
    // commit cannot be undone — but the repair must follow the NEWEST
    // target (chat-c), never let chat-b win.
    settleSetActiveB!()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(useConversationContextStore.getState().activeWorkspaceId).toBe('chat-c')
    expect(useConversationStore.getState().activeConversationId).toBe('chat-c')
    expect(routerReplaceMock).not.toHaveBeenCalled()
  })

  it('bounds the host-project activation wait: a stalled setActiveProject redirects to /chats', async () => {
    vi.useFakeTimers()
    try {
      // No active project: Step 0 must bind a host before anything else.
      setupStores({ activeProjectId: '', conversations: [{ id: 'chat-1', kind: 'direct' }] })
      // The activation never settles — the stall class the bound exists for.
      setActiveProjectSpy.mockImplementation(() => new Promise<boolean>(() => {}))

      renderHook(() => useWorkspaceRouteSyncStandalone('chat-1'))
      await vi.advanceTimersByTimeAsync(0)
      expect(setActiveProjectSpy).toHaveBeenCalledWith('project-a')
      expect(routerReplaceMock).not.toHaveBeenCalled()

      // Past the HOST_ACTIVATION_TIMEOUT_MS bound (30s, shared with the
      // switchWorkspace bound) the sync gives up and takes the recoverable
      // /chats redirect instead of pinning the route behind its loading gate.
      await vi.advanceTimersByTimeAsync(30_000)
      expect(routerReplaceMock).toHaveBeenCalledWith('/chats')
      expect(switchWorkspaceSpy).not.toHaveBeenCalled()
      expect(setActiveConversationSpy).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a settled host-project activation still proceeds normally (bound does not fire early)', async () => {
    vi.useFakeTimers()
    try {
      setupStores({ activeProjectId: '', conversations: [{ id: 'chat-1', kind: 'direct' }] })

      renderHook(() => useWorkspaceRouteSyncStandalone('chat-1'))
      // Well past the bound minus a tick: the activation resolves first, so
      // the sync must continue into the workspace switch — no redirect.
      await vi.advanceTimersByTimeAsync(29_999)
      expect(routerReplaceMock).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      await vi.advanceTimersByTimeAsync(0)
      expect(switchWorkspaceSpy).toHaveBeenCalledWith('chat-1')
      expect(setActiveConversationSpy).toHaveBeenCalledWith('chat-1')
      expect(routerReplaceMock).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
