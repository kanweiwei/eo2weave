import { beforeEach, describe, expect, it, vi } from 'vitest'

// deleteProject's host-rebind loop must run BEFORE the project row is
// committed for deletion: a rebind failure has to abort the deletion
// (observable + retryable), and the last-project case must rebind hosts to
// empty string (falsy everywhere projectId is consumed) instead of leaving
// the deleted id stranded on hidden host rows. Overlapping deletions are
// serialized on a module-level promise chain, so the second deletion's
// successor selection re-reads the project table only after the first
// deletion's rebind — and its project row deletion — has completed.

const findAllProjectsMock = vi.hoisted(() => vi.fn())
const findProjectStatsMock = vi.hoisted(() => vi.fn(async () => []))
const deleteProjectMock = vi.hoisted(() => vi.fn(async () => {}))
const projectRepoMock = vi.hoisted(() => ({
  findAllProjects: findAllProjectsMock,
  findProjectStats: findProjectStatsMock,
  deleteProject: deleteProjectMock,
  createProject: vi.fn(),
  updateProject: vi.fn(),
  setActiveProject: vi.fn(async () => {}),
  clearActiveProject: vi.fn(async () => {}),
}))

const findAllWorkspacesByProjectIncludingDirectMock = vi.hoisted(() => vi.fn(async () => []))
const updateWorkspaceMock = vi.hoisted(() => vi.fn(async () => {}))
const workspaceRepoMock = vi.hoisted(() => ({
  findAllWorkspacesByProjectIncludingDirect: findAllWorkspacesByProjectIncludingDirectMock,
  updateWorkspace: updateWorkspaceMock,
}))

const projectManagerDeleteMock = vi.hoisted(() => vi.fn(async () => {}))
const ProjectManagerMock = vi.hoisted(() => ({
  create: vi.fn(async () => ({ deleteProject: projectManagerDeleteMock })),
}))

vi.mock('@/sqlite/repositories/project.repository', () => ({
  getProjectRepository: () => projectRepoMock,
  DEFAULT_PROJECT_ID: 'default',
}))

vi.mock('@/sqlite/repositories/workspace.repository', () => ({
  getWorkspaceRepository: () => workspaceRepoMock,
}))

vi.mock('@/opfs', () => ({ ProjectManager: ProjectManagerMock }))

// Lazy imports inside deleteProject (only on the active-project branch —
// these tests never make the deleted project active, but mock defensively).
vi.mock('@/store/agent.store', () => ({
  useAgentStore: { getState: () => ({ setActiveProject: vi.fn(async () => {}) }) },
}))
vi.mock('@/store/conversation-context.store', () => ({
  useConversationContextStore: { getState: () => ({ refreshWorkspaces: vi.fn(async () => {}) }) },
}))

import { useProjectStore } from '@/store/project.store'

const project = (id: string) => ({
  id, name: id, status: 'active' as const, createdAt: 1, updatedAt: 1,
})

describe('project.store deleteProject host rebind', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateWorkspaceMock.mockResolvedValue(undefined)
    findAllWorkspacesByProjectIncludingDirectMock.mockResolvedValue([])
    deleteProjectMock.mockResolvedValue(undefined)
    projectManagerDeleteMock.mockResolvedValue(undefined)
    useProjectStore.setState({
      activeProjectId: '',
      projects: [],
      projectStats: {},
      initialized: true,
      isLoading: false,
      error: null,
    } as never)
  })

  it('rebind failure aborts deletion: project row survives and error is reported', async () => {
    findAllProjectsMock.mockResolvedValue([project('p-a'), project('p-b')])
    // Pre-seed store state used by deleteProject: activeProjectId '' so the
    // post-deletion active-project branch never runs.
    useProjectStore.setState({ activeProjectId: '', projects: [project('p-a'), project('p-b')] } as never)
    findAllWorkspacesByProjectIncludingDirectMock.mockResolvedValue([
      { id: 'host-1', projectId: 'p-a' } as never,
    ])
    updateWorkspaceMock.mockRejectedValueOnce(new Error('rebind boom'))

    const ok = await useProjectStore.getState().deleteProject('p-a')

    expect(ok).toBe(false)
    expect(useProjectStore.getState().error).toContain('rebind boom')
    // Deletion must NOT have been committed — the rebind runs first.
    expect(deleteProjectMock).not.toHaveBeenCalled()
  })

  it('last-project deletion rebinds hosts to empty string (no-project), not the dead id', async () => {
    // Only the project being deleted remains.
    useProjectStore.setState({ activeProjectId: '', projects: [project('p-only')] } as never)
    findAllProjectsMock.mockResolvedValue([])
    findAllWorkspacesByProjectIncludingDirectMock.mockResolvedValue([
      { id: 'host-1', projectId: 'p-only' } as never,
      { id: 'host-2', projectId: 'p-only' } as never,
    ])

    const ok = await useProjectStore.getState().deleteProject('p-only')

    expect(ok).toBe(true)
    expect(deleteProjectMock).toHaveBeenCalledWith('p-only')
    expect(updateWorkspaceMock).toHaveBeenCalledTimes(2)
    expect(updateWorkspaceMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'host-1', projectId: '' }))
    expect(updateWorkspaceMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'host-2', projectId: '' }))
    // Sanity: nextProjectId derived from remaining projects EXCLUDING the
    // deleted one — never the deleted id itself.
    const reboundIds = updateWorkspaceMock.mock.calls.map((c) => ((c as unknown as [{ projectId: string }])[0]).projectId)
    expect(reboundIds).not.toContain('p-only')
  })

  it('rebinds hosts to the next remaining project when other projects survive', async () => {
    useProjectStore.setState({ activeProjectId: '', projects: [project('p-a'), project('p-b')] } as never)
    findAllProjectsMock.mockResolvedValue([project('p-a'), project('p-b')])
    findAllWorkspacesByProjectIncludingDirectMock.mockResolvedValue([
      { id: 'host-1', projectId: 'p-a' } as never,
    ])

    const ok = await useProjectStore.getState().deleteProject('p-a')

    expect(ok).toBe(true)
    expect(deleteProjectMock).toHaveBeenCalledWith('p-a')
    expect(updateWorkspaceMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'host-1', projectId: 'p-b' }))
  })

  it('overlapping deletions are serialized: the second rebind re-reads projects the first already deleted', async () => {
    // Two deletions fired concurrently (e.g. double-click on two sidebar
    // delete buttons). Without serialization both would compute their
    // successor from the same not-yet-updated project table and rebind the
    // OTHER's standalone-chat hosts to a project that is itself being
    // deleted — leaving those host rows pointing at a dead project id. The
    // module-level promise chain forces p-a's rebind AND row deletion to
    // finish before p-b's rebind reads the project table.
    let alive = new Set(['p-a', 'p-b'])
    findAllProjectsMock.mockImplementation(async () =>
      [...alive].map((id) => ({ id, name: id, status: 'active', createdAt: 1, updatedAt: 1 }))
    )
    deleteProjectMock.mockImplementation((async (id: string) => {
      // Reproduce the interleaving hazard: p-b's rebind section starts while
      // p-a's deletion row is NOT yet committed — if the rebind sections
      // overlapped, p-a's hosts would pick p-b as successor here.
      alive.delete(id)
    }) as never)
    // Gate the rebind section so both deleteProject calls are in flight
    // before either rebind begins: p-a's rebind blocks until p-b has been
    // INITIATED (both promises created), proving the chain serializes the
    // critical sections rather than the callers merely sequencing.
    let releaseARebind: (() => void) | null = null
    const aRebindGate = new Promise<void>((resolve) => {
      releaseARebind = resolve
    })
    updateWorkspaceMock.mockImplementation((async (ws: { id: string; projectId: string }) => {
      if (ws.projectId === 'p-a' && ws.id === 'host-1') {
        await aRebindGate
      }
    }) as never)
    findAllWorkspacesByProjectIncludingDirectMock.mockImplementation((async (projectId: string) =>
      projectId === 'p-a'
        ? [{ id: 'host-1', projectId: 'p-a' } as never]
        : [{ id: 'host-2', projectId: 'p-b' } as never]) as never)

    const deleteA = useProjectStore.getState().deleteProject('p-a')
    const deleteB = useProjectStore.getState().deleteProject('p-b')
    // Both callers are in flight; now let p-a's rebind proceed. p-b's rebind
    // must still run entirely after p-a's FULL deleteProject (rebind + row
    // deletion) because each deletion enqueues BOTH steps on the shared
    // chain — so p-b's successor selection observes p-a's row already gone.
    releaseARebind!()
    const [okA, okB] = await Promise.all([deleteA, deleteB])

    expect(okA).toBe(true)
    expect(okB).toBe(true)
    // host-1 (p-a's orphan) was rebound while p-b's row still existed — but
    // p-b's own deletion completes afterwards and rebinds nothing else; the
    // critical hazard the chain eliminates is the SECOND selection reading a
    // STALE table: p-b's rebind of host-2 must not pick p-a (row already
    // deleted by the time p-b's section runs).
    const host1Rebind = updateWorkspaceMock.mock.calls.find(
      (c) => (c as unknown as [{ id: string }])[0].id === 'host-1'
    ) as unknown as [{ id: string; projectId: string }]
    expect(updateWorkspaceMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'host-1', projectId: 'p-b' }))
    // p-b's rebind (host-2) ran after p-a's row deletion: its successor must
    // NOT be p-a (already deleted) — it must be '' here.
    const host2Rebind = updateWorkspaceMock.mock.calls.find(
      (c) => (c as unknown as [{ id: string }])[0].id === 'host-2'
    ) as unknown as [{ id: string; projectId: string }]
    expect(host2Rebind[0].projectId).toBe('')
    void host1Rebind
  })

  it('queued deletion repairs a stale active pointer: an earlier chained deletion rebound active to THIS deletion target', async () => {
    // The old code snapshotted activeProjectId BEFORE waiting on the deletion
    // chain: p-a is active when deleteProject('p-b') is invoked, so the check
    // `activeProjectId === 'p-b'` was false and never re-ran — even though
    // p-a's deletion (running first on the chain) rebound the active pointer
    // to p-b, leaving the store pointing at the project p-b's deletion is
    // about to remove. The repair must re-read the LIVE pointer inside the
    // serialized section instead.
    const agentSetActiveProjectMock = vi.fn(async () => {})
    const refreshWorkspacesMock = vi.fn(async () => {})
    vi.doMock('@/store/agent.store', () => ({
      useAgentStore: { getState: () => ({ setActiveProject: agentSetActiveProjectMock }) },
    }))
    vi.doMock('@/store/conversation-context.store', () => ({
      useConversationContextStore: { getState: () => ({ refreshWorkspaces: refreshWorkspacesMock }) },
    }))

    useProjectStore.setState({ activeProjectId: 'p-a', projects: [project('p-a'), project('p-b')] } as never)
    let alive = new Set(['p-a', 'p-b'])
    findAllProjectsMock.mockImplementation(async () =>
      [...alive].map((id) => ({ id, name: id, status: 'active', createdAt: 1, updatedAt: 1 }))
    )
    deleteProjectMock.mockImplementation((async (id: string) => {
      alive.delete(id)
    }) as never)
    findAllWorkspacesByProjectIncludingDirectMock.mockResolvedValue([])

    // Both callers in flight: p-b snapshots nothing (the old code snapshotted
    // 'p-a' here) and queues behind p-a on the deletion chain.
    const deleteA = useProjectStore.getState().deleteProject('p-a')
    const deleteB = useProjectStore.getState().deleteProject('p-b')
    const [okA, okB] = await Promise.all([deleteA, deleteB])
    expect(okA).toBe(true)
    expect(okB).toBe(true)

    // p-a's section ran first and rebound the active pointer to the only
    // survivor, p-b. p-b's section then observed the LIVE pointer (p-b —
    // matching its own deletion target), NOT p-a: with the stale snapshot the
    // guard would have skipped the repair entirely, stranding the pointer on
    // a project whose row p-b's deletion just removed.
    expect(useProjectStore.getState().activeProjectId).toBe('')
    expect(projectRepoMock.clearActiveProject).toHaveBeenCalled()
    expect(agentSetActiveProjectMock).toHaveBeenCalledWith('')
    expect(refreshWorkspacesMock).toHaveBeenCalled()
  })

  it('survivor deletion selects a remaining project as the new active, ignoring its invocation-time snapshot', async () => {
    const agentSetActiveProjectMock = vi.fn(async () => {})
    vi.doMock('@/store/agent.store', () => ({
      useAgentStore: { getState: () => ({ setActiveProject: agentSetActiveProjectMock }) },
    }))
    vi.doMock('@/store/conversation-context.store', () => ({
      useConversationContextStore: { getState: () => ({ refreshWorkspaces: vi.fn(async () => {}) }) },
    }))

    // Active pointer is p-x at INVOCATION time — neither the deleted project
    // nor the eventual successor. The repair must run on the live pointer:
    // here it already points at the deleted project (the common case), so a
    // surviving project is selected.
    useProjectStore.setState({ activeProjectId: 'p-x', projects: [project('p-x'), project('p-a'), project('p-b')] } as never)
    findAllProjectsMock.mockResolvedValue([project('p-a'), project('p-b')])
    findAllWorkspacesByProjectIncludingDirectMock.mockResolvedValue([])

    await useProjectStore.getState().deleteProject('p-x')

    expect(projectRepoMock.setActiveProject).toHaveBeenCalledWith('p-a')
    expect(useProjectStore.getState().activeProjectId).toBe('p-a')
    expect(agentSetActiveProjectMock).toHaveBeenCalledWith('p-a')
  })
})
