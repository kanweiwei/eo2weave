import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AgentProfileDrawer } from '../AgentProfileDrawer'
import { useI18nStore } from '@/i18n/store'

/**
 * AgentProfileDrawer — i18n wiring
 *
 * Renders the panel against the real translation table for every supported
 * locale. Fails if a key is missing (the panel would render the raw key and
 * `createUseT` would log a missing-translation warning).
 */

const readAgentFiles = vi.fn(async () => ({
  soul: '# SOUL.md',
  identity: '',
  agents: '',
  user: '',
  memory: '',
  diaries: [],
}))

vi.mock('@/store/agents.store', () => ({
  useAgentsStore: (selector: (s: unknown) => unknown) =>
    selector({
      readAgentFiles,
      readAgentDiary: vi.fn(async () => ''),
      updateAgentFile: vi.fn(async () => true),
      updateAgentDiary: vi.fn(async () => true),
      agentsRevision: 0,
      agents: [{ id: 'default', name: 'default', createdAt: 0, lastAccessedAt: 0 }],
    }),
}))

vi.mock('@/store/agent-profile.store', () => ({
  useAgentProfileStore: (selector: (s: unknown) => unknown) =>
    selector({ isOpen: true, agentId: 'default', close: vi.fn(), open: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const LOCALES = [
  { locale: 'en-US', title: 'Agent Profile', edit: 'Edit', preview: 'Preview' },
  { locale: 'zh-CN', title: 'Agent 档案', edit: '编辑', preview: '预览' },
  { locale: 'ja-JP', title: 'Agent プロファイル', edit: '編集', preview: 'プレビュー' },
  { locale: 'ko-KR', title: 'Agent 프로파일', edit: '편집', preview: '미리보기' },
] as const

describe('AgentProfileDrawer i18n', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it.each(LOCALES)('renders localized copy for $locale', async ({ locale, title, edit, preview }) => {
    useI18nStore.setState({ locale })

    render(<AgentProfileDrawer />)

    await waitFor(() => {
      expect(screen.getByText(title)).toBeTruthy()
    })
    expect(screen.getByText(edit)).toBeTruthy()
    expect(screen.getByText(preview)).toBeTruthy()
    // No key should fall back to its raw identifier.
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
