/**
 * schedule.tool.test.ts
 *
 * Regression coverage for the tool-card failure badge.
 *
 * The chat UI decides whether a tool call failed by checking whether the
 * result payload carries an `error` key (ToolCallDisplay.buildCtx). The
 * schedule payload used to serialize `error: s.error` unconditionally, so a
 * perfectly healthy schedule (`s.error === null`) still rendered a red badge.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/schedule-storage', () => ({
  createSchedule: vi.fn(),
  saveSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
  loadSchedule: vi.fn(),
  getSchedulesForWorkspace: vi.fn(async () => []),
}))

vi.mock('@/services/schedule-heartbeat', () => ({
  triggerSchedule: vi.fn(async () => {}),
}))

vi.mock('@/store/schedule.store', () => ({
  useScheduleStore: { getState: () => ({ refresh: vi.fn(async () => {}) }) },
}))

import { manageScheduleExecutor } from '../schedule.tool'
import type { ToolContext } from '../tool-types'

const HEALTHY = {
  id: 'sched-1',
  projectId: 'proj-1',
  workspaceId: 'conv-1',
  name: 'Smoke test',
  prompt: 'write a file',
  schedule: { type: 'cron' as const, expression: '*/5 * * * *' },
  enabled: true,
  error: null,
  createdAt: Date.parse('2026-01-01T00:00:00.000Z'),
  updatedAt: Date.parse('2026-01-01T00:00:00.000Z'),
  lastRunAt: null,
  lastRunNumber: 0,
}

async function run(args: Record<string, unknown>) {
  const context = { workspaceId: 'conv-1', directoryHandle: null } as unknown as ToolContext
  const raw = await manageScheduleExecutor(args, context)
  return { result: JSON.parse(raw) as Record<string, unknown>, raw }
}

/**
 * Mirrors ToolCallDisplay.buildCtx, including its raw-string fallback: a
 * payload is treated as failed when it has an own `error` key OR when the
 * serialized text contains `"error"` anywhere (nested included).
 */
function rendersFailureBadge(raw: string): boolean {
  const parsed = JSON.parse(raw) as Record<string, unknown>
  if (Object.prototype.hasOwnProperty.call(parsed, 'error')) return true
  return raw.includes('"error"')
}

describe('manage_schedule result payload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('omits the error key for a healthy schedule so the card shows success', async () => {
    const { loadSchedule } = await import('@/services/schedule-storage')
    vi.mocked(loadSchedule).mockResolvedValue(HEALTHY as never)

    const { result, raw } = await run({ action: 'get', schedule_id: 'sched-1' })

    expect(result.ok).toBe(true)
    expect(result).not.toHaveProperty('error')
    expect((result.schedule as Record<string, unknown>)).not.toHaveProperty('error')
    expect(rendersFailureBadge(raw)).toBe(false)
  })

  it('still surfaces a real schedule error so failures stay visible', async () => {
    const { loadSchedule } = await import('@/services/schedule-storage')
    vi.mocked(loadSchedule).mockResolvedValue({
      ...HEALTHY,
      error: 'CONV_DELETED',
    } as never)

    const { result, raw } = await run({ action: 'get', schedule_id: 'sched-1' })

    expect(result.ok).toBe(true)
    expect(result.schedule as Record<string, unknown>).toHaveProperty('error', 'CONV_DELETED')
    expect(rendersFailureBadge(raw)).toBe(true)
  })

  it('reports failures from the envelope with ok=false and an error message', async () => {
    const { result, raw } = await run({ action: 'create', name: '', cron: '', prompt: '' })

    expect(result.ok).toBe(false)
    expect(typeof result.error).toBe('string')
    expect(rendersFailureBadge(raw)).toBe(true)
  })

  it('lists schedules without emitting an error key when none are broken', async () => {
    const { getSchedulesForWorkspace } = await import('@/services/schedule-storage')
    vi.mocked(getSchedulesForWorkspace).mockResolvedValue([HEALTHY] as never)

    const { result, raw } = await run({ action: 'list' })
    const schedules = result.schedules as Record<string, unknown>[]

    expect(result.ok).toBe(true)
    expect(schedules).toHaveLength(1)
    expect(schedules[0]).not.toHaveProperty('error')
    expect(rendersFailureBadge(raw)).toBe(false)
  })
})