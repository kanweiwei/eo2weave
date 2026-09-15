/**
 * Extension install-channel constants.
 *
 * The extension can be installed two ways, and the install guide ALWAYS
 * offers both — the user picks whichever works for their network:
 *
 *   - store → one-click install from the Chrome Web Store (auto-updates).
 *     Unreachable from some mainland-China networks, but reachable for
 *     users with a VPN, so it must never be hidden by a build flag.
 *   - zip   → download the package hosted alongside the web app and load
 *     it unpacked (developer mode). Works on any network; manual updates.
 *
 * There is deliberately NO build-time branching here: both options ship in
 * every build. The guide marks the store option as "Recommended".
 *
 * Consumers of CHROME_WEB_STORE_URL:
 *   - ExtensionInstallGuide (store flow, step 2)
 *   - SettingsDialog extension panel (always-visible store install button,
 *     paired with the zip download button so both channels stay reachable
 *     from the settings page)
 */

export type GuideMethod = 'store' | 'zip'

/**
 * True on mobile devices (phones/tablets), where Chrome/Edge extensions
 * cannot be installed at all. User-agent based on purpose: a narrow
 * desktop window is still a desktop and CAN install the extension, so a
 * viewport check (useMobile) would be wrong here. SSR-safe (returns false).
 */
export function isMobileDeviceForExtension(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  )
}

/** Chrome Web Store listing for EO2Weave. */
export const CHROME_WEB_STORE_URL =
  'https://chromewebstore.google.com/detail/eo2weave/canpcddlognjbengiodekfbbfnjafeml'
