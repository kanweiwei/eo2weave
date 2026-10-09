/**
 * Side panel environment helpers.
 *
 * Microsoft Edge implements the per-tab sidePanel API differently from
 * Chrome: switching to another tab force-closes a tab-specific panel, and
 * the panel is NOT restored when the user switches back. There is no
 * programmatic remedy — `sidePanel.open()` requires a user gesture and tab
 * activation does not count as one (see w3c/webextensions#588 and
 * microsoft/MicrosoftEdge-Extensions#142).
 *
 * On Edge we therefore use a WINDOW-scoped panel instead of a tab-scoped
 * one: the panel stays open across tab switches, and its content keeps
 * following the tab it was opened from via the side panel binding store.
 */
export function shouldUseGlobalSidePanel(): boolean {
  // "Edg/<major>" is Edge's own UA token (Edge inherits Chrome's UA and
  // appends this token; "EdgiOS" / "EdgA" are the mobile variants).
  return /\bEdg(?:e|A|iOS)?\//.test(navigator.userAgent);
}
