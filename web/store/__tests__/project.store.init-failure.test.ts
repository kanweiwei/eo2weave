import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────
// project.store.initialize() touches: the project repository (SQLite),
// ProjectManager (OPFS), and — on the success path — agent stores via
// dynamic import. Only the repository matters for these tests.

const findAllProjects = vi.fn()
const findProjectStats = vi.fn()

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

import { useProjectStore } from '../project.store'

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
    })
    sessionStorage.clear()
    localStorage.clear()
    // Default: a healthy repository returning an empty list.
    findAllProjects.mockResolvedValue([])
    findProjectStats.mockResolvedValue([])
  })

  it('does NOT set initialized:true on failure and exposes the error', async () => {
    findAllProjects.mockRejectedValue(new Error('OPFS pool busy'))

    await useProjectStore.getState().initialize()

    const state = useProjectStore.getState()
    expect(state.initialized).toBe(false)
    expect(state.error).toBe('OPFS pool busy')
    expect(state.isLoading).toBe(false)
  })

  it('retries the full init when initialize() runs again after a failure', async () => {
    findAllProjects.mockRejectedValueOnce(new Error('transient'))
    await useProjectStore.getState().initialize()
    expect(useProjectStore.getState().initialized).toBe(false)

    // Second call must actually query the repository again (retry path).
    await useProjectStore.getState().initialize()

    expect(findAllProjects).toHaveBeenCalledTimes(2)
    const state = useProjectStore.getState()
    expect(state.initialized).toBe(true)
    expect(state.error).toBeNull()
  })

  it('persists the failure to sessionStorage for diagnostics', async () => {
    findAllProjects.mockRejectedValue(new Error('database_inaccessible'))

    await useProjectStore.getState().initialize()

    const raw = sessionStorage.getItem('creatorweave:project-store-init-error')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw as string)).toMatchObject({
      message: 'database_inaccessible',
    })
  })

  it('clears the persisted failure record after a successful init', async () => {
    findAllProjects.mockRejectedValueOnce(new Error('transient'))
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
  })
})
