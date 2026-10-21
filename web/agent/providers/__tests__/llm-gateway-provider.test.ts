/**
 * Tests for the gateway rate-limits error messages.
 *
 * The settings card used to show "Not logged in" for every failure, which
 * contradicted the "Logged in" badge and told the user to log in again for a
 * session that had merely expired. The auth layer records the real state, so
 * the message must distinguish "expired" (re-login) from "missing" (log in).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/security/api-key-store', () => ({
  saveApiKey: vi.fn(async () => {}),
  loadApiKey: vi.fn(async () => null),
  deleteApiKey: vi.fn(async () => {}),
}))

import { fetchGatewayRateLimits } from '../llm-gateway-provider'
import { useI18nStore } from '@/i18n/store'

function seedStoredTokens(
  overrides: { accessExpired?: boolean; refreshExpired?: boolean } = {}
): void {
  const now = Date.now()
  localStorage.setItem(
    'llm-gateway-tokens',
    JSON.stringify({
      access_token: 'stale-access-token',
      refresh_token: 'refresh-token',
      access_expires_at: overrides.accessExpired === false ? now + 10 * 60 * 1000 : now - 1000,
      refresh_expires_at:
        overrides.refreshExpired === false ? now + 30 * 24 * 60 * 60 * 1000 : now - 1000,
      client_id: 'test-client-id',
      base_url: 'https://ai.jianguoyun.com',
    })
  )
}

describe('fetchGatewayRateLimits error message', () => {
  beforeEach(() => {
    localStorage.clear()
    useI18nStore.setState({ locale: 'en-US' })
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('reports an expired session as expired (re-login), not as never logged in', async () => {
    seedStoredTokens({ accessExpired: true, refreshExpired: true })

    await expect(fetchGatewayRateLimits()).rejects.toThrow(
      'Nutstore AI login has expired. Please log in again.'
    )
  })

  it('reports a missing credential as not logged in', async () => {
    await expect(fetchGatewayRateLimits()).rejects.toThrow(
      'Not logged in to Nutstore AI. Please log in first.'
    )
  })
})
