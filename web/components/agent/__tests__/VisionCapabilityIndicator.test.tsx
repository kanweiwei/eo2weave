import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { VisionCapabilityIndicator } from '../VisionCapabilityIndicator'

/**
 * VisionCapabilityIndicator — the shared composer vision button.
 *
 * The glyph is asserted explicitly: the picture-frame icon belongs to the
 * image-model picker in the same toolbar row, so the two buttons must stay
 * visually distinct.
 */

const supportsImageInput = vi.fn()

vi.mock('@/agent/llm/pi-ai-model-resolver', () => ({
  supportsImageInput: (...args: unknown[]) => supportsImageInput(...args),
}))

vi.mock('@/i18n', () => ({
  useT: () => (key: string) => key,
}))

vi.mock('@creatorweave/ui', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

function renderIndicator(props: Partial<Parameters<typeof VisionCapabilityIndicator>[0]> = {}) {
  return render(
    <VisionCapabilityIndicator
      modelName="gpt-5.4"
      providerType="openai"
      canCapture
      isCapturing={false}
      onCapture={vi.fn()}
      {...props}
    />,
  )
}

describe('VisionCapabilityIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supportsImageInput.mockReturnValue(true)
  })

  it('uses the scan-eye glyph and not the picture-frame icon', () => {
    const { container } = renderIndicator()

    expect(container.querySelector('.lucide-scan-eye')).toBeTruthy()
    // The picture-frame icon is reserved for the image-model picker.
    expect(container.querySelector('.lucide-image')).toBeNull()
  })

  it('offers the capture action when the model supports vision', () => {
    renderIndicator()

    const button = screen.getByRole('button', { name: 'agent.vision.capture' })
    expect(button.hasAttribute('disabled')).toBe(false)
    expect(button.className).toContain('text-primary-600')
  })

  it('reports the unsupported state when the model has no image input', () => {
    supportsImageInput.mockReturnValue(false)

    renderIndicator()

    const button = screen.getByRole('button', { name: 'agent.vision.unsupported' })
    expect(button.hasAttribute('disabled')).toBe(true)
    expect(button.className).toContain('text-neutral-400')
  })

  it('disables the button when a screenshot cannot be captured', () => {
    renderIndicator({ canCapture: false })

    const button = screen.getByRole('button', { name: 'agent.vision.supported' })
    expect(button.hasAttribute('disabled')).toBe(true)
    // Disabled buttons must dim, otherwise a supported model still looks
    // available in the welcome composer.
    expect(button.className).toContain('disabled:opacity-50')
  })

  it('fires the capture callback', () => {
    const onCapture = vi.fn()
    renderIndicator({ onCapture })

    screen.getByRole('button', { name: 'agent.vision.capture' }).click()

    expect(onCapture).toHaveBeenCalled()
  })
})
