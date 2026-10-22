import { beforeEach, describe, expect, it } from 'vitest'
import { useAgentProfileStore } from '../agent-profile.store'

describe('useAgentProfileStore', () => {
  beforeEach(() => {
    useAgentProfileStore.setState({ isOpen: false, agentId: null })
  })

  it('starts closed', () => {
    expect(useAgentProfileStore.getState().isOpen).toBe(false)
    expect(useAgentProfileStore.getState().agentId).toBeNull()
  })

  it('opens for a given agent', () => {
    useAgentProfileStore.getState().open('frontend')

    expect(useAgentProfileStore.getState().isOpen).toBe(true)
    expect(useAgentProfileStore.getState().agentId).toBe('frontend')
  })

  it('closes and clears the agent id', () => {
    useAgentProfileStore.getState().open('frontend')
    useAgentProfileStore.getState().close()

    expect(useAgentProfileStore.getState().isOpen).toBe(false)
    expect(useAgentProfileStore.getState().agentId).toBeNull()
  })
})
