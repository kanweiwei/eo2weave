import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/projects',
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), info: vi.fn() },
}))

vi.mock('@/components/activity/ActivityHeatmap', () => ({
  ActivityHeatmap: () => null,
}))

vi.mock('@/store/theme.store', () => ({
  useTheme: () => ({ mode: 'light', setTheme: vi.fn(), accentColor: 'teal', setAccentColor: vi.fn() }),
  ACCENT_COLORS: {},
}))

vi.mock('@/i18n', () => ({
  useT: () => (key: string, params?: Record<string, string | number>) => {
    const messages: Record<string, string> = {
      'app.initFailed': 'Initialization failed',
      'app.retry': 'Retry',
      'app.projectsInitErrorHint': 'Your projects are safe',
      'app.projectsInitRetrying': 'Retrying...',
    }
    let text = messages[key] ?? key
    if (params) {
      for (const [name, value] of Object.entries(params)) {
        text = text.replaceAll(`{${name}}`, String(value))
      }
    }
    return text
  },
  useLocale: () => ['zh-CN', vi.fn()],
  LOCALE_LABELS: {
    'zh-CN': 'Simplified Chinese',
    'en-US': 'English',
    'ja-JP': 'Japanese',
    'ko-KR': 'Korean',
  },
}))

import ProjectHomeView from '../ProjectHomeView'
import { useProjectStore } from '@/store/project.store'

function setupStore(opts: {
  error: string | null
  initialized?: boolean
  isLoading?: boolean
  projects?: { id: string; name: string; status: 'active'; createdAt: number; updatedAt: number }[]
}) {
  useProjectStore.setState({
    activeProjectId: '',
    projects: opts.projects ?? [],
    projectStats: {},
    initialized: opts.initialized ?? false,
    isLoading: opts.isLoading ?? false,
    error: opts.error,
  })
}

describe('ProjectHomeView — SQLite init failure surfacing (issue #131)', () => {
  beforeEach(() => {
    useProjectStore.setState({
      activeProjectId: '',
      projects: [],
      projectStats: {},
      initialized: false,
      isLoading: false,
      error: null,
    })
  })

  it('renders an error banner with the error message instead of an empty project list', () => {
    setupStore({ error: 'OPFS pool busy' })

    render(<ProjectHomeView />)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Initialization failed')
    expect(alert).toHaveTextContent('OPFS pool busy')
    // Must NOT show the "No projects yet" empty state — that reads as data loss.
    expect(screen.queryByText('projectHome.empty.noProjects')).toBeNull()
  })

  it('does not render the banner when there is no error', () => {
    setupStore({
      error: null,
      initialized: true,
      projects: [{ id: 'p1', name: 'P1', status: 'active', createdAt: 1, updatedAt: 1 }],
    })

    render(<ProjectHomeView />)

    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('re-runs initialize() when the Retry button is clicked', async () => {
    const user = userEvent.setup()
    const initializeSpy = vi
      .spyOn(useProjectStore.getState(), 'initialize')
      .mockResolvedValue(undefined)
    setupStore({ error: 'transient failure' })

    render(<ProjectHomeView />)

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(initializeSpy).toHaveBeenCalledTimes(1))
    // Failure is not pinned: initialized stays false so the retry is real.
    expect(useProjectStore.getState().initialized).toBe(false)
  })
})
