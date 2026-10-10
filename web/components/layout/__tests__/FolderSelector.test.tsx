import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mocks = vi.hoisted(() => ({
  sidePanel: true,
  requestPermission: vi.fn(),
  bind: vi.fn(),
  loadRoots: vi.fn(),
  agentState: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/agent/workspace-assistant-context', () => ({ isSidePanelMode: () => mocks.sidePanel }))
vi.mock('@/storage/runtime-capability', () => ({ getRuntimeCapability: () => ({ canPickDirectory: true }) }))
vi.mock('@/hooks/useNativeHostPing', () => ({ useNativeHostPing: () => 'unavailable' }))
vi.mock('@/i18n', () => ({ useT: () => (key: string) => key }))
vi.mock('@/native-fs', () => ({ bindRuntimeDirectoryHandle: mocks.bind }))
vi.mock('@/store/agent.store', () => ({ useAgentStore: { setState: mocks.agentState } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: mocks.error } }))
vi.mock('@/store/folder-access.store', () => ({
  useFolderAccessStore: () => ({
    roots: [{
      id: 'root-photos', name: 'photos', status: 'needs_user_activation', backend: 'fsaccess',
      persistedHandle: { requestPermission: mocks.requestPermission },
    }],
    activeProjectId: 'project-photos', loadRoots: mocks.loadRoots,
    addRoot: vi.fn(), adoptPickedRoot: vi.fn(), addNativeHostRoot: vi.fn(),
    removeRoot: vi.fn(), toggleReadOnly: vi.fn(),
  }),
}))

import { FolderSelector } from '../FolderSelector'

describe('FolderSelector permission restoration', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.sidePanel = true
    mocks.loadRoots.mockResolvedValue(undefined)
    vi.spyOn(window, 'open').mockReturnValue(null)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  async function restore() {
    render(<FolderSelector />)
    const user = userEvent.setup()
    await user.click(screen.getByText('photos'))
    await user.click(screen.getByText('projectRoots.restorePermission'))
  }

  it('requests restoration in a full tab instead of prompting from the side panel', async () => {
    await restore()
    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining('/folder-pick?projectId=project-photos'), '_blank', 'noopener',
    )
    expect(mocks.requestPermission).not.toHaveBeenCalled()
    expect(mocks.bind).not.toHaveBeenCalled()
  })

  it('does not bind a directory when top-level permission is denied', async () => {
    mocks.sidePanel = false
    mocks.requestPermission.mockResolvedValue('denied')
    await restore()
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('projectRoots.permissionDenied'))
    expect(mocks.bind).not.toHaveBeenCalled()
    expect(mocks.agentState).not.toHaveBeenCalled()
  })

  it('binds a directory when top-level permission is explicitly granted', async () => {
    mocks.sidePanel = false
    mocks.requestPermission.mockResolvedValue('granted')
    await restore()
    await waitFor(() => expect(mocks.bind).toHaveBeenCalledWith(
      'project-photos', 'photos', expect.objectContaining({ requestPermission: mocks.requestPermission }),
    ))
    expect(window.open).not.toHaveBeenCalled()
  })
})
