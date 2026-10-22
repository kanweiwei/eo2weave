import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AgentDropdown } from '../AgentDropdown'

const open = vi.fn()

vi.mock('@/store/agent-profile.store', () => ({
  useAgentProfileStore: (selector: (s: unknown) => unknown) => selector({ open }),
}))

vi.mock('@/i18n', () => ({
  useT: () => (key: string) => key,
}))

describe('AgentDropdown', () => {
  it('offers an "edit profile" entry that opens the profile panel', async () => {
    const user = userEvent.setup()
    render(
      <AgentDropdown
        allAgents={[{ id: 'default', name: 'default', createdAt: 0, lastAccessedAt: 0 }]}
        activeAgentId="default"
        setActiveAgent={vi.fn()}
        deleteAgent={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button'))
    await user.click(screen.getByTestId('agent-dropdown-edit-profile'))

    expect(open).toHaveBeenCalledWith('default')
  })
})
