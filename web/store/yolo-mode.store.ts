/**
 * YOLO Mode Store — conversation-scoped "skip all prompt-level approvals".
 *
 * PR-4 of the tool authorization redesign generalizes the old page-action
 * yolo (global in-memory flag) into a conversation-scoped yoloMode that the
 * policy engine consults for EVERY prompt-level tool (external calls, disk
 * writes, page-action writes), not just page writes.
 *
 * Scope model (redesign doc §3.8) — intentional tightening:
 * - Persisted to localStorage so a refresh keeps the per-conversation grant
 *   (matches the persistence story of agentMode / autoApplyOnRunComplete —
 *   those are also remembered across refreshes via workspace-preferences
 *   store, so yolo now follows the same rule). Stale entries for closed
 *   conversations stay in localStorage until the conversation is deleted
 *   (see conversation.store.sqlite's delete flow, which calls setYolo(id,
 *   false) to drop the grant before the row is removed).
 * - Keyed by conversation: switching to a different conversation hides the
 *   grant (AgentModeSelect only shows YOLO for the active conv). Opening a
 *   different conversation does NOT inherit another's yolo — the per-conv
 *   map keeps grants isolated.
 * - forbidden tools are never covered by yolo (enforced in policy-engine,
 *   not here). LLM cannot enable yolo — switch_agent_mode force-clears it.
 *
 * NOTE: this module deliberately imports NOTHING conversation-related.
 * Importing the conversation store from here creates an import cycle
 * (conversation store → tool-registry → switch-mode.tool → this store), so
 * engine callers MUST pass the conversation id explicitly
 * (ToolContext.workspaceId) and UI reads the map via the zustand hook.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { usePageActionSessionStore } from '@/store/page-action-session.store'

/**
 * Sentinel key used for YOLO toggles made on the WelcomeScreen BEFORE a
 * conversation exists (bare URL). The pre-conversation pick is stored under
 * this key so it (a) actually persists into yoloByConversation instead of
 * being dropped on the floor, and (b) survives a refresh via the localStorage
 * layer above. The sentinel is intentionally NOT cleared after migration:
 * WorkspaceLayout.handleStartConversation reads it as the user's default YOLO
 * preference and carries it onto EVERY new conversation created from the bare
 * URL. It only changes when the user explicitly picks plan/act on the
 * WelcomeScreen (setYolo(null, false) writes the sentinel as false).
 */
export const YOLO_WELCOME_SENTINEL = '__welcome__'

interface YoloModeState {
  /** conversationId -> yolo on */
  yoloByConversation: Record<string, boolean>

  setYolo: (conversationId: string | null | undefined, on: boolean) => void

  /** Turn yolo off for every conversation (LLM mode-switch safety valve). */
  clearAll: () => void
}

export const useYoloModeStore = create<YoloModeState>()(
  persist(
    (set) => ({
      yoloByConversation: {},

      setYolo: (conversationId, on) =>
        set((state) => {
          // Map null/undefined onto the welcome sentinel so the pre-conversation
          // pick is recorded (and persisted). Without this, toggling YOLO on
          // the bare URL would silently no-op and the choice would vanish on
          // refresh.
          const key = conversationId ?? YOLO_WELCOME_SENTINEL
          if (Boolean(state.yoloByConversation[key]) === on) return state
          return { yoloByConversation: { ...state.yoloByConversation, [key]: on } }
        }),

      clearAll: () => set({ yoloByConversation: {} }),
    }),
    {
      name: 'creatorweave-yolo-mode',
      version: 1,
      // Only persist the per-conversation map; methods are stable references
      // and don't need to survive a refresh.
      partialize: (state) => ({ yoloByConversation: state.yoloByConversation }),
    },
  ),
)

/**
 * Engine-facing read: is yolo currently on for the given conversation?
 * There is deliberately NO global fallback — a conversation-less yolo would
 * be exactly the global flag this PR removes. No id → off.
 */
export function isYoloOn(conversationId?: string | null): boolean {
  if (!conversationId) return false
  return Boolean(useYoloModeStore.getState().yoloByConversation[conversationId])
}

/** Legacy global flag — kept in sync as a UI compatibility shim. */
export function syncLegacyPageActionYolo(on: boolean): void {
  try {
    usePageActionSessionStore.getState().setPageActionYolo(on)
  } catch {
    // Legacy store unavailable (e.g. stripped in tests) — non-fatal.
  }
}
