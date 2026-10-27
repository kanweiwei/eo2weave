import { create } from 'zustand'
import { buildHostCatalog } from './catalog-normalizer'
import type {
  WebMCPDiscoveredTool,
  WebMCPHostCatalog,
  WebMCPRegisteredTool,
} from './types'

interface WebMCPState {
  enabledByHost: Record<string, boolean>
  catalogByHost: Record<string, WebMCPHostCatalog>
  discoveredTools: WebMCPDiscoveredTool[]
  lastScanAt: number | null

  setHostEnabled: (hostname: string, enabled: boolean) => void
  setAuthorizationMirror: (enabledByHost: Record<string, boolean>) => void
  isHostEnabled: (hostname: string) => boolean
  setDiscoveredTools: (tools: WebMCPDiscoveredTool[], scannedAt: number) => void
  clearCatalog: () => void
  getAllTools: () => WebMCPRegisteredTool[]
  getEnabledTools: () => WebMCPRegisteredTool[]
  getToolByCallName: (fullName: string) => WebMCPRegisteredTool | undefined
}

export const useWebMCPStore = create<WebMCPState>()((set, get) => ({
  enabledByHost: {},
  catalogByHost: {},
  discoveredTools: [],
  lastScanAt: null,

  setHostEnabled: (hostname, enabled) => {
    const normalized = hostname.trim().toLowerCase()
    if (!normalized) return
    set((state) => ({
      enabledByHost: { ...state.enabledByHost, [normalized]: enabled },
    }))
  },

  setAuthorizationMirror: (enabledByHost) => {
    // Extension storage is authoritative. This in-memory copy only lets the
    // settings UI and tool filtering render the current authorization state.
    set({ enabledByHost: { ...enabledByHost } })
  },

  isHostEnabled: (hostname) => {
    const normalized = hostname.trim().toLowerCase()
    if (!normalized) return false
    return get().enabledByHost[normalized] !== false
  },

  setDiscoveredTools: (tools, scannedAt) => {
    set({
      discoveredTools: tools,
      catalogByHost: buildHostCatalog(tools),
      lastScanAt: scannedAt,
    })
  },

  clearCatalog: () => set({
    catalogByHost: {},
    discoveredTools: [],
    lastScanAt: null,
  }),

  getAllTools: () =>
    Object.values(get().catalogByHost).flatMap((host) => host.registeredTools),

  getEnabledTools: () => {
    const state = get()
    return Object.values(state.catalogByHost)
      .filter((host) => state.isHostEnabled(host.hostname))
      .flatMap((host) => host.registeredTools)
  },

  getToolByCallName: (fullName) =>
    get().getEnabledTools().find((tool) => tool.fullName === fullName),
}))
