/**
 * ScheduleForm — create or edit a schedule.
 *
 * Fields:
 * - Name
 * - Cron expression (with live description)
 * - Prompt (with distillation option)
 * - Notification preferences (onSuccess / onFailure)
 * - Test run button
 */

import { useState, useEffect } from 'react'
import { Loader2, AlertTriangle, CheckCircle, RefreshCw, ChevronDown, Clock3 } from 'lucide-react'
import {
  BrandButton,
  BrandInput,
  BrandTextarea,
  BrandCheckbox,
  BrandSelect,
  BrandSelectTrigger,
  BrandSelectValue,
  BrandSelectContent,
  BrandSelectItem,
} from '@creatorweave/ui'
import { useT } from '@/i18n'
import {
  createSchedule,
  deleteSchedule,
  saveSchedule,
  type Schedule,
} from '@/services/schedule-storage'
import { triggerSchedule } from '@/services/schedule-heartbeat'
import { parseCron, describeCron, getNextRunTime } from '@/utils/cron-utils'
import { getWorkspaceRepository } from '@/sqlite/repositories/workspace.repository'
import { useConversationStore } from '@/store/conversation.store'

interface ScheduleFormProps {
  workspaceId: string
  /** null = create mode, Schedule = edit mode */
  initialSchedule?: Schedule | null
  onCreated?: (schedule: Schedule) => void
  onUpdated?: (schedule: Schedule) => void
  onCancel?: () => void
}

export function ScheduleForm({
  workspaceId,
  initialSchedule,
  onCreated,
  onUpdated,
  onCancel,
}: ScheduleFormProps) {
  const t = useT()
  const isEdit = !!initialSchedule

  // Form state
  const [name, setName] = useState(initialSchedule?.name ?? '')
  const [cronExpression, setCronExpression] = useState(initialSchedule?.schedule.expression ?? '0 9 * * *')
  const [prompt, setPrompt] = useState(initialSchedule?.prompt ?? '')
  const [onSuccess, setOnSuccess] = useState(initialSchedule?.notification?.onSuccess ?? true)
  const [onFailure, setOnFailure] = useState(initialSchedule?.notification?.onFailure ?? true)

  const [cronDescription, setCronDescription] = useState('')
  const [nextRun, setNextRun] = useState<string>('')
  const [cronError, setCronError] = useState<string>('')
  // Load conversation title for default name
  useEffect(() => {
    if (!isEdit && !name) {
      // Try to get the conversation title
      const conversation = useConversationStore.getState().conversations.find(c => c.id === workspaceId)
      if (conversation) {
        setName(conversation.title)
      }
    }
  }, [workspaceId, isEdit, name])

  // Live cron parsing
  useEffect(() => {
    if (!cronExpression.trim()) {
      setCronDescription('')
      setCronError('')
      setNextRun('')
      return
    }

    const parsed = parseCron(cronExpression)
    if (!parsed.ok) {
      setCronDescription('')
      setCronError(parsed.error)
      setNextRun('')
      return
    }

    setCronError('')
    setCronDescription(describeCron(cronExpression))

    const next = getNextRunTime(cronExpression)
    if (next !== null) {
      setNextRun(new Date(next).toLocaleString())
    } else {
      setNextRun('')
    }
  }, [cronExpression])

  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const canSave = name.trim() && cronExpression.trim() && !cronError && prompt.trim()
  const parsedSchedule = parseCron(cronExpression)
  const cronFields = parsedSchedule.ok ? parsedSchedule.fields : null
  const [advancedCron, setAdvancedCron] = useState(false)
  const [frequency, setFrequency] = useState(() => {
    if (!cronFields) return 'custom'
    if (cronFields.hour === '*' && cronFields.dayOfMonth === '*' && cronFields.month === '*' && cronFields.dayOfWeek === '*') return 'hourly'
    if (cronFields.hour !== '*' && cronFields.dayOfMonth === '*' && cronFields.month === '*' && cronFields.dayOfWeek === '*') return 'daily'
    if (cronFields.hour !== '*' && cronFields.dayOfMonth === '*' && cronFields.month === '*' && cronFields.dayOfWeek !== '*') return 'weekly'
    if (cronFields.hour !== '*' && cronFields.dayOfMonth !== '*' && cronFields.month === '*' && cronFields.dayOfWeek === '*') return 'monthly'
    return 'custom'
  })
  const [scheduleHour, setScheduleHour] = useState(() => cronFields?.hour !== '*' ? Number(cronFields?.hour ?? 9) : 9)
  const [scheduleMinute, setScheduleMinute] = useState(() => Number(cronFields?.minute ?? 0))
  const [weekday, setWeekday] = useState(() => cronFields?.dayOfWeek !== '*' ? Number(cronFields?.dayOfWeek ?? 1) : 1)
  const [monthday, setMonthday] = useState(() => cronFields?.dayOfMonth !== '*' ? Number(cronFields?.dayOfMonth ?? 1) : 1)

  const applyFrequency = (nextFrequency: string, hour = scheduleHour, minute = scheduleMinute) => {
    setFrequency(nextFrequency)
    if (nextFrequency === 'hourly') setCronExpression(`${minute} * * * *`)
    else if (nextFrequency === 'daily') setCronExpression(`${minute} ${hour} * * *`)
    else if (nextFrequency === 'weekly') setCronExpression(`${minute} ${hour} * * ${weekday}`)
    else if (nextFrequency === 'monthly') setCronExpression(`${minute} ${hour} ${monthday} * *`)
  }
  const updateTime = (hour: number, minute: number) => {
    setScheduleHour(hour)
    setScheduleMinute(minute)
    if (frequency !== 'custom') applyFrequency(frequency, hour, minute)
  }

  const handleSave = async () => {
    if (!canSave || saving) return
    setSaving(true)
    setTestResult(null)

    try {
      // Get projectId from workspace
      let projectId = ''
      try {
        const wsRepo = await getWorkspaceRepository()
        const ws = await wsRepo.findWorkspaceById(workspaceId)
        if (ws) {
          projectId = ws.projectId ?? ''
        }
      } catch {
        // Fallback: use empty projectId
      }

      const scheduleData = {
        projectId: isEdit && initialSchedule ? initialSchedule.projectId : projectId,
        workspaceId: isEdit && initialSchedule ? initialSchedule.workspaceId : workspaceId,
        name: name.trim(),
        prompt: prompt.trim(),
        schedule: { type: 'cron' as const, expression: cronExpression.trim() },
        notification: { onSuccess, onFailure },
        enabled: isEdit && initialSchedule ? initialSchedule.enabled : true,
      }

      let saved: Schedule
      if (isEdit && initialSchedule) {
        saved = {
          ...initialSchedule,
          ...scheduleData,
          updatedAt: Date.now(),
        }
        await saveSchedule(saved)
      } else {
        saved = await createSchedule(scheduleData)
      }

      if (isEdit && initialSchedule) {
        onUpdated?.(saved)
      } else {
        onCreated?.(saved)
      }
    } catch (err) {
      setTestResult({ ok: false, message: String(err) })
    } finally {
      setSaving(false)
    }
  }

  const handleTestRun = async () => {
    if (saving || testing || !prompt.trim() || !cronExpression.trim() || cronError) return
    setTesting(true)
    setTestResult(null)
    let temporaryId: string | undefined

    try {
      let projectId = initialSchedule?.projectId ?? ''
      if (!initialSchedule) {
        try {
          const wsRepo = await getWorkspaceRepository()
          const ws = await wsRepo.findWorkspaceById(workspaceId)
          if (ws) projectId = ws.projectId ?? ''
        } catch {
          // Testing can proceed without project metadata.
        }
      }

      const temp = await createSchedule({
        projectId,
        workspaceId: initialSchedule?.workspaceId ?? workspaceId,
        name: name.trim() || t('schedule.form.testRun'),
        prompt: prompt.trim(),
        schedule: { type: 'cron', expression: cronExpression.trim() },
        notification: { onSuccess: false, onFailure: false },
        enabled: false,
      })
      temporaryId = temp.id
      await triggerSchedule(temp.id, { force: true })
      setTestResult({ ok: true, message: t('schedule.testSuccess') })
    } catch (err) {
      setTestResult({ ok: false, message: String(err) })
    } finally {
      if (temporaryId) {
        try {
          await deleteSchedule(temporaryId)
        } catch (err) {
          console.warn('[ScheduleForm] Failed to clean up test schedule:', err)
        }
      }
      setTesting(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {/* Name */}
        <div className="space-y-1.5">
          <label htmlFor="schedule-name" className="text-sm font-medium">{t('schedule.form.name')}</label>
          <BrandInput
            id="schedule-name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('schedule.form.namePlaceholder')}
            className="h-10 px-3 py-2"
          />
        </div>

        {/* Schedule cadence */}
        <section className="space-y-3 border-y border-border py-4">
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-primary" aria-hidden="true" />
            <label htmlFor="schedule-frequency" className="text-sm font-semibold">{t('schedule.form.schedule')}</label>
          </div>
          <BrandSelect
            value={frequency}
            onValueChange={value => {
              if (value === 'custom') setFrequency(value)
              else applyFrequency(value)
            }}
          >
            <BrandSelectTrigger id="schedule-frequency" aria-label={t('schedule.form.schedule')}>
              <BrandSelectValue />
            </BrandSelectTrigger>
            <BrandSelectContent>
              <BrandSelectItem value="hourly">{t('schedule.form.everyHour')}</BrandSelectItem>
              <BrandSelectItem value="daily">{t('schedule.form.daily')}</BrandSelectItem>
              <BrandSelectItem value="weekly">{t('schedule.form.weekly')}</BrandSelectItem>
              <BrandSelectItem value="monthly">{t('schedule.form.monthly')}</BrandSelectItem>
              <BrandSelectItem value="custom">{t('schedule.form.custom')}</BrandSelectItem>
            </BrandSelectContent>
          </BrandSelect>

          {frequency !== 'custom' && frequency !== 'hourly' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-xs text-muted">
                <span>{t('schedule.form.time')}</span>
                <div className="flex items-center gap-1.5">
                  <BrandSelect value={String(scheduleHour)} onValueChange={value => updateTime(Number(value), scheduleMinute)}>
                    <BrandSelectTrigger aria-label={t('schedule.form.hour')} className="min-w-0 flex-1">
                      <BrandSelectValue />
                    </BrandSelectTrigger>
                    <BrandSelectContent>
                      {Array.from({ length: 24 }, (_, hour) => <BrandSelectItem key={hour} value={String(hour)}>{String(hour).padStart(2, '0')}</BrandSelectItem>)}
                    </BrandSelectContent>
                  </BrandSelect>
                  <span aria-hidden="true">:</span>
                  <BrandSelect value={String(scheduleMinute)} onValueChange={value => updateTime(scheduleHour, Number(value))}>
                    <BrandSelectTrigger aria-label={t('schedule.form.minute')} className="min-w-0 flex-1">
                      <BrandSelectValue />
                    </BrandSelectTrigger>
                    <BrandSelectContent>
                      {Array.from({ length: 60 }, (_, minute) => <BrandSelectItem key={minute} value={String(minute)}>{String(minute).padStart(2, '0')}</BrandSelectItem>)}
                    </BrandSelectContent>
                  </BrandSelect>
                </div>
              </label>
              {frequency === 'weekly' && (
                <label className="space-y-1 text-xs text-muted">
                  <span>{t('schedule.form.dayOfWeek')}</span>
                  <BrandSelect value={String(weekday)} onValueChange={value => { const day = Number(value); setWeekday(day); setCronExpression(`${scheduleMinute} ${scheduleHour} * * ${day}`) }}>
                    <BrandSelectTrigger aria-label={t('schedule.form.dayOfWeek')}>
                      <BrandSelectValue />
                    </BrandSelectTrigger>
                    <BrandSelectContent>
                      {(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const).map((day, index) => <BrandSelectItem key={day} value={String(index)}>{t(`schedule.form.weekdays.${day}`)}</BrandSelectItem>)}
                    </BrandSelectContent>
                  </BrandSelect>
                </label>
              )}
              {frequency === 'monthly' && (
                <label className="space-y-1 text-xs text-muted">
                  <span>{t('schedule.form.dayOfMonth')}</span>
                  <BrandSelect value={String(monthday)} onValueChange={value => { const day = Number(value); setMonthday(day); setCronExpression(`${scheduleMinute} ${scheduleHour} ${day} * *`) }}>
                    <BrandSelectTrigger aria-label={t('schedule.form.dayOfMonth')}>
                      <BrandSelectValue />
                    </BrandSelectTrigger>
                    <BrandSelectContent>
                      {Array.from({ length: 31 }, (_, index) => <BrandSelectItem key={index + 1} value={String(index + 1)}>{index + 1}</BrandSelectItem>)}
                    </BrandSelectContent>
                  </BrandSelect>
                </label>
              )}
            </div>
          )}

          {frequency === 'hourly' && (
            <p className="text-xs text-muted">{t('schedule.form.hourlyHint')}</p>
          )}

          {cronDescription && !cronError && (
            <p className="text-sm font-medium text-foreground">{cronDescription}</p>
          )}
          {nextRun && !cronError && (
            <p className="flex items-center gap-1.5 text-xs text-muted"><Clock3 className="h-3 w-3" />{t('schedule.form.nextRun')}: {nextRun}</p>
          )}

          <div className="border-t border-border/70 pt-2">
            <button type="button" className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground" aria-expanded={advancedCron} onClick={() => setAdvancedCron(value => !value)}>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${advancedCron ? 'rotate-180' : ''}`} />
              {t('schedule.form.advancedCron')}
            </button>
            {advancedCron && (
              <div className="mt-2 space-y-1.5">
                <BrandInput
                  type="text"
                  aria-label={t('schedule.form.cronExpression')}
                  state={cronError ? 'error' : 'default'}
                  className="font-mono"
                  value={cronExpression}
                  onChange={e => { setFrequency('custom'); setCronExpression(e.target.value) }}
                  placeholder="0 9 * * 1"
                />
                {cronError && <p role="alert" className="flex items-center gap-1 text-xs text-red-500"><AlertTriangle className="h-3 w-3" />{cronError}</p>}
              </div>
            )}
          </div>
        </section>

        {/* Prompt */}
        <div className="space-y-2">
          <label htmlFor="schedule-prompt" className="text-sm font-semibold">{t('schedule.form.prompt')}</label>
          <p className="text-xs leading-relaxed text-muted">
            {t('schedule.form.promptHint')}
          </p>
          <BrandTextarea
            id="schedule-prompt"
            className="min-h-[132px] resize-y text-sm leading-relaxed"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder={t('schedule.form.promptPlaceholder')}
          />
        </div>

        {/* Notification preferences */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">{t('schedule.form.notification')}</legend>
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-5">
            <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-foreground">
              <BrandCheckbox checked={onSuccess} onCheckedChange={checked => setOnSuccess(checked === true)} size="sm" aria-label={t('schedule.form.notifyOnSuccess')} />
              {t('schedule.form.notifyOnSuccess')}
            </label>
            <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-foreground">
              <BrandCheckbox checked={onFailure} onCheckedChange={checked => setOnFailure(checked === true)} size="sm" aria-label={t('schedule.form.notifyOnFailure')} />
              {t('schedule.form.notifyOnFailure')}
            </label>
          </div>
        </fieldset>

        {/* Test result */}
      </div>

      {/* Action buttons */}
      <div className="shrink-0 border-t border-border bg-background px-5 py-3.5">
        {testResult && (
          <div role={testResult.ok ? 'status' : 'alert'} className={`mb-3 flex items-start gap-2 rounded-md px-3 py-2 text-sm ${
            testResult.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200' : 'bg-destructive/10 text-destructive'
          }`}>
            {testResult.ok ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{testResult.message}</span>
          </div>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          {onCancel && (
            <BrandButton variant="ghost" className="sm:w-auto" onClick={onCancel}>
              {t('common.cancel')}
            </BrandButton>
          )}
          <div className="flex flex-1 gap-2 sm:justify-end">
        {/* Test run */}
        <BrandButton
          variant="secondary"
          className="flex-1 sm:flex-none"
          disabled={!prompt.trim() || !!cronError || testing || saving}
          onClick={handleTestRun}
        >
          {testing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {t('schedule.form.testRun')}
        </BrandButton>

        {/* Save */}
        <BrandButton
          className="flex-1 sm:flex-none"
          disabled={!canSave || saving || testing}
          onClick={handleSave}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          {isEdit
            ? t('schedule.form.save')
            : t('schedule.form.create')}
        </BrandButton>

          </div>
        </div>
      </div>
    </div>
  )
}
