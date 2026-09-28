import type { Locale } from '@creatorweave/i18n'
import { t as translate } from '@creatorweave/i18n'

/**
 * Friendly presentation for LLM provider errors.
 *
 * The streaming layer surfaces provider failures as raw strings:
 * - custom Chat Completions handler:  `HTTP {status}: {errorBody}`
 *   (web/agent/llm/pi-ai-custom-openai-fetch.ts)
 * - pi-ai built-in handlers:          `{model} does not exist or does not support {type}`
 * - fetch failures (DNS refused, CORS, offline): `fetch failed` / `Failed to fetch`
 *
 * Before this module, ConversationErrorBanner rendered those strings verbatim,
 * dumping entire JSON error bodies into the chat. This classifier extracts the
 * HTTP status and error body, summarizes well-known provider error codes, and
 * keeps the raw body behind a collapsible <details> block for debugging
 * (same pattern as DatabaseRefreshDialog).
 */

/** OpenAI-style error codes recognized inside provider error bodies. */
const KNOWN_ERROR_CODES = new Set([
  'context_length_exceeded',
  'invalid_api_key',
  'insufficient_quota',
  'permission_denied',
  'not_found_error',
  'billing_not_active',
  'rate_limit_exceeded',
  'model_not_found',
  'api_key_disabled',
])

const NETWORK_FRAGMENTS = [
  'failed to fetch',
  'fetch failed',
  'networkerror',
  'network request failed',
  'load failed',
]

export interface LlmErrorPresentation {
  /** Localized one-line explanation, always user-readable. */
  title: string
  /**
   * Raw error content when it adds information beyond the title (HTTP body,
   * provider error JSON). Null when it would just repeat the title.
   */
  details: string | null
}

/** Extract the status code from a `HTTP {status}: {body}` error string. */
function extractStatus(message: string): number | null {
  const match = message.match(/^HTTP\s+(\d{3})\b/i)
  return match ? Number(match[1]) : null
}

/**
 * Extract the error body from a `HTTP {status}: {body}` string. Returns null
 * for placeholder bodies that carry no provider information.
 */
function extractErrorBody(message: string): string | null {
  const match = message.match(/^HTTP\s+\d{3}:\s*([\s\S]+)$/i)
  const body = match?.[1]?.trim()
  if (!body || body === 'No response body' || body === 'Failed to read response body') {
    return null
  }
  return body
}

/**
 * Pull the friendliest single line out of a provider error body: prefer a
 * known error code, then a `message` field from JSON, then the body itself
 * (truncated — some providers return whole HTML error pages).
 */
function summarizeErrorBody(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      error?: { code?: unknown; message?: unknown }
      code?: unknown
      message?: unknown
    }
    const err = typeof parsed.error === 'object' && parsed.error !== null ? parsed.error : undefined
    // Prefer the human-readable message (usually names the specific limit/
    // model); fall back to the code only when it is a recognized one —
    // unknown codes (e.g. "requests") are noise.
    const msg = typeof err?.message === 'string' ? err.message : typeof parsed.message === 'string' ? parsed.message : undefined
    if (msg) return msg.length > 300 ? `${msg.slice(0, 300)}…` : msg
    const code = typeof err?.code === 'string' ? err.code : typeof parsed.code === 'string' ? parsed.code : undefined
    if (code && KNOWN_ERROR_CODES.has(code)) return code
  } catch {
    // Not JSON — fall through to raw text.
  }
  return body.length > 300 ? `${body.slice(0, 300)}…` : body
}

function isNetworkError(message: string): boolean {
  const lower = message.toLowerCase()
  return NETWORK_FRAGMENTS.some((f) => lower.includes(f))
}

/**
 * Classify a raw LLM error string into a friendly presentation.
 * Pure function — locale is passed explicitly so it can be unit-tested
 * and memoized independently of React.
 */
export function presentLlmError(rawError: string, locale: Locale): LlmErrorPresentation {
  const t = (key: string, params?: Record<string, string | number>) =>
    translate(locale, key, params)

  const trimmed = rawError.trim()
  if (!trimmed) {
    return { title: t('conversation.error.failed'), details: null }
  }

  if (isNetworkError(trimmed)) {
    return { title: t('conversation.error.network'), details: trimmed }
  }

  const status = extractStatus(trimmed)

  if (status !== null) {
    const body = extractErrorBody(trimmed)
    const title = t('conversation.error.http', { status })
    const details = body ? summarizeErrorBody(body) : null
    return { title, details }
  }

  // pi-ai built-in handler style: "{model} does not exist or does not support ..."
  // Already human-readable as-is — keep it without adding a generic wrapper.
  if (/does not exist or does not support/i.test(trimmed)) {
    return { title: trimmed, details: null }
  }

  // Unrecognized failure (provider SDK throw, empty-body abort, etc.) —
  // show a generic friendly line and keep the raw string as details.
  return { title: t('conversation.error.failed'), details: trimmed }
}
