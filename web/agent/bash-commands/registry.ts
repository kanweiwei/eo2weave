/** Public, page-context contract. Extensions own all communication inside invoke. */
export interface BashCommandManifest {
  name: string
  description: string
  manual: string
}

export interface BashCommandInput {
  args: string[]
  stdin: string
}

export interface BashCommandResult {
  stdout: string
  stderr: string
  exitCode: number
}

export interface ExternalBashCommand {
  manifest: BashCommandManifest
  invoke(input: BashCommandInput): Promise<BashCommandResult>
  /** Probe the extension connection, not merely the injected page object. */
  isAlive(): Promise<boolean>
}

export type RegistrationStatus = 'current' | 'missing' | 'replaced'

/** Callable for compatibility with existing providers. Holds no provider reference. */
export interface CommandRegistration {
  (): void
  getStatus(): RegistrationStatus
}

type RegistrationState = { status: RegistrationStatus }

export class BashCommandRegistry {
  private commands = new Map<string, ExternalBashCommand & { registrationState: RegistrationState }>()
  // Weak metadata invalidates even expired handles when a newer provider registers.
  // Finalization removes names whose handles and providers have both been released.
  private registrations = new Map<string, WeakRef<RegistrationState>>()
  private finalized = new FinalizationRegistry<{ name: string; ref: WeakRef<RegistrationState> }>(({ name, ref }) => {
    if (this.registrations.get(name) === ref) this.registrations.delete(name)
  })
  private probes = new WeakMap<ExternalBashCommand, Promise<boolean>>()

  constructor(private probeTimeoutMs = 3000) {}

  registerCommand(command: ExternalBashCommand): CommandRegistration {
    const manifest = command?.manifest
    if (!manifest || typeof manifest.name !== 'string' || !/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/.test(manifest.name) ||
        typeof manifest.description !== 'string' || typeof manifest.manual !== 'string' ||
        typeof command.invoke !== 'function' || typeof command.isAlive !== 'function') {
      throw new TypeError('Invalid bash command: expected manifest { name, description, manual } and invoke/isAlive')
    }
    // Copy the declaration and bind invoke to preserve the extension's own state.
    const state: RegistrationState = { status: 'current' }
    const name = manifest.name
    const entry = {
      registrationState: state,
      manifest: { ...manifest },
      invoke: command.invoke.bind(command),
      isAlive: command.isAlive.bind(command),
    }
    const previous = this.registrations.get(name)?.deref()
    if (previous) previous.status = 'replaced'
    const ref = new WeakRef(state)
    this.registrations.set(name, ref)
    this.finalized.register(state, { name, ref }, state)
    this.commands.set(name, entry)
    return this.handle(name, state)
  }

  private handle(name: string, state: RegistrationState): CommandRegistration {
    return Object.assign(() => {
      if (this.commands.get(name)?.registrationState === state) this.commands.delete(name)
      state.status = 'replaced'
      if (this.registrations.get(name)?.deref() === state) this.registrations.delete(name)
      this.finalized.unregister(state)
    }, {
      getStatus: () => {
        const current = this.commands.get(name)
        if (current && current.registrationState !== state) state.status = 'replaced'
        return state.status
      },
    })
  }

  /** Web owns expiry: missing, rejected or timed-out probes remove the command. */
  checkAlive(command: ExternalBashCommand): Promise<boolean> {
    const existing = this.probes.get(command)
    if (existing) return existing
    const probe = new Promise<boolean>(resolve => {
      let settled = false
      const finish = (alive: boolean) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (!alive && this.commands.get(command.manifest.name) === command) {
          this.commands.get(command.manifest.name)!.registrationState.status = 'missing'
          this.commands.delete(command.manifest.name)
        }
        resolve(alive)
      }
      const timer = setTimeout(() => finish(false), this.probeTimeoutMs)
      Promise.resolve().then(() => command.isAlive()).then(
        alive => finish(alive === true),
        () => finish(false),
      )
    }).finally(() => { this.probes.delete(command) })
    this.probes.set(command, probe)
    return probe
  }

  async refresh(): Promise<void> {
    await Promise.all(Array.from(this.commands.values(), command => this.checkAlive(command)))
  }

  snapshot(): Map<string, ExternalBashCommand> {
    return new Map(this.commands)
  }

  describe(): string {
    return Array.from(this.commands.values(), ({ manifest }) =>
      `Command: ${manifest.name}\nDescription: ${manifest.description}\nManual:\n${manifest.manual}`,
    ).join('\n\n')
  }
}

export const bashCommandRegistry = new BashCommandRegistry()
