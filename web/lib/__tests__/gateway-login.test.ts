import { beforeEach, describe, expect, it, vi } from 'vitest'

const { provider, keyStore, settings } = vi.hoisted(() => ({
  provider: {
    update: vi.fn<() => Promise<Array<{ id: string; name: string }>>>(),
    prepare: vi.fn<() => Promise<Array<{ id: string; name: string }>>>(),
    register: vi.fn(),
  },
  keyStore: {
    save: vi.fn<(id: string, key: string) => Promise<void>>(),
    load: vi.fn<(id: string) => Promise<string | null>>(),
    delete: vi.fn<(id: string) => Promise<void>>(),
  },
  settings: {
    modelName: 'old-model',
    pinnedModelsByProvider: { 'llm-gateway': ['old-model'] },
    invalidateApiKeyCache: vi.fn(),
    switchProviderAndModel: vi.fn(),
    setHasApiKey: vi.fn(),
    setModelCredentialStatus: vi.fn(),
    triggerProviderRefresh: vi.fn(),
  },
}))

vi.mock('@/agent/providers/llm-gateway-provider', () => ({
  getLLMGatewayBaseURL: () => 'https://gateway.example',
  getLLMGatewayClientId: () => 'client',
  getLLMGatewayApiKeyProviderKey: () => 'gateway-key',
  LLM_GATEWAY_PROVIDER_TYPE: 'llm-gateway',
  updateGatewayModels: provider.update,
  prepareGatewayModels: provider.prepare,
  registerGatewayModels: provider.register,
}))
vi.mock('@/security/api-key-store', () => ({
  saveApiKey: keyStore.save,
  loadApiKey: keyStore.load,
  deleteApiKey: keyStore.delete,
}))
vi.mock('@/store/settings.store', () => ({
  useSettingsStore: { getState: () => settings },
}))

import { applyGatewayLoginTokens } from '@/lib/gateway-login'

import {
  __resetGatewayCredentialFencingForTests,
} from '@/agent/providers/gateway-credential-lock'

describe('applyGatewayLoginTokens cancellation', () => {
  let savedKey: string | null

  beforeEach(() => {
    vi.clearAllMocks()
    __resetGatewayCredentialFencingForTests()
    savedKey = 'previous-key'
    keyStore.load.mockImplementation(async () => savedKey)
    keyStore.save.mockImplementation(async (_id, key) => { savedKey = key })
    keyStore.delete.mockImplementation(async () => { savedKey = null })
    provider.update.mockResolvedValue([{ id: 'new-model', name: 'New' }])
    provider.prepare.mockResolvedValue([{ id: 'new-model', name: 'New' }])
  })

  it('does not persist a credential when cancelled during model preparation', async () => {
    // The abort must land while preparation is IN FLIGHT: wait until
    // provider.prepare has been invoked and its promise is still pending,
    // then cancel. Aborting before the awaited import reaches prepare would
    // pass trivially even if cancellation mid-preparation were mishandled.
    let finish!: (models: Array<{ id: string; name: string }>) => void
    const models = new Promise<Array<{ id: string; name: string }>>((resolve) => { finish = resolve })
    provider.update.mockReturnValue(models)
    provider.prepare.mockReturnValue(models)
    const controller = new AbortController()
    const commit = vi.fn()
    const pending = applyGatewayLoginTokens('new-key', { signal: controller.signal, onCommit: commit })
    // Preparation started and is pending → NOW the cancellation is mid-flight.
    await vi.waitFor(() => expect(provider.prepare).toHaveBeenCalledTimes(1))
    controller.abort()
    finish([{ id: 'new-model', name: 'New' }])
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(savedKey).toBe('previous-key')
    expect(keyStore.save).not.toHaveBeenCalled()
    expect(settings.switchProviderAndModel).not.toHaveBeenCalled()
    expect(commit).not.toHaveBeenCalled()
  })

  it('restores the previous credential if cancellation happens during its save', async () => {
    let release!: () => void
    keyStore.save.mockImplementationOnce(async (_id, key) => {
      await new Promise<void>((resolve) => { release = resolve })
      savedKey = key
    })
    const controller = new AbortController()
    const commit = vi.fn()
    const pending = applyGatewayLoginTokens('new-key', { signal: controller.signal, onCommit: commit })
    await vi.waitFor(() => expect(keyStore.save).toHaveBeenCalledTimes(1))
    controller.abort()
    release()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(savedKey).toBe('previous-key')
    expect(settings.switchProviderAndModel).not.toHaveBeenCalled()
    expect(commit).not.toHaveBeenCalled()
  })

  it('does NOT roll back when another tab already saved a newer credential', async () => {
    // Cross-tab race: THIS attempt's save commits, then it is cancelled.
    // Before its rollback check runs, ANOTHER tab's login saves a different
    // (newer) key. The rollback must leave that newer credential alone —
    // restoring our older key would leave the other tab "successful" while
    // its token pair and saved credential disagree.
    let release!: () => void
    keyStore.save.mockImplementationOnce(async () => {
      // The hung save writes NOTHING on release — the newer credential is
      // already the store's content, so the rollback CAS must skip.
      await new Promise<void>((resolve) => { release = resolve })
    })
    const controller = new AbortController()
    const pending = applyGatewayLoginTokens('new-key', { signal: controller.signal })
    await vi.waitFor(() => expect(keyStore.save).toHaveBeenCalledTimes(1))
    controller.abort()
    // Another tab commits a newer credential now (the store's content), and
    // the cancelled attempt's save resolves WITHOUT writing.
    savedKey = 'other-tab-newer-key'
    release()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    // The newer credential survived; no restore/delete ran after it.
    expect(savedKey).toBe('other-tab-newer-key')
    expect(keyStore.save).toHaveBeenCalledTimes(1)
    expect(keyStore.delete).not.toHaveBeenCalled()
  })

  it('does not roll back a newer login committed by another tab', async () => {
    vi.resetModules()
    const firstTab = await import('@/lib/gateway-login')
    vi.resetModules()
    const secondTab = await import('@/lib/gateway-login')
    let finishFirstSave!: () => void
    keyStore.save.mockImplementationOnce(async (_id, key) => {
      await new Promise<void>((resolve) => { finishFirstSave = resolve })
      savedKey = key
    })
    const controller = new AbortController()
    const first = firstTab.applyGatewayLoginTokens('cancelled-key', { signal: controller.signal })
    await vi.waitFor(() => expect(keyStore.save).toHaveBeenCalledTimes(1))
    controller.abort()
    const second = secondTab.applyGatewayLoginTokens('newer-key')
    await vi.waitFor(() => expect(provider.prepare).toHaveBeenCalledTimes(2))
    await Promise.resolve()
    expect(keyStore.save).toHaveBeenCalledTimes(1)
    finishFirstSave()
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    await expect(second).resolves.toMatchObject({ ok: true })
    expect(savedKey).toBe('newer-key')
  })

  it('rejects before writing when cross-tab credential locking is unavailable', async () => {
    const realLocks = navigator.locks
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
    try {
      await expect(applyGatewayLoginTokens('new-key')).rejects.toThrow(/Web Locks are required/)
      expect(savedKey).toBe('previous-key')
      expect(keyStore.save).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(navigator, 'locks', { configurable: true, value: realLocks })
    }
  })

  it('refuses a STALE save that lands after a newer credential commit (fenced at the mutation point)', async () => {
    // Round-20: a bounded key-store op can stay pending past the registry
    // TTL/quiescence cap while ANOTHER tab commits a newer credential. The
    // stale save must be refused AT ITS LANDING POINT (after the underlying
    // write resolved) — the dispatch-time check ran before that commit even
    // existed — and the login must NOT report success or commit settings.
    // The CAS rollback leaves the newer credential untouched.
    let releaseSave!: () => void
    keyStore.save.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => { releaseSave = resolve })
      // Writes NOTHING on release — the newer credential is already the
      // store's content (the other tab committed while this op was
      // pending).
    })
    const pending = applyGatewayLoginTokens('stale-key')
    await vi.waitFor(() => expect(keyStore.save).toHaveBeenCalledTimes(1))
    // Another tab commits a NEWER credential while this save is pending…
    savedKey = 'newer-tab-key'
    // …which bumps the shared commit sequence, fencing every op registered
    // before it (exactly what withGatewayCredentialLock does per commit —
    // the login's own lock grant already stamped seq=1, so a newer commit
    // is seq=2).
    localStorage.setItem('eo2weave-gateway-credential-commit-seq', '2')
    releaseSave()

    // The landing-point fence throws; the login must NOT report success.
    await expect(pending).rejects.toThrow(/key-store op fenced/)
    // The newer credential survives; no restore/delete ran after it.
    expect(savedKey).toBe('newer-tab-key')
    expect(keyStore.delete).not.toHaveBeenCalled()
    expect(settings.switchProviderAndModel).not.toHaveBeenCalled()
    expect(settings.setHasApiKey).not.toHaveBeenCalled()
  })

  it('commits normally when no newer credential commit landed (fence inert)', async () => {
    // The landing-point fence must not break the happy path: a save that
    // lands with the commit sequence unchanged (no concurrent commit) still
    // succeeds and completes the login.
    const pending = applyGatewayLoginTokens('fresh-key')
    await expect(pending).resolves.toMatchObject({ ok: true })
    expect(savedKey).toBe('fresh-key')
    expect(settings.setHasApiKey).toHaveBeenCalledWith(true)
  })
})
