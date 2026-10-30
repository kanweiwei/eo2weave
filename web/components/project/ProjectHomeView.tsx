'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { BrandButton } from '@creatorweave/ui'
import { useT, useLocale } from '@/i18n'
import { useProjectStore } from '@/store/project.store'
import { useConversationContextStore } from '@/store/conversation-context.store'
import { useOPFSStore } from '@/store/opfs.store'
import { useConversationStore } from '@/store/conversation.store'
import { clearSQLiteAndProjectsDirectory, RESET_REQUIRES_TAB_CLOSURE } from '@/storage'
import type { Project } from '@/sqlite/repositories/project.repository'
import { ProjectHome } from '@/components/project/ProjectHome'
import { projectWorkspacePath, projectsPath, docsPath } from '@/lib/route-paths'

/**
 * ProjectHomeView — store-connected ProjectHome for the /projects route.
 *
 * Previously ProjectHome received its props from AppReady (WorkspaceApp.tsx);
 * this wrapper pulls state from the stores directly and owns the handler
 * logic (create/rename/archive/delete/clear-local-data + toasts) that used
 * to live in AppReady.
 */
export default function ProjectHomeView() {
  const router = useRouter()
  const t = useT()
  const [locale] = useLocale()
  const docsLanguage: 'zh' | 'en' = locale === 'zh-CN' ? 'zh' : 'en'

  const projects = useProjectStore((s) => s.projects)
  const projectStats = useProjectStore((s) => s.projectStats)
  const projectLoading = useProjectStore((s) => s.isLoading)
  const projectError = useProjectStore((s) => s.error)
  const initializeProjects = useProjectStore((s) => s.initialize)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const createProject = useProjectStore((s) => s.createProject)
  const renameProject = useProjectStore((s) => s.renameProject)
  const setProjectArchived = useProjectStore((s) => s.setProjectArchived)
  const deleteProject = useProjectStore((s) => s.deleteProject)

  const [isRetrying, setIsRetrying] = useState(false)

  const handleRetryInit = async () => {
    setIsRetrying(true)
    try {
      await initializeProjects()
    } finally {
      setIsRetrying(false)
    }
  }

  const [isClearingLocalData, setIsClearingLocalData] = useState(false)

  const handleCreateProject = async (name: string): Promise<string | null> => {
    const project = await createProject(name)
    if (project) {
      // Defer navigation: ProjectHome still needs the project id to bind any
      // pre-picked folder handles via folderAccessStore.setHandle. The dialog
      // component is responsible for binding folders and then calling
      // router.push once it has the id.
      toast.success(t('app.projectCreated', { name: project.name }))
      return project.id
    }
    toast.error(t('app.createProjectFailed'))
    return null
  }

  const handleCreateAndOpen = async (name: string): Promise<string | null> => {
    const projectId = await handleCreateProject(name)
    if (projectId) {
      router.push(projectWorkspacePath(projectId))
    }
    return projectId
  }

  // onCreateProject below is the "create only, no navigate" path. Navigation
  // is triggered separately by the dialog via the onProjectCreated prop (wired
  // to handleOpenProject). The split lets the dialog eagerly create a project
  // when the user adds a native-host root before the dialog's primary submit
  // action runs — handleCreateAndOpen above is kept as a convenience for any
  // future code paths that want both create-and-navigate in one call.
  void handleCreateAndOpen

  const handleRenameProject = async (projectId: string, name: string) => {
    const ok = await renameProject(projectId, name)
    if (ok) {
      toast.success(t('app.projectRenamed'))
    } else {
      toast.error(t('app.renameFailed'))
    }
  }

  const handleArchiveProject = async (projectId: string, archived: boolean) => {
    const ok = await setProjectArchived(projectId, archived)
    if (ok) {
      toast.success(archived ? t('app.projectArchived') : t('app.projectUnarchived'))
    } else {
      toast.error(archived ? t('app.archiveFailed') : t('app.unarchiveFailed'))
    }
  }

  const handleDeleteProject = async (projectId: string) => {
    const ok = await deleteProject(projectId)
    if (ok) {
      toast.success(t('app.projectDeleted'))
    } else {
      toast.error(t('app.deleteFailed'))
    }
  }

  const handleOpenProject = async (projectId: string) => {
    router.push(projectWorkspacePath(projectId))
  }

  const handleExportProjectUsage = async (project: Project) => {
    const toastId = toast.loading(t('app.projectUsageExporting'))
    try {
      const { exportProjectUsageCSV } = await import('@/services/export/project-usage-export')
      const result = await exportProjectUsageCSV(project)
      if (!result.success) throw new Error(result.error || 'Export failed')
      toast.success(t('app.projectUsageExported', { filename: result.filename }), { id: toastId })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast.error(t('app.projectUsageExportFailed', { error: message }), { id: toastId })
    }
  }

  const handleClearLocalData = async () => {
    setIsClearingLocalData(true)
    try {
      await clearSQLiteAndProjectsDirectory()

      // Reset auto-default-project flags so re-init can auto-create again
      localStorage.removeItem('creatorweave:auto-default-project-created')
      sessionStorage.removeItem('creatorweave:auto-default-redirected')

      useProjectStore.setState({
        activeProjectId: '',
        projects: [],
        projectStats: {},
        initialized: false,
        isLoading: false,
        error: null,
      })
      useConversationContextStore.setState({
        ...(await import('@/store/workspace.store')).PENDING_RESET_PATCH,
        activeWorkspaceId: null,
        workspaces: [],
        initialized: false,
      })
      useOPFSStore.setState({
        workspaceId: null,
        initialized: false,
        pendingChanges: [],
        approvedNotSyncedPaths: new Set<string>(),
        cachedPaths: [],
        isLoading: false,
        error: null,
      })
      useConversationStore.setState({
        conversations: [],
        activeConversationId: null,
        loaded: true,
        loadError: null,
        suggestedFollowUps: new Map(),
        mountedConversations: new Map(),
      })

      const { useConversationRuntimeStore } = await import('@/store/conversation-runtime.store')
      useConversationRuntimeStore.setState({
        runtimes: new Map(),
        suggestedFollowUps: new Map(),
        cancelledRunIds: new Set(),
        mountedConversations: new Map(),
      })

      await useProjectStore.getState().initialize()
      await useConversationContextStore.getState().initialize()
      await useOPFSStore.getState().initialize()

      router.replace(projectsPath())
      toast.success(t('app.localDataCleared'))
    } catch (error) {
      console.error('[App] Failed to clear local data:', error)
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes(RESET_REQUIRES_TAB_CLOSURE)) {
        toast.error(t('app.clearFailedCloseOtherTabs'))
      } else {
        toast.error(t('app.clearLocalDataFailed'))
      }
    } finally {
      setIsClearingLocalData(false)
    }
  }

  // Init failure: never render the "No projects yet" empty state — that
  // reads as data loss (issue #131). Show an error banner with a Retry that
  // re-runs initialize() instead.
  if (projectError) {
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
            {projectError}
          </p>
          <p className="mb-5 text-sm text-muted-foreground">
            {t('app.projectsInitErrorHint')}
          </p>
          <BrandButton
            variant="primary"
            onClick={() => void handleRetryInit()}
            disabled={isRetrying || projectLoading}
          >
            {isRetrying || projectLoading
              ? t('app.projectsInitRetrying')
              : t('app.retry')}
          </BrandButton>
        </div>
      </div>
    )
  }

  return (
    <ProjectHome
      projects={projects}
      projectStats={projectStats}
      activeProjectId={activeProjectId}
      isLoading={projectLoading}
      onOpenProject={handleOpenProject}
      onCreateProject={handleCreateProject}
      onRenameProject={handleRenameProject}
      onArchiveProject={handleArchiveProject}
      onDeleteProject={handleDeleteProject}
      onExportProjectUsage={handleExportProjectUsage}
      onClearLocalData={handleClearLocalData}
      onOpenDocs={() => router.push(docsPath(docsLanguage))}
      isClearingLocalData={isClearingLocalData}
    />
  )
}
