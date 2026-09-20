/**
 * Workspace Change Detection
 *
 * Standalone implementations of WorkspaceRuntime's dual-storage change
 * detection methods (OPFS scan, diff against snapshots, pending-changes
 * refresh, detected-change registration). Each function takes the runtime
 * instance (via the WorkspaceChangeDetectionInternals bridge interface)
 * as its first parameter; the class methods on WorkspaceRuntime are
 * one-line delegates.
 *
 * Cross-method calls go through the runtime instance (rt.method()) so
 * instance-level overrides keep working exactly as before extraction.
 */

import type {
  FileContent,
  FileScanItem,
  FileChange,
  ChangeDetectionResult,
} from '../types/opfs-types'
import { scanFilesInWorker } from '@/workers/diff-worker-manager'
import type { WorkspacePendingManager } from './workspace-pending'
import type { DiskExecutor } from '../native-disk/executor'

/**
 * Internal bridge onto WorkspaceRuntime's change-detection state and
 * delegate methods. The class delegates cast `this` to this interface so
 * the standalone implementations can access the fields/methods they need.
 */
export interface WorkspaceChangeDetectionInternals {
  initialized: boolean
  /** Cache for scanFiles result (for performance) */
  scanFilesCache?: Map<string, FileScanItem>
  readonly pendingManager: WorkspacePendingManager
  readonly diskExec: DiskExecutor
  initialize(): Promise<void>
  getFilesDir(): Promise<FileSystemDirectoryHandle>
  scanFiles(): Promise<Map<string, FileScanItem>>
  hasAnyNativeDirectoryHandle(): Promise<boolean>
  hasCachedFile(path: string): boolean
  cleanupStaleBaselines(): Promise<void>
  normalizeWorkspacePath(path: string): string
  getNativeDirectoryHandleForPath(path: string, projectId?: string | null): Promise<FileSystemDirectoryHandle | null>
  resolvePath(path: string, projectId?: string | null): Promise<{
    rootName: string
    rootId: string | null
    backend: 'fsaccess' | 'native-host'
    relativePath: string
    readOnly: boolean
  }>
  getFileHandle(nativeDir: FileSystemDirectoryHandle, path: string): Promise<FileSystemFileHandle>
  readFromFilesDir(path: string): Promise<{ content: FileContent; mtime: number; size: number; contentType: 'text' | 'binary' } | null>
  areFileContentsEqual(left: FileContent, right: FileContent): Promise<boolean>
  captureModifyBaseline(path: string, content: FileContent, forceOverwrite?: boolean): Promise<void>
}

  /**
   * Scan files/ directory for change detection
   * @returns Map of file path -> FileScanItem
   */
export async function scanFilesImpl(
  rt: WorkspaceChangeDetectionInternals
): Promise<Map<string, FileScanItem>> {
    const filesDir = await rt.getFilesDir()
    const result = new Map<string, FileScanItem>()

    async function scanDir(
      dir: FileSystemDirectoryHandle,
      prefix: string = ''
    ): Promise<void> {
      for await (const entry of dir.values()) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name

        if (entry.kind === 'file') {
          try {
            const file = await entry.getFile()
            result.set(path, {
              path,
              mtime: file.lastModified,
              size: file.size,
            })
          } catch {
            // File access error, skip
          }
        } else if (entry.kind === 'directory') {
          // Cast to directory handle and recursively scan
          await scanDir(entry as FileSystemDirectoryHandle, path)
        }
      }
    }

    await scanDir(filesDir)
    return result
  }

  /**
   * Detect changes between two file snapshots
   * @param before Snapshot before Python execution
   * @returns Change detection result
   */
export function detectChangesImpl(
  rt: WorkspaceChangeDetectionInternals,
  before: Map<string, FileScanItem>
): ChangeDetectionResult {
    const changes: FileChange[] = []
    let added = 0
    let modified = 0
    let deleted = 0

    const beforePaths = new Set(before.keys())
    const afterMap = rt.scanFilesCache ?? new Map()

    // Check for added and modified files (in after but not in before, or different mtime)
    for (const [path, item] of afterMap.entries()) {
      const beforeItem = before.get(path)

      if (!beforeItem) {
        // New file
        changes.push({ type: 'add', path, size: item.size, mtime: item.mtime })
        added++
      } else if (beforeItem.mtime !== item.mtime) {
        // Modified file
        changes.push({ type: 'modify', path, size: item.size, mtime: item.mtime })
        modified++
      }
    }

    // Check for deleted files (in before but not in after)
    for (const path of beforePaths) {
      if (!afterMap.has(path)) {
        changes.push({ type: 'delete', path })
        deleted++
      }
    }

    return { changes, added, modified, deleted }
  }


  /**
   * Scan files with caching
   * @returns File scan snapshot
   */
export async function scanFilesWithCacheImpl(
  rt: WorkspaceChangeDetectionInternals
): Promise<Map<string, FileScanItem>> {
    const result = await rt.scanFiles()
    rt.scanFilesCache = result
    return result
  }

  /**
   * Refresh pending changes - independent of Python tool execution
   *
   * This method scans OPFS files/ directory and compares with pending.json
   * to detect any changes made outside of Python tool workflow.
   * Updates pending.json with new changes found.
   *
   * Use cases:
   * - User opens "Pending Sync" panel to see latest changes
   * - Files uploaded/created through non-python tools
   * - Manual file operations in OPFS
   *
   * @returns Change detection result
   */
export async function refreshPendingChangesImpl(
  rt: WorkspaceChangeDetectionInternals
): Promise<ChangeDetectionResult> {
    const t0 = performance.now()
    // Force reload from database to ensure we have latest state (including review_status)
    await rt.pendingManager.reload()
    const tReload = performance.now()

    // Pure OPFS mode short-circuit: when no native directory is mounted, agent
    // writes/deletes bypass the pending queue (see writeFile/deleteFile), so
    // there is nothing to reconcile against disk. Still return any legacy
    // pending rows from before this mode was enabled so the UI can surface them.
    const hasNative = await rt.hasAnyNativeDirectoryHandle()
    const tHasNative = performance.now()
    if (!hasNative) {
      const latestPending = await rt.pendingManager.getAll()
      const reviewPending = latestPending.filter(
        (pending) => !pending.reviewStatus || pending.reviewStatus === 'pending'
      )
      const changes: FileChange[] = reviewPending.map((pending) => ({
        type: pending.type === 'delete' ? 'delete' : pending.type === 'create' ? 'add' : 'modify',
        path: pending.path,
        snapshotId: pending.snapshotId,
        snapshotStatus: pending.snapshotStatus,
        snapshotSummary: pending.snapshotSummary,
        reviewStatus: pending.reviewStatus,
      }))
      console.log(
        `[WorkspaceRuntime] refreshPendingChanges pure-opfs done (${Math.round(performance.now() - t0)}ms)`,
        { reloadMs: Math.round(tReload - t0), hasNativeCheckMs: Math.round(tHasNative - tReload), legacy: changes.length }
      )
      return {
        changes,
        added: changes.filter((c) => c.type === 'add').length,
        modified: changes.filter((c) => c.type === 'modify').length,
        deleted: changes.filter((c) => c.type === 'delete').length,
      }
    }

    const normalizeComparePath = (p: string): string => {
      // Worker scan keys are relative paths without leading slash.
      // Pending/cache records can be "/foo", "foo", "/mnt/foo", or "/mnt/foo/bar".
      let normalized = p.replace(/\\/g, '/')
      if (normalized.startsWith('/mnt/')) {
        normalized = normalized.slice(5)
      } else if (normalized === '/mnt') {
        normalized = ''
      } else if (normalized.startsWith('/')) {
        normalized = normalized.slice(1)
      }
      return normalized
    }

    // 1. Get current pending changes (from previous operations)
    const existingPending = await rt.pendingManager.getAll()
    const existingPaths = new Map(existingPending.map((p) => [normalizeComparePath(p.path), p]))
    const tGetAll = performance.now()

    // 2. Scan current OPFS state using Worker (bypass cache)
    const filesDir = await rt.getFilesDir()
    const currentFiles = await scanFilesInWorker(filesDir)
    const tScan = performance.now()

    // 3. Reconcile pending queue against current OPFS state
    const detectedChanges: FileChange[] = []

    // Check for modified/restored files that are already tracked by pending queue.
    // NOTE: Do NOT auto-create new pending records for every file found in files/.
    // files/ can contain baseline/synced snapshots; re-adding them would cause
    // "pending reappears after successful sync".
    for (const [path, item] of currentFiles.entries()) {
      const pendingItem = existingPaths.get(path)
      const pendingPath = pendingItem?.path ?? path

      if (!pendingItem) {
        // Not tracked in pending queue: skip.
        continue
      } else if (pendingItem.type !== 'delete' && pendingItem.fsMtime !== item.mtime) {
        // File was modified after being added to pending - update mtime
        // Note: fsMtime will be set during sync, just update timestamp here
        await rt.pendingManager.add(pendingPath, pendingItem.fsMtime)
        detectedChanges.push({ type: 'modify', path: pendingPath, size: item.size, mtime: item.mtime })
      }
      // If pending item is 'delete', file was restored - remove from pending
      else if (pendingItem.type === 'delete') {
        // File restored, remove delete record
        const deleteRecordId = existingPending.find(
          (p) => normalizeComparePath(p.path) === path && p.type === 'delete'
        )?.id
        if (deleteRecordId) {
          await rt.pendingManager.remove(deleteRecordId)
        }
        // Now add as created/modified
        await rt.pendingManager.markAsCreated(pendingPath, item.mtime)
        detectedChanges.push({ type: 'add', path: pendingPath, size: item.size, mtime: item.mtime })
      }
    }

    // Check for deleted files (in pending but not in current OPFS scan)
    for (const pending of existingPending) {
      if (pending.type !== 'delete' && !currentFiles.has(normalizeComparePath(pending.path))) {
        // Keep cache-originated pending edits as modify/create.
        // They are valid changes even if files/ scan doesn't include them.
        const normalizedPath = normalizeComparePath(pending.path)
        const stillInCache = rt.hasCachedFile(pending.path) || rt.hasCachedFile(normalizedPath)
        if (stillInCache) {
          continue
        }

        // Re-check live pending state: if the entry was already removed
        // (e.g. create→delete cancel-out happened after the snapshot), skip
        // to avoid creating a ghost delete record for an already-cleaned path.
        if (!rt.pendingManager.hasPendingPath(pending.path)) {
          continue
        }

        // File was deleted, add delete record
        await rt.pendingManager.markForDeletion(pending.path)
        detectedChanges.push({ type: 'delete', path: pending.path })
      }
    }

    // Update cache with fresh scan
    rt.scanFilesCache = currentFiles

    // IMPORTANT: UI pending panels expect the full pending snapshot, not just newly detected deltas.
    const latestPending = await rt.pendingManager.getAll()
    const reviewPending = latestPending.filter(
      (pending) => !pending.reviewStatus || pending.reviewStatus === 'pending'
    )
    const changes: FileChange[] = reviewPending.map((pending) => {
      if (pending.type === 'delete') {
        return {
          type: 'delete',
          path: pending.path,
          snapshotId: pending.snapshotId,
          snapshotStatus: pending.snapshotStatus,
          snapshotSummary: pending.snapshotSummary,
          reviewStatus: pending.reviewStatus,
        }
      }
      const file = currentFiles.get(normalizeComparePath(pending.path))
      return {
        type: pending.type === 'create' ? 'add' : 'modify',
        path: pending.path,
        size: file?.size,
        mtime: file?.mtime,
        snapshotId: pending.snapshotId,
        snapshotStatus: pending.snapshotStatus,
        snapshotSummary: pending.snapshotSummary,
        reviewStatus: pending.reviewStatus,
      }
    })

    const added = changes.filter((c) => c.type === 'add').length
    const modified = changes.filter((c) => c.type === 'modify').length
    const deleted = changes.filter((c) => c.type === 'delete').length

    await rt.cleanupStaleBaselines()

    console.log(
      `[WorkspaceRuntime] refreshPendingChanges full done (${Math.round(performance.now() - t0)}ms)`,
      {
        reloadMs: Math.round(tReload - t0),
        getAllMs: Math.round(tGetAll - tHasNative),
        scanMs: Math.round(tScan - tGetAll),
        reconcileMs: Math.round(performance.now() - tScan),
        changes: changes.length,
        scannedFiles: currentFiles.size,
        added,
        modified,
        deleted,
      }
    )

    return { changes, added, modified, deleted }
  }

export async function registerDetectedChangesImpl(
  rt: WorkspaceChangeDetectionInternals,
  changes: FileChange[],
  directoryHandle?: FileSystemDirectoryHandle | null
): Promise<void> {
    if (!rt.initialized) await rt.initialize()

    for (const change of changes) {
      let nativeFsMtime: number | undefined
      let effectiveType: FileChange['type'] = change.type

      const normalizedPath = rt.normalizeWorkspacePath(change.path)

      if (directoryHandle) {
        // Multi-root: resolve the per-path native handle and strip the rootName
        // prefix before reading the native file. Without this, getFileHandle()
        // treats the rootName as a real subdirectory and throws — falling through
        // to the catch branch that uses OPFS mtime as nativeFsMtime. That makes
        // pending.fsMtime diverge from the actual disk mtime and triggers false
        // "mtime_or_marker" conflicts in detect_conflicts after every
        // sync → python write cycle.
        const fallbackDir = directoryHandle // narrow for TS
        const nativeHandle =
          (await rt.getNativeDirectoryHandleForPath(normalizedPath)) ?? fallbackDir
        const resolved = await rt.resolvePath(normalizedPath).catch(() => null)
        const nativePath = resolved?.relativePath || normalizedPath

        try {
          const fileHandle = await rt.getFileHandle(nativeHandle, nativePath)
          const file = await fileHandle.getFile()
          nativeFsMtime = file.lastModified

          // Diff snapshots are OPFS-only. If native file already exists, this should
          // be treated as a modify, not a newly created file.
          if (change.type === 'add') {
            effectiveType = 'modify'
          }

          if (effectiveType === 'modify') {
            // Compare OPFS content with native content as raw bytes.
            // Always use ArrayBuffer to avoid encoding round-trip issues
            // (e.g. GBK/Latin1 text decoded via file.text() would not
            // survive a TextEncoder re-encode).
            const nativeContent = await file.arrayBuffer()

            const opfsContent = await rt.readFromFilesDir(normalizedPath)
            if (opfsContent && await rt.areFileContentsEqual(nativeContent, opfsContent.content)) {
              console.log(`[WorkspaceRuntime] Skipping no-op mtime change: ${normalizedPath}`)
              continue
            }

            // Content differs — capture baseline for conflict resolution fallback
            await rt.captureModifyBaseline(normalizedPath, nativeContent)
          }
        } catch {
          // No native file was readable, so no common disk baseline exists.
          // Keep the sentinel at 0; using the OPFS change mtime here incorrectly
          // turns a Python-created draft into a fake disk baseline and can
          // subsequently manufacture a conflict against an older disk file.
          nativeFsMtime = 0
        }
      } else {
        // No directoryHandle — check native-host roots via executor
        try {
          const resolved = await rt.resolvePath(normalizedPath).catch(() => null)
          if (resolved?.rootId) {
            const nativePath = resolved.relativePath || normalizedPath
            const stat = await rt.diskExec.stat(resolved.rootId, nativePath)
            if (stat) {
              nativeFsMtime = stat.mtime
              if (change.type === 'add') {
                effectiveType = 'modify'
              }
              if (effectiveType === 'modify') {
                const readResult = await rt.diskExec.read(resolved.rootId, nativePath)
                const nativeContent = typeof readResult.content === 'string'
                  ? new TextEncoder().encode(readResult.content).buffer as ArrayBuffer
                  : readResult.content
                const opfsContent = await rt.readFromFilesDir(normalizedPath)
                if (opfsContent && await rt.areFileContentsEqual(nativeContent, opfsContent.content)) {
                  console.log(`[WorkspaceRuntime] Skipping no-op mtime change: ${normalizedPath}`)
                  continue
                }
                await rt.captureModifyBaseline(normalizedPath, nativeContent)
              }
            } else {
              // The file does not exist on disk: no common disk baseline.
              nativeFsMtime = 0
            }
          } else {
            // No disk root is bound: this is an OPFS-only draft.
            nativeFsMtime = 0
          }
        } catch {
          // Do not synthesize a disk baseline from the OPFS mtime.
          nativeFsMtime = 0
        }
      }

      if (effectiveType === 'add') {
        await rt.pendingManager.markAsCreated(change.path, nativeFsMtime)
      } else if (effectiveType === 'modify') {
        await rt.pendingManager.add(change.path, nativeFsMtime)
      } else if (change.type === 'delete') {
        await rt.pendingManager.markForDeletion(change.path, nativeFsMtime)
      }
    }
  }
