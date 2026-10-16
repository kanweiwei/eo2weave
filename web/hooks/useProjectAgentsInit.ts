/**
 * useProjectAgentsInit — make sure `useAgentsStore` is initialized for the
 * currently active project. Idempotent: re-mounts and re-runs are no-ops
 * once the store has loaded agents for the project.
 *
 * Why this exists as a separate hook:
 * - `useConversationLogic` originally contained the init effect, but it only
 *   runs on screens that mount `ConversationView`. The WelcomeScreen
 *   toolbar (added in the pre-conversation configuration PR) renders an
 *   `AgentDropdown` that needs live agent data on bare URLs to a workspace
 *   that has no conversation yet — there is no `ConversationView` mounted,
 *   so the init effect used to skip the toolbar entirely. Extracting the
 *   effect lets both screens call it.
 *
 * Behaviour:
 * - Skips bare-URL state (no `activeProjectId`).
 * - Re-runs only if the project changes, init is not in flight, and either
 *   the store is not yet initialised or the agent list is empty. The
 *   re-run guard matches the original ConversationView guard exactly so
 *   swapping callers does not change the trigger conditions.
 */

import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useProjectStore } from '@/store/project.store'
import { useAgentsStore } from '@/store/agents.store'

const EMPTY_MENTION_AGENTS: { id: string; name: string }[] = []

export function useProjectAgentsInit(): void {
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const isAgentsLoading = useAgentsStore((s) => s.isLoading)
  const isAgentsInitialized = useAgentsStore((s) => s.isInitialized)
  const mentionAgents = useAgentsStore(
    useShallow((s) => {
      const filtered = s.agents
        .filter((agent) => agent.id !== 'default')
        .map((agent) => ({ id: agent.id, name: agent.name }))
      return filtered.length === 0 ? EMPTY_MENTION_AGENTS : filtered
    })
  )

  useEffect(() => {
    if (!activeProjectId) return
    if (isAgentsLoading) return
    if (mentionAgents.length > 0 && isAgentsInitialized) return

    let cancelled = false
    ;(async () => {
      try {
        const { ProjectManager } = await import('@/opfs')
        const pm = await ProjectManager.create()
        if (cancelled) return
        const store = useAgentsStore.getState()
        store.setProjectManager(pm)
        await store.initialize(activeProjectId)
      } catch (error) {
        if (!cancelled) {
          console.warn('[useProjectAgentsInit] Failed to initialize agents:', error)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeProjectId, isAgentsLoading, isAgentsInitialized, mentionAgents])
}
