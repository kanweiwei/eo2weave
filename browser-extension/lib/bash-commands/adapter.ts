import { installCommandProvider, type CommandBridge } from './provider'

export function installAdapterCommand(send: CommandBridge): () => void {
  let disposed = false
  const stop = installCommandProvider({
    manifest: {
      name: 'cw-webmcp-adapter',
      description: 'Validate extension-owned CreatorWeave WebMCP adapter packages without executing workflows.',
      manual: 'cw-webmcp-adapter validate /external/{webmcp|builtin-webmcp}/<package-id>: validate manifest, workflow contracts and schemas. Exit codes: 0 valid, 1 invalid/unreadable, 2 incorrect usage. Workspace-relative paths are not supported; copy packages to the extension mount first.',
    },
    async isAlive() {
      if (disposed) return false
      return (await send('browser_command_ping', {}, 2000))?.ok === true
    },
    async invoke({ args }) {
      if (disposed) return { stdout: '', stderr: 'cw-webmcp-adapter: provider disposed\n', exitCode: 1 }
      if (args.length !== 2 || args[0] !== 'validate') {
        return { stdout: '', stderr: 'Usage: cw-webmcp-adapter validate /external/{webmcp|builtin-webmcp}/<package-id>\n', exitCode: 2 }
      }
      try {
        const response = await send('webmcp_adapter_validate', { directory: args[1] })
        if (!response?.ok) throw new Error(response?.error ?? 'Adapter validation unavailable')
        return { stdout: `Valid WebMCP adapter package: ${response.id}@${response.version} (${response.tools} tools)\n`, stderr: '', exitCode: 0 }
      } catch (error) {
        return { stdout: '', stderr: `cw-webmcp-adapter: ${error instanceof Error ? error.message : String(error)}\n`, exitCode: 1 }
      }
    },
  }, send, () => { disposed = true })
  return stop
}
