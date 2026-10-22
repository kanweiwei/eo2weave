import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentManager } from '../agent-manager'

/**
 * Build an in-memory FileSystemDirectoryHandle tree.
 *
 * The File System Access API is not available in the test environment, so we
 * stub just enough of it for AgentManager: directory enumeration, nested
 * directory lookup, and file reads.
 */
function createDir(
  name: string,
  files: Record<string, string> = {},
  dirs: Record<string, FileSystemDirectoryHandle> = {},
): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name,
    entries: async function* () {
      for (const [fileName, content] of Object.entries(files)) {
        yield [
          fileName,
          {
            kind: 'file',
            name: fileName,
            getFile: async () => new Blob([content]),
          },
        ] as unknown as [string, FileSystemFileHandle]
      }
      for (const [dirName, dirHandle] of Object.entries(dirs)) {
        yield [dirName, dirHandle] as unknown as [string, FileSystemDirectoryHandle]
      }
    },
    getDirectoryHandle: vi.fn(async (child: string) => {
      const childHandle = dirs[child]
      if (!childHandle) throw new Error('NotFoundError')
      return childHandle
    }),
    getFileHandle: vi.fn(async (fileName: string) => {
      const content = files[fileName]
      if (content === undefined) throw new Error('NotFoundError')
      return {
        kind: 'file',
        name: fileName,
        getFile: async () => new Blob([content]),
        createWritable: async () => ({
          write: async () => {},
          close: async () => {},
        }),
      }
    }),
    removeEntry: vi.fn(async () => {}),
  } as unknown as FileSystemDirectoryHandle
}

function createManagerWithDiaries(diaryFiles: Record<string, string>) {
  const memoryDir = createDir('memory', diaryFiles)
  const agentsDir = createDir('agents', {}, {
    default: createDir('default', {}, { memory: memoryDir }),
  })
  return new AgentManager(agentsDir)
}

describe('AgentManager.listDiaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists diary dates newest first', async () => {
    const manager = createManagerWithDiaries({
      '2026-10-20.md': 'a',
      '2026-10-22.md': 'b',
      '2026-10-21.md': 'c',
    })

    expect(await manager.listDiaries('default')).toEqual([
      '2026-10-22',
      '2026-10-21',
      '2026-10-20',
    ])
  })

  it('ignores non-markdown files', async () => {
    const manager = createManagerWithDiaries({
      '2026-10-21.md': 'a',
      'notes.txt': 'b',
    })

    expect(await manager.listDiaries('default')).toEqual(['2026-10-21'])
  })

  it('returns an empty array when the memory directory is missing', async () => {
    const agentsDir = createDir('agents', {}, { default: createDir('default') })
    const manager = new AgentManager(agentsDir)

    expect(await manager.listDiaries('default')).toEqual([])
  })

  it('returns an empty array when the agent does not exist', async () => {
    const manager = new AgentManager(createDir('agents'))

    expect(await manager.listDiaries('nope')).toEqual([])
  })
})
