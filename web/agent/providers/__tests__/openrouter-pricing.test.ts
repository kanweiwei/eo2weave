import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import rawSnapshot from '@/data/openrouter-models.json'

/**
 * A dataset containing a model that exists in NO bundled snapshot
 * (simulates a model released after the snapshot was taken).
 */
const MARKER_ID = 'test-only/brand-new-model'
const MARKER_BARE = 'brand-new-model'
const FRESH_DATASET = {
  data: [
    {
      id: MARKER_ID,
      pricing: { prompt: '0.00000015', completion: '0.0000006', input_cache_read: '0.000000015' },
      context_length: 1048576,
      architecture: { input_modalities: ['text', 'image'] },
    },
    {
      id: 'vendor/example-model',
      pricing: { prompt: '0.000001', completion: '0.000002' },
      context_length: 128000,
      architecture: { input_modalities: ['text'] },
    },
  ],
}

const JSON_HEADERS = { get: () => 'application/json' }

const LIVE_OK_RESPONSE = {
  ok: true,
  headers: JSON_HEADERS,
  json: () => Promise.resolve(FRESH_DATASET),
} as Response

const FETCHED_AT_KEY = 'cw.openrouter-models.fetchedAt'

/**
 * The pricing module keeps its model index in module-level state. Reset the
 * registry and re-import per test so every test starts from the bundled
 * snapshot instead of an index swapped by a previous test.
 */
async function loadMod() {
  return await import('../openrouter-pricing')
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('bundled snapshot (bootstrap fallback)', () => {
  it('resolves pricing from the snapshot', async () => {
    const mod = await loadMod()
    expect(mod.getOpenRouterPricing('z-ai/glm-5.3')).not.toBeNull()
  })

  it('covers deepseek-v4.1-flash (regression: snapshot had lagged upstream)', async () => {
    const mod = await loadMod()
    expect(mod.getOpenRouterPricing('deepseek/deepseek-v4.1-flash')).toEqual({
      input: 0.3,
      output: 1.2,
      cacheRead: 0.006,
    })
    expect(mod.getOpenRouterContextWindow('deepseek/deepseek-v4.1-flash')).toBe(1048576)
    expect(mod.getOpenRouterInputModalities('deepseek/deepseek-v4.1-flash')).toContain('image')
  })

  it('is case-insensitive and strips vendor prefixes', async () => {
    const mod = await loadMod()
    expect(mod.getOpenRouterPricing('DeepSeek/DeepSeek-V4.1-Flash')).not.toBeNull()
  })

  it('stays null for genuinely unknown models', async () => {
    const mod = await loadMod()
    expect(mod.getOpenRouterPricing('totally-nonexistent-model-xyz')).toBeNull()
    expect(mod.getOpenRouterContextWindow('totally-nonexistent-model-xyz')).toBeNull()
    expect(mod.getOpenRouterInputModalities('totally-nonexistent-model-xyz')).toBeNull()
  })
})

describe('refreshOpenRouterModelsNow (runtime overlay)', () => {
  it('replaces the in-memory index with the fetched dataset', async () => {
    const mod = await loadMod()
    expect(mod.getOpenRouterPricing(MARKER_ID)).toBeNull()

    const fetchMock = vi.fn().mockResolvedValue(LIVE_OK_RESPONSE)
    vi.stubGlobal('fetch', fetchMock)
    const swapped = await mod.refreshOpenRouterModelsNow()

    expect(swapped).toBe(true)
    // Bounded like every other provider fetch — a hung gateway must not
    // pin the daily refresh window or spin the manual button forever.
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(mod.getOpenRouterPricing(MARKER_ID)).toEqual({
      input: 0.15,
      output: 0.6,
      cacheRead: 0.015,
    })
    // Bare-name lookup keeps working for refreshed ids.
    expect(mod.getOpenRouterPricing(MARKER_BARE)).not.toBeNull()
    expect(mod.getOpenRouterContextWindow(MARKER_ID)).toBe(1048576)
    expect(mod.getOpenRouterInputModalities(MARKER_ID)).toEqual(['text', 'image'])
  })

  it('shares a single in-flight fetch between concurrent callers', async () => {
    const mod = await loadMod()
    let resolveFetch!: (v: Response) => void
    const fetchMock = vi.fn().mockImplementation(
      () => new Promise<Response>((resolve) => {
        resolveFetch = resolve
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const first = mod.refreshOpenRouterModelsNow()
    const second = mod.refreshOpenRouterModelsNow()

    resolveFetch(LIVE_OK_RESPONSE)
    const [a, b] = await Promise.all([first, second])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(a).toBe(true)
    expect(b).toBe(true)
  })

  it('clears the in-flight slot on failure so it can be retried at once', async () => {
    const mod = await loadMod()
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(LIVE_OK_RESPONSE)
    vi.stubGlobal('fetch', fetchMock)

    expect(await mod.refreshOpenRouterModelsNow()).toBe(false)
    expect(await mod.refreshOpenRouterModelsNow()).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('rejects non-JSON content-type before parsing', async () => {
    const mod = await loadMod()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'text/html' },
        json: () => Promise.resolve(FRESH_DATASET),
      } as unknown as Response),
    )

    const swapped = await mod.refreshOpenRouterModelsNow()

    expect(swapped).toBe(false)
    expect(mod.getOpenRouterPricing(MARKER_ID)).toBeNull()
    expect(mod.getOpenRouterPricing('z-ai/glm-5.3')).not.toBeNull()
    expect(localStorage.getItem(FETCHED_AT_KEY)).toBeNull()
  })

  it('persists the throttle timestamp after a successful refresh', async () => {
    const mod = await loadMod()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(LIVE_OK_RESPONSE))

    await mod.refreshOpenRouterModelsNow()

    expect(Number(localStorage.getItem(FETCHED_AT_KEY))).toBeGreaterThan(0)
  })

  it('keeps the current dataset when the endpoint fails', async () => {
    const mod = await loadMod()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const swapped = await mod.refreshOpenRouterModelsNow()

    expect(swapped).toBe(false)
    expect(mod.getOpenRouterPricing('z-ai/glm-5.3')).not.toBeNull()
    expect(mod.getOpenRouterPricing(MARKER_ID)).toBeNull()
    expect(localStorage.getItem(FETCHED_AT_KEY)).toBeNull()
  })

  it('keeps the current dataset when the payload is degenerate', async () => {
    const mod = await loadMod()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: JSON_HEADERS,
        json: () => Promise.resolve({ data: [] }),
      } as Response),
    )

    const swapped = await mod.refreshOpenRouterModelsNow()

    expect(swapped).toBe(false)
    expect(mod.getOpenRouterPricing('z-ai/glm-5.3')).not.toBeNull()
    expect(localStorage.getItem(FETCHED_AT_KEY)).toBeNull()
  })

  it('keeps the current dataset on a non-2xx response', async () => {
    const mod = await loadMod()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response))

    const swapped = await mod.refreshOpenRouterModelsNow()

    expect(swapped).toBe(false)
    expect(mod.getOpenRouterPricing('z-ai/glm-5.3')).not.toBeNull()
  })
})

describe('maybeRefreshOpenRouterModels (daily throttle)', () => {
  it('fetches when the stored timestamp is older than 24h', async () => {
    const mod = await loadMod()
    localStorage.setItem(FETCHED_AT_KEY, String(Date.now() - 25 * 60 * 60 * 1000))
    const fetchMock = vi.fn().mockResolvedValue(LIVE_OK_RESPONSE)
    vi.stubGlobal('fetch', fetchMock)

    mod.maybeRefreshOpenRouterModels()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })

  it('does not fetch within the 24h window', async () => {
    const mod = await loadMod()
    localStorage.setItem(FETCHED_AT_KEY, String(Date.now() - 1 * 60 * 60 * 1000))
    const fetchMock = vi.fn().mockResolvedValue(LIVE_OK_RESPONSE)
    vi.stubGlobal('fetch', fetchMock)

    mod.maybeRefreshOpenRouterModels()
    await new Promise((r) => setTimeout(r, 0))

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('treats a missing timestamp as due for refresh', async () => {
    const mod = await loadMod()
    const fetchMock = vi.fn().mockResolvedValue(LIVE_OK_RESPONSE)
    vi.stubGlobal('fetch', fetchMock)

    mod.maybeRefreshOpenRouterModels()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })

  it('never throws to the caller, even when the fetch rejects', async () => {
    const mod = await loadMod()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    expect(() => mod.maybeRefreshOpenRouterModels()).not.toThrow()
    // Let the fire-and-forget promise settle so nothing dangles into teardown.
    await new Promise((r) => setTimeout(r, 0))
  })
})

describe('snapshot integrity (guards against a broken refresh bundle)', () => {
  it('bundled snapshot parses with a non-empty model list', () => {
    const shape = rawSnapshot as { data?: unknown[] }
    expect(Array.isArray(shape.data)).toBe(true)
    expect(shape.data!.length).toBeGreaterThan(100)
  })

  it('bundled snapshot contains deepseek-v4.1-flash', () => {
    const shape = rawSnapshot as { data?: Array<{ id: string }> }
    expect(shape.data!.some((m) => m.id === 'deepseek/deepseek-v4.1-flash')).toBe(true)
  })
})
