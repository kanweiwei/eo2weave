'use client'

import { useEffect, useRef } from 'react'
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
 * - Project context is ensured, not switched: workspace rows are NOT NULL
 *   project_id, so when the user lands directly on /chats (activeProjectId
 *   still empty — it is URL-driven), the first available project is bound
 *   silently as the workspace host. This never surfaces in the UI — the
 *   chats space shows no project semantics.
 * - A chatId that resolves to a non-direct conversation redirects to /chats
 *   (standalone chats never surface project conversations).
 */
export function useWorkspaceRouteSyncStandalone(chatId: string) {
  const router = useRouter()
  const initialized = useProjectStore((s) => s.initialized)
  const projectLoading = useProjectStore((s) => s.isLoading)
  // Re-run when the conversation store finishes loading: a cold link to
  // /chats/:id can land before loadFromDB resolves, and without this
  // dependency the sync never retries (leaving the chat inactive).
  const conversationsLoaded = useConversationStore((s) => s.loaded)
  // Newest route target the effect has started a sync for. A stale
  // continuation's generation check can only discard the OLD run — it cannot
  // undo the store write that the discarded run's in-flight `setActive` may
  // still commit internally (the store's own setActive commits before the
  // hook regains control). When a stale completion fires, the repair below
  // re-asserts the newest route's choice so the store cannot end on a
  // superseded chat. The ref is assigned BEFORE the guards and blanked on
  // cleanup: a next route whose effect early-returns (project state still
  // loading) must still update the target, and a route that left /chats/:id
  // entirely must leave it empty — otherwise a stale completion reads the
  // old chat and re-activates it after the user has moved on.
  const newestChatIdRef = useRef<string>('')

  useEffect(() => {
    newestChatIdRef.current = chatId
    if (!chatId) return
    if (!initialized || projectLoading) return

    // Generation token: only the newest sync run may touch the stores. A
    // slow switch to chat A must never land after a newer switch to chat B.
    let generation = 0

    const syncFromRoute = async () => {
      const myGeneration = ++generation
      const cancelled = () => myGeneration !== generation

      // Step 0: ensure a project host exists. Landing on /chats directly
      // skips the /projects route sync, so activeProjectId may still be ''.
      const projectState = useProjectStore.getState()
      if (!projectState.activeProjectId) {
        const fallback =
          projectState.projects.find((p) => p.status !== 'archived') ?? projectState.projects[0]
        if (!fallback) {
          // Degenerate state (every project deleted): the chats home still
          // renders, but an individual chat has no workspace host.
          console.warn('[chatsSync] no project available as workspace host, redirecting to /chats')
          if (!cancelled()) router.replace('/chats')
          return
        }
        const switched = await projectState.setActiveProject(fallback.id)
        if (!switched) {
          if (!cancelled()) router.replace('/chats')
          return
        }
        if (cancelled()) return
      }

      // Step 1: the conversation must exist and be standalone (kind='direct').
      const convState = useConversationStore.getState()
      if (!convState.loaded) return
      const conversation = convState.conversations.find((c) => c.id === chatId)
      if (!conversation || conversation.kind !== 'direct') {
        console.warn('[chatsSync] standalone chat not found or not direct, redirecting to /chats', {
          chatId,
          found: !!conversation,
        })
        if (!cancelled()) router.replace('/chats')
        return
      }

      if (cancelled()) return

      // Step 2: switch workspace (OPFS/SQLite state). switchWorkspace
      // lazy-creates the workspace record on first visit, same as the
      // /projects route. The workspace store serializes concurrent switches
      // internally; the generation check after the await drops stale
      // completions so a slow switch to chat A never lands after the user
      // has already moved on to chat B.
      const ctxState = useConversationContextStore.getState()
      const activeWorkspaceId = ctxState.activeWorkspaceId
      if (activeWorkspaceId !== chatId) {
        try {
          await ctxState.switchWorkspace(chatId)
        } catch (error) {
          if (!cancelled()) {
            console.warn('[chatsSync] switchWorkspace failed, redirecting to /chats', { chatId, error })
            router.replace('/chats')
          }
          return
        }
        if (cancelled()) return
      } else {
        await ctxState.refreshPendingChanges(true)
        if (cancelled()) return
      }

      // Step 3: activate the conversation (loads messages). The generation
      // check after the await drops stale completions: a slow setActive(chatId)
      // for chat A must never overwrite the active conversation chosen by a
      // newer route sync to chat B.
      const activeConversationId = useConversationStore.getState().activeConversationId
      if (activeConversationId !== chatId) {
        await useConversationStore.getState().setActive(chatId)
        if (!cancelled()) return
        // Stale completion — but discarding the run is not enough: this
        // run's `setActive` may have already committed chat-a INSIDE the
        // store (the store commits before the hook regains control). Re-run
        // the activation for the newest route so the store ends on the chat
        // the user last navigated to, never the stale one. The re-run goes
        // through the same generation-guarded path and is a no-op when the
        // newest sync already landed.
        const newest = newestChatIdRef.current
        if (newest && newest !== useConversationStore.getState().activeConversationId) {
          await useConversationStore.getState().setActive(newest)
        }
        return
      }
    }

    void syncFromRoute()

    return () => {
      generation++
      // The route no longer points at a chat (unmount or a next route whose
      // effect early-returned): a stale setActive completion must NOT repair
      // toward the old target — there is no newest route that re-asserts a
      // choice, so the repair would re-activate a chat the user left.
      newestChatIdRef.current = ''
    }
  }, [chatId, router, initialized, projectLoading, conversationsLoaded])
}

/**
 * Resolve the canonical URL for a standalone chat id (used by list rows and
 * creation handlers so every entry shares one URL builder).
 */
export function standaloneChatHref(chatId: string): string {
  return chatPath(chatId)
}
