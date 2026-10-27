import { isTrustedCreatorWeaveSenderUrl } from '@creatorweave/shared'

type Result = { stdout: string; stderr: string; exitCode: number }
type Command = {
  manifest: { name: string; description: string; manual: string }
  isAlive(): Promise<boolean>
  invoke(input: { args: string[]; stdin: string }): Promise<Result>
}
type Registration = (() => void) & { getStatus?: () => 'current' | 'missing' | 'replaced' }
type API = { registerCommand(command: Command): Registration }
export type CommandBridge = (type: string, payload: Record<string, unknown>, timeout?: number) => Promise<any>

/** The extension owns recovery; Web may discard an unresponsive registration. */
export function installCommandProvider(command: Command, send: CommandBridge, onStop: () => void = () => {}): () => void {
  if (!isTrustedCreatorWeaveSenderUrl(location.href)) return () => {}
  let disposed = false
  let registration: Registration | undefined
  let registeredAPI: API | undefined
  let probing = false
  let cancelProbe: (() => void) | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  const api = () => (window as Window & { creatorWeave?: { bash?: API } }).creatorWeave?.bash
  const register = (target: API) => {
    if (disposed) return
    registration?.()
    registeredAPI = target
    registration = target.registerCommand(command)
  }
  const stop = () => {
    if (disposed) return
    disposed = true
    clearInterval(timer)
    cancelProbe?.()
    window.removeEventListener('creatorweave:bash-ready', check)
    window.removeEventListener('focus', check)
    registration?.()
    registration = undefined
    registeredAPI = undefined
    onStop()
  }
  const check = () => {
    if (disposed) return
    const target = api()
    if (!target) return
    if (!registration) { register(target); return }
    const status = registration.getStatus?.()
    if (status === 'replaced') { stop(); return }
    if (registeredAPI === target && status !== 'missing') return
    if (probing) return
    probing = true
    // Bound waiting, but keep single-flight until the underlying bridge settles.
    let deadline: ReturnType<typeof setTimeout>
    const timeout = new Promise<null>(resolve => {
      deadline = setTimeout(() => resolve(null), 2000)
      cancelProbe = () => { clearTimeout(deadline); resolve(null) }
    })
    const request = Promise.resolve().then(() => disposed ? null : send('browser_command_ping', {}, 2000))
    void request.then(() => { probing = false }, () => { probing = false })
    void Promise.race([request, timeout])
      .then(response => {
        if (disposed) return
        if (response?.errorCode === 'EXTENSION_CONTEXT_INVALIDATED') { stop(); return }
        if (registration?.getStatus?.() === 'replaced') { stop(); return }
        if (response?.ok === true && api() === target &&
            (registeredAPI !== target || registration?.getStatus?.() === 'missing')) register(target)
      }).catch(() => {}).finally(() => {
        clearTimeout(deadline)
        cancelProbe = undefined
      })
  }
  window.addEventListener('creatorweave:bash-ready', check)
  window.addEventListener('focus', check)
  timer = setInterval(check, 5000)
  check()
  return stop
}
