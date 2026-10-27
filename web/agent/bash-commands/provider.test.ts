import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BashCommandRegistry } from './registry'
import { installBrowserCommand } from '../../../browser-extension/lib/bash-commands/browser/provider'
import { installAdapterCommand } from '../../../browser-extension/lib/bash-commands/adapter'
import { installCommandProvider } from '../../../browser-extension/lib/bash-commands/provider'

let registry: BashCommandRegistry
const stops: Array<() => void> = []
const command = {
  manifest: { name: 'browser', description: 'Replacement', manual: 'Replacement' },
  isAlive: async () => true,
  invoke: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('location', { href: 'http://localhost:5173/app' })
  registry = new BashCommandRegistry()
  window.creatorWeave = { bash: { registerCommand: value => registry.registerCommand(value) } }
})
afterEach(() => {
  stops.splice(0).forEach(stop => stop())
  delete window.creatorWeave
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('extension-owned command recovery', () => {
  it.each([
    ['browser', installBrowserCommand],
    ['cw-webmcp-adapter', installAdapterCommand],
  ] as const)('restores %s after Web expiry only when the background is reachable', async (name, install) => {
    let alive = false
    const send = vi.fn(async () => ({ ok: alive }))
    stops.push(install(send))
    expect(registry.snapshot().has(name)).toBe(true)
    await registry.refresh()
    expect(registry.snapshot().has(name)).toBe(false)
    await vi.advanceTimersByTimeAsync(10000)
    expect(registry.snapshot().has(name)).toBe(false)
    alive = true
    await vi.advanceTimersByTimeAsync(5000)
    expect(registry.snapshot().has(name)).toBe(true)
    send.mockClear()
    await vi.advanceTimersByTimeAsync(15000)
    expect(send).not.toHaveBeenCalled()
  })

  it('deduplicates overlapping checks and recovers immediately on focus', async () => {
    let finish!: (value: { ok: boolean }) => void
    const send = vi.fn(() => new Promise<{ ok: boolean }>(resolve => { finish = resolve }))
    stops.push(installBrowserCommand(send))
    const current = registry.snapshot().get('browser')!
    current.isAlive = async () => false
    await registry.refresh()
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('creatorweave:bash-ready'))
    await Promise.resolve()
    expect(send).toHaveBeenCalledTimes(1)
    finish({ ok: true })
    await vi.advanceTimersByTimeAsync(0)
    expect(registry.snapshot().has('browser')).toBe(true)
  })

  it('ignores late success after disposal and clears timers/listeners', async () => {
    let finish!: (value: { ok: boolean }) => void
    const send = vi.fn(() => new Promise<{ ok: boolean }>(resolve => { finish = resolve }))
    const stop = installBrowserCommand(send)
    stops.push(stop)
    registry.snapshot().get('browser')!.isAlive = async () => false
    await registry.refresh()
    window.dispatchEvent(new Event('focus'))
    await Promise.resolve()
    stop()
    expect(vi.getTimerCount()).toBe(0)
    finish({ ok: true })
    await vi.advanceTimersByTimeAsync(10000)
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('creatorweave:bash-ready'))
    expect(send).toHaveBeenCalledTimes(1)
    expect(registry.snapshot().size).toBe(0)
  })

  it('does not reclaim a replacement even if its registration is later removed', async () => {
    const send = vi.fn(async () => ({ ok: true }))
    stops.push(installCommandProvider(command, send))
    const replacement = registry.registerCommand(command)
    await vi.advanceTimersByTimeAsync(5000)
    expect(vi.getTimerCount()).toBe(0)
    replacement()
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('creatorweave:bash-ready'))
    await vi.advanceTimersByTimeAsync(10000)
    expect(registry.snapshot().size).toBe(0)
    expect(send).not.toHaveBeenCalled()
  })

  it('cannot overwrite a replacement installed during recovery', async () => {
    let finish!: (value: { ok: boolean }) => void
    const send = vi.fn(() => new Promise<{ ok: boolean }>(resolve => { finish = resolve }))
    stops.push(installCommandProvider(command, send))
    registry.snapshot().get('browser')!.isAlive = async () => false
    await registry.refresh()
    window.dispatchEvent(new Event('focus'))
    await Promise.resolve()
    const replacement = registry.registerCommand({ ...command, manifest: { ...command.manifest, manual: 'New version' } })
    finish({ ok: true })
    await vi.advanceTimersByTimeAsync(0)
    expect(registry.snapshot().get('browser')!.manifest.manual).toBe('New version')
    expect(vi.getTimerCount()).toBe(0)
    replacement()
  })

  it('disposes old injections without letting their pending probes register again', async () => {
    let finish!: (value: { ok: boolean }) => void
    const oldStop = installBrowserCommand(() => new Promise(resolve => { finish = resolve }))
    registry.snapshot().get('browser')!.isAlive = async () => false
    await registry.refresh()
    window.dispatchEvent(new Event('focus'))
    await Promise.resolve()
    oldStop()
    stops.push(installBrowserCommand(async () => ({ ok: true })))
    const replacement = registry.snapshot().get('browser')
    finish({ ok: true })
    await vi.advanceTimersByTimeAsync(10000)
    expect(registry.snapshot().get('browser')).toBe(replacement)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('keeps only one underlying probe when the bridge never responds', async () => {
    const send = vi.fn(() => new Promise<never>(() => {}))
    const stop = installBrowserCommand(send)
    stops.push(stop)
    registry.snapshot().get('browser')!.isAlive = async () => false
    await registry.refresh()
    await vi.advanceTimersByTimeAsync(30000)
    expect(send).toHaveBeenCalledTimes(1)
    expect(registry.snapshot().size).toBe(0)
    stop()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not revive an expired instance after a newer registration has also disappeared', async () => {
    let finish!: (value: { ok: boolean }) => void
    const send = vi.fn(() => new Promise<{ ok: boolean }>(resolve => { finish = resolve }))
    stops.push(installCommandProvider(command, send))
    registry.snapshot().get('browser')!.isAlive = async () => false
    await registry.refresh()
    window.dispatchEvent(new Event('focus'))
    await Promise.resolve()
    const newer = registry.registerCommand(command)
    newer()
    finish({ ok: true })
    await vi.advanceTimersByTimeAsync(10000)
    expect(registry.snapshot().size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stops recovery when the extension context has been invalidated', async () => {
    const send = vi.fn(async () => ({ ok: false, errorCode: 'EXTENSION_CONTEXT_INVALIDATED' }))
    stops.push(installAdapterCommand(send))
    await registry.refresh()
    await vi.advanceTimersByTimeAsync(15000)
    expect(send).toHaveBeenCalledTimes(2)
    expect(registry.snapshot().size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('waits for page API readiness and rejects untrusted pages', () => {
    delete window.creatorWeave
    stops.push(installBrowserCommand(async () => ({ ok: true })))
    window.creatorWeave = { bash: { registerCommand: value => registry.registerCommand(value) } }
    window.dispatchEvent(new Event('creatorweave:bash-ready'))
    expect(registry.snapshot().has('browser')).toBe(true)
    stops.splice(0).forEach(stop => stop())
    vi.stubGlobal('location', { href: 'https://untrusted.example/' })
    stops.push(installAdapterCommand(async () => ({ ok: true })))
    expect(registry.snapshot().size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})
