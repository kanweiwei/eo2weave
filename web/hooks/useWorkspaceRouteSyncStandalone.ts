'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useProjectStore } from '@/store/project.store'
import { useConversationContextStore } from '@/store/conversation-context.store'
import { useConversationStore } from '@/store/conversation.store'
import { chatPath } from '@/lib/route-paths'

/**
 * useWorkspaceRouteSyncStandalone — URL → store sync for /chats/:chatId.
 *
 * The standalone-chats sibling of useWorkspaceRouteSync: the workspace ↔
 * conversation 1:1 binding and the switchWorkspace/setActive choreography are
 * IDENTICAL — only the route shape differs (no :projectId segment, and the
 * not-found fallback is the chats home, not /projects).
 *
 * Deviations from the project version:
 * - No project switch step: the active project stays whatever it was; the
 *   standalone chat's workspace record keeps its own project_id (workspace
 *   rows are NOT NULL project_id) while the conversation itself is kind='direct'.
 * - A chatId that resolves to a non-direct conversation redirects to /chats
 *   (standalone chats never surface project conversations).
 */
export function useWorkspaceRouteSyncStandalone(chatId: string) {
  const router = useRouter()
  const initialized = useProjectStore((s) => s.initialized)
  const projectLoading = useProjectStore((s) => s.isLoading)

  useEffect(() => {
    if (!chatId) return
    if (!initialized || projectLoading) return

    let cancelled = false

    const syncFromRoute = async () => {
      // Step 1: the conversation must exist and be standalone (kind='direct').
      const convState = useConversationStore.getState()
      if (!convState.loaded) return
      const conversation = convState.conversations.find((c) => c.id === chatId)
      if (!conversation || conversation.kind !== 'direct') {
        console.warn('[chatsSync] standalone chat not found or not direct, redirecting to /chats', {
          chatId,
          found: !!conversation,
        })
        if (!cancelled) router.replace('/chats')
        return
      }

      if (cancelled) return

      // Step 2: switch workspace (OPFS/SQLite state). switchWorkspace
      // lazy-creates the workspace record on first visit, same as the
      // /projects route.
      const ctxState = useConversationContextStore.getState()
      const activeWorkspaceId = ctxState.activeWorkspaceId
      if (activeWorkspaceId !== chatId) {
        await ctxState.switchWorkspace(chatId)
      } else {
        await ctxState.refreshPendingChanges(true)
      }

      if (cancelled) return

      // Step 3: activate the conversation (loads messages).
      const activeConversationId = useConversationStore.getState().activeConversationId
      if (activeConversationId !== chatId) {
        await useConversationStore.getState().setActive(chatId)
      }
    }

    void syncFromRoute()

    return () => {
      cancelled = true
    }
  }, [chatId, router, initialized, projectLoading])
}

/**
 * Resolve the canonical URL for a standalone chat id (used by list rows and
 * creation handlers so every entry shares one URL builder).
 */
export function standaloneChatHref(chatId: string): string {
  return chatPath(chatId)
}
