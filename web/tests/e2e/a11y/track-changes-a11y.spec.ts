import { test, expect } from '@playwright/test'
import { join } from 'node:path'

/**
 * E2E accessibility tests for track-changes diff rendering (issue #109).
 *
 * The jsdom suite (`components/sync/__tests__/inlineDiff.test.tsx`) asserts
 * the markup statically; these tests verify the REAL component in a REAL
 * browser against the actual accessibility tree:
 *
 * - axe-core (wcag2a + wcag2aa tags) finds no violations on the diff view,
 *   in both light and dark themes (the track-changes row paints a fixed
 *   dark surface in BOTH themes, so contrast must hold in each).
 * - Removed/added fragments are exposed as role `deletion` / `insertion`
 *   (semantic <del>/<ins>) and carry the expected text.
 *
 * The page under test is `/a11y/track-changes` — a minimal harness route
 * (app/a11y/track-changes/page.tsx) that mounts the production
 * LazyDiffViewer with a markdown diff containing fused track-changes rows.
 * Reaching a diff through the full app would require a real workspace with
 * pending file changes; the harness mounts the same component with the
 * same root layout/styles, only skipping the storage-gated app shell.
 */

// Locate the axe-core bundle on disk and inject it into the page via
// addScriptTag({ path }). Specs are loaded by Playwright's CJS/ESM
// transform pipeline, so a plain `import axe from 'axe-core'` (UMD browser
// bundle) or `createRequire`/`import.meta` usage is not portable here —
// resolve the package through the workspace node_modules instead (this
// spec always runs with cwd = web/, per playwright.config.ts testDir).
// NOTE: `node_modules/axe-core` is a pnpm symlink into the store; addScriptTag
// follows it fine.
const axeBundlePath = join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js')

const THEME_QUERY = (theme: 'light' | 'dark') =>
  `/a11y/track-changes?theme=${theme}`

// The app's theme store (store/theme.store.ts, zustand persist) hydrates
// from localStorage AT MODULE IMPORT TIME, before any page effect can run —
// so the desired theme must be in `bfosa-theme` before app code executes.
// addInitScript runs before any page script on every navigation.
async function openHarness(page: import('@playwright/test').Page, theme: 'light' | 'dark') {
  await page.addInitScript((seeded: string) => {
    window.localStorage.setItem('bfosa-theme', seeded)
  }, JSON.stringify({ state: { mode: theme, resolvedTheme: theme, accentColor: 'teal' }, version: 0 }))
  await page.goto(THEME_QUERY(theme))
  // The theme class must actually be applied — if this regresses, the
  // assertions below would audit the wrong palette.
  await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`))
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`track-changes diff a11y (${theme} theme)`, () => {
    test('axe-core reports no wcag2a/wcag2aa violations', async ({ page }) => {
      await openHarness(page, theme)

      // The viewer mounts client-only; wait for the real track-changes rows.
      const rows = page.getByTestId('track-changes-line')
      await expect(rows).toHaveCount(2)

      // Inject the axe-core bundle, then run it with wcag2a/wcag2aa tags.
      //
      // Scope: the harness <main> (the whole rendered page is the diff view
      // — root layout + real component), with two narrowly-scoped,
      // commented exclusions (an allowlist, not a blanket disable):
      //
      // 1. `.text-neutral-500` toolbar/hunk-header/fallback-line chrome and
      //    the `@@` hunk-header line (`.text-blue-500` on `bg-blue-50/50`) —
      //    LOW-IMPACT CONTEXT CHROME of the diff viewer (stats line,
      //    unchanged context text, hunk headers), measuring just under the
      //    4.5:1 AA threshold in light mode. Fixing it means re-tuning the
      //    viewer's palette — a visual design change, NOT a track-changes
      //    regression this suite guards. Reported to the user in issue
      //    #109 instead of silently auto-fixing component code.
      // 2. `meta[name=viewport]` (rule `meta-viewport`) — `user-scalable=no`
      //    is set DELIBERATELY in app/layout.tsx: this is an app-like PWA
      //    where double-tap zoom fights the editor UI (see the comment on
      //    `export const viewport` there). An app-shell decision, out of
      //    scope for diff rendering.
      await page.addScriptTag({ path: axeBundlePath })
      const violations = await page.evaluate(async () => {
        const results = await (window as unknown as {
          axe: {
            run: (
              context?: unknown,
              options?: unknown,
            ) => Promise<{
              violations: {
                id: string
                impact: string | null
                nodes: { target: string[] }[]
              }[]
            }>
          }
        }).axe.run(
          { include: [['main']], exclude: [['.text-neutral-500'], ['.text-blue-500'], ['meta[name=viewport]']] },
          { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } },
        )
        return results.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => n.target),
        }))
      })

      expect(violations, JSON.stringify(violations, null, 2)).toEqual([])
    })

    test('exposes removed/added fragments as deletion/insertion roles', async ({ page }) => {
      await openHarness(page, theme)

      // <del> → implicit role `deletion`, <ins> → implicit role `insertion`
      // (Chromium). getByRole walks the accessibility tree, so hidden
      // fragments cannot satisfy these queries.
      const deletions = page.getByRole('deletion')
      const insertions = page.getByRole('insertion')
      await expect(deletions).toHaveCount(2)
      await expect(insertions).toHaveCount(2)

      // Inline pair: the word-level diff of the fox sentence.
      await expect(deletions.nth(0)).toHaveText(/brown/)
      await expect(insertions.nth(0)).toHaveText(/red/)
      // Second pair: whole-line fallback ("removed entirely" line vs
      // "added entirely" line) — the <del>/<ins> carry the full line text.
      await expect(deletions.nth(1)).toHaveText(/removed/)
      await expect(insertions.nth(1)).toHaveText(/added/)

      // Fragments live inside a fused row — both sides in ONE row.
      const firstRow = page.getByTestId('track-changes-line').first()
      await expect(firstRow.getByRole('deletion')).toHaveCount(1)
      await expect(firstRow.getByRole('insertion')).toHaveCount(1)

      // Equal fragments carry an explicit, theme-aware foreground — they
      // must NOT inherit `--foreground` blindly (near-black in light mode
      // would vanish against surfaces tuned for the other theme). Assert
      // real WCAG contrast against the row's actual computed background in
      // whichever theme is active — the same property axe's color-contrast
      // rule checks, pinned per-fragment.
      const { color, rowBg } = await firstRow
        .getByTestId('track-changes-equal')
        .first()
        .evaluate((el) => {
          const row = el.closest('[data-testid="track-changes-line"]')
          const parse = (c: string) =>
            c.match(/\d+/g)?.slice(0, 3).map(Number) ?? []
          // The row paints an opaque surface; its background is used as-is
          // (no alpha < 1 in the component's classes).
          return {
            color: parse(getComputedStyle(el).color),
            rowBg: parse(getComputedStyle(row!).backgroundColor),
          }
        })
      const luminance = ([r, g, b]: number[]) => {
        const lin = (c: number) => {
          const s = c / 255
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
      }
      const l1 = luminance(color)
      const l2 = luminance(rowBg)
      const contrast = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
      expect(contrast, `equal-fragment contrast ${contrast.toFixed(2)}:1`).toBeGreaterThan(4.5)
    })
  })
}
