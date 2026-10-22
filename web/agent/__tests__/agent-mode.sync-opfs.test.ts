/**
 * Pins the Plan-mode exemption for `sync-to-opfs`:
 *
 * The tool copies files FROM the real disk INTO the OPFS files/ cache
 * (mounted at /mnt/ in Pyodide). It never overwrites a file that already
 * exists in OPFS (that copy may hold agent edits / pending changes), never
 * registers a pending change, and never writes to the real disk. So Plan
 * mode can pull workspace files into OPFS before `run_python` without
 * requiring a mode switch.
 *
 * This test locks the classification so a future refactor cannot silently
 * re-gate it (which would break read-only data analysis in Plan mode).
 */
import { describe, expect, it } from 'vitest'
import {
  getToolCategory,
  isToolAllowedInMode,
  TOOL_MODE_CLASSIFICATION,
  type AgentMode,
} from '../agent-mode'

describe('sync-to-opfs Plan-mode exemption', () => {
  it('is classified as read (not write)', () => {
    expect(getToolCategory('sync-to-opfs')).toBe('read')
  })

  it('is allowed in Plan mode', () => {
    const modes: AgentMode[] = ['plan', 'act']
    for (const mode of modes) {
      expect(isToolAllowedInMode('sync-to-opfs', mode)).toBe(true)
    }
  })

  it('documents its limited write scope via planModeDescription', () => {
    const meta = TOOL_MODE_CLASSIFICATION.get('sync-to-opfs')
    expect(meta?.planModeDescription).toBeTruthy()
    expect(meta?.planModeDescription).toContain('OPFS')
  })

  it('did not accidentally loosen the real write tools', () => {
    // Guardrail: the disk-writing tool must stay write-gated in Plan mode.
    for (const name of ['write', 'edit', 'delete', 'snapshot_restore']) {
      expect(getToolCategory(name)).toBe('write')
      expect(isToolAllowedInMode(name, 'plan')).toBe(false)
    }
  })
})
