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
  it('FOLDER_DEPENDENT_TOOLS covers exactly the task-mandated tool set', () => {
    for (const name of [
      'read', 'write', 'edit', 'delete', 'ls', 'search',
      'snapshot_status', 'snapshot_restore', 'sync-to-opfs',
    ]) {
      expect(FOLDER_DEPENDENT_TOOLS.has(name), name).toBe(true)
    }
  })

  it('isToolAllowedInDirectMode rejects folder tools and keeps everything else', () => {
    for (const name of FOLDER_DEPENDENT_TOOLS) {
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
    // read-type non-folder tools stay visible in direct plan mode
    expect(directPlanNames).toContain('run_python')
  })

  it('omitting directMode preserves the full project behavior (zero drift)', () => {
    const registry = getToolRegistry()
    const names = registry.getToolDefinitionsForMode('act').map((d) => d.function.name)
    for (const name of FOLDER_DEPENDENT_TOOLS) {
      expect(names, `default must register ${name}`).toContain(name)
    }
  })

  it('folder-dependent tools are classified read/write as before (filter does not touch plan gating)', () => {
    expect(getToolCategory('read')).toBe('read')
    expect(getToolCategory('write')).toBe('write')
    expect(getToolCategory('sync-to-opfs')).toBe('read')
  })
})
