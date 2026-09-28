/**
 * Regression tests for the "Logged in badge + logout button on a dead session"
 * bug (user report: HTTP 401 "gateway token expired" while the settings card
 * claimed the user was logged in).
 *
 * Root cause: when the refresh_token was definitively invalid (invalid_grant /
 * 400 / 401), the auth layer cleared localStorage + the SQLite refresh-token
 * backup but left the access_token shadow in the api-key store. The settings
 * card derives its logged-in state from that shadow key alone, so the UI kept
 * showing "Logged in" with a logout button while every request 401'd.
 *
 * Expected behavior now: a definitively invalid refresh_token must also purge
 * the api-key shadow key, so the card falls back to its logged-out state and
 * shows the login button directly (no logout-then-login dance).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the dynamic import used by clearApiKeyStoreShadow() so the test never
// touches the real SQLite-backed api-key store. (No provider-module mock
// needed: LLM_GATEWAY_API_KEY_ID now lives in llm-gateway-auth itself.)
const deleteApiKeyMock = vi.hoisted(() => vi.fn<(provider: string) => Promise<void>>())

vi.mock('@/security/api-key-store', () => ({
  saveApiKey: vi.fn(async () => {}),
  loadApiKey: vi.fn(async () => null),
  deleteApiKey: (...args: unknown[]) => deleteApiKeyMock(...(args as [string])),
}))

import {
  forceRefreshAccessToken,
  getValidAccessToken,
  logoutGateway,
} from '../llm-gateway-auth'

const BASE_URL = 'https://ai.jianguoyun.com'
const CLIENT_ID = 'test-client-id'

function seedStoredTokens(overrides: Partial<{ refresh_expires_at: number }> = {}): void {
  const now = Date.now()
  localStorage.setItem(
    'llm-gateway-tokens',
    JSON.stringify({
      access_token: 'stale-access-token',
      refresh_token: 'refresh-token',
      access_expires_at: now - 1000, // already expired → forces refresh path
      refresh_expires_at: overrides.refresh_expires_at ?? now + 30 * 24 * 60 * 60 * 1000,
      client_id: CLIENT_ID,
      base_url: BASE_URL,
    })
  )
}

describe('llm-gateway-auth dead-session cleanup', () => {
  beforeEach(() => {
    localStorage.clear()
    deleteApiKeyMock.mockReset()
    deleteApiKeyMock.mockResolvedValue(undefined)
  })

  /** Flush fire-and-forget dynamic-import chains before assertions. */
  const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 20))

  afterEach(() => {
    localStorage.clear()
  })

  describe('forceRefreshAccessToken', () => {
    it('purges the api-key shadow key when the refresh_token is definitively invalid (invalid_grant)', async () => {
      seedStoredTokens()

      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          new Response(JSON.stringify({ code: 'invalid_grant', message: 'token revoked' }), {
            status: 400,
          })
        )
      )

      const result = await forceRefreshAccessToken(BASE_URL, CLIENT_ID)

      expect(result).toBeNull()
      // The stale access_token shadow must be gone, not just localStorage.
      await vi.waitFor(() => {
        expect(deleteApiKeyMock).toHaveBeenCalledWith('__llm_gateway_token__')
      })
      expect(localStorage.getItem('llm-gateway-tokens')).toBeNull()

      vi.unstubAllGlobals()
    })

    it('purges the api-key shadow key when the refresh_token is expired locally', async () => {
      seedStoredTokens({ refresh_expires_at: Date.now() - 1000 })

      const result = await forceRefreshAccessToken(BASE_URL, CLIENT_ID)

      expect(result).toBeNull()
      await vi.waitFor(() => {
        expect(deleteApiKeyMock).toHaveBeenCalledWith('__llm_gateway_token__')
      })
      expect(localStorage.getItem('llm-gateway-tokens')).toBeNull()
    })

    it('keeps tokens (and the shadow key) on transient network errors', async () => {
      seedStoredTokens()

      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new TypeError('Failed to fetch')
        })
      )

      const result = await forceRefreshAccessToken(BASE_URL, CLIENT_ID)

      expect(result).toBeNull()
      // Give fire-and-forget cleanup a chance to (wrongly) run before asserting.
      await flushAsync()
      expect(deleteApiKeyMock).not.toHaveBeenCalled()
      // Tokens survive transient failures — user must NOT be forced to re-login.
      expect(localStorage.getItem('llm-gateway-tokens')).not.toBeNull()

      vi.unstubAllGlobals()
    })
  })

  describe('getValidAccessToken', () => {
    it('purges the api-key shadow key when the refresh_token is definitively invalid', async () => {
      seedStoredTokens()

      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          new Response(JSON.stringify({ code: 'invalid_grant', message: 'token revoked' }), {
            status: 401,
          })
        )
      )

      const token = await getValidAccessToken(BASE_URL, CLIENT_ID)

      expect(token).toBeNull()
      await vi.waitFor(() => {
        expect(deleteApiKeyMock).toHaveBeenCalledWith('__llm_gateway_token__')
      })
      expect(localStorage.getItem('llm-gateway-tokens')).toBeNull()

      vi.unstubAllGlobals()
    })

    it('returns the cached access token without touching the api-key store while it is still valid', async () => {
      const now = Date.now()
      localStorage.setItem(
        'llm-gateway-tokens',
        JSON.stringify({
          access_token: 'fresh-access-token',
          refresh_token: 'refresh-token',
          access_expires_at: now + 10 * 60 * 1000,
          refresh_expires_at: now + 30 * 24 * 60 * 60 * 1000,
          client_id: CLIENT_ID,
          base_url: BASE_URL,
        })
      )

      const token = await getValidAccessToken(BASE_URL, CLIENT_ID)

      expect(token).toBe('fresh-access-token')
      expect(deleteApiKeyMock).not.toHaveBeenCalled()
    })
  })

  describe('logoutGateway', () => {
    it('also purges the api-key shadow key', async () => {
      logoutGateway()

      // Flush the fire-and-forget dynamic import chain.
      await vi.waitFor(() => {
        expect(deleteApiKeyMock).toHaveBeenCalledWith('__llm_gateway_token__')
      })
    })
  })
})
