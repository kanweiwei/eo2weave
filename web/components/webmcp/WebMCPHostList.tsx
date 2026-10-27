import { Globe } from 'lucide-react'
import type { WebMCPHostCatalog, WebMCPTabInstance } from '@/webmcp'

interface WebMCPHostListProps {
  t: (key: string) => string
  hosts: WebMCPHostCatalog[]
}

function summarizeTabs(tabs: WebMCPTabInstance[]): string {
  return tabs
    .slice(0, 2)
    .map((tab) => {
      if (tab.title.trim()) return tab.title.trim()
      try {
        return new URL(tab.url).pathname || tab.url
      } catch {
        return tab.url
      }
    })
    .join(' · ')
}

/**
 * List of discovered (authorized) WebMCP tools — read-only.
 *
 * The shared trust switch lives one level up (WebMCPSettings); per-site
 * authorization still lives exclusively in the extension popup — this
 * component renders state, it never mutates anything.
 */
export function WebMCPHostList({ t, hosts }: WebMCPHostListProps) {
  if (hosts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 p-4 text-xs text-tertiary dark:border-neutral-700">
        {t('settings.webMCPNoHosts')}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {hosts.map((host) => {
        const totalTools = host.registeredTools.length
        const totalTabs = host.tabs.length
        return (
          <div
            key={host.hostname}
            className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-800"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary-600" />
                <p className="truncate font-mono text-sm text-secondary dark:text-foreground">
                  {host.hostname}
                </p>
              </div>
              <p className="mt-1 text-xs text-tertiary">
                {t('settings.webMCPHostSummary')
                  .replace('{tools}', String(totalTools))
                  .replace('{tabs}', String(totalTabs))}
              </p>
            </div>

            <div className="mt-3 rounded-lg border border-neutral-200 bg-muted/40 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900/40">
              <div className="rounded bg-white/80 px-2 py-1.5 text-[11px] text-tertiary dark:bg-neutral-950/40">
                {host.registeredTools
                  .slice(0, 8)
                  .map((tool) => tool.name)
                  .join(' · ')}
                {host.registeredTools.length > 8 ? ` +${host.registeredTools.length - 8}` : ''}
              </div>

              {host.tabs.length > 0 && (
                <div className="mt-2 text-[11px] text-tertiary">
                  {t('settings.webMCPTabPreview').replace('{tabs}', summarizeTabs(host.tabs))}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
