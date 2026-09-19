/* eslint-disable */
// @ts-nocheck
/**
 * WorkspacePendingManager — sync ordering & result accounting tests
 *
 * Complements workspace-pending-queue.test.ts by covering the sync()
 * execution semantics: delete-deepest-first ordering, conflict fail-fast
 * accounting, idempotent deletes (NotFoundError), missing-cache failures,
 * and the sync batch lifecycle.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspacePendingManager } from '../workspace-pending'
import type { PendingOverlayOp } from '@/sqlite/repositories/fs-overlay.repository'

const listPendingOpsMock = vi.fn(async () => [] as PendingOverlayOp[])
const upsertPendingOpMock = vi.fn(async (..._args: unknown[]) => ({}) as PendingOverlayOp)
const discardPendingPathMock = vi.fn(async () => {})
const createSyncBatchMock = vi.fn(async () => 'batch-1')
const markOpSyncedMock = vi.fn(async () => {})
const keepOpPendingMock = vi.fn(async () => {})
const recordSyncItemMock = vi.fn(async () => {})
const finalizeSyncBatchMock = vi.fn(async () => {})

vi.mock('@/sqlite/repositories/fs-overlay.repository', () => ({
  getFSOverlayRepository: () => ({
    listPendingOps: listPendingOpsMock,
    upsertPendingOp: upsertPendingOpMock,
    discardPendingPath: discardPendingPathMock,
    createSyncBatch: createSyncBatchMock,
    markOpSynced: markOpSyncedMock,
    keepOpPending: keepOpPendingMock,
    recordSyncItem: recordSyncItemMock,
    finalizeSyncBatch: finalizeSyncBatchMock,
  }),
}))

function makeOp(
  id: string,
  path: string,
  type: 'create' | 'modify' | 'delete',
  timestamp = Date.now()
): PendingOverlayOp {
  return {
    id,
    workspaceId: 'w1',
    path,
    type,
    fsMtime: null,
    reviewStatus: 'pending',
    timestamp,
  } as PendingOverlayOp
}

function makeManager() {
  return new WorkspacePendingManager('w1', {} as FileSystemDirectoryHandle) as any
}

/** Fake OPFS directory handle: tracks files, supports nested dirs + delete */
function makeFakeDir(files = new Map<string, string>()) {
  const dir = {
    getDirectoryHandle: vi.fn(async (name: string) => {
      throw Object.assign(new Error('not found'), { name: 'NotFoundError' })
    }),
    getFileHandle: vi.fn(async (name: string) => {
      if (!files.has(name)) {
        throw Object.assign(new Error('not found'), { name: 'NotFoundError' })
      }
      return {
        createWritable: async () => ({
          write: async (data: string) => files.set(name, data),
          close: async () => {},
        }),
        getFile: async () => ({ text: async () => files.get(name) }),
      }
    }),
    removeEntry: vi.fn(async (name: string) => {
      if (!files.has(name)) {
        throw Object.assign(new Error('not found'), { name: 'NotFoundError' })
      }
      files.delete(name)
    }),
  }
  return dir
}

function makeCacheManager(contentByPath: Record<string, string>) {
  return {
    read: async (path: string) =>
      contentByPath[path] !== undefined ? { content: contentByPath[path] } : null,
  }
}

describe('WorkspacePendingManager sync semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listPendingOpsMock.mockResolvedValue([])
    upsertPendingOpMock.mockImplementation(async (_ws, path, type) =>
      makeOp(`op-${path}-${type}`, path, type)
    )
    createSyncBatchMock.mockResolvedValue('batch-1')
  })

  it('deletes execute deepest-first (child before parent)', async () => {
    const manager = makeManager()
    const now = Date.now()
    listPendingOpsMock.mockResolvedValueOnce([
      makeOp('op-parent', 'src', 'delete', now),
      makeOp('op-child', 'src/deep/child.ts', 'delete', now - 1000),
    ])
    await manager.reload()

    const order: string[] = []
    manager.deleteFile = vi.fn(async (_handle, path: string) => {
      order.push(path)
    })

    const dir = makeFakeDir()
    const result = await manager.sync(dir, makeCacheManager({}))

    expect(result.success).toBe(2)
    expect(order[0]).toBe('src/deep/child.ts')
    expect(order[1]).toBe('src')
  })

  it('records a success batch when all operations succeed', async () => {
    const manager = makeManager()
    listPendingOpsMock.mockResolvedValueOnce([makeOp('op-1', 'a.txt', 'create')])
    await manager.reload()

    const dir = makeFakeDir()
    await manager.sync(dir, makeCacheManager({ 'a.txt': 'content' }))

    expect(finalizeSyncBatchMock).toHaveBeenCalledWith('batch-1', 'success', 1, 0, 0)
  })

  it('records a partial batch when some operations fail', async () => {
    const manager = makeManager()
    // modify with no cached content → failed; delete with no disk target → idempotent success
    listPendingOpsMock.mockResolvedValueOnce([
      makeOp('op-1', 'missing-cache.ts', 'modify'),
      makeOp('op-2', 'gone.ts', 'delete'),
    ])
    await manager.reload()

    const dir = makeFakeDir()
    const result = await manager.sync(dir, makeCacheManager({}))

    expect(result.success).toBe(1) // idempotent delete
    expect(result.failed).toBe(1) // no cached content
    expect(finalizeSyncBatchMock).toHaveBeenCalledWith('batch-1', 'partial', 1, 1, 0)
    // The failed op must stay pending with a reason
    expect(keepOpPendingMock).toHaveBeenCalledWith('op-1', 'No cached content found')
  })

  it('skips paths outside onlyPaths without executing them', async () => {
    const manager = makeManager()
    listPendingOpsMock.mockResolvedValueOnce([
      makeOp('op-1', 'a.txt', 'create'),
      makeOp('op-2', 'b.txt', 'create'),
    ])
    await manager.reload()

    const dir = makeFakeDir()
    const result = await manager.sync(dir, makeCacheManager({ 'a.txt': 'A' }), ['a.txt'])

    expect(result.success).toBe(1)
    expect(result.skipped).toBe(1)
    expect(recordSyncItemMock).toHaveBeenCalledWith('batch-1', 'op-2', 'b.txt', 'skipped')
  })

  it('idempotent deletes treat NotFoundError as success', async () => {
    const manager = makeManager()
    listPendingOpsMock.mockResolvedValueOnce([makeOp('op-1', 'gone.ts', 'delete')])
    await manager.reload()

    const dir = makeFakeDir() // empty → deleteFile throws NotFoundError
    const result = await manager.sync(dir, makeCacheManager({}))

    expect(result.success).toBe(1)
    expect(result.failed).toBe(0)
    expect(markOpSyncedMock).toHaveBeenCalledWith('op-1')
  })

  it('forceOverwrite skips the conflict check', async () => {
    const manager = makeManager()
    listPendingOpsMock.mockResolvedValueOnce([makeOp('op-1', 'a.ts', 'modify')])
    await manager.reload()

    const conflictCheck = vi.spyOn(manager, 'checkNativeConflict')
    manager.readCacheContent = vi.fn(async () => 'fresh content')

    const dir = makeFakeDir(new Map([['a.ts', 'old']]))
    await manager.sync(dir, makeCacheManager({ 'a.ts': 'fresh content' }), undefined, true)

    expect(conflictCheck).not.toHaveBeenCalled()
    expect(dir.getFileHandle).toHaveBeenCalledWith('a.ts', { create: true })
  })
})
