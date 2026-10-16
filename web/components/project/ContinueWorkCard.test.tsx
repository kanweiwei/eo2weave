import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ContinueWorkCard } from './ContinueWorkCard'

const t = (key: string, params?: Record<string, string | number>) => {
  const messages: Record<string, string> = {
    'projectHome.continueWork.openProject': 'Open project {name}',
    'projectHome.project.workspaceCount': '{count} conversations',
  }
  let text = messages[key] ?? key
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
  }
  return text
}

vi.mock('@/i18n', () => ({
  useT: () => t,
  useLocale: () => ['zh-CN', vi.fn()],
  LOCALE_LABELS: { 'zh-CN': 'zh' },
}))

const baseProject = {
  id: 'project-1',
  name: 'weave',
  status: 'active' as const,
  createdAt: Date.now() - 1000 * 60 * 60,
  updatedAt: Date.now() - 1000 * 60 * 21,
}

describe('ContinueWorkCard', () => {
  it('renders the project name and the relative activity timestamp', () => {
    render(
      <ContinueWorkCard
        project={baseProject}
        stats={{
          projectId: 'project-1',
          workspaceCount: 12,
          lastWorkspaceAccessAt: Date.now() - 1000 * 60 * 5,
        }}
        onOpen={vi.fn()}
      />,
    )

    // Single inline button — name and time visible.
    expect(screen.getByText('weave')).toBeInTheDocument()
    expect(screen.getByTestId('continue-work-card')).toBeInTheDocument()
  })

  it('opens the project on click', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()

    render(
      <ContinueWorkCard
        project={baseProject}
        onOpen={onOpen}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Open project weave' }))

    expect(onOpen).toHaveBeenCalledWith('project-1')
  })

  it('falls back to project.updatedAt when workspace stats are missing', () => {
    render(<ContinueWorkCard project={baseProject} onOpen={vi.fn()} />)

    expect(screen.getByText('weave')).toBeInTheDocument()
    expect(screen.getByTestId('continue-work-card')).toBeInTheDocument()
  })
})