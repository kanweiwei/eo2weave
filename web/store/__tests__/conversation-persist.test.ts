/* eslint-disable */
// @ts-nocheck - Unit tests for persistence & message-merge paths in conversation.store.sqlite.ts
/**
 * Conversation Store — persistence & merge coverage
 *
 * These tests target the persistence/merge logic that the future
 * `conversation-persist.ts` / `conversation-message-ops.ts` split will own.
 * They drive the store through its PUBLIC API only (updateMessages /
 * addMessage / updateTitle / loadFromDB), so they keep passing unchanged
 * when the module is split — they assert behavior, not file layout.
 *
 * Covered semantics:
 *  - persistMessageReplace debounce coalescing (300ms window)
 *  - persistNewMessage immediate insert path
 *  - persistConversationMeta routing through saveMeta
 *  - reconcileMessageSnapshot replace-vs-append decision
 *  - healCompressionBaseline cutoff recovery on loadFromDB
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAssistantMessage, createUserMessage } from '@/agent/message-types'
import { useConversationStore } from '../conversation.store'
import { reconcileMessageSnapshot } from '../conversation.store.sqlite'
import { useConversationRuntimeStore } from '../conversation-runtime.store'
import { clearAgentLoops } from '../agent-loop-registry'
import { clearStreamingQueues } from '../streaming-queue-registry'

const conversationRepoSaveMetaMock = vi.fn(() => Promise.resolve())
const conversationRepoTouchMock = vi.fn(() => Promise.resolve())
const messageRepoReplaceAllMock = vi.fn(() => Promise.resolve())
const messageRepoInsertMock = vi.fn(() => Promise.resolve())

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

vi.mock('@/streaming-bus', () => ({
  emitThinkingStart: vi.fn(),
  emitThinkingDelta: vi.fn(),
  emitCompressionEvent: vi.fn(),
  emitToolStart: vi.fn(),
  emitComplete: vi.fn(),
  emitError: vi.fn(),
}))

vi.mock('../conversation-context.store', () => ({
  getActiveConversation: vi.fn(() => null),
  useConversationContextStore: {
    getState: vi.fn(() => ({
      // loadFromDB heals the ACTIVE conversation only — point it at heal-conv
      activeWorkspaceId: 'heal-conv',
      workspaces: [],
      createWorkspace: vi.fn(() => Promise.resolve()),
      switchWorkspace: vi.fn(() => Promise.resolve()),
      refreshWorkspaces: vi.fn(() => Promise.resolve()),
      refreshPendingChanges: vi.fn(() => Promise.resolve()),
      deleteWorkspace: vi.fn(() => Promise.resolve()),
    })),
  },
}))

vi.mock('../settings.store', () => {
  const mockSettingsState = {
    providerType: 'openai',
    modelName: 'mock-model',
    maxIterations: 20,
    getEffectiveProviderConfig: vi.fn(() => ({
      apiKeyProviderKey: 'openai',
      baseUrl: 'https://example.com',
      modelName: 'mock-model',
    })),
  }
  return {
    useSettingsStore: { getState: vi.fn(() => mockSettingsState) },
    __mockSettingsState: mockSettingsState,
  }
})

vi.mock('@/sqlite', () => ({
  initSQLiteDB: vi.fn(() => Promise.resolve()),
  getApiKeyRepository: vi.fn(() => ({
    load: vi.fn(() => Promise.resolve('test-key')),
  })),
  getConversationRepository: vi.fn(() => ({
    findAllMeta: vi.fn(() =>
      Promise.resolve([
        {
          id: 'heal-conv',
          title: 'heal me',
          titleMode: 'manual',
          lastContextWindowUsage: null,
          compressedContextSummary: null,
          compressedContextCutoffTimestamp: null,
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_000_000,
        },
      ])
    ),
    findByConversation: vi.fn(() => Promise.resolve([])),
    save: vi.fn(() => Promise.resolve()),
    saveMeta: conversationRepoSaveMetaMock,
    touch: conversationRepoTouchMock,
    delete: vi.fn(() => Promise.resolve()),
  })),
  getMessageRepository: vi.fn(() => ({
    findByConversation: vi.fn((convId: string) =>
      convId === 'heal-conv'
        ? Promise.resolve([
            {
              id: 'summary-1',
              role: 'assistant',
              kind: 'context_summary',
              content: 'summary-of-earlier-context',
              // context_summary messages store timestamp = cutoffTimestamp - 1
              timestamp: 1_700_000_000_001 - 1,
            },
          ])
        : Promise.resolve([])
    ),
    insert: messageRepoInsertMock,
    replaceAll: messageRepoReplaceAllMock,
    migrateFromJsonBlob: vi.fn(() => Promise.resolve({ conversations: 0, messages: 0 })),
    recoverFromAppSessions: vi.fn(() =>
      Promise.resolve({ sessions: 0, conversations: 0, messages: 0 })
    ),
  })),
  getSQLiteDB: vi.fn(() => ({
    queryFirst: vi.fn(() => Promise.resolve({ count: 0 })),
  })),
}))

vi.mock('@/agent/providers/types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/agent/providers/types')>()
  return {
    ...actual,
    LLM_PROVIDER_CONFIGS: {
      ...actual.LLM_PROVIDER_CONFIGS,
      openai: {
        ...actual.LLM_PROVIDER_CONFIGS.openai,
        baseURL: 'https://example.com',
        modelName: 'mock-model',
      },
    },
    isCustomProviderType: vi.fn(() => false),
  }
})

/** Reset store + registries between tests (mirrors conversation.store.sqlite.test.ts) */
function resetStore(extra: Record<string, unknown> = {}) {
  clearAgentLoops()
  clearStreamingQueues()
  useConversationRuntimeStore.setState({ runtimes: new Map() })
  useConversationStore.setState({
    conversations: [],
    activeConversationId: null,
    loaded: true,
    loadError: null,
    suggestedFollowUps: new Map(),
    cancelledRunIds: new Set(),
    mountedConversations: new Map(),
    ...extra,
  } as never)
}

/** createUserMessage ignores id overrides (2nd arg is assets) — build then patch id */
function mkUser(id: string, content: string) {
  const m = createUserMessage(content)
  m.id = id
  return m
}
function mkAssistant(id: string, content: string) {
  const m = createAssistantMessage(content)
  m.id = id
  return m
}

/** Seed a conversation as a plain (non-frozen) object in the store. */
function seedConversation(messages: ReturnType<typeof createUserMessage>[]) {
  const conv = useConversationStore.getState().createNew('persist-test')
  // createNew returns a frozen store object; replace it wholesale via setState
  // with a plain snapshot carrying the messages we want.
  useConversationStore.setState({
    conversations: [{ ...conv, messages }],
    activeConversationId: conv.id,
  } as never)
  return conv
}

const getConv = (id: string) =>
  useConversationStore.getState().conversations.find((c) => c.id === id)

describe('conversation persistence: debounce coalescing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    resetStore()
  })

  afterEach(() => {
    vi.useRealTimers()
    resetStore()
  })

  it('writes each updateMessages call immediately (flush path, serialized)', async () => {
    const conv = seedConversation([mkUser('u1', 'q')])

    // updateMessages uses the flush path (final saves): every call persists
    // immediately, chained after the previous write — never dropped.
    for (let i = 1; i <= 3; i++) {
      useConversationStore.getState().updateMessages(conv.id, [
        mkUser('u1', 'q'),
        mkAssistant(`a-${i}`, `block ${i}`),
      ])
    }

    await vi.advanceTimersByTimeAsync(0)

    expect(messageRepoReplaceAllMock).toHaveBeenCalledTimes(3)
    // The last persisted snapshot is the final state
    const lastPersisted = messageRepoReplaceAllMock.mock.calls[2][1] as { id: string }[]
    expect(lastPersisted[lastPersisted.length - 1].id).toBe('a-3')
  })

  it('persists through updateMessages after the debounce window elapses', async () => {
    const conv = seedConversation([mkUser('u1', 'hello')])

    useConversationStore.getState().updateMessages(conv.id, [
      mkUser('u1', 'hello'),
      mkAssistant('a1', 'answer'),
    ])
    await vi.advanceTimersByTimeAsync(400)

    expect(messageRepoReplaceAllMock).toHaveBeenCalledTimes(1)
    expect(conversationRepoTouchMock).toHaveBeenCalledWith(conv.id)
  })

  it('persists new messages immediately through addMessage (insert path)', async () => {
    const conv = seedConversation([])

    useConversationStore.getState().addMessage(conv.id, createUserMessage('first'))
    await vi.advanceTimersByTimeAsync(0)

    expect(messageRepoInsertMock).toHaveBeenCalledTimes(1)
    expect(conversationRepoTouchMock).toHaveBeenCalledWith(conv.id)
  })
})

describe('conversation persistence: metadata routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    resetStore()
  })

  afterEach(() => {
    vi.useRealTimers()
    resetStore()
  })

  it('routes title updates through saveMeta without touching message rows', async () => {
    const conv = seedConversation([])

    useConversationStore.getState().updateTitle(conv.id, 'renamed')
    await vi.advanceTimersByTimeAsync(400)

    expect(conversationRepoSaveMetaMock).toHaveBeenCalled()
    const saved = conversationRepoSaveMetaMock.mock.calls.at(-1)[0]
    expect(saved.id).toBe(conv.id)
    expect(saved.title).toBe('renamed')
    // Meta persist must not rewrite message rows
    expect(messageRepoReplaceAllMock).not.toHaveBeenCalled()
  })
})

describe('message merge semantics (reconcileMessageSnapshot)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns previous when incoming is empty', () => {
    const previous = [mkUser('u1', 'q1')]
    expect(reconcileMessageSnapshot(previous, [])).toBe(previous)
  })

  it('returns incoming when previous is empty', () => {
    const incoming = [mkUser('u1', 'q1')]
    expect(reconcileMessageSnapshot([], incoming)).toBe(incoming)
  })

  it('replaces when incoming fully covers previous (re-mapped snapshot)', () => {
    const previous = [mkUser('u1', 'q1'), mkAssistant('a1', 'a1')]
    const incoming = [mkUser('u1', 'q1'), mkAssistant('a1', 'a1-regenerated')]

    const merged = reconcileMessageSnapshot(previous, incoming)

    expect(merged).toHaveLength(2)
    expect(merged[1].content).toBe('a1-regenerated')
  })

  it('appends unseen messages on partial overlap without dropping history', () => {
    const previous = [mkUser('u1', 'q1')]
    const incoming = [mkUser('u1', 'q1'), mkAssistant('a-tail', 'tail')]

    const merged = reconcileMessageSnapshot(previous, incoming)

    expect(merged).toHaveLength(2)
    expect(merged[0].id).toBe('u1')
    expect(merged[1].id).toBe('a-tail')
  })

  it('appends a small non-overlapping fragment instead of replacing history', () => {
    const previous = [
      mkUser('u1', 'q1'),
      mkAssistant('a1', 'long answer'),
      mkAssistant('a2', 'more'),
      mkAssistant('a3', 'even more'),
    ]
    // A tiny fragment (new tool result) — must append, not replace
    const fragment = [mkAssistant('a-new', 'tool result')]

    const merged = reconcileMessageSnapshot(previous, fragment)

    expect(merged).toHaveLength(5)
    expect(merged[0].id).toBe('u1')
    expect(merged[4].id).toBe('a-new')
  })

  it('treats a large non-overlapping incoming as a replacement snapshot (regenerated ids)', () => {
    const previous = [mkUser('u1', 'q1'), mkAssistant('a1', 'answer')]
    // Cancel/regenerate re-maps all ids: no overlap but same scale as previous
    const incoming = [mkUser('u1-r', 'q1'), mkAssistant('a1-r', 'answer-regenerated')]

    const merged = reconcileMessageSnapshot(previous, incoming)

    expect(merged).toHaveLength(2)
    expect(merged.map((m) => m.id)).toEqual(['u1-r', 'a1-r'])
  })

  it('preserves previous reasoningDurationMs when incoming drops it', () => {
    const previous = [mkAssistant('a1', 'answer')]
    previous[0].reasoningDurationMs = 1234
    const incoming = [mkAssistant('a1', 'answer')]

    const merged = reconcileMessageSnapshot(previous, incoming)

    expect(merged[0].reasoningDurationMs).toBe(1234)
  })
})

describe('compression baseline healing on loadFromDB', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    resetStore({ loaded: false, activeConversationId: 'heal-conv' })
  })

  afterEach(() => {
    vi.useRealTimers()
    resetStore()
  })

  it('heals compressedContextSummary/cutoff from a context_summary message', async () => {
    await useConversationStore.getState().loadFromDB()
    await vi.advanceTimersByTimeAsync(0)

    const healed = getConv('heal-conv')
    expect(healed).toBeDefined()
    expect(healed?.compressedContextSummary).toBe('summary-of-earlier-context')
    // cutoff = summary timestamp + 1
    expect(healed?.compressedContextCutoffTimestamp).toBe(1_700_000_000_001)
  })
})
