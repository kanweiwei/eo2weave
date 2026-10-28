import { beforeEach, describe, expect, it, vi } from 'vitest'

const queryFirst = vi.fn()
const queryAll = vi.fn()
const execute = vi.fn(() => Promise.resolve())

vi.mock('../sqlite-database', () => ({
  getSQLiteDB: () => ({ queryFirst, queryAll, execute }),
  parseJSON: <T>(value: string, fallback: T): T => {
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  },
  toJSON: JSON.stringify,
}))

import { ConversationRepository } from './conversation.repository'

describe('ConversationRepository', () => {
  beforeEach(() => {
    queryFirst.mockReset()
    queryAll.mockReset()
    execute.mockReset()
    execute.mockResolvedValue(undefined)
    // All column probes succeed by default (modern schema tier).
    queryFirst.mockResolvedValue(undefined)
  })

  it('loads a flow instance when compression columns are absent', async () => {
    queryFirst.mockImplementation((sql: string) => {
      if (sql.includes('flow_instance_json FROM conversations LIMIT 0')) {
        return Promise.resolve(undefined)
      }
      // This test exercises the PRE-kind fallback tier: no compression and no
      // kind column, so both probes must reject.
      if (sql.includes('compressed_context_summary') || sql.includes('SELECT kind FROM conversations')) {
        return Promise.reject(new Error('no such column'))
      }
      return Promise.resolve(undefined)
    })
    queryAll.mockImplementation((sql: string) => {
      if (sql.includes('compressed_context_summary') || sql.includes('SELECT kind FROM conversations')) {
        return Promise.reject(new Error('no such column'))
      }
      return Promise.resolve([
        {
          id: 'conversation-1',
          title: 'Existing conversation',
          title_mode: 'manual',
          context_usage_json: null,
          flow_instance_json: '{"id":"flow-1"}',
          created_at: 1,
          updated_at: 2,
        },
      ])
    })

    const conversations = await new ConversationRepository().findAll()

    expect(conversations).toMatchObject([
      {
        id: 'conversation-1',
        compressedContextSummary: null,
        flowInstance: { id: 'flow-1' },
      },
    ])
  })

  it('saveMeta writes kind on INSERT but never updates it on conflict', async () => {
    const repo = new ConversationRepository()

    await repo.saveMeta({
      id: 'conv-1',
      title: 'stale snapshot',
      titleMode: 'manual',
      kind: 'direct',
      createdAt: 1,
      updatedAt: 2,
    })

    expect(execute).toHaveBeenCalledTimes(1)
    const [sql] = execute.mock.calls[0] as unknown as [string, unknown[]]
    // INSERT carries kind (creating a 'direct' row must persist its kind)…
    expect(sql).toContain('INSERT INTO conversations')
    expect(sql).toContain('kind')
    // …but the conflict UPDATE must NOT write kind: a stale 'direct' snapshot
    // landing after a committed direct→project transition must not revert it.
    expect(sql).not.toMatch(/kind\s*=\s*excluded\.kind/)
  })

  it('updateKind writes the kind column via a dedicated UPDATE', async () => {
    const repo = new ConversationRepository()

    await repo.updateKind('conv-1', 'project')

    expect(execute).toHaveBeenCalledTimes(1)
    const [sql, params] = execute.mock.calls[0] as unknown as [string, unknown[]]
    expect(sql).toBe('UPDATE conversations SET kind = ?, updated_at = ? WHERE id = ?')
    expect(params).toEqual(['project', expect.any(Number), 'conv-1'])
  })

  it('updateKind is a no-op when the kind column does not exist', async () => {
    queryFirst.mockImplementation((sql: string) => {
      if (sql.includes('SELECT kind FROM conversations')) {
        return Promise.reject(new Error('no such column'))
      }
      return Promise.resolve(undefined)
    })
    const repo = new ConversationRepository()

    await repo.updateKind('conv-1', 'project')

    expect(execute).not.toHaveBeenCalled()
  })
})
