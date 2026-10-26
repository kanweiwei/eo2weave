import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ResourceTabPanel } from '../Sidebar'

// The component reads the OPFS store reactively — control it per test.
let mockOpfsState = { pendingChanges: [] as unknown[], cachedPaths: [] as string[] }

vi.mock('@/store/opfs.store', () => ({
  useOPFSStore: (selector: (s: typeof mockOpfsState) => unknown) => selector(mockOpfsState),
}))

vi.mock('zustand', async () => {
  const actual = await vi.importActual<typeof import('zustand')>('zustand')
  return actual
})

const t = (key: string) => key

const opfsOnlyRoots = [{ id: '__opfs__', name: 'Drafts', handle: null }]

function renderPanel() {
  return render(
    <ResourceTabPanel
      resourceTab='files'
      onTabChange={() => {}}
      roots={opfsOnlyRoots}
      selectedFilePath={null}
      rootsLength={1}
      onFileSelect={() => {}}
      onFileDelete={() => {}}
      currentPendingCount={0}
      refreshPending={async () => {}}
      t={t}
    />,
  )
}

describe('ResourceTabPanel — OPFS-only root empty state guard', () => {
  beforeEach(() => {
    mockOpfsState = { pendingChanges: [], cachedPaths: [] }
  })

  it('shows the empty state when the OPFS workspace has no content', () => {
    renderPanel()
    // i18n is not mocked — the title key renders raw, which is fine for assertion
    expect(screen.getByText('sidebar.localFilesEmpty.title')).toBeTruthy()
  })

  it('renders the file tree instead of the empty state once the LLM wrote files', () => {
    mockOpfsState = { pendingChanges: [], cachedPaths: ['reports/a.md'] }
    const { container } = renderPanel()
    expect(screen.queryByText('sidebar.localFilesEmpty.title')).toBeNull()
    // RootFileTreePanel mounts (rendering the virtual root header / tree shell)
    expect(container.firstElementChild).toBeTruthy()
  })

  it('renders the file tree when there are pending changes', () => {
    mockOpfsState = {
      pendingChanges: [{ path: 'b.md', status: 'created' }],
      cachedPaths: [],
    }
    renderPanel()
    expect(screen.queryByText('sidebar.localFilesEmpty.title')).toBeNull()
  })
})
