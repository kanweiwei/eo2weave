/**
 * Shared permission-restoration flow for File System Access roots.
 *
 * Used by both the FolderSelector dropdown action and the workspace
 * re-authorization banner (issue #83) so the two surfaces behave
 * identically: side-panel runs hand off to a top-level `/folder-pick`
 * page (cross-origin panels cannot prompt), full tabs call
 * `requestPermission()` directly, and a grant re-binds the runtime
 * handle + syncs agent.store.
 */

import { toast } from 'sonner'
import { bindRuntimeDirectoryHandle } from '@/native-fs'
import type { RootInfo } from '@/types/folder-access'

export interface RestoreRootPermissionOptions {
  projectId: string
  root: RootInfo
  /** True when running inside the extension side panel. */
  sidePanel: boolean
  /** Localized strings for the result toasts. */
  strings: {
    restored: string
    denied: string
    failed: string
  }
  /** Store action that reloads root statuses after a successful grant. */
  loadRoots: () => Promise<void>
}

export async function restoreRootPermission({
  projectId,
  root,
  sidePanel,
  strings,
  loadRoots,
}: RestoreRootPermissionOptions): Promise<boolean> {
  if (!root.persistedHandle) return false

  if (sidePanel) {
    // Re-grant in a top-level page; cross-origin panels cannot prompt.
    const url = new URL(window.location.href)
    url.hash = ''
    url.search = `?projectId=${encodeURIComponent(projectId)}`
    url.pathname = '/folder-pick'
    window.open(url.toString(), '_blank', 'noopener')
    return false
  }

  try {
    const permission = await root.persistedHandle.requestPermission({ mode: 'readwrite' })
    if (permission === 'granted') {
      bindRuntimeDirectoryHandle(projectId, root.name, root.persistedHandle)
      await loadRoots()

      // Sync to agent.store
      const { useAgentStore } = await import('@/store/agent.store')
      useAgentStore.setState({
        directoryHandle: root.persistedHandle,
        directoryName: root.name,
      })

      toast.success(strings.restored)
      return true
    }
    toast.error(strings.denied)
    return false
  } catch (error) {
    console.error('[folder-permission] Failed to restore permission:', error)
    toast.error(strings.failed)
    return false
  }
}
