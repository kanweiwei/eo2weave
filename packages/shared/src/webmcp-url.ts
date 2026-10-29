/** Longest URL a tool pattern is matched against. */
const MAX_MATCH_URL_LENGTH = 4096

/**
 * Catastrophic backtracking ("ReDoS") guard for tool URL patterns.
 *
 * A pattern with a nested quantifier — a quantified group whose body is
 * itself quantified, e.g. `(a+)+`, `(a*)*`, `(a+?)+` — can take exponential
 * time on a long non-matching input. A registry package could ship such a
 * pattern and stall the extension's service worker while it probes the tab
 * URL.
 *
 * The patterns are rejected at VALIDATION time (manifest validation, which
 * both the installer and the extension catalog run), so a hostile package
 * never reaches the matching stage.
 */
const NESTED_QUANTIFIER = /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{]/

/**
 * A pattern that legitimately nests quantifiers would be rejected too — the
 * check is intentionally conservative: a tool URL pattern has no reason to
 * nest quantifiers, and every builtin pattern stays unaffected.
 */
export function hasNestedQuantifier(pattern: string): boolean {
  return NESTED_QUANTIFIER.test(pattern)
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
