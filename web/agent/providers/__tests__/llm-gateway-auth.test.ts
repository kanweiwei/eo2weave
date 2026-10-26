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
const loadApiKeyMock = vi.hoisted(() =>
  vi.fn<(provider: string) => Promise<string | null>>(async () => null)
)

vi.mock('@/security/api-key-store', () => ({
  saveApiKey: vi.fn(async () => {}),
  loadApiKey: loadApiKeyMock,
  deleteApiKey: (...args: unknown[]) => deleteApiKeyMock(...(args as [string])),
}))

// The auth layer pushes the credential state into the settings store through a
// dynamic import — stub it so the tests never load the real store.
vi.mock('@/store/settings.store', () => ({
  useSettingsStore: {
    getState: () => ({ setModelCredentialStatus: vi.fn() }),
  },
}))

import {
  forceRefreshAccessToken,
  refreshAccessTokenWithStatus,
  getGatewayCredentialStatus,
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
    loadApiKeyMock.mockReset()
    loadApiKeyMock.mockResolvedValue(null)
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

    it('reuses one refresh request for concurrent callers', async () => {
      seedStoredTokens()
      let resolveRefresh!: (response: Response) => void
      const refreshResponse = new Promise<Response>((resolve) => { resolveRefresh = resolve })
      const fetchMock = vi.fn(() => refreshResponse)
      vi.stubGlobal('fetch', fetchMock)

      const first = refreshAccessTokenWithStatus(BASE_URL, CLIENT_ID)
      const second = refreshAccessTokenWithStatus(BASE_URL, CLIENT_ID)
      expect(first).toBe(second)
      resolveRefresh(new Response(JSON.stringify({
        access_token: 'new-token', token_type: 'Bearer', expires_in: 60,
        refresh_token: 'new-refresh', refresh_expires_in: 3600,
      }), { status: 200 }))

      const results = await Promise.all([first, second])
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(results).toEqual([
        { status: 'success', accessToken: 'new-token' },
        { status: 'success', accessToken: 'new-token' },
      ])
      vi.unstubAllGlobals()
    })

    it('uses the refresh completion time when calculating token expiry', async () => {
      seedStoredTokens()
      const start = Date.now()
      vi.stubGlobal('fetch', vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
        return new Response(JSON.stringify({
          access_token: 'new-token', token_type: 'Bearer', expires_in: 60,
          refresh_token: 'new-refresh', refresh_expires_in: 3600,
        }), { status: 200 })
      }))

      const result = await refreshAccessTokenWithStatus(BASE_URL, CLIENT_ID)
      expect(result.status).toBe('success')
      const completedAt = Date.now()
      const stored = JSON.parse(localStorage.getItem('llm-gateway-tokens')!)
      // Expiry must be calculated from refresh COMPLETION time, not request
      // start — assert against both bounds so a start-based calculation
      // (which would lose the ~20ms delay) fails.
      expect(stored.access_expires_at).toBeGreaterThanOrEqual(start + 60_000 + 15)
      expect(stored.access_expires_at).toBeLessThanOrEqual(completedAt + 60_000)
      vi.unstubAllGlobals()
    })

    it('discards a refresh that completes after logout (stale session)', async () => {
      seedStoredTokens()
      let resolveRefresh!: (response: Response) => void
      const refreshResponse = new Promise<Response>((resolve) => { resolveRefresh = resolve })
      vi.stubGlobal('fetch', vi.fn(() => refreshResponse))

      const pending = refreshAccessTokenWithStatus(BASE_URL, CLIENT_ID)
      logoutGateway() // session ends while the refresh is in flight
      resolveRefresh(new Response(JSON.stringify({
        access_token: 'late-token', token_type: 'Bearer', expires_in: 60,
        refresh_token: 'late-refresh', refresh_expires_in: 3600,
      }), { status: 200 }))

      const result = await pending
      expect(result.status).toBe('temporary_error')
      // Nothing from the dead session may be written
      expect(localStorage.getItem('llm-gateway-tokens')).toBeNull()
      vi.unstubAllGlobals()
    })

    it('does not reuse an in-flight refresh across a session change', async () => {
      seedStoredTokens()
      let resolveRefresh!: (response: Response) => void
      const refreshResponse = new Promise<Response>((resolve) => { resolveRefresh = resolve })
      const fetchMock = vi.fn(() => refreshResponse)
      vi.stubGlobal('fetch', fetchMock)

      const first = refreshAccessTokenWithStatus(BASE_URL, CLIENT_ID)
      logoutGateway()
      // Same tick as before: the wrapper must NOT hand back the dead-session promise
      const second = refreshAccessTokenWithStatus(BASE_URL, CLIENT_ID)
      expect(second).not.toBe(first)
      resolveRefresh(new Response(JSON.stringify({
        access_token: 'stale', token_type: 'Bearer', expires_in: 60,
        refresh_token: 'stale-refresh', refresh_expires_in: 3600,
      }), { status: 200 }))
      await first.catch(() => {})
      vi.unstubAllGlobals()
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

  describe('stale access_token shadow without a token pair', () => {
    /**
     * The token pair (localStorage + SQLite refresh backup) is gone but the
     * api-key-store still holds the access_token shadow of an earlier login.
     * That is a session that DIED, not a user who never logged in: the
     * settings card must offer a re-login instead of a logout, and the
     * gateway error must say "login expired" rather than "not logged in".
     */
    function seedShadowOnly(): void {
      loadApiKeyMock.mockImplementation(async (provider: string) =>
        provider === '__llm_gateway_token__' ? 'stale-access-token' : null
      )
    }

    it('reports "expired" and purges the shadow in getValidAccessToken', async () => {
      seedShadowOnly()

      const token = await getValidAccessToken(BASE_URL, CLIENT_ID)

      expect(token).toBeNull()
      expect(getGatewayCredentialStatus()).toBe('expired')
      expect(deleteApiKeyMock).toHaveBeenCalledWith('__llm_gateway_token__')
    })

    it('reports "expired" and purges the shadow in forceRefreshAccessToken', async () => {
      seedShadowOnly()

      const token = await forceRefreshAccessToken(BASE_URL, CLIENT_ID)

      expect(token).toBeNull()
      expect(getGatewayCredentialStatus()).toBe('expired')
      expect(deleteApiKeyMock).toHaveBeenCalledWith('__llm_gateway_token__')
    })

    it('still reports "missing" when there is no shadow either (never logged in)', async () => {
      const token = await getValidAccessToken(BASE_URL, CLIENT_ID)

      expect(token).toBeNull()
      expect(getGatewayCredentialStatus()).toBe('missing')
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

  describe('getGatewayCredentialStatus', () => {
    it('reports "expired" when the refresh_token is definitively invalid', async () => {
      seedStoredTokens()

      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          new Response(JSON.stringify({ code: 'invalid_grant', message: 'token revoked' }), {
            status: 400,
          })
        )
      )

      await getValidAccessToken(BASE_URL, CLIENT_ID)

      expect(getGatewayCredentialStatus()).toBe('expired')

      vi.unstubAllGlobals()
    })

    it('reports "missing" after an explicit logout', () => {
      logoutGateway()

      expect(getGatewayCredentialStatus()).toBe('missing')
    })

    it('reports "valid" while the stored access token is still usable', async () => {
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

      await getValidAccessToken(BASE_URL, CLIENT_ID)

      expect(getGatewayCredentialStatus()).toBe('valid')
    })
  })
})
