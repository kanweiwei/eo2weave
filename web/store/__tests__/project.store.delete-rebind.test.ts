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
  // Activation's existence checks: tests that exercise setActiveProject
  // replace this with a live spy (default: never found).
  findById: vi.fn(async () => null),
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
// setState is included because setActiveProject's step 1 also touches these
// stores (the activation-overlapping-deletion test exercises that path).
vi.mock('@/store/agent.store', () => ({
  useAgentStore: {
    getState: () => ({ setActiveProject: vi.fn(async () => {}) }),
    setState: vi.fn(),
  },
}))
vi.mock('@/store/conversation-context.store', () => ({
  useConversationContextStore: {
    getState: () => ({ refreshWorkspaces: vi.fn(async () => {}) }),
    setState: vi.fn(),
  },
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

  it('a failed deletion does not strand already-queued deletions (queue keeps draining)', async () => {
    // Finding: the shared chain was attached with a bare `.then(...)`, so
    // when p-a's rebind failed the chain rejected and p-b's queued section
    // was SKIPPED — p-b's caller resolved false for a deletion never
    // attempted and the project stayed alive. Each queued section must
    // swallow the predecessor's rejection (the failed caller still sees its
    // own error via its own link) so the queue drains in order.
    let alive = new Set(['p-a', 'p-b'])
    findAllProjectsMock.mockImplementation(async () =>
      [...alive].map((id) => ({ id, name: id, status: 'active', createdAt: 1, updatedAt: 1 }))
    )
    deleteProjectMock.mockImplementation((async (id: string) => {
      alive.delete(id)
    }) as never)
    // The workspace query is keyed by project (like production): p-a owns
    // host-1, p-b owns host-2. p-a's rebind fails; p-b's rebind must still
    // run afterwards and must not inherit p-a's failure.
    findAllWorkspacesByProjectIncludingDirectMock.mockImplementation((async (projectId: string) =>
      projectId === 'p-a'
        ? [{ id: 'host-1', projectId: 'p-a' } as never]
        : [{ id: 'host-2', projectId: 'p-b' } as never]) as never)
    updateWorkspaceMock.mockImplementation((async (ws: { id: string; projectId: string }) => {
      if (ws.id === 'host-1') throw new Error('rebind boom')
    }) as never)

    const [okA, okB] = await Promise.all([
      useProjectStore.getState().deleteProject('p-a'),
      useProjectStore.getState().deleteProject('p-b'),
    ])

    // The failed deletion reports failure to ITS caller only...
    expect(okA).toBe(false)
    expect(useProjectStore.getState().error).toContain('rebind boom')
    // ...and the queued deletion still RAN and succeeded.
    expect(okB).toBe(true)
    expect(deleteProjectMock).toHaveBeenCalledWith('p-b')
    expect(alive.has('p-b')).toBe(false)
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
    // Fresh module registry so THIS test's doMock factories are what the
    // store's dynamic imports observe: a prior test already imported the
    // dynamically-imported stores, and without the reset the cached module
    // (and its EARLIER spies) would be reused here. (Same pattern as
    // conversation.store.sqlite.test.ts's conversion tests.)
    vi.resetModules()
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
    // Fresh module registry: the previous test installed its own doMock
    // factories and dynamically imported the mocked stores — without the
    // reset this test's doMock would not take effect (cached module keeps
    // the earlier spies) and the assertion below could pass or fail against
    // the WRONG spy.
    vi.resetModules()
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

  it('rebind failure mid-deleteProject restores original workspace assignments', async () => {
    // Finding: when the SECOND rebind (or the row deletion) failed, the
    // already-rebound workspaces stayed assigned to the successor project
    // even though the deletion aborted — the caller saw failure while the
    // store held half-applied rebinds. Every successful rebind must be
    // rolled back to its ORIGINAL project id on failure.
    useProjectStore.setState({ activeProjectId: '', projects: [project('p-a'), project('p-b')] } as never)
    findAllProjectsMock.mockResolvedValue([project('p-a'), project('p-b')])
    findAllWorkspacesByProjectIncludingDirectMock.mockResolvedValue([
      { id: 'host-1', projectId: 'p-a' } as never,
      { id: 'host-2', projectId: 'p-a' } as never,
    ])
    // First rebind succeeds, second fails — the rollback must restore BOTH.
    updateWorkspaceMock.mockImplementation((async (ws: { id: string }) => {
      if (ws.id === 'host-2') throw new Error('second rebind boom')
    }) as never)

    const ok = await useProjectStore.getState().deleteProject('p-a')

    expect(ok).toBe(false)
    expect(useProjectStore.getState().error).toContain('second rebind boom')
    // Deletion never committed.
    expect(deleteProjectMock).not.toHaveBeenCalled()
    // Rollback: host-1 (successfully rebound to p-b) is restored to p-a.
    const host1Restore = updateWorkspaceMock.mock.calls.find(
      (c) => (c as unknown as [{ id: string; projectId: string }])[0].id === 'host-1' &&
        (c as unknown as [{ id: string; projectId: string }])[0].projectId === 'p-a'
    )
    expect(host1Restore).toBeTruthy()
  })

  it('post-delete repair failure still returns success with a refreshed list', async () => {
    // Finding: a throw in the active-pointer repair AFTER the row deletion
    // committed made the caller see failure while the project was gone from
    // SQLite — and the outer catch skipped refreshProjects, so the UI kept
    // the deleted project. The repair must be non-fatal (deletion reports
    // success) and the list must be refreshed from the repository.
    const agentSetActiveProjectMock = vi.fn(async () => {
      throw new Error('repair boom')
    })
    // Fresh module registry — see the survivor-deletion test above.
    vi.resetModules()
    vi.doMock('@/store/agent.store', () => ({
      useAgentStore: { getState: () => ({ setActiveProject: agentSetActiveProjectMock }) },
    }))
    vi.doMock('@/store/conversation-context.store', () => ({
      useConversationContextStore: { getState: () => ({ refreshWorkspaces: vi.fn(async () => {}) }) },
    }))

    useProjectStore.setState({ activeProjectId: 'p-a', projects: [project('p-a'), project('p-b')] } as never)
    findAllProjectsMock.mockResolvedValue([project('p-b')])
    findAllWorkspacesByProjectIncludingDirectMock.mockResolvedValue([])

    const ok = await useProjectStore.getState().deleteProject('p-a')

    // Deletion committed → success, despite the repair crash.
    expect(ok).toBe(true)
    expect(deleteProjectMock).toHaveBeenCalledWith('p-a')
    expect(useProjectStore.getState().error).toBeNull()
    // The UI list was refreshed AFTER the deletion committed: it reflects
    // the surviving projects, not the invocation-time snapshot.
    expect(useProjectStore.getState().projects.map((p) => p.id)).toEqual(['p-b'])
  })

  it('activation that overlaps a committed deletion does not republish the deleted id', async () => {
    // Finding: setActiveProject passed its initial existence check, then
    // paused during its awaits while deleteProject removed the row; when
    // deletion read the OLD active pointer it skipped repair, and activation
    // later published the deleted id into activeProjectId — the app stayed
    // pointed at a project whose row was gone. The row must be revalidated
    // immediately before the publish, and a vanished row must abort the
    // activation (false + error), never republish the dead id.
    let rowAlive = true
    findAllProjectsMock.mockImplementation(async () =>
      rowAlive ? [project('p-a'), project('p-b')] : [project('p-b')]
    )
    // findById reflects the live row existence (deletion removes it).
    projectRepoMock.findById = vi.fn(async (id: string) =>
      rowAlive ? project(id) : null
    ) as never
    findAllWorkspacesByProjectIncludingDirectMock.mockResolvedValue([
      { id: 'host-1', projectId: 'p-a' } as never,
    ])
    // happy-dom has no navigator.storage, so bootstrapProjectOpfs would
    // early-return; enable it so activation's OPFS bootstrap await hosts the
    // interleaving (this test only — restored at the end). The stub dir
    // handle is enough for ensureProject's getDirectoryHandle chain.
    ;(navigator as unknown as { storage: unknown }).storage = {
      getDirectory: async () => ({
        getDirectoryHandle: async () => ({
          getDirectoryHandle: async () => ({}),
        }),
      }),
    }
    // Suspend activation inside its OPFS bootstrap await — the window where
    // the overlapping deleteProject commits and removes the row.
    // (mockImplementationOnce REPLACES the base create for this call; the
    // instance must still expose deleteProject for later flush paths.)
    ProjectManagerMock.create.mockImplementationOnce(async () => ({
      getOrCreateProjectById: async () => {
        await useProjectStore.getState().deleteProject('p-a')
      },
      getProject: async () => null,
      deleteProject: projectManagerDeleteMock,
    }))
    // The overlapping deletion must actually REMOVE the row: once the DB
    // delete commits, both findAllProjects and findById observe it gone.
    deleteProjectMock.mockImplementation((async () => {
      rowAlive = false
    }) as never)
    // Fresh registry + own doMock factories: earlier tests in this file
    // installed doMock factories WITHOUT setState for these stores and that
    // registration persists until unmocked/reset — activation's step 1
    // calls setState on both. folder-access is mocked because activation
    // step 3 reaches it through the real agent.store chain, and its
    // IndexedDB hydration never settles under the test-setup IDB mock.
    vi.resetModules()
    const activationAgentSetActiveMock = vi.fn(async () => {})
    const activationRefreshWorkspacesMock = vi.fn(async () => {})
    vi.doMock('@/store/agent.store', () => ({
      useAgentStore: {
        getState: () => ({ setActiveProject: activationAgentSetActiveMock }),
        setState: vi.fn(),
      },
    }))
    vi.doMock('@/store/conversation-context.store', () => ({
      useConversationContextStore: {
        getState: () => ({ refreshWorkspaces: activationRefreshWorkspacesMock }),
        setState: vi.fn(),
      },
    }))
    vi.doMock('@/store/folder-access.store', () => ({
      useFolderAccessStore: {
        getState: () => ({ setActiveProject: vi.fn(async () => {}) }),
        setState: vi.fn(),
      },
    }))
    vi.doMock('@/store/agents.store', () => ({
      useAgentsStore: {
        getState: () => ({
          setProjectManager: vi.fn(),
          initialize: vi.fn(async () => {}),
        }),
        setState: vi.fn(),
      },
    }))

    // Order matters: activation starts first (passes its initial check),
    // deletion queues behind it and commits during activation's awaits.
    const activation = useProjectStore.getState().setActiveProject('p-a')

    const ok = await activation
    // Activation aborts instead of publishing the deleted id...
    expect(ok).toBe(false)
    expect(useProjectStore.getState().activeProjectId).not.toBe('p-a')
    expect(useProjectStore.getState().error).toContain('Project not found: p-a')
    // ...and the store list was re-synced from the repository (p-b survives).
    expect(useProjectStore.getState().projects.map((p) => p.id)).toEqual(['p-b'])
    // Drop the navigator.storage stub so later tests keep the happy-dom
    // early-return behavior.
    delete (navigator as unknown as { storage?: unknown }).storage
  })

  it('OPFS cleanup runs only AFTER the DB row deletion commits', async () => {
    // Finding: the OPFS directory was deleted BEFORE repo.deleteProject — a
    // DB failure then lost the project's workspace files with no way back.
    // The order must be: rebinds → DB commit → OPFS cleanup (deferred,
    // best-effort: at that point the data is unreferenced, so a failed OPFS
    // cleanup is orphaned files, not data loss).
    const order: string[] = []
    deleteProjectMock.mockImplementation((async (id: string) => {
      order.push(`db:${id}`)
    }) as never)
    projectManagerDeleteMock.mockImplementation((async (id: string) => {
      order.push(`opfs:${id}`)
    }) as never)
    useProjectStore.setState({ activeProjectId: '', projects: [project('p-a')] } as never)
    findAllProjectsMock.mockResolvedValue([])

    const ok = await useProjectStore.getState().deleteProject('p-a')

    expect(ok).toBe(true)
    expect(order).toEqual(['db:p-a', 'opfs:p-a'])
  })

  it('a DB deletion failure never touches OPFS (workspace files survive for retry)', async () => {
    // Finding 1's data-loss half: with the old order the OPFS directory was
    // already destroyed when the DB deletion failed, so retrying a "failed"
    // deletion resurrected an empty project. Now OPFS cleanup happens only
    // after a committed deletion — a DB failure must leave OPFS untouched.
    useProjectStore.setState({ activeProjectId: '', projects: [project('p-a'), project('p-b')] } as never)
    findAllProjectsMock.mockResolvedValue([project('p-a'), project('p-b')])
    findAllWorkspacesByProjectIncludingDirectMock.mockResolvedValue([
      { id: 'host-1', projectId: 'p-a' } as never,
    ])
    deleteProjectMock.mockRejectedValueOnce(new Error('db boom'))

    const ok = await useProjectStore.getState().deleteProject('p-a')

    expect(ok).toBe(false)
    expect(useProjectStore.getState().error).toContain('db boom')
    expect(projectManagerDeleteMock).not.toHaveBeenCalled()
  })

  it('post-delete repair failure still clears the stale active pointer and refreshes workspace state', async () => {
    // Finding: when the repair crashed (here: agent store sync), the store's
    // activeProjectId stayed on the DELETED id — refreshProjects() re-syncs
    // the list but not the pointer, so the UI kept pointing at a dead
    // project. The fallback must re-derive the pointer (first remaining
    // project, matching the store's existing normalization) and reset the
    // dependent workspace state, while the deletion still reports success.
    const agentSetActiveProjectMock = vi.fn(async () => {
      throw new Error('repair boom')
    })
    const refreshWorkspacesMock = vi.fn(async () => {})
    const contextSetStateMock = vi.fn()
    // Fresh module registry — see the survivor-deletion test above.
    vi.resetModules()
    vi.doMock('@/store/agent.store', () => ({
      useAgentStore: { getState: () => ({ setActiveProject: agentSetActiveProjectMock }) },
    }))
    vi.doMock('@/store/conversation-context.store', () => ({
      useConversationContextStore: {
        getState: () => ({ refreshWorkspaces: refreshWorkspacesMock }),
        setState: contextSetStateMock,
      },
    }))

    useProjectStore.setState({ activeProjectId: 'p-a', projects: [project('p-a'), project('p-b')] } as never)
    findAllProjectsMock.mockResolvedValue([project('p-b')])
    findAllWorkspacesByProjectIncludingDirectMock.mockResolvedValue([])

    const ok = await useProjectStore.getState().deleteProject('p-a')

    // Deletion committed → still success.
    expect(ok).toBe(true)
    expect(deleteProjectMock).toHaveBeenCalledWith('p-a')
    // Pointer was re-derived away from the deleted id to the survivor.
    expect(useProjectStore.getState().activeProjectId).not.toBe('p-a')
    expect(useProjectStore.getState().activeProjectId).toBe('p-b')
    // Dependent workspace state was refreshed for the fallback pointer.
    expect(refreshWorkspacesMock).toHaveBeenCalled()
  })
})
