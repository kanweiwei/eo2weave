/**
 * Cascading fuzzy matching for the edit tool's old_text.
 *
 * Tiers are tried in order; the first tier that yields a unique match wins:
 *
 *   1. exact       — byte-for-byte substring, unique
 *   2. quotes      — curly-quote-normalized substring, unique
 *   3. whitespace  — per-line: line endings unified (CRLF/CR -> LF handled by
 *                    splitting), trailing whitespace stripped; whole-block match
 *   4. indent      — leading-whitespace-insensitive block match; a consistent
 *                    indent delta is captured so new_text can be re-indented
 *   5. fuzzy       — SequenceMatcher-style similarity over line-sized windows
 *                    (line-level LCS ratio; char-level ratio for small blocks),
 *                    acceptance >= 0.9 with a uniqueness margin
 *   6. anchored    — first/last significant lines act as anchors; candidate
 *                    windows are scored with max(line ratio, char ratio),
 *                    acceptance >= 0.8
 *
 * Uniqueness is enforced at every tier: a tier matching more than one location
 * aborts with candidate locations instead of silently picking the first one.
 * A total miss returns the closest candidates (line number + similarity) so
 * the model can self-correct without re-reading the whole file.
 */

import { diffArrays, diffChars } from 'diff'

// ── Public types ────────────────────────────────────────────────────

export type MatchTier = 'exact' | 'quotes' | 'whitespace' | 'indent' | 'fuzzy' | 'anchored'

export interface MatchCandidate {
  /** 1-based line number of the candidate region start */
  line: number
  /** 0..1 similarity between old_text and the candidate region */
  similarity: number
  /** Trimmed preview of the candidate region's first line */
  text: string
  /** Char offset of the candidate region start */
  start: number
  /** Char offset of the candidate region end (exclusive) */
  end: number
}

export interface EditMatch {
  /** Char offset of the match start (inclusive) */
  start: number
  /** Char offset of the match end (exclusive) */
  end: number
  /** The actual text from the file (original formatting preserved) */
  actualOldText: string
  tier: MatchTier
  similarity: number
  /**
   * True when the match region starts at a line's column 0 (its leading
   * whitespace is INSIDE the region). False when it starts after the file
   * line's own indentation (e.g. single-line fuzzy mid-line matches).
   *
   * This determines how indentDelta must be applied to new_text:
   * lineAligned=true  -> EVERY line needs the delta (the first line must
   *                      (re)create its own indentation).
   * lineAligned=false -> only continuation lines need the delta; the first
   *                      line sits after the file's own leading whitespace.
   */
  lineAligned: boolean
  /**
   * Whitespace prefix to prepend to new_text lines per the lineAligned
   * rule above (indent flex). Empty string when no re-indentation needed.
   */
  indentDelta: string
}

export type MatchOutcome =
  | { kind: 'ok'; match: EditMatch }
  | { kind: 'ambiguous'; tier: MatchTier; occurrences: MatchCandidate[] }
  | { kind: 'not_found'; candidates: MatchCandidate[]; bestSimilarity: number }

// ── Tunables ────────────────────────────────────────────────────────

/** Minimum similarity for the full-scan fuzzy tier */
const FUZZY_ACCEPT = 0.9
/** Minimum per-line similarity for anchor lines (0.9+: sibling functions
 * like foo()/bar() share ~0.85 char similarity — boilerplate dilutes it) */
const ANCHOR_EDGE_RATIO = 0.9
/** Minimum window similarity for the anchored tier */
const ANCHOR_ACCEPT = 0.8
/** Best candidate must beat the runner-up by this margin to be accepted */
const UNIQUENESS_MARGIN = 0.05
/** Above this line count, skip the full-window fuzzy scan (anchors only) */
const FULL_SCAN_MAX_LINES = 4000
/** Above this line count, skip single-line fuzzy scanning entirely */
const SINGLE_LINE_FUZZY_MAX_LINES = 20000
/** Soft wall-clock budget for fuzzy scanning */
const TIME_BUDGET_MS = 3000
/** Max candidates reported in errors */
const MAX_CANDIDATES = 3
/** Similarity below which a near-miss is not worth reporting */
const CANDIDATE_FLOOR = 0.5
/** Skip windows whose length differs too much from the search block */
const LENGTH_PREFILTER = 0.6

// ── Quote normalization (models often cannot emit curly quotes) ─────

const CURLY_QUOTE_MAP: Array<[string, string]> = [
  ['\u2018', "'"],
  ['\u2019', "'"],
  ['\u201C', '"'],
  ['\u201D', '"'],
]

export function normalizeQuotes(str: string): string {
  let result = str
  for (const [curly, straight] of CURLY_QUOTE_MAP) {
    if (result.includes(curly)) result = result.replaceAll(curly, straight)
  }
  return result
}

// ── Line model ──────────────────────────────────────────────────────

interface FileLine {
  /** Char offset of the line start */
  start: number
  /** Char offset of the line end, excluding the terminator (\n or \r\n) */
  contentEnd: number
  /** Char offset of the line end, including the terminator */
  lineEnd: number
  /** Line content without terminator */
  raw: string
  /** raw with trailing horizontal whitespace stripped */
  tstrip: string
  /** raw fully trimmed */
  trimmed: string
  /** leading horizontal whitespace of raw */
  lead: string
}

function splitLines(content: string): FileLine[] {
  const lines: FileLine[] = []
  let start = 0
  for (;;) {
    const nl = content.indexOf('\n', start)
    const hasNl = nl !== -1
    const rawEnd = hasNl ? nl : content.length
    let contentEnd = rawEnd
    if (contentEnd > start && content[contentEnd - 1] === '\r') contentEnd -= 1
    const raw = content.slice(start, contentEnd)
    lines.push({
      start,
      contentEnd,
      lineEnd: hasNl ? nl + 1 : content.length,
      raw,
      tstrip: raw.replace(/[ \t]+$/, ''),
      trimmed: raw.trim(),
      lead: raw.match(/^[ \t]*/)![0],
    })
    if (!hasNl) break
    start = nl + 1
  }
  return lines
}

interface ParsedSearch {
  lines: string[]
  tstrip: string[]
  trimmed: string[]
  leads: string[]
  /** true when searchText ended with a newline */
  trailingNewline: boolean
  /** index of first significant (non-blank) line, -1 when all blank */
  sigFirst: number
  /** index of last significant line, -1 when all blank */
  sigLast: number
}

function parseSearch(searchText: string): ParsedSearch {
  const unified = searchText.replace(/\r\n?/g, '\n')
  const trailingNewline = unified.endsWith('\n')
  const lines = (trailingNewline ? unified.slice(0, -1) : unified).split('\n')
  const tstrip = lines.map((l) => l.replace(/[ \t]+$/, ''))
  const trimmed = tstrip.map((l) => l.trim())
  const leads = lines.map((l) => l.match(/^[ \t]*/)![0])
  let sigFirst = -1
  let sigLast = -1
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i]) {
      sigFirst = i
      break
    }
  }
  for (let i = trimmed.length - 1; i >= 0; i--) {
    if (trimmed[i]) {
      sigLast = i
      break
    }
  }
  return { lines, tstrip, trimmed, leads, trailingNewline, sigFirst, sigLast }
}

// ── Small utilities ─────────────────────────────────────────────────

export function countLinesBefore(content: string, index: number): number {
  let line = 1
  for (let i = 0; i < index && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++
  }
  return line
}

function countOccurrences(haystack: string, needle: string): { count: number; indices: number[] } {
  const indices: number[] = []
  let count = 0
  let idx = haystack.indexOf(needle)
  while (idx !== -1) {
    if (indices.length < MAX_CANDIDATES) indices.push(idx)
    count++
    idx = haystack.indexOf(needle, idx + needle.length)
  }
  return { count, indices }
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000
}

/** Character-level similarity (difflib-style ratio) via char diff */
function charRatio(a: string, b: string): number {
  if (a === b) return 1
  const total = a.length + b.length
  if (total === 0) return 1
  // Upper bound: 2*min/(a+b). Skip the expensive diff when it cannot pass
  // even the reporting floor.
  const upper = (2 * Math.min(a.length, b.length)) / total
  if (upper < CANDIDATE_FLOOR) return upper
  const parts = diffChars(a, b)
  let common = 0
  for (const part of parts) {
    if (!part.added && !part.removed) common += part.value.length
  }
  return (2 * common) / total
}

/** Line-level similarity via LCS line diff */
function lineRatio(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const upper = (2 * Math.min(a.length, b.length)) / (a.length + b.length)
  if (upper < CANDIDATE_FLOOR) return upper
  const parts = diffArrays(a, b, { comparator: (x, y) => x === y })
  let common = 0
  for (const part of parts) {
    if (!part.added && !part.removed) common += part.count ?? 0
  }
  return (2 * common) / (a.length + b.length)
}

function candidateAt(
  fileContent: string,
  index: number,
  end: number,
  similarity: number
): MatchCandidate {
  const nl = fileContent.indexOf('\n', index)
  const lineEnd = nl === -1 ? fileContent.length : nl
  return {
    line: countLinesBefore(fileContent, index),
    similarity: round3(similarity),
    text: fileContent.slice(index, Math.min(lineEnd, end)).trim().slice(0, 80),
    start: index,
    end,
  }
}

// ── Tier 3/4: structural (whitespace / indent) ──────────────────────

function matchStructural(
  fileContent: string,
  fileLines: FileLine[],
  search: ParsedSearch,
  mode: 'whitespace' | 'indent'
): MatchOutcome | null {
  const k = search.lines.length
  const n = fileLines.length
  if (k === 0 || k > n) return null

  // When old_text has no trailing newline, its last line may be a partial
  // line (the model often omits trailing punctuation). The first line must
  // match fully — leading-indent differences are already covered by the
  // per-line normalization.
  const lastEdgeFlexible = !search.trailingNewline

  const occurrences: Array<{ startLine: number; delta: string }> = []

  for (let start = 0; start + k <= n; start++) {
    let delta: string | null = null
    let matched = true
    for (let i = 0; i < k; i++) {
      const fl = fileLines[start + i]!
      const sl = mode === 'whitespace' ? search.tstrip[i]! : search.trimmed[i]!
      const al = mode === 'whitespace' ? fl.tstrip : fl.trimmed
      const isLast = i === k - 1
      const okLine =
        al === sl ||
        (isLast && lastEdgeFlexible && sl.length > 0 && (al.endsWith(sl) || al.startsWith(sl)))
      if (!okLine) {
        matched = false
        break
      }
      if (mode === 'indent' && sl.length > 0) {
        const sLead = search.leads[i]!
        if (!fl.lead.startsWith(sLead)) {
          matched = false
          break
        }
        const d = fl.lead.slice(sLead.length)
        if (delta === null) delta = d
        else if (delta !== d) {
          matched = false
          break
        }
      }
    }
    if (matched) occurrences.push({ startLine: start, delta: delta ?? '' })
    if (occurrences.length > MAX_CANDIDATES) break
  }

  if (occurrences.length === 0) return null

  if (occurrences.length > 1) {
    return {
      kind: 'ambiguous',
      tier: mode,
      occurrences: occurrences.slice(0, MAX_CANDIDATES).map((o) => {
        const fl = fileLines[o.startLine]!
        const lastLine = fileLines[o.startLine + k - 1]!
        const end = search.trailingNewline ? lastLine.lineEnd : lastLine.contentEnd
        return candidateAt(fileContent, fl.start, end, 1)
      }),
    }
  }

  const occ = occurrences[0]!
  const firstLine = fileLines[occ.startLine]!
  const lastLine = fileLines[occ.startLine + k - 1]!
  const start = firstLine.start
  const end = search.trailingNewline ? lastLine.lineEnd : lastLine.contentEnd
  return {
    kind: 'ok',
    match: {
      start,
      end,
      actualOldText: fileContent.slice(start, end),
      tier: mode,
      similarity: 1,
      lineAligned: true,
      indentDelta: occ.delta,
    },
  }
}

// ── Similarity scoring over windows ─────────────────────────────────

interface WindowScores {
  /** char-level similarity of the joined trimmed blocks (null when the
   * length prefilter rejects) */
  char: number | null
  /** line-level similarity of the trimmed line sequences */
  line: number
}

function scoreWindow(
  fileLines: FileLine[],
  start: number,
  k: number,
  searchBlock: string,
  searchTrimmed: string[]
): WindowScores {
  const slice = fileLines.slice(start, start + k)
  const block = slice.map((l) => l.trimmed).join('\n')
  const la = searchBlock.length
  const lb = block.length
  const charOk = Math.abs(la - lb) / Math.max(la, lb, 1) <= LENGTH_PREFILTER
  return {
    char: charOk ? charRatio(searchBlock, block) : null,
    line: lineRatio(searchTrimmed, slice.map((l) => l.trimmed)),
  }
}

/**
 * Boilerplate-heavy char similarity makes sibling code blocks (same shape,
 * different identifiers) look ~0.9 alike. Line structure is the semantic
 * skeleton: require at least half the lines to align, then take the char
 * ratio for small windows and the line ratio for larger ones.
 */
function acceptWindow(scores: WindowScores, k: number, threshold: number): boolean {
  if (scores.line < 0.5) return false
  const primary = k <= 4 ? scores.char : scores.line
  return primary !== null && primary >= threshold
}

function windowDisplayScore(scores: WindowScores, k: number): number {
  const primary = k <= 4 ? scores.char : scores.line
  return round3(primary ?? scores.line)
}

function resolveAccepted(
  fileContent: string,
  fileLines: FileLine[],
  accepted: Array<{ start: number; score: number }>,
  tier: 'fuzzy' | 'anchored',
  k: number,
  trailingNewline: boolean,
  searchLeads: string[],
  searchTrimmedLines: string[]
): MatchOutcome | null {
  if (accepted.length === 0) return null
  accepted.sort((a, b) => b.score - a.score)
  const best = accepted[0]!
  const runnerUp = accepted[1]
  const toCandidate = (a: { start: number; score: number }): MatchCandidate => {
    const fl = fileLines[a.start]!
    const lastLine = fileLines[a.start + k - 1]!
    const end = trailingNewline ? lastLine.lineEnd : lastLine.contentEnd
    return candidateAt(fileContent, fl.start, end, a.score)
  }
  if (runnerUp && best.score - runnerUp.score < UNIQUENESS_MARGIN) {
    return {
      kind: 'ambiguous',
      tier,
      occurrences: accepted.slice(0, MAX_CANDIDATES).map(toCandidate),
    }
  }
  const firstLine = fileLines[best.start]!
  const lastLine = fileLines[best.start + k - 1]!
  const start = firstLine.start
  const end = trailingNewline ? lastLine.lineEnd : lastLine.contentEnd
  // Plurality vote over the constant offset between file-line indentation
  // and the search's own indentation. The search often strips indentation
  // from content lines while brace lines legitimately start at column 0,
  // so no single line is a reliable witness. Blank lines carry no opinion.
  const votes = new Map<string, number>()
  for (let i = 0; i < k; i++) {
    if ((searchTrimmedLines[i] ?? '').length === 0) continue
    const fl = fileLines[best.start + i]!
    if (fl.trimmed.length === 0) continue
    const sLead = searchLeads[i] ?? ''
    if (!fl.lead.startsWith(sLead)) continue
    const d = fl.lead.slice(sLead.length)
    votes.set(d, (votes.get(d) ?? 0) + 1)
  }
  let indentDelta = ''
  let bestVotes = 0
  for (const [d, c] of votes) {
    if (c > bestVotes) {
      indentDelta = d
      bestVotes = c
    }
  }
  return {
    kind: 'ok',
    match: {
      start,
      end,
      actualOldText: fileContent.slice(start, end),
      tier,
      similarity: round3(best.score),
      lineAligned: true,
      indentDelta,
    },
  }
}

// ── Tier 5: fuzzy ───────────────────────────────────────────────────

function matchFuzzyWindows(
  fileContent: string,
  fileLines: FileLine[],
  search: ParsedSearch,
  deadline: number,
  pushCandidate: (c: MatchCandidate) => void
): MatchOutcome | null {
  const k = search.lines.length
  const n = fileLines.length
  if (k < 2 || k > n) return null

  const searchBlock = search.trimmed.join('\n')
  const accepted: Array<{ start: number; score: number }> = []

  if (n <= FULL_SCAN_MAX_LINES) {
    for (let start = 0; start + k <= n; start++) {
      if ((start & 255) === 0 && Date.now() > deadline) break
      const scores = scoreWindow(fileLines, start, k, searchBlock, search.trimmed)
      const display = windowDisplayScore(scores, k)
      if (acceptWindow(scores, k, FUZZY_ACCEPT)) {
        accepted.push({ start, score: display })
      } else if (display >= CANDIDATE_FLOOR) {
        pushCandidate(
          candidateAt(fileContent, fileLines[start]!.start, fileLines[start + k - 1]!.contentEnd, display)
        )
      }
    }
  }

  return resolveAccepted(
    fileContent,
    fileLines,
    accepted,
    'fuzzy',
    k,
    search.trailingNewline,
    search.leads,
    search.trimmed
  )
}

// ── Tier 5b: single-line fuzzy (whole trimmed line replacement) ─────

function matchSingleLineFuzzy(
  fileContent: string,
  fileLines: FileLine[],
  search: ParsedSearch,
  deadline: number,
  pushCandidate: (c: MatchCandidate) => void
): MatchOutcome | null {
  if (search.trailingNewline || search.trimmed.length !== 1) return null
  const needle = search.trimmed[0]!
  if (!needle) return null
  const n = fileLines.length
  if (n > SINGLE_LINE_FUZZY_MAX_LINES) return null

  const accepted: Array<{ lineIdx: number; score: number }> = []
  for (let i = 0; i < n; i++) {
    if ((i & 255) === 0 && Date.now() > deadline) break
    const fl = fileLines[i]!
    if (!fl.trimmed) continue
    const score = charRatio(fl.trimmed, needle)
    if (score >= FUZZY_ACCEPT) accepted.push({ lineIdx: i, score })
    else if (score >= CANDIDATE_FLOOR) {
      pushCandidate({
        line: i + 1,
        similarity: round3(score),
        text: fl.trimmed.slice(0, 80),
        start: fl.start,
        end: fl.contentEnd,
      })
    }
  }
  if (accepted.length === 0) return null

  accepted.sort((a, b) => b.score - a.score)
  const best = accepted[0]!
  const runnerUp = accepted[1]
  const toOccurrence = (a: { lineIdx: number; score: number }): MatchCandidate => {
    const fl = fileLines[a.lineIdx]!
    return {
      line: a.lineIdx + 1,
      similarity: round3(a.score),
      text: fl.trimmed.slice(0, 80),
      start: fl.start,
      end: fl.contentEnd,
    }
  }
  if (runnerUp && best.score - runnerUp.score < UNIQUENESS_MARGIN) {
    return {
      kind: 'ambiguous',
      tier: 'fuzzy',
      occurrences: accepted.slice(0, MAX_CANDIDATES).map(toOccurrence),
    }
  }
  const fl = fileLines[best.lineIdx]!
  // Replace the whole trimmed line; the file's own leading whitespace stays
  // in place before the match start, so no indent delta is needed.
  const start = fl.start + fl.lead.length
  const end = fl.start + fl.lead.length + fl.trimmed.length
  return {
    kind: 'ok',
    match: {
      start,
      end,
      actualOldText: fileContent.slice(start, end),
      tier: 'fuzzy',
      similarity: round3(best.score),
      lineAligned: false,
      indentDelta: '',
    },
  }
}

// ── Tier 6: anchored ────────────────────────────────────────────────

function matchAnchoredWindows(
  fileContent: string,
  fileLines: FileLine[],
  search: ParsedSearch,
  deadline: number,
  pushCandidate: (c: MatchCandidate) => void
): MatchOutcome | null {
  const k = search.lines.length
  const n = fileLines.length
  if (k < 2 || k > n) return null
  if (search.sigFirst < 0 || search.sigLast < 0) return null

  const sFirst = search.trimmed[search.sigFirst]!
  const sLast = search.trimmed[search.sigLast]!

  const starts = new Set<number>()
  const scanAnchor = (needle: string, offsetInSearch: number): void => {
    for (let fi = 0; fi < n; fi++) {
      if ((fi & 127) === 0 && Date.now() > deadline) return
      const fl = fileLines[fi]!
      if (charRatio(fl.trimmed, needle) >= ANCHOR_EDGE_RATIO) {
        const start = fi - offsetInSearch
        if (start >= 0 && start + k <= n) starts.add(start)
      }
    }
  }
  scanAnchor(sFirst, search.sigFirst)
  scanAnchor(sLast, search.sigLast)

  const searchBlock = search.trimmed.join('\n')
  const accepted: Array<{ start: number; score: number }> = []
  let considered = 0
  for (const start of starts) {
    if (considered++ > 4000) break
    const scores = scoreWindow(fileLines, start, k, searchBlock, search.trimmed)
    const display = windowDisplayScore(scores, k)
    if (acceptWindow(scores, k, ANCHOR_ACCEPT)) {
      accepted.push({ start, score: display })
    } else if (display >= CANDIDATE_FLOOR) {
      pushCandidate(
        candidateAt(
          fileContent,
          fileLines[start]!.start,
          fileLines[start + k - 1]!.contentEnd,
          display
        )
      )
    }
  }

  return resolveAccepted(
    fileContent,
    fileLines,
    accepted,
    'anchored',
    k,
    search.trailingNewline,
    search.leads,
    search.trimmed
  )
}

// ── Entry point ─────────────────────────────────────────────────────

export function findEditMatch(fileContent: string, searchText: string): MatchOutcome {
  if (!searchText) {
    return { kind: 'not_found', candidates: [], bestSimilarity: 0 }
  }
  const deadline = Date.now() + TIME_BUDGET_MS
  const sink: MatchCandidate[] = []
  const pushCandidate = (c: MatchCandidate): void => {
    if (c.similarity >= CANDIDATE_FLOOR) sink.push(c)
  }

  // Tier 1: exact
  const exact = countOccurrences(fileContent, searchText)
  if (exact.count === 1) {
    return {
      kind: 'ok',
      match: {
        start: exact.indices[0]!,
        end: exact.indices[0]! + searchText.length,
        actualOldText: searchText,
        tier: 'exact',
        similarity: 1,
        lineAligned: true,
        indentDelta: '',
      },
    }
  }
  if (exact.count > 1) {
    return {
      kind: 'ambiguous',
      tier: 'exact',
      occurrences: exact.indices.map((idx) => candidateAt(fileContent, idx, idx + searchText.length, 1)),
    }
  }

  // Tier 2: quote-normalized (positions map 1:1 onto the original content)
  const normFile = normalizeQuotes(fileContent)
  const normSearch = normalizeQuotes(searchText)
  const quoted = countOccurrences(normFile, normSearch)
  if (quoted.count === 1) {
    return {
      kind: 'ok',
      match: {
        start: quoted.indices[0]!,
        end: quoted.indices[0]! + normSearch.length,
        actualOldText: fileContent.slice(quoted.indices[0]!, quoted.indices[0]! + normSearch.length),
        tier: 'quotes',
        similarity: 1,
        lineAligned: true,
        indentDelta: '',
      },
    }
  }
  if (quoted.count > 1) {
    return {
      kind: 'ambiguous',
      tier: 'quotes',
      occurrences: quoted.indices.map((idx) =>
        candidateAt(fileContent, idx, idx + normSearch.length, 1)
      ),
    }
  }

  const fileLines = splitLines(fileContent)
  const search = parseSearch(searchText)

  // Tier 3: whitespace-normalized
  const ws = matchStructural(fileContent, fileLines, search, 'whitespace')
  if (ws) return ws

  // Tier 4: indent-insensitive (with re-indent delta)
  const indent = matchStructural(fileContent, fileLines, search, 'indent')
  if (indent) return indent

  // Tier 5: fuzzy
  const fuzzy =
    search.lines.length === 1 && !search.trailingNewline
      ? matchSingleLineFuzzy(fileContent, fileLines, search, deadline, pushCandidate)
      : matchFuzzyWindows(fileContent, fileLines, search, deadline, pushCandidate)
  if (fuzzy) return fuzzy

  // Tier 6: line-anchored
  const anchored = matchAnchoredWindows(fileContent, fileLines, search, deadline, pushCandidate)
  if (anchored) return anchored

  // Not found — report the closest candidates for self-correction.
  sink.sort((a, b) => b.similarity - a.similarity)
  const seen = new Set<number>()
  const candidates: MatchCandidate[] = []
  for (const c of sink) {
    if (seen.has(c.start)) continue
    seen.add(c.start)
    candidates.push(c)
    if (candidates.length >= MAX_CANDIDATES) break
  }
  return {
    kind: 'not_found',
    candidates,
    bestSimilarity: candidates[0]?.similarity ?? 0,
  }
}

// ── Re-indentation helper ───────────────────────────────────────────

/**
 * Re-indent newText with the match's indentDelta.
 *
 * lineAligned=true: the match region started at column 0, so EVERY non-empty
 * line of newText needs the delta — including the first one, which must
 * (re)create its own indentation.
 *
 * lineAligned=false: the match starts after the file line's own leading
 * whitespace; the first line inherits it for free and only continuation
 * lines need the delta. Blank lines are always left untouched.
 */
export function reindentNewText(
  newText: string,
  indentDelta: string,
  skipFirstLine: boolean
): string {
  if (!indentDelta) return newText
  return newText
    .split('\n')
    .map((line, i) =>
      i === 0 && skipFirstLine
        ? line
        : line.trim().length > 0
          ? indentDelta + line
          : line
    )
    .join('\n')
}
