import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────
// project.store.initialize() touches: the project repository (SQLite),
// ProjectManager (OPFS), and — on the success path — agent stores via
// dynamic import. Only the repository matters for these tests.

const {
  findAllProjects,
  findProjectStats,
} = vi.hoisted(() => ({
  findAllProjects: vi.fn(),
  findProjectStats: vi.fn(),
}))

vi.mock('@/sqlite/repositories/project.repository', () => ({
  DEFAULT_PROJECT_ID: 'default-project',
  getProjectRepository: () => ({
    findAllProjects,
    findProjectStats,
    createProject: vi.fn(),
    deleteProject: vi.fn(),
  }),
}))

vi.mock('@/opfs', () => ({
  ProjectManager: { create: vi.fn() },
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), info: vi.fn() },
}))

import { useProjectStore } from '@/store/project.store'

describe('project.store initialize() failure semantics (issue #131)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Reset the store to a pristine snapshot before each test. Zustand +
    // immer freezes state objects, so always pass plain snapshots.
    useProjectStore.setState({
      activeProjectId: '',
      projects: [],
      projectStats: {},
      initialized: false,
      isLoading: false,
      error: null,
      initError: null,
      initErrorKind: 'transient',
      initializingRetry: false,
    })
    sessionStorage.clear()
    localStorage.clear()
    // Default: a healthy repository returning an empty list.
    findAllProjects.mockResolvedValue([])
    findProjectStats.mockResolvedValue([])
  })

  it('does NOT set initialized:true on failure and exposes initError', async () => {
    findAllProjects.mockRejectedValue(new Error('OPFS pool busy'))

    await useProjectStore.getState().initialize()

    const state = useProjectStore.getState()
    expect(state.initialized).toBe(false)
    expect(state.error).toBe('OPFS pool busy')
    expect(state.initError).toBe('OPFS pool busy')
    // Known retryable-contention signature → reassurance classification.
    expect(state.initErrorKind).toBe('transient')
    expect(state.isLoading).toBe(false)
  })

  it('classifies unrecognizable storage failures as kind:"unknown" (no reassurance)', async () => {
    // Sourcery round 2 ("Storage damage gets reassurance"): an I/O error or
    // any unrecognized storage failure must NOT get the transient
    // "projects are safe, retrying usually fixes it" classification — the
    // code has no basis to promise the data is safe.
    findAllProjects.mockRejectedValue(new Error('Storage I/O error'))

    await useProjectStore.getState().initialize()

    const state = useProjectStore.getState()
    expect(state.initError).toBe('Storage I/O error')
    expect(state.initErrorKind).toBe('unknown')
  })

  it('classifies corruption-class errors as kind:"corruption"', async () => {
    findAllProjects.mockRejectedValue(new Error('Database file is corrupt'))

    await useProjectStore.getState().initialize()

    const state = useProjectStore.getState()
    expect(state.initErrorKind).toBe('corruption')
    const raw = sessionStorage.getItem('creatorweave:project-store-init-error')
    expect(JSON.parse(raw as string)).toMatchObject({ kind: 'corruption' })
  })

  it('classifies persistent open failures (CANTOPEN) as unknown — no reassurance', async () => {
    // Sourcery round 3 ("Persistent open failures promise safe data"):
    // CANTOPEN / database_inaccessible can be a persistent path or access
    // problem, not temporary contention — they must not get the transient
    // "projects are safe, retrying usually fixes it" classification.
    findAllProjects.mockRejectedValue(new Error('SQLite error: CANTOPEN'))

    await useProjectStore.getState().initialize()

    const state = useProjectStore.getState()
    expect(state.initError).toBe('SQLite error: CANTOPEN')
    expect(state.initErrorKind).toBe('unknown')
  })

  it('classifies database_inaccessible as unknown — no reassurance', async () => {
    findAllProjects.mockRejectedValue(new Error('database_inaccessible'))

    await useProjectStore.getState().initialize()

    expect(useProjectStore.getState().initErrorKind).toBe('unknown')
  })

  it('reportInitFailure surfaces storage-layer startup failures like init failures', () => {
    // Sourcery round 3 ("Worker startup failures bypass the banner"):
    // AppBootstrap records initStorage() failures via reportInitFailure —
    // they must land in the same banner/diagnostics state.
    useProjectStore.getState().reportInitFailure('OPFS worker failed to start')

    const state = useProjectStore.getState()
    expect(state.initialized).toBe(false)
    expect(state.initError).toBe('OPFS worker failed to start')
    expect(state.initErrorKind).toBe('unknown')
    expect(state.isLoading).toBe(false)
    const raw = sessionStorage.getItem('creatorweave:project-store-init-error')
    expect(JSON.parse(raw as string)).toMatchObject({
      message: 'OPFS worker failed to start',
    })
  })

  it('reportInitFailure classifies contention signatures as transient', () => {
    useProjectStore.getState().reportInitFailure('opfs pool busy')
    expect(useProjectStore.getState().initErrorKind).toBe('transient')
  })

  it('retries the full init when initialize() runs again after a failure', async () => {
    findAllProjects.mockRejectedValueOnce(new Error('opfs pool busy'))
    await useProjectStore.getState().initialize()
    expect(useProjectStore.getState().initialized).toBe(false)

    // Second call must actually query the repository again (retry path).
    await useProjectStore.getState().initialize()

    expect(findAllProjects).toHaveBeenCalledTimes(2)
    const state = useProjectStore.getState()
    expect(state.initialized).toBe(true)
    expect(state.error).toBeNull()
    expect(state.initError).toBeNull()
    expect(state.initializingRetry).toBe(false)
  })

  it('de-duplicates concurrent initialize() calls into one attempt', async () => {
    // Sourcery "Retry can become a no-op": overlapping calls must JOIN one
    // attempt, never race a success against a later failure. The shared
    // in-flight promise eliminates the overlap race at the source.
    let calls = 0
    findAllProjects.mockImplementation(async () => {
      calls += 1
      await new Promise((r) => setTimeout(r, 10))
      return []
    })

    await Promise.all([
      useProjectStore.getState().initialize(),
      useProjectStore.getState().initialize(),
    ])

    expect(calls).toBe(1)
    expect(useProjectStore.getState().initialized).toBe(true)
  })

  it('persists the failure to sessionStorage for diagnostics', async () => {
    findAllProjects.mockRejectedValue(new Error('storage I/O failure'))

    await useProjectStore.getState().initialize()

    const raw = sessionStorage.getItem('creatorweave:project-store-init-error')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw as string)).toMatchObject({
      message: 'storage I/O failure',
    })
  })

  it('clears the persisted failure record after a successful init', async () => {
    findAllProjects.mockRejectedValueOnce(new Error('opfs pool busy'))
    await useProjectStore.getState().initialize()
    expect(
      sessionStorage.getItem('creatorweave:project-store-init-error')
    ).not.toBeNull()

    await useProjectStore.getState().initialize()

    expect(
      sessionStorage.getItem('creatorweave:project-store-init-error')
    ).toBeNull()
  })

  it('still succeeds (initialized:true) when the repository works', async () => {
    await useProjectStore.getState().initialize()

    const state = useProjectStore.getState()
    expect(state.initialized).toBe(true)
    expect(state.error).toBeNull()
    expect(state.initError).toBeNull()
  })
})
