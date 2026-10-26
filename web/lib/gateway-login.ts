/**
 * Shared login body for the LLM Gateway (坚果云 AI) Device Code Flow.
 *
 * Extracted from useGatewayLogin so both the hook and the gateway-relogin
 * store (credential-expired error card) run the EXACT same sequence:
 * persist the token → fetch/register models → atomically switch
 * provider/model → seed curated pins → sync credential state.
 *
 * Non-hook by design: zustand stores and plain async callers must not need
 * React to run a login.
 */

import {
  getLLMGatewayBaseURL,
  getLLMGatewayClientId,
  getLLMGatewayApiKeyProviderKey,
  updateGatewayModels,
  LLM_GATEWAY_PROVIDER_TYPE,
} from '@/agent/providers/llm-gateway-provider'
import { useSettingsStore } from '@/store/settings.store'

export interface GatewayLoginResult {
  ok: boolean
  /** The access token on success (null otherwise). */
  accessToken: string | null
  models: Array<{ id: string; name: string }>
}

/**
 * Post-token save/model/credential sequence shared by every gateway login
 * entry point. Assumes the Device Code Flow already produced `accessToken`.
 */
export async function applyGatewayLoginTokens(accessToken: string): Promise<GatewayLoginResult> {
  // Save access_token as the "API key" for this provider
  const keyId = getLLMGatewayApiKeyProviderKey()
  const { saveApiKey } = await import('@/security/api-key-store')
  await saveApiKey(keyId, accessToken)
  useSettingsStore.getState().invalidateApiKeyCache(keyId)

  // Fetch and register model list FIRST (need models before we can select one)
  const models = await updateGatewayModels(accessToken)

  // Keep provider/model selection atomic. The shared reconciliation action
  // also preserves an existing gateway model when the catalog changes.
  const settings = useSettingsStore.getState()
  settings.switchProviderAndModel(
    LLM_GATEWAY_PROVIDER_TYPE,
    models[0]?.id ?? settings.modelName,
  )

  // Seed the curated default pin (deepseek-v4.1-flash) for first-time
  // gateway users — same first-save seeding as ProviderManager, so the
  // top-bar switcher works without manual pinning. Intersection with the
  // live catalog skips an out-of-curation default.
  if ((useSettingsStore.getState().pinnedModelsByProvider[LLM_GATEWAY_PROVIDER_TYPE]?.length ?? 0) === 0) {
    const { getDefaultPinnedModels } = await import('@/agent/providers/default-models')
    const defaults = getDefaultPinnedModels(LLM_GATEWAY_PROVIDER_TYPE, models.map((m) => m.id))
    if (defaults.length > 0) {
      useSettingsStore.getState().setPinnedModels(LLM_GATEWAY_PROVIDER_TYPE, defaults)
      useSettingsStore.getState().markPinnedModelsSeen(LLM_GATEWAY_PROVIDER_TYPE, defaults)
    }
  }

  // Sync global credential state so UI reacts immediately (must come AFTER
  // provider/model set). Expiry is kept separate from model availability.
  useSettingsStore.getState().setHasApiKey(true)
  useSettingsStore.getState().setModelCredentialStatus('valid')

  // Trigger UI refresh so provider dropdowns etc. update
  useSettingsStore.getState().triggerProviderRefresh()

  return { ok: true, accessToken, models }
}

export { getLLMGatewayBaseURL, getLLMGatewayClientId }
