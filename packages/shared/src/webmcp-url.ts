/** Longest URL a tool pattern is matched against. */
const MAX_MATCH_URL_LENGTH = 4096

/**
 * Catastrophic backtracking ("ReDoS") guard for tool URL patterns.
 *
 * A pattern that lets the matching engine split the same input span between
 * two quantifiers — a quantified group whose body can match empty, starts
 * with a quantified atom (the classic `(a+)+`), or carries overlapping
 * alternation branches — can take exponential time on a long non-matching
 * input. A registry package could ship such a pattern and stall the
 * extension's service worker while it probes the tab URL.
 *
 * The check below is a conservative structural scan, deliberately broader
 * than a literal "nested quantifier" pattern: it also rejects repeated
 * ambiguous alternations, bounded repeats over quantified bodies
 * (`(a+){2,4}`), and nested groups that bottom out in a quantifier. A tool
 * URL pattern has no reason to use any of these shapes, and every builtin
 * pattern stays unaffected.
 *
 * The patterns are rejected at VALIDATION time (manifest validation, which
 * both the installer and the extension catalog run), so a hostile package
 * never reaches the matching stage.
 */

interface SequenceAnalysis {
  /** The whole sequence can match the empty string. */
  canMatchEmpty: boolean
  /** The FIRST atom of the sequence carries a quantifier (`(a+)` → true). */
  leadingAtomQuantified: boolean
  /** A top-level `|` was seen (branches may overlap when repeated). */
  alternation: boolean
}

function isQuantifierChar(char: string | undefined): boolean {
  return char === '*' || char === '+' || char === '?' || char === '{'
}

/** Zero-repetition minimum for the quantifier at `index`, or null. */
function quantifierAllowsZero(pattern: string, index: number): boolean | null {
  const char = pattern[index]
  if (char === '*' || char === '?') return true
  if (char === '+') return false
  if (char === '{') {
    const close = pattern.indexOf('}', index)
    if (close === -1 || !/^\d+(,\d*)?$/.test(pattern.slice(index + 1, close))) return null
    const min = (pattern.slice(index + 1, close).split(',')[0] ?? '').trim()
    return min === '' || min === '0'
  }
  return null
}

/** Where a group's BODY starts, skipping `(?:`, `(?=`, `(?<name>`, … */
function groupBodyStart(pattern: string, open: number): number {
  if (pattern.startsWith('(?<', open)) {
    const arrow = pattern.indexOf('>', open)
    return arrow !== -1 ? arrow + 1 : open + 3
  }
  return pattern.startsWith('(?', open) ? open + 3 : open + 1
}

/**
 * Analyze `pattern[from, until)` — a sequence of atoms possibly joined by
 * top-level `|`. Returns null when the fragment is malformed in a way this
 * scanner does not model (the RegExp constructor reports those, not this
 * guard).
 */
function analyzeSequence(pattern: string, from: number, until: number): SequenceAnalysis {
  /** Skippability of each top-level atom, in order. */
  const atoms: boolean[] = []
  /** Index just past the FIRST atom — a quantifier here targets it. */
  let firstAtomEnd = -1
  let alternation = false
  let emptyBranch = false
  let depth = 0
  let groupOpen = -1
  let i = from
  while (i < until) {
    const char = pattern[i]
    if (char === '\\') {
      atoms.push(false)
      i += 2
      if (firstAtomEnd === -1) firstAtomEnd = i
      continue
    }
    if (char === '[') {
      const close = pattern.indexOf(']', i + 1)
      i = close === -1 ? until : close + 1
      atoms.push(false)
      if (firstAtomEnd === -1) firstAtomEnd = i
      continue
    }
    if (char === '(') {
      if (depth === 0) groupOpen = i
      depth += 1
      i += 1
      continue
    }
    if (char === ')') {
      depth -= 1
      if (depth === 0 && groupOpen !== -1) {
        const bodyStart = groupBodyStart(pattern, groupOpen)
        // A group atom is skippable when its own body can match empty.
        const inner = bodyStart <= i ? analyzeSequence(pattern, bodyStart, i) : null
        atoms.push(inner ? inner.canMatchEmpty : false)
        i += 1
        if (firstAtomEnd === -1) firstAtomEnd = i
        groupOpen = -1
        continue
      }
      i += 1
      continue
    }
    if (char === '|' && depth === 0) {
      alternation = true
      const prev = i > from ? pattern[i - 1] : '('
      const next = i + 1 < until ? pattern[i + 1] : ')'
      if (prev === '|' || prev === '(' || next === '|' || next === ')') emptyBranch = true
      i += 1
      continue
    }
    if (isQuantifierChar(char) && depth === 0) {
      const quantifierAt = i
      let allowsZero: boolean | null
      if (char === '{') {
        const close = pattern.indexOf('}', i)
        allowsZero = close !== -1 && close < until ? quantifierAllowsZero(pattern, i) : null
        if (allowsZero === null) {
          // Not a quantifier — a literal `{`.
          atoms.push(false)
          i += 1
          if (firstAtomEnd === -1) firstAtomEnd = i
          continue
        }
        i = close + 1
      } else {
        allowsZero = char !== '+'
        i += 1
      }
      // A trailing `?` is a lazy modifier, part of the same quantifier.
      if (pattern[i] === '?') i += 1
      if (atoms.length > 0) atoms[atoms.length - 1] = atoms[atoms.length - 1]! || allowsZero!
      if (firstAtomEnd === quantifierAt) {
        // The quantifier targeted the first atom of this sequence.
        return { canMatchEmpty: false, leadingAtomQuantified: true, alternation }
      }
      continue
    }
    if (char === '|' || isQuantifierChar(char)) {
      // Quantifier inside a nested group — belongs to the inner scan.
      i += 1
      continue
    }
    if (depth > 0) {
      // Any other character inside a nested group belongs to the INNER
      // analysis, not to this sequence's atom list — counting it here would
      // desynchronize `firstAtomEnd` and hide a quantifier that targets the
      // group itself (`((a)*)+`).
      i += 1
      continue
    }
    // Plain character atom.
    atoms.push(false)
    i += 1
    if (firstAtomEnd === -1) firstAtomEnd = i
  }
  const canMatchEmpty =
    emptyBranch ||
    atoms.length === 0 ||
    (!alternation && atoms.every(skippable => skippable))
  return { canMatchEmpty, leadingAtomQuantified: false, alternation }
}

/**
 * True when quantifying this group body creates a backtracking risk:
 * the body can match empty (skip ambiguity — `(?:a*)*`, `(|a)*`),
 * its first atom is itself quantified (consume ambiguity — `(a+)+`,
 * `(x+x+)+y`, `(a+){2,4}`), or it carries a top-level alternation whose
 * branches may overlap when repeated (`(a|aa)+`).
 */
function bodyIsDangerous(pattern: string, bodyStart: number, bodyEnd: number): boolean {
  if (bodyStart >= bodyEnd) return true // `()*` — empty body matches empty
  const body = analyzeSequence(pattern, bodyStart, bodyEnd)
  return body.canMatchEmpty || body.leadingAtomQuantified || body.alternation
}

/**
 * Structural backtracking scan: every group followed by a quantifier gets
 * its body analyzed. Groups that are not quantified are irrelevant (their
 * body runs once); a quantified group with a fixed, non-empty,
 * non-alternating body — `(?:/[^?#]*)?` — stays allowed.
 */
export function hasNestedQuantifier(pattern: string): boolean {
  const opens: number[] = []
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i]
    if (char === '\\') { i += 1; continue }
    if (char === '[') {
      const close = pattern.indexOf(']', i + 1)
      if (close !== -1) i = close
      continue
    }
    if (char === '(') {
      opens.push(i)
      continue
    }
    if (char === ')') {
      const open = opens.pop()
      if (open === undefined) continue
      if (isQuantifierChar(pattern[i + 1]) && bodyIsDangerous(pattern, groupBodyStart(pattern, open), i)) {
        return true
      }
    }
  }
  return false
}

export function validateUrlRegex(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('urlRegex must be a nonempty string')
  if (value.length > 2000 || !value.startsWith('^') || !value.endsWith('$'))
    throw new Error('urlRegex must start with ^, end with $, and contain at most 2000 characters')
  if (hasNestedQuantifier(value))
    throw new Error('urlRegex must not contain nested quantifiers (they allow catastrophic backtracking)')
  try { new RegExp(value) } catch (error) { throw new Error(`Invalid urlRegex: ${String(error)}`) }
  return value
}

/** Matching also verifies the complete match, including expressions with alternation. */
export function matchesToolUrl(pattern: string, href: string): boolean {
  // An over-long URL cannot be a real tab URL and only feeds a pathological
  // pattern more backtracking work.
  if (href.length > MAX_MATCH_URL_LENGTH) return false
  const url = new URL(href)
  if (!['https:', 'http:'].includes(url.protocol)) return false
  const match = new RegExp(pattern).exec(url.href)
  return match !== null && match.index === 0 && match[0].length === url.href.length
}
