import { ModelQuickSwitch } from '@/components/layout/ModelQuickSwitch'
import type { ExtendedThinkingLevel } from '@/agent/llm/pi-ai-custom-openai-fetch'

interface ModelThinkingControlsProps {
  enableThinking: boolean
  thinkingLevel: ExtendedThinkingLevel
  setEnableThinking: (enabled: boolean) => void
  setThinkingLevel: (level: ExtendedThinkingLevel) => void
}

/** Compact model and thinking controls grouped for the composer toolbar. */
export function ModelThinkingControls({
  enableThinking,
  thinkingLevel,
  setEnableThinking,
  setThinkingLevel,
}: ModelThinkingControlsProps) {
  return (
    <div className="flex min-w-0 shrink items-center">
      <ModelQuickSwitch
        compact
        enableThinking={enableThinking}
        thinkingLevel={thinkingLevel}
        setEnableThinking={setEnableThinking}
        setThinkingLevel={setThinkingLevel}
      />
    </div>
  )
}
