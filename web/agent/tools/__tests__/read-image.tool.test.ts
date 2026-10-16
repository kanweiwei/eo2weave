import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '../tool-types'
import { readImageDefinition, readImageExecutor } from '../read-image.tool'
import { buildChatCompletionsPayload, CW_OPENAI_FETCH_API } from '../../llm/pi-ai-custom-openai-fetch'

const resolveVfsTargetMock = vi.fn()
const fileToBase64Mock = vi.fn()
const performOcrMock = vi.fn()
const isOcrCompatibleImageMock = vi.fn()

vi.mock('../vfs-resolver', () => ({
  resolveVfsTarget: (...args: unknown[]) => resolveVfsTargetMock(...args),
}))
vi.mock('../agent-file-protection', () => ({
  isSubagentPermissionDenied: () => false,
  SUBAGENT_PERMISSION_DENIED: 'SUBAGENT_PERMISSION_DENIED',
}))
vi.mock('@/services/ocr.service', () => ({
  fileToBase64: (...args: unknown[]) => fileToBase64Mock(...args),
  performOcr: (...args: unknown[]) => performOcrMock(...args),
  isOcrCompatibleImage: (...args: unknown[]) => isOcrCompatibleImageMock(...args),
}))

function makeContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    directoryHandle: null,
    workspaceId: 'workspace-1',
    projectId: 'project-1',
    provider: { getModel: () => ({ input: ['text', 'image'] }) } as never,
    ...overrides,
  }
}

function mockImageTarget() {
  resolveVfsTargetMock.mockResolvedValue({
    kind: 'workspace',
    path: 'photos/chart.png',
    backend: {
      readFile: vi.fn().mockResolvedValue({
        content: new Uint8Array([137, 80, 78, 71]),
        mimeType: 'image/png',
      }),
    },
  })
}

describe('read_image tool', () => {
  beforeEach(() => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({
      width: 1,
      height: 1,
      close: vi.fn(),
    }))

    resolveVfsTargetMock.mockReset()
    fileToBase64Mock.mockReset()
    performOcrMock.mockReset()
    isOcrCompatibleImageMock.mockReset()
    isOcrCompatibleImageMock.mockReturnValue(true)
    fileToBase64Mock.mockResolvedValue('aW1hZ2U=')
    performOcrMock.mockResolvedValue({
      text: 'recognized text',
      base64Data: 'aW1hZ2U=',
      mimeType: 'image/png',
      status: 'done',
    })
    mockImageTarget()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('declares path as the only required input', () => {
    expect(readImageDefinition.function.parameters.required).toEqual(['path'])
  })

  it('returns vision content parts directly in the tool result', async () => {
    const raw = await readImageExecutor({ path: 'photos/chart.png' }, makeContext())
    const result = JSON.parse(raw)

    expect(result.ok).toBe(true)
    expect(result.data).toEqual(expect.objectContaining({ mode: 'vision', ocrStatus: 'not_needed' }))
    expect(result.contentParts).toEqual([
      expect.objectContaining({ type: 'text' }),
      { type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' },
    ])
    expect(performOcrMock).not.toHaveBeenCalled()
  })

  it('sends the image as a tool result in the provider request', async () => {
    const onReadImageSuccess = vi.fn(() => true)
    const model = {
      id: 'vision-test', api: CW_OPENAI_FETCH_API, provider: 'test',
      baseUrl: 'https://example.test/v1', input: ['text', 'image'], reasoning: false,
    } as never
    const raw = await readImageExecutor({ path: 'photos/chart.png' }, makeContext({
      provider: { getModel: () => model } as never,
      onReadImageSuccess,
    }))
    const result = JSON.parse(raw)
    expect(result.ok).toBe(true)
    expect(onReadImageSuccess).not.toHaveBeenCalled()

    const payload = buildChatCompletionsPayload(model, {
      systemPrompt: 'Test',
      messages: [
        { role: 'assistant', content: [{ type: 'toolCall', id: 'call_image', name: 'read_image', arguments: { path: 'photos/chart.png' } }] },
        { role: 'toolResult', toolCallId: 'call_image', toolName: 'read_image', content: result.contentParts, isError: false },
      ],
      tools: [],
    } as never)
    expect(payload.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'tool', tool_call_id: 'call_image', name: 'read_image',
        content: expect.arrayContaining([
          { type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } },
          expect.objectContaining({ type: 'text', text: expect.stringContaining('photos/chart.png') }),
        ]),
      }),
    ]))
  })

  it('uses OCR text for a non-vision model', async () => {
    const context = makeContext({
      provider: { getModel: () => ({ input: ['text'] }) } as never,
    })
    const raw = await readImageExecutor({ path: 'photos/chart.png' }, context)
    const result = JSON.parse(raw)

    expect(result.ok).toBe(true)
    expect(result.data.mode).toBe('ocr')
    expect(result.data.ocrStatus).toBe('done')
    expect(result.contentParts).toEqual([
      expect.objectContaining({ type: 'text', text: expect.stringContaining('recognized text') }),
    ])
  })

  it('creates an explicit OCR limitation message when OCR produces no text', async () => {
    performOcrMock.mockResolvedValueOnce({
      text: '',
      base64Data: 'aW1hZ2U=',
      mimeType: 'image/png',
      status: 'done',
    })
    const raw = await readImageExecutor(
      { path: 'photos/chart.png' },
      makeContext({ provider: { getModel: () => ({ input: ['text'] }) } as never }),
    )
    const result = JSON.parse(raw)

    expect(result.data.ocrStatus).toBe('empty')
    expect(result.contentParts).toEqual([
      expect.objectContaining({ type: 'text', text: expect.stringContaining('No usable text was recognized') }),
    ])
  })

  it('rejects an oversized source before decoding or OCR', async () => {
    resolveVfsTargetMock.mockResolvedValueOnce({
      kind: 'workspace',
      path: 'photos/huge.png',
      backend: {
        readFile: vi.fn().mockResolvedValue({
          content: new Uint8Array(10 * 1024 * 1024 + 1),
          mimeType: 'image/png',
        }),
      },
    })
    const raw = await readImageExecutor({ path: 'photos/huge.png' }, makeContext())
    const result = JSON.parse(raw)

    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('image_too_large')
    expect(fileToBase64Mock).not.toHaveBeenCalled()
    expect(performOcrMock).not.toHaveBeenCalled()
  })

  it('rejects an image whose decoded dimensions exceed the pixel limit', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({
      width: 5_000,
      height: 5_000,
      close: vi.fn(),
    }))
    const raw = await readImageExecutor({ path: 'photos/chart.png' }, makeContext())
    const result = JSON.parse(raw)

    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('image_dimensions_too_large')
  })

  it('rejects non-image files before producing a tool result', async () => {
    isOcrCompatibleImageMock.mockReturnValueOnce(false)
    resolveVfsTargetMock.mockResolvedValueOnce({
      kind: 'workspace',
      path: 'notes.txt',
      backend: {
        readFile: vi.fn().mockResolvedValue({
          content: new Uint8Array([1]),
          mimeType: 'text/plain',
        }),
      },
    })
    const raw = await readImageExecutor({ path: 'notes.txt' }, makeContext())
    const result = JSON.parse(raw)

    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('not_an_image')
  })
})
