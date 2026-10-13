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
    onReadImageSuccess: () => true,
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

  it('queues a vision handoff with an image user content part', async () => {
    const onReadImageSuccess = vi.fn(() => true)
    const raw = await readImageExecutor({ path: 'photos/chart.png' }, makeContext({ onReadImageSuccess }))
    const result = JSON.parse(raw)

    expect(result.ok).toBe(true)
    expect(result.data.mode).toBe('vision')
    expect(onReadImageSuccess).toHaveBeenCalledWith(expect.objectContaining({
      contentParts: [
        expect.objectContaining({ type: 'text' }),
        { type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' },
      ],
      readImage: expect.objectContaining({
        path: 'photos/chart.png',
        ocrStatus: 'not_needed',
      }),
    }))
    expect(performOcrMock).not.toHaveBeenCalled()
  })

  it('opt-in sends the image as a tool result in the provider request without a handoff', async () => {
    vi.stubEnv('NEXT_PUBLIC_EXPERIMENT_READ_IMAGE_TOOL_RESULT', 'true')
    // Build-time env var path is covered here; the localStorage fallback
    // branch below proves the runtime toggle alone enables the mode.
    vi.stubGlobal('window', { localStorage: { getItem: vi.fn(() => null) } })
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

  it('enables tool-result mode from the localStorage runtime toggle alone', async () => {
    vi.stubGlobal('window', { localStorage: { getItem: vi.fn((key: string) => key === 'experiment.readImageToolResult' ? 'true' : null) } })
    const onReadImageSuccess = vi.fn(() => true)
    const raw = await readImageExecutor({ path: 'photos/chart.png' }, makeContext({ onReadImageSuccess }))
    const result = JSON.parse(raw)

    expect(result.ok).toBe(true)
    expect(result.data.mode).toBe('vision')
    expect(onReadImageSuccess).not.toHaveBeenCalled()
  })

  it('uses OCR text for a non-vision model while retaining the preview data', async () => {
    const onReadImageSuccess = vi.fn(() => true)
    const context = makeContext({
      provider: { getModel: () => ({ input: ['text'] }) } as never,
      onReadImageSuccess,
    })
    const raw = await readImageExecutor({ path: 'photos/chart.png' }, context)
    const result = JSON.parse(raw)

    expect(result.ok).toBe(true)
    expect(result.data.mode).toBe('ocr')
    expect(onReadImageSuccess).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('recognized text'),
      contentParts: [expect.objectContaining({ type: 'text', text: expect.stringContaining('recognized text') })],
      readImage: expect.objectContaining({ imageData: 'aW1hZ2U=', ocrStatus: 'done' }),
    }))
  })

  it('creates an explicit OCR limitation message when OCR produces no text', async () => {
    performOcrMock.mockResolvedValueOnce({
      text: '',
      base64Data: 'aW1hZ2U=',
      mimeType: 'image/png',
      status: 'done',
    })
    const onReadImageSuccess = vi.fn(() => true)
    await readImageExecutor(
      { path: 'photos/chart.png' },
      makeContext({ provider: { getModel: () => ({ input: ['text'] }) } as never, onReadImageSuccess }),
    )

    expect(onReadImageSuccess).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('No usable text was recognized'),
      readImage: expect.objectContaining({ ocrStatus: 'empty' }),
    }))
  })

  it('reports a failure when the follow-up message cannot be queued', async () => {
    const raw = await readImageExecutor(
      { path: 'photos/chart.png' },
      makeContext({ onReadImageSuccess: () => false }),
    )
    const result = JSON.parse(raw)

    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('handoff_unavailable')
  })

  it('rejects an oversized source before decoding, OCR, or queueing', async () => {
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
    const onReadImageSuccess = vi.fn(() => true)
    const raw = await readImageExecutor({ path: 'photos/huge.png' }, makeContext({ onReadImageSuccess }))
    const result = JSON.parse(raw)

    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('image_too_large')
    expect(fileToBase64Mock).not.toHaveBeenCalled()
    expect(performOcrMock).not.toHaveBeenCalled()
    expect(onReadImageSuccess).not.toHaveBeenCalled()
  })

  it('rejects an image whose decoded dimensions exceed the pixel limit', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({
      width: 5_000,
      height: 5_000,
      close: vi.fn(),
    }))
    const onReadImageSuccess = vi.fn(() => true)
    const raw = await readImageExecutor({ path: 'photos/chart.png' }, makeContext({ onReadImageSuccess }))
    const result = JSON.parse(raw)

    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('image_dimensions_too_large')
    expect(onReadImageSuccess).not.toHaveBeenCalled()
  })

  it('rejects non-image files before queueing a handoff', async () => {
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
    const onReadImageSuccess = vi.fn(() => true)
    const raw = await readImageExecutor({ path: 'notes.txt' }, makeContext({ onReadImageSuccess }))
    const result = JSON.parse(raw)

    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('not_an_image')
    expect(onReadImageSuccess).not.toHaveBeenCalled()
  })
})
