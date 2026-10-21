/**
 * TextSelectionToolbar — invisible component that auto-copies
 * selected text to clipboard when the user selects text inside
 * the markdown content area.
 *
 * Uses debounce to control copy frequency.
 *
 * The document-level `selectionchange` listener is a module-level
 * SINGLETON shared by all mounted instances: one listener total, which
 * serializes the selection (`selection.toString()`) at most once per
 * event and dispatches only to the container that owns the anchor node.
 * (Previously every mounted message added its own listener, so each
 * selection change ran O(instances) full-selection serializations.)
 */

import { memo, useCallback, useEffect, useRef } from 'react'
import { useT } from '@/i18n'
import { toast } from 'sonner'

/** Minimum selection length to trigger auto-copy */
const MIN_SELECTION_LENGTH = 2

/** Debounce delay in ms */
const DEBOUNCE_MS = 400

interface SelectionSubscriber {
  getContainer(): HTMLElement | null
  onSelectionText: (text: string) => void
  /** Selection collapsed / moved outside all containers — cancel pending copy. */
  onSelectionEnd: () => void
}

const selectionSubscribers = new Set<SelectionSubscriber>()
let singletonListenerInstalled = false

function notifyAllSelectionEnd(): void {
  for (const subscriber of selectionSubscribers) subscriber.onSelectionEnd()
}

function handleDocumentSelectionChange(): void {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || !selection.rangeCount) {
    notifyAllSelectionEnd()
    return
  }
  const anchorNode = selection.anchorNode
  if (!anchorNode) {
    notifyAllSelectionEnd()
    return
  }
  for (const subscriber of selectionSubscribers) {
    const container = subscriber.getContainer()
    if (container && container.contains(anchorNode)) {
      // Serialize only once per event, and only when a container matches.
      const text = selection.toString().trim()
      if (text.length >= MIN_SELECTION_LENGTH) subscriber.onSelectionText(text)
      else subscriber.onSelectionEnd()
      return
    }
  }
  notifyAllSelectionEnd()
}

function subscribeTextSelection(subscriber: SelectionSubscriber): () => void {
  selectionSubscribers.add(subscriber)
  if (!singletonListenerInstalled) {
    singletonListenerInstalled = true
    document.addEventListener('selectionchange', handleDocumentSelectionChange)
  }
  return () => {
    selectionSubscribers.delete(subscriber)
    if (selectionSubscribers.size === 0 && singletonListenerInstalled) {
      singletonListenerInstalled = false
      document.removeEventListener('selectionchange', handleDocumentSelectionChange)
    }
  }
}

export const TextSelectionToolbar = memo(function TextSelectionToolbar({
  containerRef,
}: {
  containerRef: React.RefObject<HTMLElement | null>
}) {
  const t = useT()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleSelectionText = useCallback(
    (text: string) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(async () => {
        try {
          await navigator.clipboard.writeText(text)
          toast.success(t('common.copied'), { duration: 1500 })
        } catch {
          // Silently ignore clipboard errors (e.g. permissions)
        }
      }, DEBOUNCE_MS)
    },
    [t]
  )

  const handleSelectionEnd = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => {
    return subscribeTextSelection({
      getContainer: () => containerRef.current,
      onSelectionText: handleSelectionText,
      onSelectionEnd: handleSelectionEnd,
    })
  }, [containerRef, handleSelectionText, handleSelectionEnd])

  return null
})
