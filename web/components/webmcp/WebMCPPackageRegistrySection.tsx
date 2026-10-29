'use client'

/**
 * WebMCPPackageRegistrySection — settings section for the WebMCP package
 * registry installer (issue #117, Tier 1).
 *
 * Renders one card per user-added registry with its package catalog
 * (id / description / toolCount / version + install button). A collapsed
 * advanced row lets the user add a registry via the loose URL forms
 * (full GitHub URL / owner/repo shorthand / raw manifest URL).
 *
 * Installed packages show "Installed · inactive" — activation is
 * deliberately NOT possible from here: it happens through the #102 opt-in
 * flow (open the side panel on a matching site). Follows the existing
 * WebMCP settings-card visual language (bordered cards, tertiary text).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import {
  addRegistry,
  registriesPersisted,
  installRegistryPackage,
  listInstalledPackageIds,
  listRegistries,
  loadRegistryCatalog,
  readInstalledPackageActivation,
  removeRegistry,
  uninstallRegistryPackage,
} from '@/webmcp/package-registry-store'
import type { PackageRegistry, RegistryManifest, RegistryManifestPackage } from '@/webmcp/package-registry-client'

interface WebMCPPackageRegistrySectionProps {
  t: (key: string) => string
}

/** Bound for the section's own manifest.json preview fetches. */
const REGISTRY_PREVIEW_TIMEOUT_MS = 30_000

/**
 * Read a preview response under a byte cap (finding: "Registry bodies hang
 * or exhaust memory"). Prefers streaming text so the cap is enforced BEFORE
 * parsing; falls back to `json()` for response doubles without a text body
 * (tests).
 */
async function readJsonCapped(response: Response, maxBytes: number): Promise<unknown> {
  if (typeof response.text === 'function') {
    const text = await response.text()
    if (text.length > maxBytes) throw new Error(`Response exceeds the size limit (${maxBytes} bytes)`)
    return JSON.parse(text)
  }
  return response.json()
}

function format(message: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value)),
    message,
  )
}


/**
 * Map a thrown error to a LOCALIZED message key (finding: "Error details
 * ignore selected locale" — raw English exception text interpolated into a
 * localized template stays English for every other locale). Known error
 * shapes get their own key; anything unknown falls back to a generic
 * localized failure message with the diagnostic text as a secondary detail.
 */
function errorKeyFor(message: string): { key: string; values?: Record<string, string> } {
  const m = message.toLowerCase()
  if (m.includes('timed out') || m.includes('timeout')) return { key: 'settings.webmcpPackages.errorTimeout' }
  if (m.includes('not found') || m.includes('http 404')) return { key: 'settings.webmcpPackages.errorNotFound' }
  if (m.includes('size limit') || m.includes('exceeds') || m.includes('too large')) return { key: 'settings.webmcpPackages.errorTooLarge' }
  if (m.includes('unreachable') || m.includes('network') || m.includes('failed to fetch')) return { key: 'settings.webmcpPackages.errorUnreachable' }
  if (m.includes('busy') || m.includes('in progress')) return { key: 'settings.webmcpPackages.errorBusy' }
  if (m.startsWith('cannot install')) return { key: 'settings.webmcpPackages.errorCollision', values: { detail: message } }
  return { key: 'settings.webmcpPackages.errorGeneric', values: { detail: message } }
}

/** Localized text for a thrown error (see `errorKeyFor`). */
function localizedError(t: (key: string) => string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const { key, values } = errorKeyFor(message)
  return values ? format(t(key), values) : t(key)
}

interface RegistryCardProps {
  t: (key: string) => string
  registry: PackageRegistry
  installedIds: Set<string>
  /** Activation state per installed id (read from the package config). */
  activations: Map<string, 'enabled' | 'disabled'>
  busyId: string | null
  onInstall: (registry: PackageRegistry, pkg: RegistryManifestPackage, verifiedToolCount: number) => Promise<boolean>
  onUninstall: (pkg: RegistryManifestPackage) => Promise<boolean>
  onRemoveRegistry: (registry: PackageRegistry) => void
}

function RegistryCard({ t, registry, installedIds, activations, busyId, onInstall, onUninstall, onRemoveRegistry }: RegistryCardProps) {
  const [manifest, setManifest] = useState<RegistryManifest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  /**
   * Tool count per package id, taken from the package's OWN manifest.json
   * (the file the extension validates). The registry's `toolCount` is a
   * publisher-provided claim and may disagree with the package contents —
   * the verified count is shown instead so the catalog never misleads.
   */
  const [verifiedToolCounts, setVerifiedToolCounts] = useState<Map<string, number>>(new Map())

  const load = useCallback(async (force: boolean) => {
    setRefreshing(true)
    setError(null)
    try {
      setManifest(await loadRegistryCatalog(registry, { force }))
    } catch (err) {
      setError(localizedError(t, err))
    } finally {
      setRefreshing(false)
    }
  }, [registry])

  useEffect(() => {
    void load(false)
  }, [load])

  /** Read one package's manifest.json and record its real tool count. */
  const readToolCount = useCallback(async (pkgId: string) => {
    try {
      const { registryFileUrl, MAX_PACKAGE_MANIFEST_PREVIEW_BYTES } = await import('@/webmcp/package-registry-client')
      const response = await fetch(registryFileUrl(registry, `packages/${pkgId}/manifest.json`), {
        credentials: 'omit',
        // Same bound as every other registry request (finding: "Registry
        // bodies hang or exhaust memory") — a stalled or oversized package
        // manifest must not hang the settings page.
        signal: AbortSignal.timeout(REGISTRY_PREVIEW_TIMEOUT_MS),
      })
      if (!response.ok) return
      const data = await readJsonCapped(response, MAX_PACKAGE_MANIFEST_PREVIEW_BYTES) as { tools?: unknown }
      if (!Array.isArray(data.tools)) return
      const count = (data.tools as unknown[]).length
      setVerifiedToolCounts(previous => {
        const next = new Map(previous)
        next.set(pkgId, count)
        return next
      })
    } catch {
      // Unreadable manifest — keep the registry's claim for that package.
    }
  }, [registry])

  useEffect(() => {
    for (const pkg of manifest?.packages ?? []) void readToolCount(pkg.id)
  }, [manifest, readToolCount])

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-800">
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 shrink-0 text-tertiary" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{registry.label}</div>
          <div className="truncate font-mono text-xs text-tertiary">{registry.manifestUrl}</div>
        </div>
        <button
          type="button"
          className="rounded p-1.5 text-tertiary hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-neutral-700"
          disabled={refreshing}
          title={t('settings.webmcpPackages.refresh')}
          onClick={() => void load(true)}
        >
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          className="rounded p-1.5 text-tertiary hover:bg-neutral-100 dark:hover:bg-neutral-700"
          title={t('settings.webmcpPackages.removeRegistry')}
          onClick={() => onRemoveRegistry(registry)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {error && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{format(t('settings.webmcpPackages.loadFailed'), { error })}</span>
        </div>
      )}

      {manifest && manifest.packages.length === 0 && (
        <div className="mt-2 text-xs text-tertiary">{t('settings.webmcpPackages.noPackages')}</div>
      )}

      <div className="mt-2 space-y-2">
        {manifest?.packages.map((pkg) => {
          const installed = installedIds.has(pkg.id)
          const busy = busyId === pkg.id
          const expanded = expandedId === pkg.id
          // The verified count (from the package manifest) wins over the
          // registry's claim; the claim is only used until the manifest was
          // read (or when it cannot be read at all).
          const toolCount = verifiedToolCounts.get(pkg.id) ?? pkg.toolCount
          const active = installed && activations.get(pkg.id) === 'enabled'
          return (
            <div key={pkg.id} className="rounded-md border border-neutral-200 p-2.5 dark:border-neutral-700">
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  className="mt-0.5 rounded p-0.5 text-tertiary hover:bg-neutral-100 dark:hover:bg-neutral-700"
                  aria-expanded={expanded}
                  onClick={() => setExpandedId(expanded ? null : pkg.id)}
                >
                  {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-xs font-medium">{pkg.id}</div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-tertiary">{pkg.description}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-tertiary">
                    <span>{format(t('settings.webmcpPackages.toolsCount'), { count: toolCount })}</span>
                    <span>·</span>
                    <span>{format(t('settings.webmcpPackages.version'), { version: pkg.version })}</span>
                  </div>
                  {installed && (
                    <div className="mt-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full border border-neutral-300 px-2 py-0.5 text-xs text-tertiary dark:border-neutral-600">
                        <Check className="h-3 w-3 text-green-600 dark:text-green-400" />
                        {active ? t('settings.webmcpPackages.installedActive') : t('settings.webmcpPackages.installedInactive')}
                      </span>
                      {/* The "enable it" hint only makes sense while the
                          package is still inactive. */}
                      {!active && (
                        <div className="mt-1 text-xs text-tertiary">{t('settings.webmcpPackages.installedInactiveHint')}</div>
                      )}
                    </div>
                  )}
                </div>
                <div className="shrink-0">
                  {installed ? (
                    <button
                      type="button"
                      className="rounded-md border border-red-300 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                      disabled={busy}
                      onClick={() => void onUninstall(pkg)}
                    >
                      {busy ? t('settings.webmcpPackages.uninstalling') : t('settings.webmcpPackages.uninstall')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      disabled={busy}
                      onClick={() => void onInstall(registry, pkg, verifiedToolCounts.get(pkg.id) ?? pkg.toolCount)}
                    >
                      {busy ? t('settings.webmcpPackages.installing') : t('settings.webmcpPackages.install')}
                    </button>
                  )}
                </div>
              </div>
              {expanded && manifest && (
                <div className="mt-2 border-t border-neutral-200 pt-2 dark:border-neutral-700">
                  <ToolCatalogPreview registry={registry} pkg={pkg} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Expandable per-package tool list. Tool names/descriptions come from the
 * package's own manifest.json — fetched through the same raw base with the
 * registry client (read-only, no credentials).
 */
function ToolCatalogPreview({ registry, pkg }: { registry: PackageRegistry; pkg: RegistryManifestPackage }) {
  const [tools, setTools] = useState<Array<{ name: string; description: string }> | null>(null)

  useEffect(() => {
    let disposed = false
    void (async () => {
      try {
        const { registryFileUrl, MAX_PACKAGE_MANIFEST_PREVIEW_BYTES } = await import('@/webmcp/package-registry-client')
        const response = await fetch(registryFileUrl(registry, `packages/${pkg.id}/manifest.json`), {
          credentials: 'omit',
          signal: AbortSignal.timeout(REGISTRY_PREVIEW_TIMEOUT_MS),
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await readJsonCapped(response, MAX_PACKAGE_MANIFEST_PREVIEW_BYTES) as { tools?: Array<{ name: string; description: string }> }
        if (!disposed) setTools(Array.isArray(data.tools) ? data.tools : [])
      } catch {
        if (!disposed) setTools([])
      }
    })()
    return () => { disposed = true }
  }, [registry, pkg.id])

  if (tools === null) return <div className="text-xs text-tertiary">…</div>
  if (tools.length === 0) return <div className="text-xs text-tertiary">—</div>
  return (
    <ul className="space-y-1">
      {tools.map(tool => (
        <li key={tool.name} className="flex items-baseline gap-2 text-xs">
          <span className="shrink-0 font-mono text-tertiary">{tool.name}</span>
          <span className="truncate text-tertiary">{tool.description}</span>
        </li>
      ))}
    </ul>
  )
}

export function WebMCPPackageRegistrySection({ t }: WebMCPPackageRegistrySectionProps) {
  const [registries, setRegistries] = useState<PackageRegistry[]>([])
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set())
  /** Activation state per installed id, read from the package config. */
  const [activations, setActivations] = useState<Map<string, 'enabled' | 'disabled'>>(new Map())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [input, setInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmPkg, setConfirmPkg] = useState<{
    registry: PackageRegistry
    pkg: RegistryManifestPackage
    /** Tool count VERIFIED from the package manifest (falls back to the claim). */
    verifiedToolCount: number
  } | null>(null)
  /**
   * Refresh generation. Two overlapping refreshes can resolve out of order;
   * an older read must never overwrite a newer one, or an installed package
   * would appear uninstalled and could be installed a second time.
   */
  const refreshGeneration = useRef(0)

  const refreshInstalled = useCallback(async () => {
    const generation = refreshGeneration.current + 1
    refreshGeneration.current = generation
    const ids = await listInstalledPackageIds()
    const states = await Promise.all([...ids].map(async id => [id, await readInstalledPackageActivation(id)] as const))
    // A stale read (an older generation that resolved last) is dropped.
    if (refreshGeneration.current !== generation) return
    setInstalledIds(ids)
    setActivations(new Map(states))
  }, [])

  useEffect(() => {
    setRegistries(listRegistries())
    void refreshInstalled()
  }, [refreshInstalled])

  useEffect(() => {
    // The side-panel opt-in flow enables packages OUTSIDE this section (the
    // background broadcasts `webmcp_packages_changed` after every catalog
    // refresh). Without this listener the activation badge stays stale until
    // an unrelated refresh or a remount (finding: "Activation badge stays
    // stale"). Guarded: tests and non-extension embeds have no chrome.
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage?.addListener) return
    const listener = (message: { type?: string } | undefined) => {
      if (message?.type === 'webmcp_packages_changed') void refreshInstalled()
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [refreshInstalled])

  const handleAdd = async () => {
    if (!input.trim()) return
    setAdding(true)
    setAddError(null)
    try {
      const registry = addRegistry(input)
      setRegistries(listRegistries())
      if (!registriesPersisted()) {
        // Private mode / storage failure: the registry lives in the session
        // mirror only — keep the form open and say so instead of letting the
        // addition silently vanish on reload (finding: "Registry addition
        // disappears in private mode").
        setAddError(format(t('settings.webmcpPackages.addSessionOnly'), { label: registry.label }))
        setAdding(false)
        return
      }
      setInput('')
      setAddOpen(false)
      void registry
    } catch (err) {
      setAddError(localizedError(t, err))
    } finally {
      setAdding(false)
    }
  }

  const handleInstall = async (registry: PackageRegistry, pkg: RegistryManifestPackage): Promise<boolean> => {
    setBusyId(pkg.id)
    try {
      await installRegistryPackage(registry, pkg)
      await refreshInstalled()
      setActionError(null)
      setConfirmPkg(null)
      return true
    } catch (error) {
      setActionError(localizedError(t, error))
      return false
    } finally {
      setBusyId(null)
    }
  }

  const handleUninstall = async (pkg: RegistryManifestPackage): Promise<boolean> => {
    setBusyId(pkg.id)
    try {
      await uninstallRegistryPackage(pkg.id)
      await refreshInstalled()
      setActionError(null)
      return true
    } catch (error) {
      setActionError(localizedError(t, error))
      return false
    } finally {
      setBusyId(null)
    }
  }

  const handleRemoveRegistry = (registry: PackageRegistry) => {
    removeRegistry(registry.manifestUrl)
    setRegistries(listRegistries())
  }

  const hasRegistries = useMemo(() => registries.length > 0, [registries.length])

  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-semibold">{t('settings.webmcpPackages.title')}</div>
        <div className="mt-0.5 text-xs text-tertiary">{t('settings.webmcpPackages.description')}</div>
        {actionError && (
          <button
            type="button"
            className="mt-1.5 flex items-start gap-1.5 text-left text-xs text-red-600 dark:text-red-400"
            onClick={() => setActionError(null)}
            title={t('settings.webmcpPackages.dismissError')}
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{format(t('settings.webmcpPackages.actionFailed'), { error: actionError })}</span>
          </button>
        )}
      </div>

      {!hasRegistries && (
        <div className="rounded-lg border border-dashed border-neutral-300 p-4 text-xs text-tertiary dark:border-neutral-700">
          {t('settings.webmcpPackages.noRegistries')}
        </div>
      )}

      {registries.map(registry => (
        <RegistryCard
          key={registry.manifestUrl}
          t={t}
          registry={registry}
          installedIds={installedIds}
          activations={activations}
          busyId={busyId}
          onInstall={(reg, pkg, verifiedCount) => {
            // The confirmation discloses the count VERIFIED from the package
            // manifest (finding: "Confirmation shows wrong tool count") — the
            // registry's claim is only a fallback when the manifest was
            // unreadable.
            setConfirmPkg({ registry: reg, pkg, verifiedToolCount: verifiedCount })
            return Promise.resolve(true)
          }}
          onUninstall={handleUninstall}
          onRemoveRegistry={handleRemoveRegistry}
        />
      ))}

      {/* Collapsed advanced option: add a custom package repository */}
      <div className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700">
        <button
          type="button"
          className="flex w-full items-center gap-1.5 p-2.5 text-xs text-tertiary"
          aria-expanded={addOpen}
          onClick={() => setAddOpen(open => !open)}
        >
          {addOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <Plus className="h-3.5 w-3.5" />
          {t('settings.webmcpPackages.addRegistryTitle')}
        </button>
        {addOpen && (
          <div className="px-2.5 pb-2.5">
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t('settings.webmcpPackages.addRegistryInputPlaceholder')}
              className="w-full rounded-md border border-neutral-300 bg-transparent px-2.5 py-1.5 font-mono text-xs focus:border-blue-500 focus:outline-none dark:border-neutral-600"
              onKeyDown={(event) => { if (event.key === 'Enter') void handleAdd() }}
            />
            <div className="mt-1.5 text-xs text-tertiary">{t('settings.webmcpPackages.addRegistryHint')}</div>
            {addError && <div className="mt-1.5 text-xs text-red-600 dark:text-red-400">{format(t('settings.webmcpPackages.addFailed'), { error: addError })}</div>}
            <button
              type="button"
              className="mt-2 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={adding || !input.trim()}
              onClick={() => void handleAdd()}
            >
              {adding ? t('settings.webmcpPackages.adding') : t('settings.webmcpPackages.addRegistryButton')}
            </button>
          </div>
        )}
      </div>

      {/* Install confirmation — discloses what will be downloaded and the inactive-by-default semantics */}
      {confirmPkg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
            <div className="text-sm font-semibold">
              {format(t('settings.webmcpPackages.confirmInstallTitle'), { id: confirmPkg.pkg.id })}
            </div>
            <div className="mt-2 text-xs text-tertiary">
              {format(t('settings.webmcpPackages.confirmInstallBody'), { count: confirmPkg.verifiedToolCount })}
            </div>
            {actionError && (
              <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                {format(t('settings.webmcpPackages.actionFailed'), { error: actionError })}
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-xs text-tertiary hover:bg-neutral-100 dark:hover:bg-neutral-700"
                onClick={() => setConfirmPkg(null)}
              >
                {t('settings.webmcpPackages.confirmInstallCancel')}
              </button>
              <button
                type="button"
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                disabled={busyId !== null}
                onClick={() => { void handleInstall(confirmPkg.registry, confirmPkg.pkg) }}
              >
                {busyId ? t('settings.webmcpPackages.installing') : t('settings.webmcpPackages.confirmInstallConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
