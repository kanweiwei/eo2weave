//=============================================================================
// Conversation persistence (SQLite) — extracted from conversation.store.sqlite.ts
//
// Module-private persistence helpers, now exported for the store facade to
// import. Signatures unchanged; this is a pure module-level extraction.
//=============================================================================

import type { Conversation, Message } from '@/agent/message-types'
import { getConversationRepository, getMessageRepository } from '@/sqlite'
import { getCurrentWorkspaceAgentMode } from './workspace-preferences.store'

//=============================================================================
// Persistence Functions (SQLite)
//=============================================================================

export const pendingConversationMetaPersists = new Map<string, Promise<void>>()

/**
 * In-flight loadFromDB promise. StrictMode (dev only) double-mounts effects
 * synchronously, and both invocations see `loaded === false` before the first
 * one finishes. Without this guard, the full N-conversation load runs twice
 * on every page refresh in dev — observed 2×5.3s back-to-back. Production
 * builds mount once, so this is a dev-only no-op there.
 */
let inflightLoadFromDB: Promise<void> | null = null

/**
 * Run `fn` under the module-level inflight guard: while a wrapped load is in
 * flight, subsequent calls receive the same in-flight promise instead of
 * starting a duplicate load. The guard clears when the wrapped promise settles.
 */
export async function withInflightLoad(fn: () => Promise<void>): Promise<void> {
  if (inflightLoadFromDB) return inflightLoadFromDB
  inflightLoadFromDB = fn().finally(() => {
    inflightLoadFromDB = null
  })
  return inflightLoadFromDB
}

export async function waitForConversationMetaPersist(convId: string): Promise<void> {
  const pending = pendingConversationMetaPersists.get(convId)
  if (pending) {
    await pending
  }
}

/** Append a single new message via MessageRepository */
export async function persistNewMessage(convId: string, message: Message, seq: number): Promise<void> {
  await waitForConversationMetaPersist(convId)
  const msgRepo = getMessageRepository()
  const convRepo = getConversationRepository()
  await msgRepo.insert(convId, message, seq)
  await convRepo.touch(convId)
}


/**
 * Debounced persist scheduler — coalesces rapid fire-and-forget calls into
 * a single database write while guaranteeing immediate flush for final saves.
 *
 * Why: During an agent run, `persistAfterBlockComplete` and `onNotification`
 * can fire many times per second. Each triggers a full DELETE + INSERT in a
 * manual transaction. If two calls overlap, SQLite throws
 * "cannot start a transaction within a transaction".
 *
 * How: We debounce non-critical calls (300 ms window) so only the latest
 * messages snapshot is written. Critical calls (flush=true) skip the timer
 * and execute immediately, chained after any in-flight write.
 */
export const persistSchedulers = new Map<
  string,
  {
    timer: ReturnType<typeof setTimeout> | null
    flushInProgress: Promise<void> | null
    // Resolve function for the currently-pending debounce Promise, so a
    // pre-empting call can settle it immediately instead of leaving it hanging.
    pendingResolve: (() => void) | null
  }
>()

export const PERSIST_DEBOUNCE_MS = 300

export async function doPersist(convId: string, messages: Message[]): Promise<void> {
  await waitForConversationMetaPersist(convId)
  const msgRepo = getMessageRepository()
  const convRepo = getConversationRepository()
  await msgRepo.replaceAll(convId, messages)
  await convRepo.touch(convId)
}

/**
 * Schedule (or immediately execute) a message persist for a conversation.
 *
 * @param flush  `true` = skip debounce, write immediately. Use for final
 *               saves (complete, cancel, user edits). `false` = debounce
 *               to coalesce rapid intermediate writes (block-complete,
 *               notifications).
 */
export function persistMessageReplace(
  convId: string,
  messages: Message[],
  flush: boolean = true
): Promise<void> {
  let entry = persistSchedulers.get(convId)
  if (!entry) {
    entry = { timer: null, flushInProgress: null, pendingResolve: null }
    persistSchedulers.set(convId, entry)
  }

  // Cancel any pending debounced write — settle the old Promise immediately
  // so its caller (which uses .catch() / void) doesn't hang.
  if (entry.timer !== null) {
    clearTimeout(entry.timer)
    entry.timer = null
  }
  if (entry.pendingResolve !== null) {
    entry.pendingResolve() // resolve old debounce Promise harmlessly
    entry.pendingResolve = null
  }

  // Flush: chain immediately after any in-flight write
  if (flush) {
    const prev = entry.flushInProgress?.catch(() => undefined) ?? Promise.resolve()
    const next = prev.then(() => doPersist(convId, messages))
    entry.flushInProgress = next
    void next.then(
      () => {
        if (entry!.flushInProgress === next) entry!.flushInProgress = null
      },
      () => {
        if (entry!.flushInProgress === next) entry!.flushInProgress = null
      }
    )
    return next
  }

  // Debounce: schedule a write after PERSIST_DEBOUNCE_MS.
  // The returned Promise resolves when the actual write completes (or
  // immediately with void if superseded by a later call).
  let resolveDebounce!: (value: void | PromiseLike<void>) => void
  let rejectDebounce!: (reason?: unknown) => void
  const debouncePromise = new Promise<void>((r, j) => {
    resolveDebounce = r
    rejectDebounce = j
  })

  entry.timer = setTimeout(() => {
    entry!.timer = null
    entry!.pendingResolve = null

    const prev = entry!.flushInProgress?.catch(() => undefined) ?? Promise.resolve()
    const next = prev.then(() => doPersist(convId, messages))
    entry!.flushInProgress = next

    // Settle the debounce Promise once the write settles
    void next.then(
      () => resolveDebounce(),
      (err) => rejectDebounce(err)
    )
    void next.then(
      () => {
        if (entry!.flushInProgress === next) entry!.flushInProgress = null
        if (entry!.timer === null && entry!.flushInProgress === null) {
          persistSchedulers.delete(convId)
        }
      },
      () => {
        if (entry!.flushInProgress === next) entry!.flushInProgress = null
        if (entry!.timer === null && entry!.flushInProgress === null) {
          persistSchedulers.delete(convId)
        }
      }
    )
  }, PERSIST_DEBOUNCE_MS)

  // Store resolve so a pre-empting flush or newer debounce can settle early
  entry.pendingResolve = resolveDebounce

  return debouncePromise
}

/** Persist only conversation metadata (title, contextUsage, etc.) — no messages */
export async function persistConversationMeta(conversation: Conversation): Promise<void> {
  const repo = getConversationRepository()
  await repo.saveMeta({
    id: conversation.id,
    title: conversation.title,
    titleMode: conversation.titleMode || 'manual',
    contextUsage: conversation.lastContextWindowUsage || null,
    compressedContextSummary: conversation.compressedContextSummary || null,
    compressedContextCutoffTimestamp: conversation.compressedContextCutoffTimestamp ?? null,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  })
}

/** Load all conversation metadata from SQLite (without messages) */
export async function loadConversationsMeta(): Promise<Conversation[]> {
  const repo = getConversationRepository()
  const metas = await repo.findAllMeta()
  // Create Conversation objects with empty messages (loaded on demand)
  return metas.map((meta) => ({
    id: meta.id,
    title: meta.title,
    titleMode: meta.titleMode || 'manual',
    messages: [] as Message[], // Messages loaded lazily when conversation is opened
    lastContextWindowUsage: meta.lastContextWindowUsage || null,
    compressedContextSummary: meta.compressedContextSummary || null,
    compressedContextCutoffTimestamp: meta.compressedContextCutoffTimestamp ?? null,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    status: 'idle' as const,
    streamingContent: '',
    streamingReasoning: '',
    isReasoningStreaming: false,
    completedReasoning: null,
    isContentStreaming: false,
    completedContent: null,
    currentToolCall: null,
    activeToolCalls: [],
    streamingToolArgs: '',
    streamingToolArgsByCallId: {},
    error: null,
    activeRunId: null,
    runEpoch: 0,
    draftAssistant: null,
    contextWindowUsage: meta.lastContextWindowUsage || null,
    mountRefCount: 0,
    compressionConvertCallCount: 0,
    compressionLastSummaryConvertCall: Number.NEGATIVE_INFINITY,
    collectedAssets: [],
    agentMode: getCurrentWorkspaceAgentMode(),
  }))
}

/** Delete a conversation from SQLite */
export async function deleteConversationFromDB(id: string): Promise<void> {
  const repo = getConversationRepository()
  await repo.delete(id)
}
