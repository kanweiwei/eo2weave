import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ResourceTabPanel } from '@/components/layout/Sidebar'

// The component (and FileTreePanel beneath it) read the OPFS store
// reactively — control it per test.
let mockOpfsState: {
  pendingChanges: { id: string; path: string; type: 'create' | 'modify' | 'delete' }[]
  cachedPaths: string[]
  approvedNotSyncedPaths: Set<string>
}

vi.mock('@/store/opfs.store', () => ({
  useOPFSStore: (selector: (s: typeof mockOpfsState) => unknown) => selector(mockOpfsState),
}))

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
      activeProjectId={null}
      t={t}
    />,
  )
}

function emptyState() {
  mockOpfsState = { pendingChanges: [], cachedPaths: [], approvedNotSyncedPaths: new Set() }
}

describe('ResourceTabPanel — OPFS-only root empty state guard', () => {
  beforeEach(emptyState)

  it('shows the empty state when the OPFS workspace has no content', () => {
    renderPanel()
    // i18n is not mocked — the title key renders raw, which is fine for assertion
    expect(screen.getByText('sidebar.localFilesEmpty.title')).toBeTruthy()
  })

  it('renders the cached file once the LLM wrote it', async () => {
    mockOpfsState = {
      pendingChanges: [],
      cachedPaths: ['a.md'],
      approvedNotSyncedPaths: new Set(),
    }
    renderPanel()
    // The tree builds its nodes asynchronously (loadChildren + effect pass)
    await waitFor(() => {
      expect(screen.queryByText('sidebar.localFilesEmpty.title')).toBeNull()
    })
    // The generated file must actually appear in the tree
    await screen.findByText('a.md')
  })

  it('renders a pending create in the tree', async () => {
    mockOpfsState = {
      pendingChanges: [{ id: 'p1', path: 'b.md', type: 'create' }],
      cachedPaths: [],
      approvedNotSyncedPaths: new Set(),
    }
    renderPanel()
    await waitFor(() => {
      expect(screen.queryByText('sidebar.localFilesEmpty.title')).toBeNull()
    })
    await screen.findByText('b.md')
  })

  it('keeps the empty state when only pending deletions remain', async () => {
    // Delete records render no tree nodes — content-wise the workspace is empty
    mockOpfsState = {
      pendingChanges: [{ id: 'p2', path: 'gone.md', type: 'delete' }],
      cachedPaths: [],
      approvedNotSyncedPaths: new Set(),
    }
    renderPanel()
    expect(screen.getByText('sidebar.localFilesEmpty.title')).toBeTruthy()
  })
})
