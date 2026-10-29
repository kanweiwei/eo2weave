/**
 * skill-install-flow — pure helpers for the /skill-install promotion landing
 * page (issue #126).
 *
 * Split out of the component so the decision branches (AI-readiness
 * detection, navigation-target selection, input prefill) can be unit-tested
 * without rendering React.
 */

import { ENABLE_LLM_GATEWAY } from '@/lib/deploy-region'
import {
  fetchGatewayRateLimits,
  getLLMGatewayBaseURL,
  getLLMGatewayClientId,
  isLLMGatewayConfigured,
  LLM_GATEWAY_API_KEY_ID,
} from '@/agent/providers/llm-gateway-provider'
import { getValidAccessToken } from '@/agent/providers/llm-gateway-auth'
import { useSettingsStore } from '@/store/settings.store'
import { getAllApiKeyProviders } from '@/security/api-key-store'

// ── AI readiness ────────────────────────────────────────────────────

export interface AiReadinessResult {
  /** True when at least one usable model credential exists. */
  ready: boolean
  /** Gateway logged in but /v1/rate-limits reports 0 available credit. */
  creditExhausted: boolean
}

/**
 * Decide whether the visitor can run the skill right away.
 *
 * Branches (issue #126):
 *   1. llm-gateway logged in (valid access token) → ready; also probe
 *      /v1/rate-limits so a 0-credit account gets the "can't use yet"
 *      hint early (ties into the #122 recharge entry).
 *   2. settings.store.hasApiKey (current provider has a key) → ready.
 *   3. any OTHER provider key in the api-key store → ready.
 *   4. nothing → not ready (caller offers inline device-code login).
 *
 * All probes are best-effort: a failing quota/key-store probe never turns
 * a ready visitor "not ready".
 */
export async function checkAiReadiness(): Promise<AiReadinessResult> {
  if (ENABLE_LLM_GATEWAY && isLLMGatewayConfigured()) {
    const token = await getValidAccessToken(getLLMGatewayBaseURL(), getLLMGatewayClientId())
    if (token) {
      let creditExhausted = false
      try {
        const limits = await fetchGatewayRateLimits()
        creditExhausted = limits.available_credit <= 0
      } catch {
        // Quota probe is informational — a failed probe must not block the flow.
      }
      return { ready: true, creditExhausted }
    }
  }

  if (useSettingsStore.getState().hasApiKey) {
    return { ready: true, creditExhausted: false }
  }

  try {
    const providers = await getAllApiKeyProviders()
    // A stored gateway token shadow alone does NOT mean usable (the token
    // branch above already proved it invalid) — exclude it.
    const others = providers.filter((p) => p !== LLM_GATEWAY_API_KEY_ID)
    if (others.length > 0) {
      return { ready: true, creditExhausted: false }
    }
  } catch {
    // Key store unavailable (storage not ready) — treat as not ready; the
    // send path's 401 chain backstops either way.
  }

  return { ready: false, creditExhausted: false }
}

// ── Navigation-target selection ─────────────────────────────────────

export interface ConversationTarget {
  id: string
  /** True when a brand-new conversation was created for the visitor. */
  created: boolean
}

/**
 * Pick the conversation the landing page navigates to (issue #126):
 * history → most recent by lastAccessedAt; none → createNew() and use its
 * id (conversationId === workspaceId in this app).
 */
export function pickConversationTarget(
  workspaces: Array<{ id: string; lastAccessedAt?: number | null }>,
  createNew: () => { id: string },
): ConversationTarget {
  if (workspaces.length > 0) {
    const sorted = [...workspaces].sort(
      (a, b) => (b.lastAccessedAt ?? 0) - (a.lastAccessedAt ?? 0),
    )
    return { id: sorted[0].id, created: false }
  }
  return { id: createNew().id, created: true }
}

// ── Input prefill ───────────────────────────────────────────────────

/**
 * Build the prefill text: `/{skill-name}` slash command (explicit skill
 * activation, teaches the slash convention), plus the promoter-defined
 * `prompt` suffix when present.
 */
export function buildPrefillText(skillName: string, prompt?: string | null): string {
  const command = `/${skillName}`
  const suffix = (prompt ?? '').trim()
  return suffix ? `${command} ${suffix}` : command
}

// ── Init polling ────────────────────────────────────────────────────

/**
 * Wait until `predicate` turns true (AppBootstrap-driven store init is
 * async relative to the landing page mount). Resolves false on timeout so
 * the caller can fall back to a safe route instead of hanging.
 */
export async function waitForCondition(
  predicate: () => boolean,
  timeoutMs = 10_000,
  intervalMs = 200,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return predicate()
}
