/**
 * AgentProfileDrawer — view and edit an agent's profile files.
 *
 * Five fixed files (SOUL / IDENTITY / AGENTS / USER / MEMORY) plus the
 * dated diary entries under memory/{date}.md. All of them are editable.
 *
 * Switching agents here only changes which agent is being edited — it does
 * not change the conversation's active agent.
 */

import { useCallback, useEffect, useState } from 'react'
import { Eye, FileText, Pencil, RotateCw, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import { BrandButton, BrandSelect, BrandSelectContent, BrandSelectItem, BrandSelectTrigger, BrandSelectValue } from '@creatorweave/ui'
import { TextareaWithLines } from '@/components/ui/TextareaWithLines'
import { MarkdownContent } from './MarkdownContent'
import { useAgentsStore, type AgentFiles } from '@/store/agents.store'
import { useAgentProfileStore } from '@/store/agent-profile.store'
import { useT } from '@/i18n'
import { cn } from '@/lib/utils'

type EditableFile = 'soul' | 'identity' | 'agents' | 'user' | 'memory'

const EDITABLE_FILES: {
  key: EditableFile
  labelKey: `agentProfile.${EditableFile}`
  fileName: string
}[] = [
  { key: 'soul', labelKey: 'agentProfile.soul', fileName: 'SOUL.md' },
  { key: 'identity', labelKey: 'agentProfile.identity', fileName: 'IDENTITY.md' },
  { key: 'agents', labelKey: 'agentProfile.agents', fileName: 'AGENTS.md' },
  { key: 'user', labelKey: 'agentProfile.user', fileName: 'USER.md' },
  { key: 'memory', labelKey: 'agentProfile.memory', fileName: 'MEMORY.md' },
]

export function AgentProfileDrawer() {
  const t = useT()
  const agentId = useAgentProfileStore((s) => s.agentId)
  const close = useAgentProfileStore((s) => s.close)
  const open = useAgentProfileStore((s) => s.open)
  const agents = useAgentsStore((s) => s.agents)
  const readAgentFiles = useAgentsStore((s) => s.readAgentFiles)
  const readAgentDiary = useAgentsStore((s) => s.readAgentDiary)
  const updateAgentFile = useAgentsStore((s) => s.updateAgentFile)
  const updateAgentDiary = useAgentsStore((s) => s.updateAgentDiary)
  const agentsRevision = useAgentsStore((s) => s.agentsRevision)

  const [files, setFiles] = useState<AgentFiles | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [selected, setSelected] = useState<EditableFile>('soul')
  const [selectedDiary, setSelectedDiary] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [isSaving, setIsSaving] = useState(false)

  const load = useCallback(async () => {
    if (!agentId) return
    try {
      const result = await readAgentFiles(agentId)
      if (!result) {
        setLoadError(true)
        return
      }
      setFiles(result)
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [agentId, readAgentFiles])

  // Reload whenever the agent changes or the agent writes its own files.
  useEffect(() => {
    void load()
  }, [load, agentsRevision])

  // Switching agent resets the selection back to the first file.
  useEffect(() => {
    setSelected('soul')
    setSelectedDiary(null)
  }, [agentId])

  // Push the selected file content into the editor.
  useEffect(() => {
    if (!files) return
    if (selectedDiary) return
    setDraft(files[selected])
  }, [files, selected, selectedDiary])

  // Diary body is fetched separately — readAgentFiles only returns dates.
  // The fetched body lands directly in the editor so the user can edit it.
  useEffect(() => {
    if (!selectedDiary || !agentId) return
    let cancelled = false
    void readAgentDiary(agentId, selectedDiary).then((text) => {
      if (cancelled) return
      setDraft(text ?? '')
    })
    return () => {
      cancelled = true
    }
  }, [agentId, selectedDiary, readAgentDiary])

  const handleSave = useCallback(async () => {
    if (!agentId || isSaving) return
    setIsSaving(true)
    try {
      const ok = selectedDiary
        ? await updateAgentDiary(agentId, selectedDiary, draft)
        : await updateAgentFile(agentId, selected, draft)
      if (ok) {
        toast.success(t('agentProfile.saved'))
        if (!selectedDiary) {
          setFiles((prev) => (prev ? { ...prev, [selected]: draft } : prev))
        }
      } else {
        toast.error(t('agentProfile.loadFailed'))
      }
    } finally {
      setIsSaving(false)
    }
  }, [
    agentId,
    isSaving,
    selected,
    selectedDiary,
    draft,
    updateAgentFile,
    updateAgentDiary,
    t,
  ])

  if (!agentId) return null

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="agent-profile-drawer">
      {/* Header — title + agent switcher */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
        <h2 className="truncate text-sm font-semibold text-foreground">{t('agentProfile.title')}</h2>
        <div className="flex items-center gap-1">
          <BrandSelect
            value={agentId}
            onValueChange={(next) => {
              setFiles(null)
              setLoadError(false)
              open(next)
            }}
          >
            <BrandSelectTrigger
              className="h-7 w-auto min-w-[6.5rem] text-xs"
              aria-label={t('agentProfile.switchAgent')}
            >
              <BrandSelectValue />
            </BrandSelectTrigger>
            <BrandSelectContent>
              {agents.map((a) => (
                <BrandSelectItem key={a.id} value={a.id}>
                  @{a.id}
                </BrandSelectItem>
              ))}
            </BrandSelectContent>
          </BrandSelect>
          <button
            type="button"
            onClick={close}
            aria-label={t('common.close')}
            className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Load failure */}
      {loadError ? (
        <div
          className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center"
          data-testid="agent-profile-error"
        >
          <p className="text-sm text-muted-foreground">{t('agentProfile.loadFailed')}</p>
          <BrandButton variant="outline" onClick={() => void load()}>
            <RotateCw className="mr-1.5 h-3.5 w-3.5" />
            {t('agentProfile.retry')}
          </BrandButton>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* Left nav — five editable files + diary group */}
          <nav className="w-40 shrink-0 overflow-y-auto border-r border-neutral-200 px-2 py-2 dark:border-neutral-700">
            {EDITABLE_FILES.map((f) => (
              <button
                key={f.key}
                type="button"
                data-testid={`agent-profile-file-${f.key}`}
                onClick={() => {
                  setSelected(f.key)
                  setSelectedDiary(null)
                }}
                className={cn(
                  'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs',
                  selected === f.key && !selectedDiary
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-neutral-100 dark:hover:bg-neutral-800',
                )}
              >
                <FileText className="h-3 w-3 shrink-0" />
                <span className="truncate">{t(f.labelKey)}</span>
              </button>
            ))}

            {/* Diary group — always rendered so the by-date memory is
                discoverable even before the agent has written any entries. */}
            <div className="mt-3 px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t('agentProfile.diary')}
            </div>
            {files && files.diaries.length > 0 ? (
              files.diaries.map((d) => (
                <button
                  key={d}
                  type="button"
                  data-testid={`agent-profile-diary-${d}`}
                  onClick={() => setSelectedDiary(d)}
                  className={cn(
                    'block w-full rounded-md px-2 py-1.5 text-left text-xs',
                    selectedDiary === d
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-neutral-100 dark:hover:bg-neutral-800',
                  )}
                >
                  {d}
                </button>
              ))
            ) : (
              <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                {t('agentProfile.noDiaries')}
              </p>
            )}
          </nav>

          {/* Right pane — shared by the fixed files and the dated diaries */}
          <section className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-700">
              <span className="truncate font-mono text-xs text-muted-foreground">
                {selectedDiary
                  ? `memory/${selectedDiary}.md`
                  : EDITABLE_FILES.find((f) => f.key === selected)?.fileName}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setMode('edit')}
                  className={cn(
                    'rounded px-2 py-1 text-xs',
                    mode === 'edit' && 'bg-neutral-100 dark:bg-neutral-800',
                  )}
                >
                  <Pencil className="mr-1 inline h-3 w-3" />
                  {t('agentProfile.edit')}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('preview')}
                  className={cn(
                    'rounded px-2 py-1 text-xs',
                    mode === 'preview' && 'bg-neutral-100 dark:bg-neutral-800',
                  )}
                >
                  <Eye className="mr-1 inline h-3 w-3" />
                  {t('agentProfile.preview')}
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {mode === 'edit' ? (
                <TextareaWithLines
                  data-testid="agent-profile-editor"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="h-full"
                  rows={20}
                />
              ) : draft ? (
                <MarkdownContent content={draft} />
              ) : (
                <p className="text-xs text-muted-foreground">{t('agentProfile.emptyContent')}</p>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-neutral-200 px-3 py-2 dark:border-neutral-700">
              <BrandButton
                variant="primary"
                data-testid="agent-profile-save"
                onClick={() => void handleSave()}
                disabled={isSaving}
              >
                <Save className="mr-1.5 h-3.5 w-3.5" />
                {isSaving ? t('agentProfile.saving') : t('agentProfile.save')}
              </BrandButton>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
