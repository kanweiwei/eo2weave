'use client'

import { useState } from 'react'
import { BrandButton } from '@creatorweave/ui'
import { useT } from '@/i18n'
import { useProjectStore } from '@/store/project.store'

/**
 * Shared initialization-failure banner (issue #131).
 *
 * Rendered by BOTH ProjectHomeView and WorkspaceRouteView so a direct
 * workspace URL (/projects/:id/...) also surfaces the error with a Retry —
 * previously only the projects list page handled it and a refreshed
 * workspace route stayed unusable with no error and no action (Sourcery:
 * "Workspace route stays unusable").
 *
 * Copy tone follows initErrorKind: transient failures reassure ("projects
 * are safe, retrying usually fixes it"); corruption-classified errors tell
 * the user data may be damaged and to preserve diagnostics instead.
 *
 * Retry semantics (Sourcery "Retry shows a misleading empty state" +
 * "Retry can become a no-op"):
 *  - The banner stays rendered while a retry is in flight — the store keeps
 *    `initError`/`initializingRetry` until the attempt resolves, so the empty
 *    project list never flashes as "No projects yet".
 *  - The store's initialize() de-duplicates concurrent attempts and a failed
 *    attempt invalidates `initialized`, so the button always triggers a real
 *    re-run instead of returning at the initialized guard.
 */
export function InitErrorBanner() {
  const t = useT()
  const initError = useProjectStore((s) => s.initError)
  const initErrorKind = useProjectStore((s) => s.initErrorKind)
  const initializingRetry = useProjectStore((s) => s.initializingRetry)
  const isLoading = useProjectStore((s) => s.isLoading)
  const initializeProjects = useProjectStore((s) => s.initialize)

  const [isRetrying, setIsRetrying] = useState(false)

  if (!initError) return null

  const busy = isRetrying || initializingRetry || isLoading

  const handleRetry = async () => {
    setIsRetrying(true)
    try {
      await initializeProjects()
    } finally {
      setIsRetrying(false)
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-6">
      <div
        role="alert"
        className="w-full max-w-md rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center"
      >
        <h1 className="mb-2 text-base font-semibold text-foreground">
          {t('app.initFailed')}
        </h1>
        <p className="mb-1 break-words text-sm text-muted-foreground">
          {initError}
        </p>
        <p className="mb-5 text-sm text-muted-foreground">
          {initErrorKind === 'corruption'
            ? t('app.projectsInitCorruptionHint')
            : t('app.projectsInitErrorHint')}
        </p>
        <BrandButton
          variant="primary"
          onClick={() => void handleRetry()}
          disabled={busy}
        >
          {busy ? t('app.projectsInitRetrying') : t('app.retry')}
        </BrandButton>
      </div>
    </div>
  )
}
