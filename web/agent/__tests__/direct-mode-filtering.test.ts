/**
 * Direct-mode tool filtering (kind='direct' conversations):
 *
 * Direct conversations have NO folder authorization, so every
 * folder-dependent tool must be invisible to the agent — in BOTH plan and
 * act modes, and both at registration (getToolDefinitionsForMode) and
 * execution (invokeTool) layers. Everything else (page_*, run_python,
 * bash, skills, subagents, schedule) must stay available.
 */
import { describe, expect, it } from 'vitest'
import {
  FOLDER_DEPENDENT_TOOLS,
  getToolCategory,
  isToolAllowedInDirectMode,
  TOOL_MODE_CLASSIFICATION,
} from '../agent-mode'
import { getToolRegistry } from '../tool-registry'

describe('directMode tool filtering', () => {
  // Independent of FOLDER_DEPENDENT_TOOLS: if the set ever drops one of these
  // names, the checks below fail LOUDLY instead of silently passing because
  // they iterate the very set under test.
  const REQUIRED_FOLDER_DEPENDENT_TOOLS = [
    'read', 'write', 'edit', 'delete', 'ls', 'search',
    'snapshot_status', 'snapshot_diff', 'snapshot_log', 'snapshot_show',
    'snapshot_restore', 'sync-to-opfs',
    'read_image', 'ocr',
  ] as const

  it('FOLDER_DEPENDENT_TOOLS covers exactly the task-mandated tool set', () => {
    for (const name of REQUIRED_FOLDER_DEPENDENT_TOOLS) {
      expect(FOLDER_DEPENDENT_TOOLS.has(name), name).toBe(true)
    }
  })

  it('isToolAllowedInDirectMode rejects folder tools and keeps everything else', () => {
    for (const name of REQUIRED_FOLDER_DEPENDENT_TOOLS) {
      expect(isToolAllowedInDirectMode(name), name).toBe(false)
    }
    // Retained capabilities (design decision): page_*, run_python, skills,
    // webmcp app-tools (external bridge), spawn_subagent, schedule.
    for (const name of [
      'run_python', 'bash', 'web_search', 'web_fetch',
      'page_snapshot', 'page_click', 'page_screenshot',
      'read_skill', 'search_skills', 'search_tools', 'call_tool',
      'spawn_subagent', 'manage_schedule', 'ask_user_question', 'generate_image',
    ]) {
      expect(isToolAllowedInDirectMode(name), name).toBe(true)
    }
  })

  it('every folder-dependent tool exists in TOOL_MODE_CLASSIFICATION (no phantom entries)', () => {
    for (const name of FOLDER_DEPENDENT_TOOLS) {
      expect(TOOL_MODE_CLASSIFICATION.has(name), name).toBe(true)
    }
  })

  it('getToolDefinitionsForMode hides folder tools in act mode with directMode', () => {
    const registry = getToolRegistry()
    const names = (direct: boolean) =>
      registry.getToolDefinitionsForMode('act', { directMode: direct }).map((d) => d.function.name)

    const projectNames = names(false)
    const directNames = names(true)

    for (const name of FOLDER_DEPENDENT_TOOLS) {
      expect(projectNames, `project must register ${name}`).toContain(name)
      expect(directNames, `direct must NOT register ${name}`).not.toContain(name)
    }
    // Independent enumeration again: a tool dropped from the set must still
    // fail here if the registry (not the set) regressed.
    for (const name of REQUIRED_FOLDER_DEPENDENT_TOOLS) {
      expect(directNames, `direct must NOT register ${name}`).not.toContain(name)
    }
    // Retained capabilities survive in direct mode. (web_search/web_fetch are
    // web-bridge tools registered only when the Browser Extension is detected —
    // absent from this bare registry, so not asserted here.)
    for (const name of ['run_python', 'bash', 'spawn_subagent', 'manage_schedule']) {
      expect(directNames, `direct must keep ${name}`).toContain(name)
    }
  })

  it('directMode also filters in plan mode (no mode re-introduces folder tools)', () => {
    const registry = getToolRegistry()
    const directPlanNames = registry
      .getToolDefinitionsForMode('plan', { directMode: true })
      .map((d) => d.function.name)
    for (const name of FOLDER_DEPENDENT_TOOLS) {
      expect(directPlanNames).not.toContain(name)
    }
    for (const name of REQUIRED_FOLDER_DEPENDENT_TOOLS) {
      expect(directPlanNames, `direct plan must NOT register ${name}`).not.toContain(name)
    }
    // read-type non-folder tools stay visible in direct plan mode
    expect(directPlanNames).toContain('run_python')
  })

  it('omitting directMode preserves the full project behavior (zero drift)', () => {
    const registry = getToolRegistry()
    const names = registry.getToolDefinitionsForMode('act').map((d) => d.function.name)
    for (const name of FOLDER_DEPENDENT_TOOLS) {
      expect(names, `default must register ${name}`).toContain(name)
    }
    for (const name of REQUIRED_FOLDER_DEPENDENT_TOOLS) {
      expect(names, `default must register ${name}`).toContain(name)
    }
  })

  it('folder-dependent tools are classified read/write as before (filter does not touch plan gating)', () => {
    expect(getToolCategory('read')).toBe('read')
    expect(getToolCategory('write')).toBe('write')
    expect(getToolCategory('sync-to-opfs')).toBe('read')
  })

  it('execute() rejects folder tools when context.directMode is set (bypass-the-definitions guard)', async () => {
    const registry = getToolRegistry()
    const context = {
      directoryHandle: null,
      directMode: true,
    } as Parameters<typeof registry.execute>[2]

    for (const name of FOLDER_DEPENDENT_TOOLS) {
      const raw = await registry.execute(name, {}, context)
      const parsed = JSON.parse(raw) as { error?: string }
      expect(parsed.error, name).toBeTruthy()
      expect(raw).not.toContain('Unknown tool')
    }

    // Non-folder tools keep executing normally in direct mode.
    const raw = await registry.execute('web_search', { query: 'x' }, context)
    expect(JSON.parse(raw) as { error?: string }).not.toHaveProperty('error', expect.stringContaining('standalone chat'))

    // Omitting directMode preserves full project behavior (zero drift).
    const projectContext = { directoryHandle: null } as unknown as Parameters<typeof registry.execute>[2]
    const projectRaw = await registry.execute('ls', {}, projectContext)
    expect(JSON.parse(projectRaw) as { error?: string }).not.toHaveProperty('error', expect.stringContaining('standalone chat'))
  })
})
