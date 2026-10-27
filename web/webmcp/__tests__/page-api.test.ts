import { afterEach, describe, expect, it, vi } from 'vitest'
import { shouldSerializeToolArgs } from '../../../browser-extension/entrypoints/webmcp/call-format'
import { resolveAgentApi } from '../../../browser-extension/entrypoints/webmcp/agent-core'
import { runWebMCPPageProbe } from '../../../browser-extension/entrypoints/webmcp/page-api'

afterEach(() => vi.unstubAllGlobals())

describe('shouldSerializeToolArgs heuristic', () => {
  it.each([
    // [inputSchema, marker, expected serialized?]
    ['serialized string schema', false, true], // legacy native Chromium (5bf782b7)
    [{ type: 'object' }, true, true], // legacy v4 polyfill marker
    ['{}', true, true], // marker wins regardless of schema shape
    [{ type: 'object' }, false, false], // v6 polyfill / current native
    [undefined, false, false],
    [null, false, false],
    [123, false, false],
  ] as const)('inputSchema=%j, marker=%j → serialized=%j', (inputSchema, marker, expected) => {
    expect(shouldSerializeToolArgs(inputSchema, marker)).toBe(expected)
  })
})

describe('WebMCP invocation boundary', () => {
  const tool = { name: 'example', description: 'Example', inputSchema: { type: 'object' } }

  type ContextKind = 'v6-polyfill' | 'native' | 'v4-polyfill' | 'legacy-native'

  function installContext(
    executeTool: ReturnType<typeof vi.fn>,
    kind: ContextKind = 'v6-polyfill',
    tool: Record<string, unknown> = {
      name: 'example', description: 'Example', inputSchema: { type: 'object' },
    },
  ) {
    // Map is a real native constructor; its instances model the native API brand.
    // A JavaScript constructor models the v6 polyfill, even with a bound method.
    const ModelContext = kind === 'native' || kind === 'legacy-native' ? Map : class ModelContext {}
    vi.stubGlobal('ModelContext', ModelContext)
    const modelContext = Object.assign(new ModelContext(), {
      getTools: vi.fn().mockResolvedValue([tool]), executeTool,
      ...(kind === 'v4-polyfill' ? { __isWebMCPPolyfill: true } : {}),
    })
    vi.stubGlobal('document', {
      modelContext,
    })
  }

  it.each([
    { kind: 'v6-polyfill', args: {} },
    { kind: 'v6-polyfill', args: { query: 'test' } },
    { kind: 'native', args: {} },
    { kind: 'native', args: { query: 'test' } },
    { kind: 'v4-polyfill', args: {} },
    { kind: 'v4-polyfill', args: { query: 'test' } },
  ] as const)('uses the correct input boundary once: %j', async ({ kind, args }) => {
    const usesSerializedInput = kind === 'v4-polyfill'
    const executeTool = vi.fn().mockImplementation(async (_tool, input) => {
      if (usesSerializedInput && typeof input !== 'string') throw new Error('Failed to parse input arguments')
      if (!usesSerializedInput && (typeof input !== 'object' || input === null)) {
        throw new Error('Expected input object')
      }
      return { received: usesSerializedInput ? JSON.parse(input) : input }
    })
    installContext(executeTool, kind, tool)

    await expect(resolveAgentApi()!.executeToolByName('example', args)).resolves.toEqual({ received: args })
    expect(await runWebMCPPageProbe({ type: 'invoke', toolName: 'example', args })).toMatchObject({
      ok: true, apiMode: 'documentModelContext', result: { received: args },
    })
    expect(executeTool).toHaveBeenCalledTimes(2)
    for (const call of executeTool.mock.calls) {
      expect(call[0]).toBe(tool)
      expect(call[1]).toEqual(usesSerializedInput ? JSON.stringify(args) : args)
    }
  })

  it('serializes arguments for legacy native contexts with string schemas (PR #80 regression)', async () => {
    // Legacy Chromium: getTools() returns serialized schemas, executeTool
    // expects JSON input, and the context carries NO polyfill marker.
    const stringSchemaTool = {
      name: 'example', description: 'Example',
      inputSchema: JSON.stringify({ type: 'object', properties: { query: { type: 'string' } } }),
    }
    for (const kind of ['legacy-native', 'v4-polyfill'] as const) {
      const executeTool = vi.fn().mockImplementation(async (_tool, input) => {
        if (typeof input !== 'string') throw new DOMException('Failed to parse input arguments', 'UnknownError')
        return { received: JSON.parse(input) }
      })
      installContext(executeTool, kind, stringSchemaTool)

      await expect(resolveAgentApi()!.executeToolByName('example', { query: 'q' })).resolves.toEqual({
        received: { query: 'q' },
      })
      expect(await runWebMCPPageProbe({ type: 'invoke', toolName: 'example', args: { query: 'q' } })).toMatchObject({
        ok: true, result: { received: { query: 'q' } },
      })
      for (const call of executeTool.mock.calls) {
        expect(call[1]).toBe(JSON.stringify({ query: 'q' }))
      }
      expect(executeTool).toHaveBeenCalledTimes(2) // no format-switch retry when the first shot works
    }
  })

  it('skips executeTool for malformed args on the object path and succeeds via the serialized retry', async () => {
    // Local pre-dispatch validation rejects the payload BEFORE any
    // executeTool call, so the malformed first attempt is provably never
    // executed — the serialized retry is the tool's first and only run.
    const objectSchemaNativeTool = {
      name: 'example', description: 'Example',
      inputSchema: { type: 'object' },
    }
    const executeTool = vi.fn().mockResolvedValue({ ok: true })
    installContext(executeTool, 'native', objectSchemaNativeTool)

    await expect(
      resolveAgentApi()!.executeToolByName('example', 'raw-string' as unknown as Record<string, unknown>)
    ).resolves.toEqual({ ok: true })
    expect(executeTool).toHaveBeenCalledTimes(1)
    expect(executeTool).toHaveBeenCalledWith(objectSchemaNativeTool, JSON.stringify('raw-string'))
  })

  it('propagates the serialized retry rejection and never sends the malformed payload', async () => {
    // What this test proves: the original malformed object/number never
    // reaches executeTool (local pre-dispatch validation rewrote it to the
    // serialized form) and the rejection propagates. Whether the tool's
    // handler ran behind the boundary before rejecting is a page-side
    // detail a mock cannot prove, so the claim stops at dispatch shape.
    const objectSchemaNativeTool = {
      name: 'example', description: 'Example',
      inputSchema: { type: 'object' },
    }
    const executeTool = vi.fn().mockRejectedValue(new TypeError('Failed to parse input arguments'))
    installContext(executeTool, 'native', objectSchemaNativeTool)

    await expect(
      resolveAgentApi()!.executeToolByName('example', 42 as unknown as Record<string, unknown>)
    ).rejects.toThrow('inputObject must be an object: number')
    // Exactly ONE dispatch happened and it carried the SERIALIZED form —
    // the malformed payload itself was never passed to executeTool.
    expect(executeTool).toHaveBeenCalledTimes(1)
    expect(executeTool).toHaveBeenCalledWith(objectSchemaNativeTool, JSON.stringify(42))
    for (const call of executeTool.mock.calls) {
      expect(typeof call[1]).toBe('string')
    }
  })

  it('never retries a page-thrown format rejection on the serialized path (tool may have run)', async () => {
    // A page controls both its hint and its error text: even a "read-only"
    // hint cannot prove the tool did not execute before throwing.
    const tool = {
      name: 'example', description: 'Example',
      annotations: { readOnlyHint: true },
    }
    const executeTool = vi.fn().mockRejectedValue(new TypeError('inputObject must be an object'))
    installContext(executeTool, 'v4-polyfill', tool)

    await expect(resolveAgentApi()!.executeToolByName('example', {})).rejects.toThrow(
      'inputObject must be an object'
    )
    expect(executeTool).toHaveBeenCalledTimes(1)
  })

  it('does not retry on the object path when args are already a valid object', async () => {
    const tool = { name: 'example', description: 'Example' }
    const executeTool = vi.fn().mockRejectedValue(new TypeError('inputObject must be an object'))
    installContext(executeTool, 'native', tool)

    await expect(resolveAgentApi()!.executeToolByName('example', { query: 'q' })).rejects.toThrow(
      'inputObject must be an object'
    )
    expect(executeTool).toHaveBeenCalledTimes(1)
  })

  it('does not retry tools on unrelated failures', async () => {
    const tool = { name: 'example', description: 'Example' }
    const executeTool = vi.fn().mockRejectedValue(new Error('Tool internal failure'))
    installContext(executeTool, 'native', tool)

    await expect(resolveAgentApi()!.executeToolByName('example', { query: 'q' })).rejects.toThrow(
      'Tool internal failure'
    )
    expect(executeTool).toHaveBeenCalledTimes(1)
  })

  it('does not mistake a bound v6 method for a native context', async () => {
    const executeTool = vi.fn().mockResolvedValue('done')
    installContext(executeTool)
    const context = (document as any).modelContext
    context.executeTool = executeTool.bind(context)

    await resolveAgentApi()!.executeToolByName('example', { query: 'bound' })
    await runWebMCPPageProbe({ type: 'invoke', toolName: 'example', args: { query: 'bound' } })
    expect(executeTool).toHaveBeenCalledTimes(2)
    expect(executeTool).toHaveBeenLastCalledWith(tool, { query: 'bound' })
  })

  it('propagates execution failure without retrying another argument format', async () => {
    const executeTool = vi.fn().mockRejectedValue(new Error('invalid input object'))
    installContext(executeTool)

    await expect(resolveAgentApi()!.executeToolByName('example', {})).rejects.toThrow('invalid input object')
    expect(executeTool).toHaveBeenCalledTimes(1)
    executeTool.mockClear()
    expect(await runWebMCPPageProbe({ type: 'invoke', toolName: 'example', args: {} })).toMatchObject({
      ok: false, error: 'invalid input object',
    })
    expect(executeTool).toHaveBeenCalledTimes(1)
  })

  it('does not discover or invoke removed navigator APIs', async () => {
    const getTools = vi.fn().mockResolvedValue([tool])
    const executeTool = vi.fn()
    vi.stubGlobal('document', {})
    vi.stubGlobal('navigator', {
      modelContext: { getTools, executeTool },
      modelContextTesting: { listTools: getTools, executeTool },
    })

    expect(resolveAgentApi()).toBeNull()
    expect(await runWebMCPPageProbe({ type: 'discover' })).toEqual({ ok: true, tools: [] })
    expect(await runWebMCPPageProbe({ type: 'invoke', toolName: 'example', args: {} })).toMatchObject({
      ok: false, errorCode: 'WEBMCP_UNAVAILABLE',
    })
    expect(getTools).not.toHaveBeenCalled()
    expect(executeTool).not.toHaveBeenCalled()
  })
})


describe('faithful per-generation boundary mocks (handler-level safety)', () => {
  // A miniature but faithful re-implementation of each known executeTool
  // boundary. The invariant under test: the REGISTERED HANDLER (the tool
  // body) runs at most once, and never with a format its generation does
  // not accept — regardless of what the wrapper is given.

  type Kind = 'v6-polyfill' | 'v4-polyfill' | 'legacy-native' | 'current-native'

  function makeBoundary(kind: Kind) {
    const handler = vi.fn(async (parsed: Record<string, unknown>) => ({ ran: true, parsed }))
    const stringSchema = '{"type":"object"}'
    const tool: Record<string, unknown> =
      kind === 'legacy-native'
        ? { name: 'example', description: 'Example', inputSchema: stringSchema }
        : { name: 'example', description: 'Example', inputSchema: { type: 'object' } }

    const executeTool = vi.fn(async (_tool: unknown, input: unknown) => {
      switch (kind) {
        case 'v6-polyfill':
          // dist/index.js validates isObject synchronously BEFORE dispatch.
          if (input === null || typeof input !== 'object') {
            throw new TypeError('inputObject must be an object')
          }
          return handler(input as Record<string, unknown>)
        case 'v4-polyfill':
          // JSON.parse gate: non-strings (or bad JSON) fail before dispatch.
          if (typeof input !== 'string') throw new Error('Failed to parse input arguments')
          return handler(JSON.parse(input) as Record<string, unknown>)
        case 'legacy-native':
          // 5bf782b7: serialized schemas, string-only input, NO marker.
          if (typeof input !== 'string') throw new TypeError('inputObject must be an object')
          return handler(JSON.parse(input) as Record<string, unknown>)
        case 'current-native':
          if (input === null || typeof input !== 'object') {
            throw new TypeError('inputObject must be an object')
          }
          return handler(input as Record<string, unknown>)
      }
    })

    const ModelContext = kind === 'legacy-native' || kind === 'current-native' ? Map : class {}
    const context = Object.assign(new (ModelContext as any)(), {
      getTools: vi.fn().mockResolvedValue([tool]),
      executeTool,
      ...(kind === 'v4-polyfill' ? { __isWebMCPPolyfill: true } : {}),
    })
    vi.stubGlobal('ModelContext', ModelContext)
    vi.stubGlobal('document', { modelContext: context })
    return { handler, executeTool, tool }
  }

  const CASES = [
    { args: { query: 'q' }, label: 'object args' },
    { args: 'raw-string', label: 'string args' },
    { args: 42, label: 'number args' },
    { args: null, label: 'null args' },
  ] as const

  it.each(CASES.map((c) => [c.label, c.args] as const))(
    'v6 polyfill: %s → handler at most once, object format only',
    async (_label, args) => {
      const { handler, executeTool } = makeBoundary('v6-polyfill')
      try {
        await resolveAgentApi()!.executeToolByName('example', args as Record<string, unknown>)
      } catch { /* rejection is fine — the invariant is below */ }
      expect(handler.mock.calls.length).toBeLessThanOrEqual(1)
      for (const [received] of handler.mock.calls) {
        expect(received).toEqual(args ?? {}) // null normalizes to {} before the boundary // v6 passes objects through verbatim
      }
      if (args !== null && typeof args === 'object') {
        expect(executeTool).toHaveBeenCalledWith(expect.anything(), args)
      } else {
        // malformed payloads never reach the boundary raw
        for (const call of executeTool.mock.calls) expect(call[1]).not.toBe(args)
      }
    },
  )

  it.each(CASES.map((c) => [c.label, c.args] as const))(
    'v4 polyfill: %s → handler at most once, parsed-object format only',
    async (_label, args) => {
      const { handler, executeTool } = makeBoundary('v4-polyfill')
      try {
        await resolveAgentApi()!.executeToolByName('example', args as Record<string, unknown>)
      } catch { /* rejection is fine */ }
      expect(handler.mock.calls.length).toBeLessThanOrEqual(1)
      for (const [received] of handler.mock.calls) {
        expect(received).toEqual(args ?? {}) // null normalizes to {} before the boundary // v4 JSON.parses before invoking
      }
      for (const call of executeTool.mock.calls) expect(typeof call[1]).toBe('string')
    },
  )

  it.each(CASES.map((c) => [c.label, c.args] as const))(
    'legacy native (string schema, no marker): %s → handler at most once, serialized input only',
    async (_label, args) => {
      const { handler, executeTool } = makeBoundary('legacy-native')
      try {
        await resolveAgentApi()!.executeToolByName('example', args as Record<string, unknown>)
      } catch { /* rejection is fine */ }
      expect(handler.mock.calls.length).toBeLessThanOrEqual(1)
      for (const [received] of handler.mock.calls) {
        expect(received).toEqual(args ?? {}) // null normalizes to {} before the boundary
      }
      for (const call of executeTool.mock.calls) expect(typeof call[1]).toBe('string')
    },
  )

  it.each(CASES.map((c) => [c.label, c.args] as const))(
    'current native: %s → handler at most once, object format only',
    async (_label, args) => {
      const { handler, executeTool: _executeTool } = makeBoundary('current-native')
      try {
        await resolveAgentApi()!.executeToolByName('example', args as Record<string, unknown>)
      } catch { /* rejection is fine */ }
      expect(handler.mock.calls.length).toBeLessThanOrEqual(1)
      for (const [received] of handler.mock.calls) {
        expect(received).toEqual(args ?? {}) // null normalizes to {} before the boundary
      }
    },
  )
})
