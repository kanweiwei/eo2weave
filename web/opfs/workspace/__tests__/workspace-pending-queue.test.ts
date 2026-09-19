/* eslint-disable */
// @ts-nocheck
/**
 * WorkspacePendingManager — queue lifecycle unit tests
 *
 * Covers the queue semantics that the existing migration/conflict tests do
 * not: add/modify/create coalescing, create→delete cancellation, review
 * status filtering, sync-candidate ordering, and removal paths. The SQLite
 * repository is mocked; behavior under test is the manager's own logic.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspacePendingManager } from '../workspace-pending'
import type { PendingOverlayOp } from '@/sqlite/repositories/fs-overlay.repository'

const listPendingOpsMock = vi.fn(async () => [] as PendingOverlayOp[])
const upsertPendingOpMock = vi.fn(async (..._args: unknown[]) => ({}) as PendingOverlayOp)
const discardPendingPathMock = vi.fn(async () => {})

vi.mock('@/sqlite/repositories/fs-overlay.repository', () => ({
  getFSOverlayRepository: () => ({
    listPendingOps: listPendingOpsMock,
    upsertPendingOp: upsertPendingOpMock,
    discardPendingPath: discardPendingPathMock,
  }),
}))

/** Build an op record shaped like the repository returns. */
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

describe('WorkspacePendingManager queue lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listPendingOpsMock.mockResolvedValue([])
    upsertPendingOpMock.mockImplementation(async (_ws, path, type) =>
      makeOp(`op-${path}-${type}`, path, type)
    )
  })

  it('initialize loads pending ops from the repository', async () => {
    listPendingOpsMock.mockResolvedValueOnce([makeOp('op-1', 'src/a.ts', 'modify')])
    const manager = makeManager()

    await manager.initialize()

    expect(listPendingOpsMock).toHaveBeenCalledWith('w1')
    expect(manager.count).toBe(1)
    expect(manager.getAll()[0].path).toBe('src/a.ts')
  })

  it('coalesces repeated add() of the same path into one modify record', async () => {
    const manager = makeManager()
    await manager.initialize()

    await manager.add('src/a.ts')
    await manager.add('src/a.ts')
    await manager.add('src/a.ts')

    expect(upsertPendingOpMock).toHaveBeenCalledTimes(3)
    expect(manager.count).toBe(1)
  })

  it('keeps create type when adding an already-created file (no modify downgrade)', async () => {
    const manager = makeManager()
    await manager.initialize()

    await manager.markAsCreated('src/new.ts')
    await manager.add('src/new.ts')

    const record = manager.getAll().find((c) => c.path === 'src/new.ts')
    expect(record?.type).toBe('create')
  })

  it('cancels create→delete pairs instead of queuing a delete record', async () => {
    const manager = makeManager()
    await manager.initialize()

    await manager.markAsCreated('src/tmp.ts')
    expect(manager.count).toBe(1)

    await manager.markForDeletion('src/tmp.ts')

    // create + delete cancel out: record removed from queue, discard persisted
    expect(manager.count).toBe(0)
    expect(discardPendingPathMock).toHaveBeenCalledWith('w1', 'src/tmp.ts')
  })

  it('queues a delete record for modify/delete of pre-existing files', async () => {
    const manager = makeManager()
    await manager.initialize()

    await manager.add('src/exists.ts')
    await manager.markForDeletion('src/exists.ts')

    const record = manager.getAll().find((c) => c.path === 'src/exists.ts')
    expect(record?.type).toBe('delete')
    expect(discardPendingPathMock).not.toHaveBeenCalled()
  })

  it('getAll returns clones (mutating the result does not corrupt internal state)', async () => {
    const manager = makeManager()
    await manager.initialize()
    await manager.add('src/a.ts')

    const snapshot = manager.getAll()
    snapshot[0].path = 'mutated.ts'

    expect(manager.getAll()[0].path).toBe('src/a.ts')
  })

  it('excludes approved records from getAll but keeps them as sync candidates', async () => {
    const manager = makeManager()
    await manager.initialize()
    const op = makeOp('op-approved', 'src/approved.ts', 'modify')
    op.reviewStatus = 'approved'
    listPendingOpsMock.mockResolvedValueOnce([op])
    await manager.reload()

    // Not in the review queue…
    expect(manager.getAll()).toHaveLength(0)
    // …but still eligible for sync (only rejected records are excluded)
    const candidates = manager.getSyncCandidates()
    expect(candidates).toHaveLength(1)
    expect(candidates[0].path).toBe('src/approved.ts')
  })

  it('excludes rejected records from both the queue and sync candidates', async () => {
    const manager = makeManager()
    const op = makeOp('op-rejected', 'src/rejected.ts', 'modify')
    op.reviewStatus = 'rejected'
    listPendingOpsMock.mockResolvedValueOnce([op])
    await manager.reload()

    expect(manager.getAll()).toHaveLength(0)
    expect(manager.count).toBe(0)
    expect(manager.getSyncCandidates()).toHaveLength(0)
  })

  it('removeByPath discards the record and drops it from the queue', async () => {
    const manager = makeManager()
    await manager.initialize()
    await manager.add('src/a.ts')

    await manager.removeByPath('src/a.ts')

    expect(manager.count).toBe(0)
    expect(discardPendingPathMock).toHaveBeenCalledWith('w1', 'src/a.ts')
    expect(manager.hasPendingPath('src/a.ts')).toBe(false)
  })

  it('removeByPath is a no-op for unknown paths (no repository write)', async () => {
    const manager = makeManager()
    await manager.initialize()

    await manager.removeByPath('src/unknown.ts')

    expect(discardPendingPathMock).not.toHaveBeenCalled()
  })

  it('hasPendingPath normalizes path separators and leading slashes', async () => {
    const manager = makeManager()
    await manager.initialize()
    await manager.add('src/a.ts')

    expect(manager.hasPendingPath('src/a.ts')).toBe(true)
    expect(manager.hasPendingPath('/src/a.ts')).toBe(true)
    expect(manager.hasPendingPath('src\\a.ts')).toBe(true)
    expect(manager.hasPendingPath('src/b.ts')).toBe(false)
  })

  it('reload() refreshes the in-memory queue from the repository', async () => {
    const manager = makeManager()
    await manager.initialize()
    expect(manager.count).toBe(0)

    listPendingOpsMock.mockResolvedValueOnce([
      makeOp('op-1', 'src/new.ts', 'create'),
      makeOp('op-2', 'src/other.ts', 'modify'),
    ])
    await manager.reload()

    expect(manager.count).toBe(2)
  })

  it('clear() discards every pending path and empties the queue', async () => {
    const manager = makeManager()
    await manager.initialize()
    await manager.add('src/a.ts')
    await manager.add('src/b.ts')

    await manager.clear()

    expect(manager.count).toBe(0)
    expect(discardPendingPathMock).toHaveBeenCalledTimes(2)
  })
})
