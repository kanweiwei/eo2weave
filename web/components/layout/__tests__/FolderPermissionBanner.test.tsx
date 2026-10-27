import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mocks = vi.hoisted(() => ({
  sidePanel: false,
  requestPermission: vi.fn(),
  loadRoots: vi.fn(),
}))

vi.mock('@/agent/workspace-assistant-context', () => ({ isSidePanelMode: () => mocks.sidePanel }))
vi.mock('@/i18n', () => ({ useT: () => (key: string) => key }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('@/native-fs', () => ({ bindRuntimeDirectoryHandle: vi.fn() }))
vi.mock('@/store/agent.store', () => ({ useAgentStore: { setState: vi.fn() } }))

const expiredRoot = {
  id: 'root-photos',
  name: 'photos',
  isDefault: false,
  readOnly: false,
  backend: 'fsaccess',
  scopeId: null,
  handle: null,
  persistedHandle: { requestPermission: mocks.requestPermission },
  status: 'needs_user_activation',
}
const nativeRoot = {
  id: 'root-disk',
  name: 'disk-archive',
  isDefault: false,
  readOnly: false,
  backend: 'native-host',
  scopeId: 'scope-1',
  handle: null,
  persistedHandle: null,
  status: 'idle',
}

vi.mock('@/store/folder-access.store', () => {
  let state: Record<string, unknown> = {
    roots: [] as unknown[],
    rootsHydrated: true,
    activeProjectId: 'project-1',
    loadRoots: mocks.loadRoots,
  }
  const useFolderAccessStore = (selector?: (s: Record<string, unknown>) => unknown) =>
    selector ? selector(state) : state
  return {
    useFolderAccessStore,
    __setMockState: (s: Record<string, unknown>) => {
      state = s
    },
  }
})

// @ts-expect-error — test-only export from the vi.mock factory (real module has no __setMockState)
import { __setMockState } from '@/store/folder-access.store'

function setRoots(roots: unknown[], hydrated = true) {
  __setMockState({
    roots,
    rootsHydrated: hydrated,
    activeProjectId: 'project-1',
    loadRoots: mocks.loadRoots,
  })
}

import { FolderPermissionBanner } from '../FolderPermissionBanner'

describe('FolderPermissionBanner (issue #83)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.loadRoots.mockResolvedValue(undefined)
    setRoots([expiredRoot])
    window.sessionStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders with a re-authorize action when a fsaccess root is needs_user_activation', () => {
    render(<FolderPermissionBanner />)
    expect(screen.getByTestId('folder-permission-banner')).toBeTruthy()
    expect(screen.getByText('projectRoots.bannerSingleTitle')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'projectRoots.bannerReauthorize' })).toBeTruthy()
  })

  it('shows nothing when all roots are ready', () => {
    setRoots([{ ...expiredRoot, status: 'ready' }])
    const { container } = render(<FolderPermissionBanner />)
    expect(screen.queryByTestId('folder-permission-banner')).toBeNull()
    expect(container.childElementCount).toBe(0)
  })

  it('excludes native-host roots (their permission never lapses)', () => {
    setRoots([nativeRoot])
    render(<FolderPermissionBanner />)
    expect(screen.queryByTestId('folder-permission-banner')).toBeNull()
  })

  it('waits for hydration before deciding', () => {
    setRoots([expiredRoot], false)
    render(<FolderPermissionBanner />)
    expect(screen.queryByTestId('folder-permission-banner')).toBeNull()
  })

  it('lists every expired folder name when several lapse at once', () => {
    setRoots([expiredRoot, { ...expiredRoot, id: 'root-docs', name: 'documents' }])
    render(<FolderPermissionBanner />)
    expect(screen.getByText('projectRoots.bannerMultiTitle')).toBeTruthy()
    expect(screen.getByText('photos, documents')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'photos' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'documents' })).toBeTruthy()
  })

  it('requests permission on click and hides the banner once granted', async () => {
    mocks.requestPermission.mockResolvedValue('granted')
    const user = userEvent.setup()
    const { rerender } = render(<FolderPermissionBanner />)
    await user.click(screen.getByRole('button', { name: 'projectRoots.bannerReauthorize' }))
    await waitFor(() =>
      expect(mocks.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' })
    )
    // The mock store doesn't notify subscribers — flip the root to ready and
    // re-render to assert the banner disappears (a real grant flips the store
    // status via loadRoots()).
    act(() => {
      setRoots([{ ...expiredRoot, status: 'ready', handle: {} }])
    })
    rerender(<FolderPermissionBanner />)
    expect(screen.queryByTestId('folder-permission-banner')).toBeNull()
  })

  it('keeps the banner visible after a denied permission request', async () => {
    mocks.requestPermission.mockResolvedValue('denied')
    const user = userEvent.setup()
    render(<FolderPermissionBanner />)
    await user.click(screen.getByRole('button', { name: 'projectRoots.bannerReauthorize' }))
    await waitFor(() => expect(mocks.requestPermission).toHaveBeenCalled())
    expect(screen.getByTestId('folder-permission-banner')).toBeTruthy()
  })

  it('dismiss hides it for the session and stores the session flag', async () => {
    const user = userEvent.setup()
    render(<FolderPermissionBanner />)
    await user.click(screen.getByRole('button', { name: 'projectRoots.bannerDismiss' }))
    expect(screen.queryByTestId('folder-permission-banner')).toBeNull()
    expect(window.sessionStorage.getItem('folder-permission-banner-dismissed')).toBe('1')
  })

  it('hands off to /folder-pick in side-panel mode instead of prompting', async () => {
    mocks.sidePanel = true
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    const user = userEvent.setup()
    render(<FolderPermissionBanner />)
    await user.click(screen.getByRole('button', { name: 'projectRoots.bannerReauthorize' }))
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('/folder-pick?projectId=project-1'),
      '_blank',
      'noopener'
    )
    expect(mocks.requestPermission).not.toHaveBeenCalled()
    openSpy.mockRestore()
    mocks.sidePanel = false
  })
})
