/**
 * edit tool - Single-file text replacement with read-before-edit safety checks.
 *
 * Only accepts an `edits` array of {old_text, new_text} entries.
 * All edits are applied atomically — if any fail, nothing is written.
 */

import { structuredPatch } from 'diff'
import { useOPFSStore } from '@/store/opfs.store'
import type { ToolContext, ToolDefinition, ToolExecutor, ToolPromptDoc } from './tool-types'
import { resolveVfsTarget, withVfsAgentIdHint } from './vfs-resolver'
import { ensureReadFileState, getReadStateKey } from './read-state'
import { toolErrorJson, toolOkJson } from './tool-envelope'
import { rewritePythonMountPathForNonPythonTool, validateRootPrefix } from './path-guards'
import { getFormatHandler, buildFormatWriteContext } from './format-registry'
import { withToolTimeout, isToolTimeoutError } from './tool-utils'
import { tryDecodeAsText } from './io-shared'
import {
  countLinesBefore,
  findEditMatch,
  reindentNewText,
  type EditMatch,
  type MatchOutcome,
  type MatchTier,
} from './fuzzy-match'

// Ensure format handlers are registered before first use
import './formats'



/** Format hunks from structuredPatch into a compact unified-diff string */
function formatHunksToDiff(hunks: Array<{ oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] }>): string {
  if (!hunks.length) return ''
  const parts: string[] = []
  for (const hunk of hunks) {
    parts.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`)
    for (const line of hunk.lines) {
      parts.push(line)
    }
  }
  return parts.join('\n')
}

export const editDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'edit',
    description: [
      'Apply text replacement to one file.',
      '',
      'WHEN TO USE: When modifying part of an existing file — changing a function, fixing a bug, updating a value, renaming a variable, adjusting a config, etc.',
      'DO NOT use write() for targeted changes to existing files. Always prefer edit() for modifications.',
      '',
      'WORKFLOW:',
      '1. Identify the exact text to change — copy it from read() output',
      '2. Call edit(path, edits=[{old_text=<snippet>, new_text=<replacement>}])',
      '3. If the edit fails with old_text_not_found, the error lists the closest candidate lines with similarity — fix old_text from that report, or read(path) again',
      '',
      'MATCHING: old_text is matched with a tolerant cascade: exact, then quote/whitespace-normalized, then indentation-insensitive (your indentation is re-applied to new_text), then fuzzy similarity >= 0.9, then line-anchored fuzzy >= 0.8. A match at a lower tier consumes more risk — still aim for exact copies.',
      '',
      'The `edits` array supports one or more edits applied atomically to the same file.',
      'If any edit fails, nothing is written.',
      'Example single edit: edit(path, edits=[{old_text:"foo", new_text:"bar"}])',
      'Example multi edit: edit(path, edits=[{old_text:"foo", new_text:"bar"}, {old_text:"baz", new_text:"qux"}])',
      '',
      'TIPS:',
      '- Copy old_text directly from read() output — exact matches are always preferred',
      '- old_text must be unique in the file; ambiguous matches are rejected with the candidate line numbers',
      '- For multi-line changes, include enough surrounding lines to make old_text unique',
      '- new_text can be an empty string to delete text',
      '- Supports vfs://workspace/... and vfs://agents/{id}/... paths',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path to edit. MUST include rootName prefix (e.g., "myRoot/src/config.ts"). Also supports vfs://agents/{id}/... paths.',
        },
        edits: {
          type: 'array',
          description: 'Array of edits to apply atomically to the file. Even a single edit must be wrapped in the array. Edits are applied bottom-to-top to avoid offset drift. If any edit fails, all changes are rolled back.',
          items: {
            type: 'object',
            properties: {
              old_text: {
                type: 'string',
                description: 'Text to find in the file. Matched with a tolerant cascade (exact → whitespace/indent-normalized → fuzzy with line anchors); must resolve to exactly one location. Copy from read() output for best fidelity.',
              },
              new_text: {
                type: 'string',
                description: 'Replacement text. Can be empty string to delete the matched text.',
              },
            },
            required: ['old_text', 'new_text'],
          },
        },
        timeout: {
          type: 'number',
          description: 'Maximum execution time in milliseconds (default: 30000).',
        },
      },
      required: ['path', 'edits'],
    },
  },
}

// ── Resolved edit item after parsing ────────────────────────────────
interface ResolvedEdit {
  oldText: string
  newText: string
}

/**
 * Strip trailing whitespace from each line while preserving line endings.
 * Used on new_text for non-markdown files (markdown needs trailing spaces
 * for hard line breaks).
 */
function stripTrailingWhitespace(str: string): string {
  const lines = str.split(/(\r\n|\n|\r)/)
  let result = ''
  for (let i = 0; i < lines.length; i++) {
    const part = lines[i]
    if (part !== undefined) {
      result += i % 2 === 0 ? part.replace(/[ \t]+$/, '') : part
    }
  }
  return result
}

/** Model output channels sometimes sanitize special tags; undo that */
const DESANITIZATIONS: Record<string, string> = {
  '<fnr>': '<function_results>',
  '<n>': '<name>',
  '</n>': '</name>',
  '<o>': '<output>',
  '</o>': '</output>',
  '<e>': '<error>',
  '</e>': '</error>',
  '<s>': '<system>',
  '</s>': '</system>',
  '<r>': '<result>',
  '</r>': '</result>',
}

function desanitize(str: string): { result: string; applied: Array<{ from: string; to: string }> } {
  let result = str
  const applied: Array<{ from: string; to: string }> = []
  for (const [from, to] of Object.entries(DESANITIZATIONS)) {
    const before = result
    result = result.replaceAll(from, to)
    if (before !== result) applied.push({ from, to })
  }
  return { result, applied }
}

/**
 * Match old_text through the cascade. When it finds nothing and old_text
 * contains sanitized tokens, retry the cascade with the de-sanitized text
 * and mirror the same replacements into new_text (matching how the model
 * had to sanitize both sides).
 */
function resolveEditMatch(
  fileContent: string,
  edit: ResolvedEdit
): { outcome: MatchOutcome; newText: string } {
  const outcome = findEditMatch(fileContent, edit.oldText)
  if (outcome.kind !== 'not_found') {
    return { outcome, newText: edit.newText }
  }
  const { result: desanitized, applied } = desanitize(edit.oldText)
  if (applied.length === 0 || desanitized === edit.oldText) {
    return { outcome, newText: edit.newText }
  }
  const retry = findEditMatch(fileContent, desanitized)
  if (retry.kind === 'not_found') {
    // Report candidates for what the model actually sent.
    return { outcome, newText: edit.newText }
  }
  let newText = edit.newText
  for (const { from, to } of applied) {
    newText = newText.replaceAll(from, to)
  }
  // Surface 'ok' and also 'ambiguous' — the latter is more actionable than
  // a generic not_found (newText mirroring is unused for ambiguous).
  return { outcome: retry, newText }
}

// ── Not-found error reporting ───────────────────────────────────────

/**
 * Build the old_text_not_found error. When fuzzy scanning surfaced close
 * candidates, include them (line + similarity + preview) so the model can
 * self-correct from the report alone instead of re-reading the file.
 */
function buildNotFoundError(
  path: string,
  editIndex: number,
  outcome: Extract<MatchOutcome, { kind: 'not_found' }>
): string {
  let message =
    `edits[${editIndex}].old_text not found in ${path}. ` +
    'Read the file and adjust old_text. '
  if (outcome.candidates.length > 0) {
    const lines = outcome.candidates.map(
      (c) => `  line ${c.line} (similarity ${c.similarity}): ${c.text}`
    )
    message +=
      `Closest candidates (best similarity ${outcome.bestSimilarity}):\n` +
      lines.join('\n')
  } else {
    message += 'No similar region found in the file.'
  }
  return toolErrorJson('edit', 'old_text_not_found', message, {
    details: {
      editIndex,
      path,
      bestSimilarity: outcome.bestSimilarity,
      candidates: outcome.candidates,
    },
  })
}

export const editExecutor: ToolExecutor = async (args, context) => {
  const path = args.path as string | undefined
  const edits = args.edits as Array<{ old_text?: string; new_text?: string }> | undefined
  const timeoutMs = typeof args.timeout === 'number' && args.timeout > 0 ? args.timeout : 30_000

  // Reject legacy batch-edit args
  if (
    args.find !== undefined ||
    args.replace !== undefined ||
    args.use_regex !== undefined ||
    args.dry_run !== undefined ||
    args.max_files !== undefined
  ) {
    return toolErrorJson(
      'edit',
      'invalid_arguments',
      'Batch edit capability has been removed. Use edit with path + edits array.'
    )
  }

  // Reject removed old_text/new_text/replace_all parameters
  if (args.old_text !== undefined || args.new_text !== undefined || args.replace_all !== undefined) {
    return toolErrorJson(
      'edit',
      'invalid_arguments',
      'The old_text, new_text, and replace_all parameters are no longer supported. Use the edits array instead: edit(path, edits=[{old_text, new_text}])'
    )
  }

  if (!path) {
    return toolErrorJson('edit', 'invalid_arguments', 'edit requires path')
  }

  if (!Array.isArray(edits) || edits.length === 0) {
    return toolErrorJson(
      'edit',
      'invalid_arguments',
      'edit requires an edits array with at least one entry: edit(path, edits=[{old_text, new_text}])'
    )
  }

  // Validate edits array entries
  for (let i = 0; i < edits.length; i++) {
    const entry = edits[i]!
    if (entry.old_text === undefined || entry.new_text === undefined) {
      return toolErrorJson(
        'edit',
        'invalid_arguments',
        `edits[${i}] is missing old_text or new_text. Each edit entry must have both.`
      )
    }
  }

  // Validate root prefix before any path rewriting
  const rootError = await validateRootPrefix('edit', path, context)
  if (rootError) return rootError

  const rewrittenPath = rewritePythonMountPathForNonPythonTool(path)
  const effectivePath = rewrittenPath?.rewritten ? rewrittenPath.rewrittenPath : path

  const resolvedEdits: ResolvedEdit[] = edits.map((e) => ({
    oldText: e.old_text!,
    newText: e.new_text!,
  }))

  return executeEdits(context, { path: effectivePath, edits: resolvedEdits, timeoutMs })
}

// ── Apply edits atomically ──────────────────────────────────────────

/**
 * Apply one or more edits to a single file atomically.
 *
 * Strategy:
 * 1. Load file content (with read-before-edit safety checks).
 * 2. Find each old_text in the file and record its position.
 * 3. Validate no ambiguous or overlapping matches.
 * 4. Sort matches by position descending (bottom-to-top).
 * 5. Apply replacements in that order — later edits don't shift earlier ones.
 * 6. If any edit fails to match, return error without writing.
 */
async function executeEdits(
  context: ToolContext,
  opts: { path: string; edits: ResolvedEdit[]; timeoutMs?: number }
): Promise<string> {
  const { path, edits } = opts
  const timeoutMs = opts.timeoutMs ?? 30_000

  // Validate no empty old_text
  for (let i = 0; i < edits.length; i++) {
    if (edits[i]!.oldText.length === 0) {
      return toolErrorJson(
        'edit',
        'invalid_arguments',
        `edits[${i}].old_text cannot be empty. Provide exact existing text to replace.`
      )
    }
  }

  try {
    const { getPendingChanges } = useOPFSStore.getState()
    const readFileState = ensureReadFileState(context)
    const target = await resolveVfsTarget(path, context, 'write')
    const readStateKey = getReadStateKey(target)
    const snapshot = readFileState.get(readStateKey)

    // Read-before-edit is advisory, not enforced: edit() always re-reads the real
    // file content below and matching failures already guide the model to read first.
    if (!snapshot || snapshot?.isPartialView) {
      // No reliable prior read state — drop any stale full-read guard so edits proceed.
      readFileState.delete(readStateKey)
    }

    let fileContent: string

    // Check if a format handler exists for this file type
    const formatHandler = getFormatHandler(path)

    try {
      if (formatHandler?.read) {
        const backendResult = await withToolTimeout(
          target.backend.readFile(target.path, { encoding: 'binary' }),
          timeoutMs,
          'edit',
        )
        const rawData = backendResult.content instanceof ArrayBuffer
          ? new Uint8Array(backendResult.content)
          : backendResult.content instanceof Uint8Array
            ? backendResult.content
            : null
        if (!rawData) {
          // Shouldn't happen (we asked for binary encoding), but if the
          // backend returned a string anyway, use it directly.
          if (typeof backendResult.content !== 'string') {
            return toolErrorJson(
              'edit',
              'binary_not_supported',
              `Cannot edit binary file: ${path}. Use write to replace the entire file.`
            )
          }
          fileContent = backendResult.content
        } else {
          const readResult = await formatHandler.read(rawData, path)
          fileContent = readResult.content
        }
      } else {
        // Explicitly request text encoding: backends honoring VfsReadOptions
        // will convert binary-classified payloads to text (WorkspaceBackend
        // does). Extension-less text files (Dockerfile, Jenkinsfile, ...)
        // may still be misclassified as binary by a backend's classifier,
        // so additionally try decoding raw bytes before giving up.
        const backendResult = await withToolTimeout(
          target.backend.readFile(target.path, { encoding: 'text' }),
          timeoutMs,
          'edit',
        )
        if (typeof backendResult.content === 'string') {
          fileContent = backendResult.content
        } else {
          const bytes = backendResult.content instanceof ArrayBuffer
            ? new Uint8Array(backendResult.content)
            : backendResult.content instanceof Uint8Array
              ? backendResult.content
              : null
          const decoded = bytes ? tryDecodeAsText(bytes) : null
          if (decoded === null) {
            return toolErrorJson(
              'edit',
              'binary_not_supported',
              `Cannot edit binary file: ${path}. Use write to replace the entire file.`
            )
          }
          fileContent = decoded
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message?.includes('not found')) {
        return toolErrorJson('edit', 'file_not_found', `File not found: ${path}`)
      }
      throw error
    }

    const isFullRead = snapshot && snapshot.offset === undefined && snapshot.limit === undefined
    if (isFullRead && snapshot.content !== fileContent) {
      return toolErrorJson(
        'edit',
        'stale_snapshot',
        'File has been modified since read. Read it again before attempting to write it.'
      )
    }

    // ── Phase 1: Resolve all matches via the fuzzy cascade ─────────
    interface ResolvedMatch {
      index: number           // position in original fileContent
      editIndex: number       // index into edits array
      actualOldText: string   // the actual text from the file
      actualNewText: string   // new_text adjusted for indentation
      tier: MatchTier
      similarity: number
      line: number            // 1-based line of the match start
    }

    // new_text carries trailing-whitespace semantics only for markdown
    // (hard line breaks); elsewhere trailing spaces are model noise.
    const isMarkdown = /\.(md|mdx)$/i.test(path)
    const normalizedEdits: ResolvedEdit[] = edits.map((edit) => ({
      oldText: edit.oldText,
      newText: isMarkdown ? edit.newText : stripTrailingWhitespace(edit.newText),
    }))

    const matches: ResolvedMatch[] = []

    for (let i = 0; i < normalizedEdits.length; i++) {
      const edit = normalizedEdits[i]!
      const { outcome, newText: resolvedNewText } = resolveEditMatch(fileContent, edit)

      if (outcome.kind === 'not_found') {
        return buildNotFoundError(path, i, outcome)
      }

      if (outcome.kind === 'ambiguous') {
        const occurrences = outcome.occurrences
        const locList = occurrences.map((o) => `line ${o.line}`).join(', ')
        const hint =
          outcome.tier === 'fuzzy' || outcome.tier === 'anchored'
            ? 'These locations differ only slightly (fuzzy match). Include a distinguishing line, e.g. a function signature or unique identifier, in old_text.'
            : 'Include more surrounding lines to make old_text unique.'
        return toolErrorJson(
          'edit',
          'ambiguous_match',
          `edits[${i}].old_text matches ${occurrences.length} location(s): ${locList}. ${hint}`,
          {
            details: {
              editIndex: i,
              path,
              tier: outcome.tier,
              occurrences,
            },
          }
        )
      }

      const found: EditMatch = outcome.match
      const start = found.start
      const end = found.end

      // Check for overlapping matches
      const overlapWith = matches.find((m) => {
        const mEnd = m.index + m.actualOldText.length
        return start < mEnd && m.index < end
      })
      if (overlapWith) {
        return toolErrorJson(
          'edit',
          'overlapping_edits',
          `edits[${i}] overlaps with edits[${overlapWith.editIndex}]. Ensure edit regions are non-overlapping.`
        )
      }

      // Re-indent new_text when the match relied on an indent delta.
      // lineAligned=false means the region starts after the file line's own
      // leading whitespace — its first line needs no delta.
      let actualNewText = resolvedNewText
      if (found.indentDelta) {
        actualNewText = reindentNewText(actualNewText, found.indentDelta, !found.lineAligned)
      }

      matches.push({
        index: start,
        editIndex: i,
        actualOldText: fileContent.slice(start, end),
        actualNewText,
        tier: found.tier,
        similarity: found.similarity,
        line: countLinesBefore(fileContent, start),
      })
    }

    // ── Phase 2: Apply bottom-to-top ───────────────────────────────
    // Sort by position descending so later-in-file edits are applied first
    matches.sort((a, b) => b.index - a.index)

    let updatedContent = fileContent
    let noopCount = 0
    let appliedCount = 0

    for (const match of matches) {
      const isNoop = match.actualOldText === match.actualNewText
      if (isNoop) {
        noopCount++
        continue
      }

      // Replace at exact position
      updatedContent =
        updatedContent.substring(0, match.index) +
        match.actualNewText +
        updatedContent.substring(match.index + match.actualOldText.length)
      appliedCount++
    }

    // ── Phase 3: Write result ──────────────────────────────────────
    if (appliedCount > 0) {
      if (formatHandler?.write) {
        const writeContext = await buildFormatWriteContext(target.backend, target.path, context.workspaceId)
        const binaryData = await formatHandler.write(updatedContent, path, writeContext)
        await withToolTimeout(target.backend.writeFile(target.path, binaryData), timeoutMs, 'edit')
      } else if (formatHandler && !formatHandler.write) {
        return toolErrorJson(
          'edit',
          'no_format_writer',
          `Cannot edit .${formatHandler.extension} files directly with the edit tool. Use the run_python tool instead if you need to modify this file.`,
          { hint: formatHandler.formatHint ?? `The .${formatHandler.extension} format handler only supports reading.` }
        )
      } else {
        await withToolTimeout(target.backend.writeFile(target.path, updatedContent), timeoutMs, 'edit')
      }
    }

    // Update read state
    readFileState.set(readStateKey, {
      content: updatedContent,
      timestamp: Date.now(),
      offset: undefined,
      limit: undefined,
      isPartialView: false,
      source: target.backend.label === 'workspace' ? 'opfs' : target.backend.label,
    })

    const pendingCount = getPendingChanges().length
    const status = target.backend.label === 'workspace' ? 'pending' : 'saved'

    // Build diff
    const patchResult = structuredPatch(path, path, fileContent, updatedContent, '', '', {
      context: 3,
    })
    const diffText = formatHunksToDiff(patchResult.hunks)

    return toolOkJson('edit', {
      noop: appliedCount === 0,
      path,
      action: 'modify',
      totalEdits: edits.length,
      appliedCount,
      noopCount,
      editResults: matches.map((m) => ({
        editIndex: m.editIndex,
        line: m.line,
        tier: m.tier,
        similarity: m.similarity,
        noop: m.actualOldText === m.actualNewText,
      })),
      diff: diffText || undefined,
      status,
      pendingCount,
      message:
        target.backend.label === 'workspace'
          ? appliedCount === 0
            ? `File "${path}" already matched all requested content. ${pendingCount} change(s) pending review.`
            : `File "${path}" edited (${appliedCount} of ${edits.length} edits applied). ${pendingCount} change(s) pending review.`
          : appliedCount === 0
            ? `File "${path}" already matched all requested content.`
            : `File "${path}" edited (${appliedCount} of ${edits.length} edits applied).`,
      ...(formatHandler?.formatHint ? { formatHint: formatHandler.formatHint } : {}),
    })
  } catch (error) {
    if (isToolTimeoutError(error)) {
      return toolErrorJson('edit', 'timeout', error.message, { retryable: true })
    }
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return toolErrorJson('edit', 'file_not_found', `File not found: ${path}`)
    }
    return toolErrorJson(
      'edit',
      'internal_error',
      `Failed to edit file: ${withVfsAgentIdHint(error instanceof Error ? error.message : String(error))}`,
      { retryable: true }
    )
  }
}

export const editPromptDoc: ToolPromptDoc = {
  category: 'file-ops',
  section: '### File Operations',
  lines: [
    '- `edit(path, edits=[{old_text, new_text}])` - Apply one or more text replacements to an existing file. All edits are applied atomically. old_text matching is tolerant (whitespace/indent-normalized, fuzzy fallback); ambiguous or unmatched old_text fails with candidate locations. (supports `vfs://workspace/...`, `vfs://agents/{id}/...`)',
  ],
}
