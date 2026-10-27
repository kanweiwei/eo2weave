import { afterEach, describe, expect, it, vi } from 'vitest'
import { validateAdapterDirectory } from '../../../browser-extension/entrypoints/webmcp/adapter-validation'
import { installAdapterCommand } from '../../../browser-extension/lib/bash-commands/adapter'
import { BashCommandRegistry } from '@/agent/bash-commands/registry'
import { manifest, source } from './fixtures'

const mounts = () => [{
  name: 'webmcp', readOnly: false,
  files: {
    directories: async () => [manifest.id],
    readFile: vi.fn(async (path: string) => {
      if (path === `${manifest.id}/manifest.json`) return JSON.stringify(manifest)
      if (path === `${manifest.id}/read-title.js`) return source
      throw new Error(`File not found: ${path}`)
    }),
  },
}]
afterEach(() => { delete window.creatorWeave; vi.unstubAllGlobals() })

describe('extension adapter validation command', () => {
  it('validates the extension package and reports shell exit codes through the registered provider', async () => {
    vi.stubGlobal('location', { href: 'http://localhost:5173/app' })
    const registry = new BashCommandRegistry()
    window.creatorWeave = { bash: { registerCommand: command => registry.registerCommand(command) } }
    const files = mounts()
    const send = vi.fn(async (type: string, payload: Record<string, unknown>) => {
      if (type === 'browser_command_ping') return { ok: true }
      expect(type).toBe('webmcp_adapter_validate')
      try { return { ok: true, ...await validateAdapterDirectory(payload.directory, files) } }
      catch (error) { return { ok: false, error: String(error) } }
    })
    const stop = installAdapterCommand(send)
    try {
      expect(registry.snapshot().has('webmcp')).toBe(false)
      const command = registry.snapshot().get('cw-webmcp-adapter')!
      expect(command.manifest.manual).toContain('validate')
      const invoke = (args: string[]) => command.invoke({ args, stdin: '' })
      expect(await invoke(['validate', `/external/webmcp/${manifest.id}`])).toMatchObject({ exitCode: 0, stderr: '', stdout: expect.stringContaining('com.example.tools@1.0.0') })
      expect(await invoke([])).toMatchObject({ exitCode: 2 })
      expect(await invoke(['validate', '/workspace/package'])).toMatchObject({ exitCode: 1, stderr: expect.stringContaining('Expected /external/') })
      files[0].files.readFile.mockResolvedValue('invalid')
      expect(await invoke(['validate', `/external/webmcp/${manifest.id}`])).toMatchObject({ exitCode: 1 })
    } finally { stop() }
  })

  it.each(['/workspace/pkg', 'com.example.tools', '/external/webmcp/../pkg', '/external/webmcp/..', '/external/extension-skills/pkg', '/external/webmcp/pkg/nested'])('rejects unsupported paths before reading: %s', async path => {
    const files = mounts()
    await expect(validateAdapterDirectory(path, files)).rejects.toThrow('Expected /external/')
    expect(files[0].files.readFile).not.toHaveBeenCalled()
  })

  it('supports the read-only builtin mount and trailing slashes', async () => {
    const files = mounts()
    files[0].name = 'builtin-webmcp'
    await expect(validateAdapterDirectory(`/external/builtin-webmcp/${manifest.id}/`, files)).resolves.toMatchObject({ id: manifest.id, tools: 1 })
  })
})
