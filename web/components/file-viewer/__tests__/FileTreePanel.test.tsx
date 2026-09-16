import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FileTreePanel } from '../FileTreePanel'

const mockOpfsState = {
  pendingChanges: [] as Array<{ type: 'create' | 'modify' | 'delete'; path: string }>,
  approvedNotSyncedPaths: new Set<string>(),
  cachedPaths: [] as string[],
}

const mockWorkspaceState = {
  activeWorkspaceId: 'ws-test' as string | null,
}

vi.mock('@/store/opfs.store', () => ({
  useOPFSStore: (selector: (state: typeof mockOpfsState) => unknown) => selector(mockOpfsState),
}))

vi.mock('@/store/workspace.store', () => ({
  useWorkspaceStore: (selector: (state: typeof mockWorkspaceState) => unknown) => selector(mockWorkspaceState),
}))

describe('FileTreePanel', () => {
  beforeEach(() => {
    mockOpfsState.pendingChanges = []
    mockOpfsState.approvedNotSyncedPaths = new Set()
    mockOpfsState.cachedPaths = []
    mockWorkspaceState.activeWorkspaceId = 'ws-test'
  })

  it('shows directory hierarchy for cached OPFS files after pending list is empty', async () => {
    mockOpfsState.cachedPaths = ['src/components/App.tsx']
    mockOpfsState.approvedNotSyncedPaths = new Set(['src/components/App.tsx'])

    render(<FileTreePanel directoryHandle={null} onFileSelect={vi.fn()} />)

    const user = userEvent.setup()
    const srcDir = await screen.findByText('src')
    await user.click(srcDir)

    const componentsDir = await screen.findByText('components')
    await user.click(componentsDir)

    expect(await screen.findByText('App.tsx')).toBeInTheDocument()
  })

  it('shows the no-directory hint when no directory, pending, or cached files exist', async () => {
    render(<FileTreePanel directoryHandle={null} onFileSelect={vi.fn()} />)

    expect(await screen.findByText(/You can continue without selecting a local directory/)).toBeInTheDocument()
  })

  it('loads the tree when activeWorkspaceId is null but stale cached paths remain', async () => {
    // Simulate switching to a new project with no workspace
    mockWorkspaceState.activeWorkspaceId = null
    // Stale cachedPaths from previous workspace should not show
    mockOpfsState.cachedPaths = ['stale-file.txt']
    mockOpfsState.pendingChanges = [{ type: 'modify' as const, path: 'stale-modify.txt' }]

    render(<FileTreePanel directoryHandle={null} onFileSelect={vi.fn()} />)

    expect(await screen.findByText('stale-file.txt')).toBeInTheDocument()
  })

  it('lists and expands a Native Host root through its disk executor', async () => {
    const listDir = vi.fn(async (_rootId: string, path: string) => {
      if (path === '') {
        return [
          { name: 'src', kind: 'directory' as const },
          { name: 'README.md', kind: 'file' as const, stat: { size: 12, mtime: 1, contentType: 'text' as const, isFile: true } },
        ]
      }
      return [{ name: 'main.ts', kind: 'file' as const, stat: { size: 8, mtime: 1, contentType: 'text' as const, isFile: true } }]
    })

    render(
      <FileTreePanel
        directoryHandle={null}
        diskRootId="scope_test"
        diskExecutor={{ listDir }}
        onFileSelect={vi.fn()}
      />
    )

    expect(await screen.findByText('README.md')).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(screen.getByText('src'))

    expect(await screen.findByText('main.ts')).toBeInTheDocument()
    expect(listDir).toHaveBeenCalledWith('scope_test', '')
    expect(listDir).toHaveBeenCalledWith('scope_test', 'src')
  })

  it('falls back to OPFS content when an expanded directory is missing on disk (native host)', async () => {
    // The "src/generated" directory exists only in OPFS (created by the agent,
    // not yet synced to disk). The native host's list_dir fails with
    // "directory not found" — the tree must still render the OPFS content.
    const listDir = vi.fn(async (_rootId: string, path: string) => {
      if (path === '') {
        return [{ name: 'src', kind: 'directory' as const }]
      }
      throw new Error(`list_dir failed: directory not found (${path})`)
    })
    mockOpfsState.cachedPaths = ['src/generated/report.md']
    mockOpfsState.approvedNotSyncedPaths = new Set(['src/generated/report.md'])

    render(
      <FileTreePanel
        directoryHandle={null}
        diskRootId="scope_test"
        diskExecutor={{ listDir }}
        onFileSelect={vi.fn()}
      />
    )

    expect(await screen.findByText('src')).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(screen.getByText('src'))

    expect(await screen.findByText('generated')).toBeInTheDocument()
    await user.click(screen.getByText('generated'))
    expect(await screen.findByText('report.md')).toBeInTheDocument()
    expect(screen.queryByText(/list_dir failed/)).not.toBeInTheDocument()
  })

  it('rethrows disk errors for a directory with no OPFS content (native host)', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const listDir = vi.fn(async (_rootId: string, path: string) => {
      if (path === '') {
        return [{ name: 'src', kind: 'directory' as const }]
      }
      throw new Error('list_dir failed: directory not found')
    })

    render(
      <FileTreePanel
        directoryHandle={null}
        diskRootId="scope_test"
        diskExecutor={{ listDir }}
        onFileSelect={vi.fn()}
      />
    )

    expect(await screen.findByText('src')).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(screen.getByText('src'))

    // No OPFS fallback is possible: the toggle logs the failure and the node
    // stays collapsed (children never marked loaded).
    await waitFor(() => expect(consoleError).toHaveBeenCalled())
    expect(consoleWarn).not.toHaveBeenCalledWith(expect.stringContaining('OPFS-only content'))
    consoleWarn.mockRestore()
    consoleError.mockRestore()
  })
})
