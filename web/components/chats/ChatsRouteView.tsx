'use client'

import { useRouter, useParams } from 'next/navigation'
import { WorkspaceLayout } from '@/components/layout/WorkspaceLayout'
import { useConversationStore } from '@/store/conversation.store'
import { useWorkspaceRouteSyncStandalone } from '@/hooks/useWorkspaceRouteSyncStandalone'
import { chatPath, chatsPath } from '@/lib/route-paths'

/**
 * ChatsRouteView — the real view for the standalone-chat URL shape:
 *
 *   /chats/:chatId  (canonical)
 *
 * Standalone chats are kind='direct' conversations rendered through the SAME
 * WorkspaceLayout/ConversationView as project workspaces — the workspace ↔
 * conversation 1:1 binding is unchanged; only the route shape differs (no
 * /projects/:projectId prefix, the chats home is the fallback target).
 */
export default function ChatsRouteView() {
  const router = useRouter()
  const params = useParams<{ chatId: string }>()
  const chatId = params.chatId ?? ''

  useWorkspaceRouteSyncStandalone(chatId)

  const activeConversationTitle = useConversationStore((s) => {
    const { activeConversationId, conversations } = s
    if (!activeConversationId) return undefined
    return conversations.find((c) => c.id === activeConversationId)?.title
  })

  return (
    <WorkspaceLayout
      routeSpace="chats"
      onBackToProjects={() => router.replace(chatsPath())}
      conversationName={activeConversationTitle}
      onSwitchProject={async () => {
        // No project semantics in the standalone chat space.
        router.replace(chatsPath())
      }}
      onSelectWorkspace={(wsId: string) => {
        router.push(chatPath(wsId))
      }}
      onDraftConversationCreated={(wsId: string) => {
        // First message sent from the WelcomeScreen: replace, not push, so the
        // welcome state leaves no history entry.
        router.replace(chatPath(wsId))
      }}
    />
  )
}
