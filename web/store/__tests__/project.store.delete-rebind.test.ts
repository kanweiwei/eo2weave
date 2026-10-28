import { beforeEach, describe, expect, it, vi } from 'vitest'

// deleteProject's host-rebind loop must run BEFORE the project row is
// committed for deletion: a rebind failure has to abort the deletion
// (observable + retryable), and the last-project case must rebind hosts to
// empty string (falsy everywhere projectId is consumed) instead of leaving
// the deleted id stranded on hidden host rows.

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
})
