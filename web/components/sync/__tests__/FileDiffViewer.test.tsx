import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FileDiffViewer } from '../FileDiffViewer'

const getActiveConversationMock = vi.fn()
const getNativeDirectoryHandleMock = vi.fn()
// 'mock'-prefixed so the vi.mock factory below can reference it (hoisting rule).
const mockGetWorkspaceManager = vi.fn()

const fileExistsInNativeFSMock = vi.fn()
const readFileFromOPFSMock = vi.fn()
const readFileFromNativeFSMock = vi.fn()

vi.mock('../MonacoDiffEditor', () => ({
  default: () => <div data-testid="monaco-diff-editor" />,
}))

vi.mock('../LazyDiffViewer', () => ({
  default: () => <div data-testid="lazy-diff-viewer" />,
}))

vi.mock('@/store/conversation-context.store', () => ({
  getActiveConversation: () => getActiveConversationMock(),
}))

vi.mock('@/opfs', () => ({
  isImageFile: () => false,
  getFileContentType: () => 'text',
  fileExistsInNativeFS: (...args: unknown[]) => fileExistsInNativeFSMock(...args),
  readFileFromOPFS: (...args: unknown[]) => readFileFromOPFSMock(...args),
  readFileFromNativeFS: (...args: unknown[]) => readFileFromNativeFSMock(...args),
  readBinaryFileFromOPFS: vi.fn(),
  readBinaryFileFromNativeFS: vi.fn(),
  // Lazy-call wrapper: the factory is hoisted, so a direct reference would hit
  // the TDZ before `mockGetWorkspaceManager` initializes.
  getWorkspaceManager: (...args: unknown[]) => mockGetWorkspaceManager(...args),
}))

describe('FileDiffViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // mockReset first: mockResolvedValue implementations survive clearAllMocks
    // (only calls/results are cleared) and would leak across tests.
    mockGetWorkspaceManager.mockReset()
    // Safe default: pinned lookups find nothing → viewer falls back to active.
    mockGetWorkspaceManager.mockResolvedValue({
      getWorkspace: vi.fn().mockResolvedValue(undefined),
    })
    getNativeDirectoryHandleMock.mockResolvedValue({} as FileSystemDirectoryHandle)
    getActiveConversationMock.mockResolvedValue({
      conversationId: 'conv_1',
      conversation: {
        getNativeDirectoryHandle: getNativeDirectoryHandleMock,
      },
    })
    fileExistsInNativeFSMock.mockResolvedValue(true)
    readFileFromOPFSMock.mockResolvedValue('const n = 2')
    readFileFromNativeFSMock.mockResolvedValue('const n = 1')
  })

  it('renders lazy diff viewer for text file changes', async () => {
    render(
      <FileDiffViewer
        fileChange={{
          type: 'modify',
          path: 'src/example.ts',
          size: 128,
        }}
      />
    )

    // Default renderer is LazyDiffViewer (only changed hunks).
    // Monaco full editor is opt-in via the "switch" button.
    expect(await screen.findByTestId('lazy-diff-viewer')).toBeDefined()
  })

  it('falls back to runtime readFile when readFileFromOPFS misses an added file', async () => {
    // Direct files/ navigation misses cache-layer drafts; the runtime's
    // routed reader (prefer_opfs) should still surface the body so the
    // add-type diff renders instead of the placeholder.
    readFileFromOPFSMock.mockResolvedValue(null)
    getActiveConversationMock.mockResolvedValue({
      conversationId: 'conv_1',
      conversation: {
        getNativeDirectoryHandle: getNativeDirectoryHandleMock,
        readFile: vi.fn().mockResolvedValue({
          source: 'opfs',
          content: 'new file body',
          metadata: {},
        }),
        readCachedFile: vi.fn().mockResolvedValue(null),
      },
    })

    render(
      <FileDiffViewer
        fileChange={{
          type: 'add',
          path: 'src/brand-new.ts',
          size: 14,
        }}
      />
    )

    expect(await screen.findByTestId('lazy-diff-viewer')).toBeDefined()
  })

  it('shows a non-error placeholder when an added file body cannot be loaded', async () => {
    readFileFromOPFSMock.mockResolvedValue(null)
    getActiveConversationMock.mockResolvedValue({
      conversationId: 'conv_1',
      conversation: {
        getNativeDirectoryHandle: getNativeDirectoryHandleMock,
        readFile: vi.fn().mockRejectedValue(new Error('not found')),
        readCachedFile: vi.fn().mockResolvedValue(null),
      },
    })

    render(
      <FileDiffViewer
        fileChange={{
          type: 'add',
          path: 'src/brand-new.ts',
          size: 14,
        }}
      />
    )

    expect(
      await screen.findByText('Preview body unavailable for this new file'),
    ).toBeDefined()
    // The generic error-style message must NOT appear for add-type changes.
    expect(screen.queryByText('Cannot read changed version content')).toBeNull()
  })

  it('hides the diff instead of rendering an all-deletions view when a modify body is unreadable', async () => {
    // OPFS body missing + disk side readable: diffing disk text against ''
    // would mark EVERY line as deleted. Must show the explicit banner instead.
    readFileFromOPFSMock.mockResolvedValue(null)
    getActiveConversationMock.mockResolvedValue({
      conversationId: 'conv_1',
      conversation: {
        getNativeDirectoryHandle: getNativeDirectoryHandleMock,
        readFile: vi.fn(async (_path: string, _h: unknown, opts?: { policy?: string }) => {
          if (opts?.policy === 'prefer_native') {
            return { source: 'native', content: 'old disk content', metadata: {} }
          }
          throw new Error('not found')
        }),
        readCachedFile: vi.fn().mockResolvedValue(null),
      },
    })

    render(
      <FileDiffViewer
        fileChange={{
          type: 'modify',
          path: 'src/example.ts',
          size: 128,
        }}
      />
    )

    expect(
      await screen.findByText('New version content could not be loaded — diff hidden to avoid showing every line as deleted.'),
    ).toBeDefined()
    expect(screen.queryByTestId('lazy-diff-viewer')).toBeNull()
  })

  it('pins reads to the given conversationId instead of the active conversation', async () => {
    // Tool-auth cross-conversation scenario: background conversation "conv_b"
    // prompts for sync approval while "conv_a" is active. The viewer must
    // read conv_b's workspace (via the manager), not the active one.
    let convAReadFile: ReturnType<typeof vi.fn>
    const convBReadFile = vi.fn(async (_path: string, _h: unknown, opts?: { policy?: string }) => {
      if (opts?.policy === 'prefer_native') {
        return { source: 'native', content: 'native body', metadata: {} }
      }
      return { source: 'opfs', content: 'conv B body', metadata: {} }
    })
    const convBReadCachedFile = vi.fn().mockResolvedValue(null)
    mockGetWorkspaceManager.mockReset()
    mockGetWorkspaceManager.mockResolvedValue({
      getWorkspace: vi.fn(async (id: string) =>
        id === 'conv_b'
          ? { readFile: convBReadFile, readCachedFile: convBReadCachedFile }
          : undefined,
      ),
    })
    getActiveConversationMock.mockResolvedValue({
      conversationId: 'conv_a',
      conversation: {
        getNativeDirectoryHandle: getNativeDirectoryHandleMock,
        readFile: (convAReadFile = vi.fn().mockResolvedValue({
          source: 'opfs',
          content: 'ACTIVE conversation body',
          metadata: {},
        })),
        readCachedFile: vi.fn().mockResolvedValue(null),
      },
    })
    readFileFromOPFSMock.mockResolvedValue(null)

    render(
      <FileDiffViewer
        fileChange={{ type: 'modify', path: 'src/pinned.ts', size: 64 }}
        conversationId="conv_b"
      />
    )

    expect(await screen.findByTestId('lazy-diff-viewer')).toBeDefined()
    // Reads went through conv_b's runtime, NOT the active conversation's.
    expect(convBReadFile).toHaveBeenCalled()
    expect(convAReadFile).not.toHaveBeenCalled()
  })

  it('falls back to the active conversation when the pinned workspace is gone', async () => {
    mockGetWorkspaceManager.mockReset()
    mockGetWorkspaceManager.mockResolvedValue({
      getWorkspace: vi.fn().mockResolvedValue(undefined),
    })
    getActiveConversationMock.mockResolvedValue({
      conversationId: 'conv_a',
      conversation: {
        getNativeDirectoryHandle: getNativeDirectoryHandleMock,
        readFile: vi.fn(async (_path: string, _h: unknown, opts?: { policy?: string }) => {
          if (opts?.policy === 'prefer_native') {
            return { source: 'native', content: 'native body', metadata: {} }
          }
          return { source: 'opfs', content: 'active fallback body', metadata: {} }
        }),
        readCachedFile: vi.fn().mockResolvedValue(null),
      },
    })
    readFileFromOPFSMock.mockResolvedValue(null)

    render(
      <FileDiffViewer
        fileChange={{ type: 'modify', path: 'src/fallback.ts', size: 64 }}
        conversationId="conv_gone"
      />
    )

    expect(await screen.findByTestId('lazy-diff-viewer')).toBeDefined()
    // Runtime path stayed empty; the runtime missing → no crash, diff renders
    // through the active conversation fallback.
    expect(getActiveConversationMock).toHaveBeenCalled()
  })
})
