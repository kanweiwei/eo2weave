/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * App-tools handlers — the execute() implementations behind the 16 schemas.
 *
 * Every handler goes through the app's OWN public surfaces (zustand stores,
 * repositories, WorkspaceManager, WorkspaceRuntime) — the same code paths the
 * UI uses. Nothing here bypasses permissions or state management.
 *
 * The dependency-injected deps are intentionally `any`-typed: they wrap
 * dynamic zustand store snapshots and repository classes whose concrete types
 * live across the app. Typing them precisely would couple this module to half
 * the codebase; tests inject mocks instead. All other `any`s flow from these.
 */

import { APP_TOOLS } from './schemas'
import type { Message } from '@/agent/message-types'
import { createUserMessage } from '@/agent/message-types'

// ─── Run registry ─────────────────────────────────────────────────────────────

export interface AppRunRecord {
  runId: string
  conversationId: string
  status: 'started' | 'queued' | 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled'
  startedAt: number
  finishedAt?: number
  result?: {
    summary: string
    changedFiles: string[]
    usage?: { inputTokens?: number; outputTokens?: number }
  }
  error?: string
}

const runRegistry = new Map<string, AppRunRecord>()
const RUN_REGISTRY_MAX = 50
let runIdCounter = 0

export function newRunId(): string {
  runIdCounter += 1
  return `run_${Date.now().toString(36)}_${runIdCounter}`
}

function recordRun(rec: AppRunRecord): void {
  runRegistry.set(rec.runId, rec)
  if (runRegistry.size > RUN_REGISTRY_MAX) {
    for (const [id, r] of runRegistry) {
      if (r.status !== 'running' && r.status !== 'queued' && r.status !== 'started') {
        runRegistry.delete(id)
        break
      }
    }
  }
}

export function getRunRecord(runId: string): AppRunRecord | undefined {
  return runRegistry.get(runId)
}

// ─── Dependency injection (wired by register.ts, overridden in tests) ────────

export interface AppToolDeps {
  getConversationStore: () => any
  getSettingsStore: () => any
  getAgentStore: () => any
  getWorkspaceManager: () => Promise<any>
  getProjectRepository: () => any
  getMessageRepository: () => any
  searchConversations: (args: Record<string, unknown>) => Promise<unknown>
  wait: (ms: number) => Promise<void>
}

let deps: AppToolDeps | null = null

export function initAppToolDeps(d: AppToolDeps): void {
  deps = d
}

function d(): AppToolDeps {
  if (!deps) throw new Error('[app-tools] initAppToolDeps() was never called')
  return deps
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 500
const HARD_WAIT_CAP_MS = 300_000
const MAX_MESSAGE_CHARS = 32 * 1024

function ok(value: unknown): { content: string } {
  return { content: JSON.stringify(value) }
}

function err(message: string): { content: string } {
  return { content: JSON.stringify({ error: message }) }
}

function truncateContent(content: string): { content: string; truncated: boolean } {
  if (content.length > MAX_MESSAGE_CHARS) {
    return { content: content.slice(0, MAX_MESSAGE_CHARS), truncated: true }
  }
  return { content, truncated: false }
}

function findConv(store: any, conversationId: string): any | null {
  return store.conversations.find((c: any) => c.id === conversationId) ?? null
}

function lastAssistantSummary(store: any, conversationId: string): string {
  const conv = findConv(store, conversationId)
  const msgs: Message[] = conv?.messages ?? []
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]
    if (m.role === 'assistant' && typeof m.content === 'string') return m.content
  }
  return ''
}

/** Files changed by the latest finished run (from the run's snapshot summary). */
function changedFilesForRun(store: any, rec: AppRunRecord): string[] {
  const conv = findConv(store, rec.conversationId)
  const msgs: Message[] = conv?.messages ?? []
  // find the newest runChanges marker at/below the run start time
  for (let i = msgs.length - 1; i >= 0; i--) {
    const meta = (msgs[i] as any)?._meta ?? (msgs[i] as any)?.meta
    const snapshotId = meta?.runChanges?.snapshotId ?? (msgs[i] as any)?.runChanges?.snapshotId
    if (snapshotId && (msgs[i].timestamp ?? 0) >= rec.startedAt - 1000) {
      // The snapshot summary file list lives in fs-overlay; simplest reliable
      // source is the run-change summary card data cached on the message meta.
      const files = meta?.runChangesFiles ?? meta?.files
      if (Array.isArray(files)) return files as string[]
      return []
    }
  }
  return []
}

async function waitForRun(rec: AppRunRecord, timeoutMs: number): Promise<AppRunRecord> {
  const cstore = d().getConversationStore()
  const deadline = Date.now() + Math.min(Math.max(timeoutMs, 1000), HARD_WAIT_CAP_MS)
  while (Date.now() < deadline) {
    await d().wait(POLL_INTERVAL_MS)
    if (!cstore.isConversationRunning(rec.conversationId)) {
      rec.status = rec.status === 'cancelled' ? 'cancelled' : 'completed'
      rec.finishedAt = Date.now()
      rec.result = {
        summary: lastAssistantSummary(cstore, rec.conversationId),
        changedFiles: changedFilesForRun(cstore, rec),
      }
      return rec
    }
  }
  rec.status = 'timeout'
  rec.finishedAt = Date.now()
  rec.error = `wait=true timed out after ${timeoutMs}ms — poll get_run_status / get_run_progress instead`
  return rec
}

// ─── Handlers ────────────────────────────────────────────────────────────────

type Handler = (args: Record<string, any>) => Promise<{ content: string }>

export const handlers: Record<string, Handler> = {
  // ── Projects ──
  list_projects: async () => {
    const repo = d().getProjectRepository()
    const [projects, stats] = (await Promise.all([
      repo.findAllProjects(),
      repo.findProjectStats(),
    ])) as any[]
    const statMap = new Map((stats as any[]).map((s: any) => [s.projectId, s]))
    return ok({
      projects: projects.map((p: any) => ({
        id: p.id,
        name: p.name,
        workspaceCount: statMap.get(p.id)?.workspaceCount ?? 0,
        lastAccessedAt: statMap.get(p.id)?.lastWorkspaceAccessAt ?? null,
      })),
    })
  },

  create_project: async (args) => {
    const name = String(args.name ?? '').trim()
    if (!name) return err('name is required')
    const repo = d().getProjectRepository()
    const project = await repo.createProject({ name })
    return ok({ project: { id: project.id, name: project.name } })
  },

  // ── Folders ──
  list_mounted_folders: async () => {
    const { useFolderAccessStore } = await import('@/store/folder-access.store')
    const records = (useFolderAccessStore.getState() as any).records ?? {}
    const folders = Object.values(records as Record<string, any>)
      .filter((r) => r.folderName || r.handle || r.persistedHandle)
      .map((r) => ({
        folderId: `${r.projectId}:${r.rootName ?? r.projectId}`,
        projectId: r.projectId,
        name: r.folderName ?? r.rootName ?? r.projectId,
        status: r.status,
      }))
    return ok({ folders })
  },

  // ── Conversations ──
  list_conversations: async (args) => {
    const store = d().getConversationStore()
    const limit = Math.min(Math.max(1, Number(args.limit ?? 20)), 100)
    const offset = Math.max(0, Number(args.offset ?? 0))
    let list: any[] = store.conversations ?? []
    if (args.projectId) list = list.filter((c: any) => c.projectId === args.projectId)
    if (args.folderId) {
      // folderId = "projectId:rootName" (from list_mounted_folders). Resolve the
      // project's workspaces for that root, then keep conversations bound to them.
      const [projectId, rootName] = String(args.folderId).split(':')
      const { useFolderAccessStore } = await import('@/store/folder-access.store')
      const records = (useFolderAccessStore.getState() as any).records ?? {}
      const rec = Object.values(records as Record<string, any>).find(
        (r) => r.projectId === projectId && (r.rootName ?? r.projectId) === (rootName ?? projectId),
      )
      if (rec) {
        const manager = await d().getWorkspaceManager()
        const wsIds = new Set(
          manager
            .getAllWorkspaces()
            .filter((w: any) => w.projectId === projectId)
            .map((w: any) => w.workspaceId),
        )
        list = list.filter((c: any) => wsIds.has(c.id))
      } else {
        list = []
      }
    }
    list = [...list].sort((a: any, b: any) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    const page = list.slice(offset, offset + limit)
    return ok({
      conversations: page.map((c: any) => ({
        id: c.id,
        title: c.title,
        projectId: c.projectId ?? null,
        status: c.status ?? 'idle',
        updatedAt: c.updatedAt ?? null,
      })),
      hasMore: offset + limit < list.length,
    })
  },

  search_conversations: async (args) => {
    const result = await d().searchConversations(args)
    return { content: JSON.stringify(result) }
  },

  create_conversation: async (args) => {
    const store = d().getConversationStore()
    const conv = store.createNew(args.title ? String(args.title) : undefined)
    return ok({ conversation: { id: conv.id, title: conv.title } })
  },

  get_messages: async (args) => {
    const conversationId = String(args.conversationId ?? '')
    if (!conversationId) return err('conversationId is required')
    const page = Math.max(1, Number(args.page ?? 1))
    const pageSize = Math.min(Math.max(1, Number(args.pageSize ?? 50)), 200)
    const repo = d().getMessageRepository()
    const all = await repo.findByConversation(conversationId)
    const total = all.length
    const end = Math.max(0, total - (page - 1) * pageSize)
    const start = Math.max(0, end - pageSize)
    const slice = all.slice(start, end)
    return ok({
      messages: slice.map((m: Message) => {
        const raw = typeof m.content === 'string' ? m.content : ''
        const t = truncateContent(raw)
        return { role: m.role, content: t.content, truncated: t.truncated, timestamp: m.timestamp }
      }),
      page,
      totalMessages: total,
      hasMore: start > 0,
    })
  },

  // ── Runs ──
  send_message: async (args) => {
    const conversationId = String(args.conversationId ?? '')
    const content = String(args.content ?? '')
    const wait = Boolean(args.wait ?? false)
    const timeoutMs = Math.min(Math.max(Number(args.timeoutMs ?? 120_000), 1000), HARD_WAIT_CAP_MS)
    if (!conversationId) return err('conversationId is required')
    if (!content.trim()) return err('content is required')

    const D = d()
    const store = D.getConversationStore()
    const settings = D.getSettingsStore()
    if (!settings.hasApiKey) {
      return err('No API key configured — set up a provider in EO2Weave settings first')
    }
    const conv = findConv(store, conversationId)
    if (!conv) return err(`Conversation not found: ${conversationId}`)

    const runId = newRunId()
    const rec: AppRunRecord = { runId, conversationId, status: 'started', startedAt: Date.now() }
    recordRun(rec)

    const agentStore = D.getAgentStore()
    const directoryHandle = agentStore?.directoryHandle ?? null

    if (store.isConversationRunning(conversationId)) {
      const result = store.enqueueMessage(conversationId, { text: content })
      if (result?.enqueued) {
        rec.status = 'queued'
        return ok({ runId, status: 'queued' })
      }
      return err('Conversation is running and its queue is full')
    }

    const userMsg = createUserMessage(content)
    store.updateMessages(conversationId, [...(conv.messages ?? []), userMsg])
    // Fire-and-forget: runAgent resolves when the loop ends.
    void store
      .runAgent(conversationId, settings.providerType, settings.modelName, settings.maxTokens, directoryHandle)
      .then(() => {
        rec.status = rec.status === 'cancelled' ? 'cancelled' : 'completed'
        rec.finishedAt = Date.now()
        rec.result = {
          summary: lastAssistantSummary(store, conversationId),
          changedFiles: changedFilesForRun(store, rec),
        }
      })
      .catch((e: unknown) => {
        rec.status = 'failed'
        rec.error = e instanceof Error ? e.message : String(e)
        rec.finishedAt = Date.now()
      })
    rec.status = 'running'

    if (!wait) return ok({ runId, status: 'started' })

    const final = await waitForRun(rec, timeoutMs)
    return ok({
      runId: final.runId,
      status: final.status,
      ...(final.result ? { result: final.result } : {}),
      ...(final.error ? { error: final.error } : {}),
    })
  },

  get_run_status: async (args) => {
    const rec = getRunRecord(String(args.runId ?? ''))
    if (!rec) return err(`Unknown runId: ${args.runId}`)
    const store = d().getConversationStore()
    const running = store.isConversationRunning(rec.conversationId)
    if (!running && (rec.status === 'running' || rec.status === 'started' || rec.status === 'queued')) {
      rec.status = 'completed'
      rec.finishedAt = rec.finishedAt ?? Date.now()
      rec.result = {
        summary: lastAssistantSummary(store, rec.conversationId),
        changedFiles: changedFilesForRun(store, rec),
      }
    }
    return ok({
      runId: rec.runId,
      status: rec.status,
      ...(rec.result ? { result: rec.result } : {}),
      ...(rec.error ? { error: rec.error } : {}),
    })
  },

  get_run_progress: async (args) => {
    const rec = getRunRecord(String(args.runId ?? ''))
    if (!rec) return err(`Unknown runId: ${args.runId}`)
    const store = d().getConversationStore()
    const running = store.isConversationRunning(rec.conversationId)
    if (!running) {
      return ok({ status: rec.status, elapsedMs: (rec.finishedAt ?? Date.now()) - rec.startedAt })
    }
    const conv = findConv(store, rec.conversationId)
    const current = conv?.currentToolCall ?? null
    const streaming: string = conv?.streamingContent ?? ''
    return ok({
      status: 'running',
      elapsedMs: Date.now() - rec.startedAt,
      toolCallsDone: (conv?.activeToolCalls ?? []).length,
      ...(current
        ? {
            currentTool: {
              name: current.function?.name ?? null,
              argsPreview: String(current.function?.arguments ?? '').slice(0, 200),
            },
          }
        : {}),
      ...(streaming ? { streamingPreview: streaming.slice(-500) } : {}),
    })
  },

  cancel_run: async (args) => {
    const rec = getRunRecord(String(args.runId ?? ''))
    if (!rec) return err(`Unknown runId: ${args.runId}`)
    const store = d().getConversationStore()
    store.cancelAgent(rec.conversationId)
    rec.status = 'cancelled'
    rec.finishedAt = Date.now()
    return ok({ cancelled: true })
  },

  // ── Files ──
  read_folder_file: async (args) => {
    const conversationId = String(args.conversationId ?? '')
    const path = String(args.path ?? '')
    if (!conversationId || !path) return err('conversationId and path are required')
    const manager = await d().getWorkspaceManager()
    const runtime = await manager.getWorkspace(conversationId)
    if (!runtime) return err(`No workspace bound to conversation ${conversationId}`)
    try {
      const result = await runtime.readFile(path)
      const content = typeof result.content === 'string' ? result.content : ''
      const t = truncateContent(content)
      return ok({ path, content: t.content, truncated: t.truncated, size: result.metadata?.size ?? t.content.length })
    } catch {
      return err(`File not found in workspace: ${path}`)
    }
  },

  write_folder_file: async (args) => {
    const conversationId = String(args.conversationId ?? '')
    const path = String(args.path ?? '')
    const content = String(args.content ?? '')
    if (!conversationId || !path) return err('conversationId and path are required')
    const manager = await d().getWorkspaceManager()
    const runtime = await manager.getWorkspace(conversationId)
    if (!runtime) return err(`No workspace bound to conversation ${conversationId}`)
    try {
      await runtime.writeFile(path, content)
      return ok({ path, written: true, size: content.length })
    } catch (e) {
      return err(`Write failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  },

  list_folder_files: async (args) => {
    const conversationId = String(args.conversationId ?? '')
    const path = String(args.path ?? '')
    const depth = Math.max(0, Number(args.depth ?? 2))
    if (!conversationId) return err('conversationId is required')
    const manager = await d().getWorkspaceManager()
    const runtime = await manager.getWorkspace(conversationId)
    if (!runtime) return err(`No workspace bound to conversation ${conversationId}`)
    const scan = await runtime.scanFiles()
    const prefix = path ? `${path.replace(/\/+$/, '')}/` : ''
    const files = [...scan.values()]
      .filter((f) => (prefix ? f.path.startsWith(prefix) : true))
      .filter((f) => {
        if (!prefix) {
          // depth limiting at root: count slashes in the remaining path
          return f.path.split('/').length <= depth + 1
        }
        const rest = f.path.slice(prefix.length)
        return rest.split('/').length <= depth + 1
      })
      .map((f) => ({ path: f.path, type: 'file' as const, size: f.size }))
    return ok({ files, truncated: false })
  },

  // ── Providers & models ──
  list_providers: async () => {
    const { getProvidersByCategory } = await import('@/agent/providers/types')
    const settings = d().getSettingsStore()
    const grouped = getProvidersByCategory()
    const providers: Array<Record<string, unknown>> = []
    for (const group of Object.values(grouped)) {
      for (const { type, meta } of group) {
        providers.push({
          id: type,
          name: meta.displayName,
          isCurrent: type === settings.providerType,
          pinnedModels: settings.pinnedModelsByProvider[type] ?? [],
        })
      }
    }
    return ok({
      providers,
      current: { providerId: settings.providerType, model: settings.modelName },
    })
  },

  list_models: async (args) => {
    const providerId = String(args.providerId ?? '')
    if (!providerId) return err('providerId is required')
    const { getModelsForProvider } = await import('@/agent/providers/types')
    const { getCachedModels } = await import('@/agent/providers/model-store')
    const settings = d().getSettingsStore()
    const staticModels: any[] = getModelsForProvider(providerId)
    const cached = getCachedModels(providerId) as any
    const models: any[] = cached?.models?.length ? cached.models : staticModels
    const pinned = settings.pinnedModelsByProvider[providerId] ?? []
    return ok({
      models: models.map((m: any) => ({
        id: m.id,
        name: m.name,
        contextWindow: m.contextWindow ?? null,
        pinned: pinned.includes(m.id),
      })),
      source: cached?.source ?? 'static',
    })
  },

  add_pinned_model: async (args) => {
    const providerId = String(args.providerId ?? '')
    const modelId = String(args.modelId ?? '')
    if (!providerId || !modelId) return err('providerId and modelId are required')
    const settings = d().getSettingsStore()
    settings.pinModel(providerId, modelId)
    return ok({ pinned: settings.pinnedModelsByProvider[providerId] ?? [] })
  },

  remove_pinned_model: async (args) => {
    const providerId = String(args.providerId ?? '')
    const modelId = String(args.modelId ?? '')
    if (!providerId || !modelId) return err('providerId and modelId are required')
    const settings = d().getSettingsStore()
    settings.unpinModel(providerId, modelId)
    return ok({ pinned: settings.pinnedModelsByProvider[providerId] ?? [] })
  },

  set_default_model: async (args) => {
    const providerId = String(args.providerId ?? '')
    const modelId = String(args.modelId ?? '')
    if (!providerId || !modelId) return err('providerId and modelId are required')
    const settings = d().getSettingsStore()
    settings.switchProviderAndModel(providerId, modelId)
    return ok({ providerId, modelId })
  },
}

// ─── Executor map builder ─────────────────────────────────────────────────────

export function buildToolExecutors(): Map<string, Handler> {
  const map = new Map<string, Handler>()
  for (const def of APP_TOOLS) {
    const h = handlers[def.name]
    if (!h) throw new Error(`[app-tools] missing handler for ${def.name}`)
    map.set(def.name, h)
  }
  return map
}
