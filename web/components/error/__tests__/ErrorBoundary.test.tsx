import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import React from 'react'

// ErrorBoundary uses useT from '@/i18n' — mock it before importing the component
vi.mock('@/i18n', () => ({
  useT: () => (key: string) => {
    const messages: Record<string, string> = {
      'errorBoundary.renderError': 'Render Error',
      'errorBoundary.componentRenderError':
        'An error occurred while rendering this component. This may be a temporary issue, please try refreshing the page.',
      'errorBoundary.retry': 'Retry',
    }
    return messages[key] ?? key
  },
}))

import { ErrorBoundary } from '@/components/error/ErrorBoundary'

// Silence React's error-boundary console.error noise during tests
let consoleErrorSpy: ReturnType<typeof vi.spyOn>

function Bomb({ shouldThrow }: { shouldThrow: boolean }): React.ReactElement {
  if (shouldThrow) {
    throw new Error('kaboom')
  }
  return <div>safe child</div>
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    cleanup()
  })

  it('renders children when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('safe child')).toBeInTheDocument()
  })

  it('shows fallback UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    )
    expect(screen.queryByText('safe child')).not.toBeInTheDocument()
    expect(screen.getByText('Render Error')).toBeInTheDocument()
  })

  it('uses the custom fallback prop when provided', () => {
    render(
      <ErrorBoundary fallback={<div>custom fallback</div>}>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('custom fallback')).toBeInTheDocument()
    expect(screen.queryByText('Render Error')).not.toBeInTheDocument()
  })

  it('calls onError with the error and component stack', () => {
    const onError = vi.fn()
    render(
      <ErrorBoundary onError={onError}>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    )
    expect(onError).toHaveBeenCalledTimes(1)
    const [error, info] = onError.mock.calls[0]
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('kaboom')
    expect(typeof info.componentStack).toBe('string')
    // The stack must be non-empty and identify the throwing component
    expect((info.componentStack as string).trim()).not.toBe('')
    expect(info.componentStack).toContain('Bomb')
  })

  it('recovers after clicking Retry', async () => {
    const { rerender } = render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Render Error')).toBeInTheDocument()

    // Fix the child, then click Retry
    rerender(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    )
    const user = (await import('@testing-library/user-event')).default
    await user.setup().click(screen.getByText('Retry'))
    expect(screen.getByText('safe child')).toBeInTheDocument()
  })
})
