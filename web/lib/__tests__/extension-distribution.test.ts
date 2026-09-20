import { describe, expect, it } from 'vitest'
import type { GuideMethod } from '../extension-distribution'
import {
  CHROME_WEB_STORE_URL,
  EDGE_ADDONS_URL,
  getPreferredStoreUrl,
  isEdgeBrowser,
} from '../extension-distribution'

/**
 * Pure-constants module: both install options ship in EVERY build (users
 * behind mainland-China networks may still reach the store via VPN, and
 * store-blocked users fall back to the zip). The only contract worth
 * locking is the store listing URL format — a typo here would send every
 * store-flow user to a 404.
 */
describe('lib/extension-distribution', () => {
  it('exposes a well-formed Chrome Web Store listing URL', () => {
    expect(CHROME_WEB_STORE_URL).toMatch(
      /^https:\/\/chromewebstore\.google\.com\/detail\/eo2weave\/[a-p]{32}$/,
    )
  })

  it('exposes a well-formed Edge Add-ons listing URL', () => {
    expect(EDGE_ADDONS_URL).toMatch(
      /^https:\/\/microsoftedge\.microsoft\.com\/addons\/detail\/eo2weave\/[a-p]{32}$/,
    )
  })

  it('prefers Edge Add-ons on Edge and Chrome Web Store elsewhere', () => {
    // getPreferredStoreUrl reads navigator.userAgent; stub it for both cases.
    const realNavigator = globalThis.navigator
    const withUa = (ua: string) =>
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: ua },
        configurable: true,
        writable: true,
      })
    try {
      withUa('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0')
      expect(isEdgeBrowser()).toBe(true)
      expect(getPreferredStoreUrl()).toBe(EDGE_ADDONS_URL)
      withUa('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36')
      expect(isEdgeBrowser()).toBe(false)
      expect(getPreferredStoreUrl()).toBe(CHROME_WEB_STORE_URL)
    } finally {
      Object.defineProperty(globalThis, 'navigator', {
        value: realNavigator,
        configurable: true,
        writable: true,
      })
    }
  })

  it('exposes the GuideMethod union used by the install guide', () => {
    // The guide's two methods — kept as a canary so a rename here forces a
    // conscious update of the guide's method-switching logic.
    const methods: GuideMethod[] = ['store', 'zip']
    expect(methods).toHaveLength(2)
  })
})
