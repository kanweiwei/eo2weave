'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { isSidePanelMode } from '@/agent/workspace-assistant-context'

/**
 * ActiveTabIndicator — a small chip above the composer (side-panel mode only)
 * showing the title of the tab the AI is currently "looking at".
 *
 * Page context follows the user's ACTIVE tab (see resolvePageContextTab in
 * the extension background), but that's invisible until the user sends a
 * message and inspects the context snapshot. This chip makes the follow
 * state visible at all times: switch tabs → the title updates live, so the
 * user always knows which page their next message will reference.
 *
 * Polling (not a push channel): the extension has no "active tab changed"
 * push to web pages, and the pull is cheap (one executeScript round-trip).
 * 2s interval keeps the chip fresh without burning the bridge; the poll
 * stops while the document is hidden (panel is not being looked at).
 */
const POLL_INTERVAL_MS = 2000

interface FollowedTabInfo {
  title: string | null
  url: string | null
}

function readFollowedTab(): Promise<FollowedTabInfo | null> {
  const agentWeb = (
    globalThis as {
      __agentWeb?: {
        fetchBoundPageContext?: (binding: string) => Promise<
          { url?: unknown; title?: unknown } | null
        >
      }
    }
  ).__agentWeb
  const fetchContext = agentWeb?.fetchBoundPageContext
  // Dynamic import: keeps this component out of the non-side-panel graph and
  // avoids a circular import at module-eval time.
  return import('@/agent/workspace-assistant-context').then(async ({ getSidePanelBindingId }) => {
    const binding = getSidePanelBindingId()
    if (!fetchContext || !binding) return null
    try {
      const ctx = await fetchContext(binding)
      if (!ctx || typeof ctx !== 'object') return null
      const pick = (key: 'url' | 'title'): string | null => {
        const value = (ctx as Record<string, unknown>)[key]
        return typeof value === 'string' && value ? value : null
      }
      return { url: pick('url'), title: pick('title') }
    } catch {
      return null
    }
  })
}

export function ActiveTabIndicator() {
  const [info, setInfo] = useState<FollowedTabInfo | null>(null)
  // Gate on module-load state: side-panel mode is static for the page's
  // lifetime (captured once from the launch URL / extension recovery).
  const [enabled] = useState(() => isSidePanelMode())

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const tick = async () => {
      if (cancelled) return
      if (document.visibilityState === 'visible') {
        const next = await readFollowedTab()
        if (!cancelled && next) {
          setInfo((prev) =>
            prev?.title === next.title && prev?.url === next.url ? prev : next,
          )
        }
      }
      if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS)
    }
    void tick()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [enabled])

  // Strict-hide gate — evaluated after all hooks (Rules of Hooks).
  if (!enabled) return null

  const display =
    info?.title ??
    info?.url ??
    null

  // S4 speech-bubble style (user pick 2026-10-09), muted palette + compact
  // sizing (user feedback: the dark teal competed with the input for focus,
  // and the bubble took too much vertical space): soft neutral bubble,
  // teal accent dot only, tight padding, tail overlapping the margin so the
  // whole indicator adds ~20px instead of ~40px.
  return (
    <div className="flex items-start" style={{ marginBottom: 5 }}>
      <span
        className="relative inline-flex max-w-full items-center gap-1.5"
        style={{
          background: '#f0fdfa',
          color: '#134e4a',
          border: '1px solid rgba(13, 148, 136, 0.22)',
          borderRadius: '10px 10px 10px 3px',
          padding: '2px 9px',
          fontSize: 11,
          lineHeight: 1.35,
        }}
        title={display ?? undefined}
      >
        {display === null ? (
          <Loader2
            className="shrink-0 animate-spin"
            style={{ width: 9, height: 9, color: '#14b8a6' }}
            aria-hidden="true"
          />
        ) : (
          <span
            aria-hidden="true"
            className="shrink-0 rounded-full"
            style={{
              width: 5,
              height: 5,
              background: '#14b8a6',
              animation: 'cwTabPulse 2s infinite',
            }}
          />
        )}
        <span className="truncate">{display ?? '…'}</span>
        {/* Tail: rotated square matching the bubble fill + border, tucked
            into the bottom-left edge. */}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 8,
            bottom: -3.5,
            width: 6,
            height: 6,
            background: '#f0fdfa',
            borderRight: '1px solid rgba(13, 148, 136, 0.22)',
            borderBottom: '1px solid rgba(13, 148, 136, 0.22)',
            transform: 'rotate(45deg)',
            borderRadius: 1,
          }}
        />
        {/* Keyframes injected once via a style tag — scoped enough for a
            single-instance component and avoids touching global CSS. */}
        <style>{'@keyframes cwTabPulse { 0% { box-shadow: 0 0 0 0 rgba(20, 184, 166, 0.35); } 70% { box-shadow: 0 0 0 5px rgba(20, 184, 166, 0); } 100% { box-shadow: 0 0 0 0 rgba(20, 184, 166, 0); } }'}</style>
      </span>
    </div>
  )
}
