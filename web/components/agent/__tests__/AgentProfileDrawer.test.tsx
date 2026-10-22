import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AgentProfileDrawer } from '../AgentProfileDrawer'

const readAgentFiles = vi.fn(async () => ({
  soul: '# SOUL.md\n\nI am helpful.',
  identity: '# IDENTITY.md',
  agents: '# AGENTS.md',
  user: '# USER.md',
  memory: '# MEMORY.md',
  diaries: ['2026-10-21'],
}))

const readAgentDiary = vi.fn(async () => '# 2026-10-21\n\nToday I wrote code.')

const updateAgentFile = vi.fn(async () => true)
const updateAgentDiary = vi.fn(async () => true)

const openProfile = vi.fn()

vi.mock('@/store/agents.store', () => ({
  useAgentsStore: (selector: (s: unknown) => unknown) =>
    selector({
      readAgentFiles,
      readAgentDiary,
      updateAgentFile,
      updateAgentDiary,
      agentsRevision: 0,
      agents: [
        { id: 'default', name: 'default', createdAt: 0, lastAccessedAt: 0 },
        { id: 'other', name: 'other', createdAt: 0, lastAccessedAt: 0 },
      ],
    }),
}))

vi.mock('@/store/agent-profile.store', () => ({
  useAgentProfileStore: (selector: (s: unknown) => unknown) =>
    selector({ isOpen: true, agentId: 'default', close: vi.fn(), open: openProfile }),
}))

vi.mock('@/i18n', () => ({
  useT: () => (key: string) => key,
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

describe('AgentProfileDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the five editable files and the diary section', async () => {
    render(<AgentProfileDrawer />)

    await waitFor(() => {
      expect(screen.getByTestId('agent-profile-file-soul')).toBeTruthy()
    })
    expect(screen.getByTestId('agent-profile-file-identity')).toBeTruthy()
    expect(screen.getByTestId('agent-profile-file-agents')).toBeTruthy()
    expect(screen.getByTestId('agent-profile-file-user')).toBeTruthy()
    expect(screen.getByTestId('agent-profile-file-memory')).toBeTruthy()
    expect(screen.getByTestId('agent-profile-diary-2026-10-21')).toBeTruthy()
  })

  it('loads the selected file content into the editor', async () => {
    render(<AgentProfileDrawer />)

    await waitFor(() => {
      expect((screen.getByTestId('agent-profile-editor') as HTMLTextAreaElement).value).toContain('I am helpful.')
    })
  })

  it('saves through updateAgentFile', async () => {
    const user = userEvent.setup()
    render(<AgentProfileDrawer />)

    await waitFor(() => screen.getByTestId('agent-profile-editor'))
    await user.click(screen.getByTestId('agent-profile-save'))

    await waitFor(() => {
      expect(updateAgentFile).toHaveBeenCalledWith(
        'default',
        'soul',
        expect.stringContaining('I am helpful.'),
      )
    })
  })

  it('shows the empty state when the agent cannot be read', async () => {
    readAgentFiles.mockResolvedValueOnce(null as never)

    render(<AgentProfileDrawer />)

    await waitFor(() => {
      expect(screen.getByTestId('agent-profile-error')).toBeTruthy()
    })
  })

  it('switches the edited agent through the header select', async () => {
    const user = userEvent.setup()
    render(<AgentProfileDrawer />)

    const trigger = await screen.findByLabelText('agentProfile.switchAgent')
    await user.click(trigger)
    await user.click(await screen.findByText('@other'))

    expect(openProfile).toHaveBeenCalledWith('other')
  })

  it('loads a diary into the editor and saves it through updateAgentDiary', async () => {
    const user = userEvent.setup()
    render(<AgentProfileDrawer />)

    await user.click(await screen.findByTestId('agent-profile-diary-2026-10-21'))

    await waitFor(() => {
      expect((screen.getByTestId('agent-profile-editor') as HTMLTextAreaElement).value).toContain(
        'Today I wrote code.',
      )
    })

    await user.click(screen.getByTestId('agent-profile-save'))

    await waitFor(() => {
      expect(updateAgentDiary).toHaveBeenCalledWith(
        'default',
        '2026-10-21',
        expect.stringContaining('Today I wrote code.'),
      )
    })
    expect(updateAgentFile).not.toHaveBeenCalled()
  })

  it('still shows the diary group when there are no entries yet', async () => {
    readAgentFiles.mockResolvedValueOnce({
      soul: '',
      identity: '',
      agents: '',
      user: '',
      memory: '',
      diaries: [],
    } as never)

    render(<AgentProfileDrawer />)

    await waitFor(() => {
      expect(screen.getByText('agentProfile.noDiaries')).toBeTruthy()
    })
  })
})
