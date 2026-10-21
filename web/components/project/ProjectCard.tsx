import { useCallback } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN, enUS, ja, ko } from 'date-fns/locale'
import type { Locale as DateFnsLocale } from 'date-fns'
import {
  MoreHorizontal,
  Clock,
  FolderOpen,
  Pencil,
  Archive,
  ArchiveRestore,
  Download,
  Trash2,
} from 'lucide-react'
import {
  BrandButton,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@creatorweave/ui'
import type { Project, ProjectStats } from '@/sqlite/repositories/project.repository'
import { useT, useLocale } from '@/i18n'

const LOCALE_MAP: Record<string, DateFnsLocale> = {
  'zh-CN': zhCN,
  'en-US': enUS,
  'ja-JP': ja,
  'ko-KR': ko,
}

export interface ProjectCardProps {
  project: Project
  stats?: ProjectStats
  activityAt: number
  isActive?: boolean
  isActionPending?: boolean
  /** Disable interactive elements (used while a destructive action is submitting). */
  isDisabled?: boolean
  onOpen: (projectId: string) => void
  onRename: (project: Project) => void
  onArchiveToggle: (project: Project, isArchived: boolean) => void
  onDelete: (project: Project) => void
  onExportUsage?: (project: Project) => void
}

export function ProjectCard({
  project,
  stats,
  activityAt,
  isActive = false,
  isActionPending = false,
  isDisabled = false,
  onOpen,
  onRename,
  onArchiveToggle,
  onDelete,
  onExportUsage,
}: ProjectCardProps) {
  const t = useT()
  const [locale] = useLocale()
  const dateFnsLocale = LOCALE_MAP[locale] ?? zhCN
  const isArchived = project.status === 'archived'
  const workspaceCount = stats?.workspaceCount ?? 0
  const relativeTime = formatDistanceToNow(new Date(activityAt), {
    addSuffix: true,
    locale: dateFnsLocale,
  })

  const handleOpen = useCallback(() => {
    if (isDisabled) return
    onOpen(project.id)
  }, [isDisabled, onOpen, project.id])

  return (
    <article
      className={`group relative flex min-h-[120px] flex-col gap-2 rounded-xl border border-border bg-card p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm ${
        isActive ? 'border-primary/50 shadow-sm' : ''
      } ${isArchived ? 'opacity-65' : ''}`}
    >
      <button
        type="button"
        onClick={handleOpen}
        disabled={isDisabled}
        className="absolute inset-0 z-0 cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        aria-label={t('projectHome.project.openProject', { name: project.name })}
      />

      <div className="relative z-10 flex items-start justify-between gap-2 pointer-events-none">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-grid h-7 w-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
            <FolderOpen className="h-4 w-4" />
          </span>
          <h3 className="truncate text-sm font-semibold text-secondary dark:text-secondary-foreground">
            {project.name}
          </h3>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <BrandButton
              variant="ghost"
              iconButton
              disabled={isActionPending || isDisabled}
              aria-label={t('projectHome.project.moreActions')}
              className="pointer-events-auto relative z-10"
            >
              <MoreHorizontal className="h-4 w-4" />
            </BrandButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[10rem] max-w-[14rem]">
            <DropdownMenuItem
              onSelect={() => onRename(project)}
              disabled={isActionPending || isDisabled}
            >
              <Pencil className="mr-2 h-4 w-4" />
              {t('projectHome.project.rename')}
            </DropdownMenuItem>
            {onExportUsage && (
              <DropdownMenuItem
                onSelect={() => onExportUsage(project)}
                disabled={isActionPending || isDisabled}
              >
                <Download className="mr-2 h-4 w-4" />
                {t('projectHome.project.exportUsage')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={() => onArchiveToggle(project, isArchived)}
              disabled={isActionPending || isDisabled}
            >
              {isArchived ? (
                <>
                  <ArchiveRestore className="mr-2 h-4 w-4" />
                  {t('projectHome.project.unarchive')}
                </>
              ) : (
                <>
                  <Archive className="mr-2 h-4 w-4" />
                  {t('projectHome.project.archive')}
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => onDelete(project)}
              disabled={isActionPending || isDisabled}
              className="text-danger focus:bg-danger/10 focus:text-danger"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t('projectHome.project.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="relative z-10 mt-auto flex items-center gap-3 text-xs text-muted-foreground pointer-events-none">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {relativeTime}
        </span>
        <span className="text-muted-foreground/60">·</span>
        <span className="inline-flex items-center gap-1">
          {t('projectHome.project.workspaceCount', { count: workspaceCount })}
        </span>
        {isArchived && (
          <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {t('projectHome.project.archived')}
          </span>
        )}
      </div>
    </article>
  )
}