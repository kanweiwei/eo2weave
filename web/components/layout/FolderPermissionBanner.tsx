/**
 * FolderPermissionBanner — re-authorization banner for expired
 * File System Access folder permissions (issue #83).
 *
 * Permission for a browser-picker root can lapse across browser restarts
 * (`needs_user_activation`); until now the only signal was an amber row
 * buried in the FolderSelector dropdown, so users saw "AI can't read my
 * files" with no hint why. This banner surfaces the expired folders above
 * the workspace content with a one-click re-authorization action.
 *
 * - Native-host roots never lapse this way and are excluded.
 * - Dismiss hides the banner for the current browser session
 *   (sessionStorage); it returns next session until the permission is
 *   actually restored.
 */

import { useEffect, useRef, useState } from 'react'
import { FolderOpen, RefreshCw, X } from 'lucide-react'
import { useT } from '@/i18n'
import { useFolderAccessStore } from '@/store/folder-access.store'
import { isSidePanelMode } from '@/agent/workspace-assistant-context'
import { restoreRootPermission } from '@/lib/folder-permission'
import { cn } from '@/lib/utils'

const DISMISS_KEY = 'folder-permission-banner-dismissed'

function readDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export function FolderPermissionBanner() {
  const t = useT()
  const roots = useFolderAccessStore((s) => s.roots)
  const rootsHydrated = useFolderAccessStore((s) => s.rootsHydrated)
  const activeProjectId = useFolderAccessStore((s) => s.activeProjectId)
  const loadRoots = useFolderAccessStore((s) => s.loadRoots)
  const [dismissed, setDismissed] = useState(true)
  // Serialize refreshes: two restores triggered close together must not let
  // the earlier loadRoots() resolution overwrite the newer roots snapshot
  // (which would flip a just-granted root back to needs_user_activation).
  const refreshQueueRef = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    setDismissed(readDismissed())
  }, [])

  // Only browser-picker (fsaccess) roots expire across restarts; a
  // native-host root's permission lives in the host's scopes file.
  const expiredRoots = roots.filter(
    (r) => (r.backend ?? 'fsaccess') === 'fsaccess' && r.status === 'needs_user_activation'
  )
  const isSidePanel = isSidePanelMode()

  if (!rootsHydrated || dismissed || expiredRoots.length === 0) return null

  const handleRestore = async (root: (typeof expiredRoots)[number]) => {
    if (!activeProjectId) return
    const granted = await restoreRootPermission({
      projectId: activeProjectId,
      root,
      sidePanel: isSidePanel,
      strings: {
        restored: t('projectRoots.permissionRestored'),
        denied: t('projectRoots.permissionDenied'),
        failed: t('projectRoots.permissionFailed'),
      },
      loadRoots: async () => {
        // Chain onto the previous refresh so invocations run in order and
        // a slower, superseded read can never clobber a newer snapshot.
        const run = refreshQueueRef.current.then(() => loadRoots())
        refreshQueueRef.current = run.catch(() => undefined)
        await run
      },
    })
    if (granted) {
      try {
        window.sessionStorage.removeItem(DISMISS_KEY)
      } catch {
        // ignore
      }
    }
  }

  return (
    <div
      data-testid="folder-permission-banner"
      className="relative flex items-center justify-between gap-3 border-b border-warning-200 bg-gradient-to-r from-warning-50 to-warning-100 px-4 py-2.5 dark:border-warning-200/30 dark:from-warning-100/15 dark:to-warning-100/5"
    >
      <div className="flex min-w-0 items-center gap-3">
        <FolderOpen className="h-4 w-4 shrink-0 text-warning" />
        <div className="min-w-0 text-sm">
          <span className="font-medium text-warning-900">
            {expiredRoots.length === 1
              ? t('projectRoots.bannerSingleTitle').replace('{name}', expiredRoots[0].name)
              : t('projectRoots.bannerMultiTitle').replace(
                  '{count}',
                  String(expiredRoots.length)
                )}
          </span>
          {expiredRoots.length > 1 && (
            <span className="ml-2 hidden text-warning dark:text-warning-200 sm:inline">
              {expiredRoots.map((r) => r.name).join(', ')}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {expiredRoots.map((root) => (
          <button
            key={root.id}
            type="button"
            onClick={(e) => {
              // This click must not also reach AppBootstrap's once-only
              // first-interaction handler, which would start a second,
              // competing requestPermission() for the legacy record.
              e.stopPropagation()
              void handleRestore(root)
            }}
            className={cn(
              'flex items-center gap-1.5 rounded-md border border-warning px-3 py-1',
              'text-xs font-medium text-warning transition-colors hover:bg-warning-50',
              'dark:hover:bg-warning-100/10',
              'focus:outline-none focus:ring-2 focus:ring-warning focus:ring-offset-2'
            )}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {expiredRoots.length === 1
              ? t('projectRoots.bannerReauthorize')
              : root.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            try {
              window.sessionStorage.setItem(DISMISS_KEY, '1')
            } catch {
              // ignore
            }
            setDismissed(true)
          }}
          className="rounded p-1 text-warning-200 transition-colors hover:bg-warning-100 hover:text-warning focus:outline-none focus:ring-2 focus:ring-warning focus:ring-offset-2 dark:hover:bg-warning-100/30"
          aria-label={t('projectRoots.bannerDismiss')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
