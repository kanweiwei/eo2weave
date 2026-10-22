/**
 * VisionCapabilityIndicator — composer button for the active model's image
 * support. It reports whether the model accepts image input and captures the
 * current page when it does.
 *
 * Shared by the welcome screen composer and the conversation composer so both
 * surfaces render the same glyph, size and disabled treatment.
 *
 * The glyph is `ScanEye` ("can the model see"). The picture-frame icon is
 * reserved for the image-model picker, which sits in the same toolbar row —
 * using it for both would make the two buttons indistinguishable.
 */

import { memo } from 'react'
import { Loader2, ScanEye } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@creatorweave/ui'
import { supportsImageInput } from '@/agent/llm/pi-ai-model-resolver'
import { useT } from '@/i18n'

export interface VisionCapabilityIndicatorProps {
  modelName: string
  providerType: string
  /** Whether a page screenshot can actually be taken right now. */
  canCapture: boolean
  isCapturing: boolean
  onCapture: () => void
}

export const VisionCapabilityIndicator = memo(function VisionCapabilityIndicator({
  modelName,
  providerType,
  canCapture,
  isCapturing,
  onCapture,
}: VisionCapabilityIndicatorProps) {
  const t = useT()
  const supportsVision = supportsImageInput(modelName, providerType || undefined)
  const label = !supportsVision
    ? t('agent.vision.unsupported')
    : canCapture
      ? t('agent.vision.capture')
      : t('agent.vision.supported')

  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <button
              type="button"
              aria-label={label}
              disabled={!supportsVision || !canCapture || isCapturing}
              onClick={onCapture}
              className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                !supportsVision
                  ? 'bg-neutral-50 text-neutral-400 dark:bg-neutral-900 dark:text-neutral-600'
                  : 'bg-primary-50 text-primary-600 dark:bg-primary-50/40 dark:text-primary-700'
              }`}
            >
              {isCapturing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <ScanEye className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
})
