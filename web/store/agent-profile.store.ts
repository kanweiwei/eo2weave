/**
 * Agent Profile Store
 *
 * 管理「Agent 档案」面板的开关状态。
 * 面板需要跨 WelcomeScreen 与 ConversationView 共享，故独立成一个 store。
 */

import { create } from 'zustand'

interface AgentProfileState {
  /** 面板是否打开 */
  isOpen: boolean
  /** 面板当前正在编辑的 agent id */
  agentId: string | null

  open: (agentId: string) => void
  close: () => void
}

export const useAgentProfileStore = create<AgentProfileState>()((set) => ({
  isOpen: false,
  agentId: null,

  open: (agentId) => set({ isOpen: true, agentId }),
  close: () => set({ isOpen: false, agentId: null }),
}))

export type { AgentProfileState }
