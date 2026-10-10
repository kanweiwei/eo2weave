/**
 * AgentDropdown — active agent selector with create/delete actions.
 */

import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Info, Trash2 } from 'lucide-react'
import { useT } from '@/i18n'
import type { AgentMeta } from '@/opfs'

interface AgentDropdownProps {
  allAgents: AgentMeta[]
  activeAgentId: string | null
  setActiveAgent: (agentId: string) => void | Promise<void>
  deleteAgent: (agentId: string) => Promise<boolean>
}

export function AgentDropdown({
  allAgents,
  activeAgentId,
  setActiveAgent,
  deleteAgent,
}: AgentDropdownProps) {
  const t = useT()
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null)

  const showGuide = allAgents.length <= 1

  // Close dropdown when clicking outside the trigger container or portal menu.
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (!containerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Keep the fixed-position portal aligned with its trigger while the page moves.
  useLayoutEffect(() => {
    if (!isOpen) {
      setMenuPosition(null)
      return
    }

    const updatePosition = () => {
      const trigger = triggerRef.current
      const menu = menuRef.current
      if (!trigger || !menu) return
      const triggerRect = trigger.getBoundingClientRect()
      const menuRect = menu.getBoundingClientRect()
      const margin = 8
      const left = Math.min(
        Math.max(margin, triggerRect.left),
        Math.max(margin, window.innerWidth - menuRect.width - margin),
      )
      const aboveTop = triggerRect.top - menuRect.height - 8
      const top = aboveTop >= margin ? aboveTop : triggerRect.bottom + 8
      setMenuPosition({ top, left })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isOpen])

  const handleDeleteAgent = async (agentId: string) => {
    if (agentId === 'default') return
    if (!window.confirm(`Delete agent "${agentId}"?`)) return
    await deleteAgent(agentId)
  }

  return (
    <div ref={containerRef} className="agent-dropdown-container relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="inline-flex h-7 min-h-0 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border-none bg-neutral-100 px-2 text-[11px] font-medium text-neutral-700 transition-colors hover:bg-neutral-200/70 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700/70 sm:h-auto sm:min-h-8 sm:gap-1.5 sm:px-2.5 sm:text-xs"
      >
        <span
          aria-hidden="true"
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-400 to-primary-600 text-[9px] font-bold leading-none text-white"
        >
          @
        </span>
        <span className="max-w-[120px] truncate">{activeAgentId || 'default'}</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          className="fixed z-50 w-52 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
          style={menuPosition ? { top: menuPosition.top, left: menuPosition.left } : { visibility: 'hidden', top: 0, left: 0 }}
        >
          <div className="max-h-48 overflow-y-auto py-1">
            {allAgents.map((agent) => {
              const isActive = activeAgentId === agent.id
              return (
                <div
                  key={agent.id}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-xs transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <button
                    type="button"
                    onClick={() => {
                      void setActiveAgent(agent.id)
                      setIsOpen(false)
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span
                      className={`font-medium ${isActive ? 'text-primary-600 dark:text-primary-500' : 'text-neutral-700 dark:text-neutral-300'}`}
                    >
                      @{agent.id}
                    </span>
                  </button>
                  <div className="ml-2 flex items-center gap-1">
                    {isActive && <Check className="h-3 w-3 text-primary-500" />}
                    {agent.id !== 'default' && (
                      <button
                        type="button"
                        onClick={() => void handleDeleteAgent(agent.id)}
                        className="rounded p-0.5 text-neutral-500 hover:bg-neutral-200 hover:text-danger dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-danger"
                        title={`Delete ${agent.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Guide hint — only show when there is just the default agent */}
          {showGuide && (
            <div className="border-t border-neutral-100 px-3 py-2.5 dark:border-neutral-800">
              <div className="flex items-start gap-1.5 text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{t('agent.dropdownGuide')}</span>
              </div>
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}
