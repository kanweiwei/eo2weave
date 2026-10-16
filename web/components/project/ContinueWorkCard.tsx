import { useMemo } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN, enUS, ja, ko } from 'date-fns/locale'
import type { Locale as DateFnsLocale } from 'date-fns'
import { ArrowRight, FolderOpen } from 'lucide-react'
import type { Project, ProjectStats } from '@/sqlite/repositories/project.repository'
import { useT, useLocale } from '@/i18n'

const LOCALE_MAP: Record<string, DateFnsLocale> = {
  'zh-CN': zhCN,
  'en-US': enUS,
  'ja-JP': ja,
  'ko-KR': ko,
}

export interface ContinueWorkCardProps {
  project: Project
  stats?: ProjectStats
  onOpen: (projectId: string) => void
  isActionPending?: boolean
}

/**
 * Compact "continue work" affordance — a single button row that surfaces the
 * most recent project so the user can resume with one click. Designed to
 * sit inline next to the primary "new project" CTA in the hero (small + low-
 * contrast), not as a featured card.
 */
export function ContinueWorkCard({
  project,
  stats,
  onOpen,
  isActionPending = false,
}: ContinueWorkCardProps) {
  const t = useT()
  const [locale] = useLocale()
  const dateFnsLocale = LOCALE_MAP[locale] ?? zhCN

  const activityAt = useMemo(() => {
    const workspaceActivityAt = stats?.lastWorkspaceAccessAt ?? 0
    return Math.max(project.updatedAt, workspaceActivityAt)
  }, [project.updatedAt, stats?.lastWorkspaceAccessAt])

  const relativeTime = formatDistanceToNow(new Date(activityAt), {
    addSuffix: true,
    locale: dateFnsLocale,
  })

  return (
    <div
      data-testid="continue-work-card"
      className="group flex h-9 items-center gap-3 rounded-lg bg-card/60 px-3 transition-colors hover:bg-muted"
    >
      <span
        aria-hidden
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary-50 text-primary dark:bg-primary/10"
      >
        <FolderOpen className="h-3.5 w-3.5" />
      </span>

      <div className="min-w-0 flex-1 truncate text-sm">
        <button
          type="button"
          onClick={() => onOpen(project.id)}
          disabled={isActionPending}
          className="cursor-pointer truncate rounded font-medium text-secondary hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60 dark:text-secondary-foreground"
        >
          {project.name}
        </button>
        <span aria-hidden className="mx-1.5 text-muted-foreground/60">·</span>
        <span className="text-muted-foreground">{relativeTime}</span>
      </div>

      <button
        type="button"
        onClick={() => onOpen(project.id)}
        disabled={isActionPending}
        aria-label={t('projectHome.continueWork.openProject', { name: project.name })}
        className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60"
      >
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  )
}