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
 * Compact "continue work" affordance — a single row that surfaces the most
 * recent project so the user can resume with one click. Designed to sit inline
 * next to the primary "new project" CTA in the hero (small + low-contrast),
 * not as a featured card.
 *
 * The whole row exposes `role="button"`, so a click anywhere on it (icon,
 * name, timestamp, arrow) opens the project. The inner <button> keeps its own
 * hover/focus visuals and relies on event bubbling to drive the row handler,
 * so visual presentation stays identical to the pre-redesign version while
 * every region of the row becomes interactive.
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

  const handleRowClick = () => {
    if (isActionPending) return
    onOpen(project.id)
  }

  const handleRowKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isActionPending) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen(project.id)
    }
  }

  return (
    <div
      data-testid="continue-work-card"
      role="button"
      tabIndex={isActionPending ? -1 : 0}
      aria-label={t('projectHome.continueWork.openProject', { name: project.name })}
      aria-disabled={isActionPending}
      onClick={handleRowClick}
      onKeyDown={handleRowKeyDown}
      className="group flex h-9 cursor-pointer items-center gap-3 rounded-lg bg-card/60 px-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
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
          disabled={isActionPending}
          className="cursor-pointer truncate rounded font-medium text-secondary hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60 dark:text-secondary-foreground"
        >
          {project.name}
        </button>
        <span aria-hidden className="mx-1.5 text-muted-foreground/60">·</span>
        <span className="text-muted-foreground">{relativeTime}</span>
      </div>

      <span
        aria-hidden
        className="grid h-6 w-6 shrink-0 cursor-pointer place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
      >
        <ArrowRight className="h-4 w-4" />
      </span>
    </div>
  )
}
