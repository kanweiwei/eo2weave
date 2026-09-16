/**
 * Read Image Tool — prepares an image for the next conversation turn.
 *
 * Unlike OCR, this tool does not return image content through a tool result.
 * It creates a queued user-message handoff so OpenAI-compatible providers
 * receive the image in a normal user message on the following turn.
 */

import type { ToolContext, ToolDefinition, ToolExecutor, ToolPromptDoc } from './tool-types'
import { resolveVfsTarget } from './vfs-resolver'
import { isSubagentPermissionDenied, SUBAGENT_PERMISSION_DENIED } from './agent-file-protection'
import { fileToBase64, isOcrCompatibleImage, performOcr } from '@/services/ocr.service'
import { toolErrorJson, toolOkJson } from './tool-envelope'

const SUPPORTED_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'])
const MAX_SOURCE_BYTES = 10 * 1024 * 1024
const MAX_IMAGE_PIXELS = 20_000_000
const MAX_IMAGE_EDGE = 4096
const MAX_NORMALIZED_BYTES = 4 * 1024 * 1024

class ReadImagePreparationError extends Error {
  constructor(
    readonly code: 'image_too_large' | 'image_dimensions_too_large' | 'invalid_image',
    message: string,
  ) {
    super(message)
  }
}

function inferMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  const mimeTypes: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    bmp: 'image/bmp',
    gif: 'image/gif',
  }
  return mimeTypes[ext] ?? 'application/octet-stream'
}

function isSupportedImage(path: string, mimeType: string): boolean {
  if (isOcrCompatibleImage(mimeType)) return true
  return SUPPORTED_IMAGE_EXTENSIONS.has(path.split('.').pop()?.toLowerCase() ?? '')
}

function displayPath(path: string): string {
  return path.replace(/^vfs:\/\/(workspace|assets)\//, '')
}

function detectImageMimeType(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 6 && String.fromCharCode(...bytes.slice(0, 6)) === 'GIF87a') return 'image/gif'
  if (bytes.length >= 6 && String.fromCharCode(...bytes.slice(0, 6)) === 'GIF89a') return 'image/gif'
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image/bmp'
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp'
  return null
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new ReadImagePreparationError('invalid_image', 'Unable to encode the normalized image.'))
    }, type, quality)
  })
}

async function normalizeImage(file: File): Promise<File> {
  if (typeof createImageBitmap !== 'function') {
    throw new ReadImagePreparationError('invalid_image', 'This browser cannot decode image files for safe processing.')
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new ReadImagePreparationError('invalid_image', 'The file could not be decoded as a valid image.')
  }

  try {
    const sourcePixels = bitmap.width * bitmap.height
    if (!bitmap.width || !bitmap.height || sourcePixels > MAX_IMAGE_PIXELS) {
      throw new ReadImagePreparationError(
        'image_dimensions_too_large',
        `Image dimensions ${bitmap.width}×${bitmap.height} exceed the ${MAX_IMAGE_PIXELS.toLocaleString()} pixel limit.`,
      )
    }

    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const needsReencode = scale < 1 || file.size > MAX_NORMALIZED_BYTES || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
    if (!needsReencode) return file

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) {
      throw new ReadImagePreparationError('invalid_image', 'This browser cannot prepare the image for model input.')
    }
    context.drawImage(bitmap, 0, 0, width, height)

    for (const quality of [0.9, 0.75, 0.6]) {
      const blob = await canvasToBlob(canvas, 'image/webp', quality)
      if (blob.size <= MAX_NORMALIZED_BYTES) {
        return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' })
      }
    }
    throw new ReadImagePreparationError(
      'image_too_large',
      `The normalized image exceeds the ${Math.round(MAX_NORMALIZED_BYTES / 1024 / 1024)} MB limit.`,
    )
  } finally {
    bitmap.close()
  }
}

export const readImageDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'read_image',
    description:
      'Read an image file from the authorized workspace or assets directory. ' +
      'This tool prepares a new visible user message containing the image for the next model turn. ' +
      'After calling it, do not call more tools: answer directly in the next turn using the image or OCR text. ' +
      'Supports PNG, JPEG, WebP, BMP, and GIF images.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Image path in the authorized workspace (for example "photos/scan.png") ' +
            'or an asset path such as "vfs://assets/scan.png".',
        },
      },
      required: ['path'],
    },
  },
}

export const readImageExecutor: ToolExecutor = async (
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<string> => {
  const path = typeof args.path === 'string' ? args.path : undefined
  if (!path) return toolErrorJson('read_image', 'invalid_arguments', 'path is required')

  if (!context.onReadImageSuccess) {
    return toolErrorJson(
      'read_image',
      'handoff_unavailable',
      'Image reading is unavailable because this conversation cannot create a follow-up message.',
    )
  }

  try {
    const target = await resolveVfsTarget(path, context, 'read')
    const result = await target.backend.readFile(target.path, { encoding: 'binary' })
    const binaryContent = result.content as ArrayBuffer | Uint8Array
    const bytes = binaryContent instanceof Uint8Array
      ? binaryContent
      : new Uint8Array(binaryContent)
    if (bytes.byteLength > MAX_SOURCE_BYTES) {
      return toolErrorJson(
        'read_image',
        'image_too_large',
        `Image is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB; the maximum supported size is ${MAX_SOURCE_BYTES / 1024 / 1024} MB.`,
        { details: { path: target.path, size: bytes.byteLength, maxSize: MAX_SOURCE_BYTES } },
      )
    }

    const declaredMimeType = result.mimeType || inferMimeType(target.path)
    const mimeType = detectImageMimeType(bytes) || declaredMimeType

    if (!isSupportedImage(target.path, mimeType)) {
      return toolErrorJson(
        'read_image',
        'not_an_image',
        `File is not a supported image format (${mimeType}). Supported formats: PNG, JPEG, WebP, BMP, GIF.`,
        { details: { path: target.path, mimeType } },
      )
    }

    const sourceFile = new File([bytes], target.path.split('/').pop() || 'image.png', { type: mimeType })
    const file = await normalizeImage(sourceFile)
    const normalizedMimeType = file.type
    const visiblePath = displayPath(target.path)
    const model = context.provider?.getModel()
    const supportsVision = model?.input?.includes('image') ?? false
    const prefix = `以下图片来自你调用的 read_image 工具。文件：${visiblePath}。请在本轮直接基于图片内容回答。`

    let content = prefix
    let contentParts: NonNullable<Parameters<NonNullable<ToolContext['onReadImageSuccess']>>[0]['contentParts']>
    let imageData: string | undefined
    let ocrStatus: 'not_needed' | 'done' | 'empty' | 'failed' | 'timeout' = 'not_needed'

    if (supportsVision) {
      const base64 = await fileToBase64(file)
      contentParts = [
        { type: 'text', text: prefix },
        { type: 'image', data: base64, mimeType: normalizedMimeType },
      ]
    } else {
      const ocr = await performOcr(file)
      imageData = ocr.base64Data
      ocrStatus = ocr.status === 'done' && ocr.text
        ? 'done'
        : ocr.status === 'done'
          ? 'empty'
          : ocr.status === 'timeout'
            ? 'timeout'
            : 'failed'
      const ocrText = ocr.text.trim()
      const fallback = ocrText
        ? `图片 OCR 识别结果：\n${ocrText}`
        : '该图片未识别到可用文字（可能是照片、图形，或 OCR 识别失败）；当前模型不支持视觉输入，无法可靠理解其视觉内容。'
      content = `${prefix}\n\n${fallback}`
      contentParts = [{ type: 'text', text: content }]
    }

    const queued = context.onReadImageSuccess({
      content,
      contentParts,
      readImage: {
        path: visiblePath,
        mimeType: normalizedMimeType,
        ...(imageData ? { imageData } : {}),
        toolCallId: context.currentToolCallId,
        ocrStatus,
      },
    })
    if (!queued) {
      return toolErrorJson(
        'read_image',
        'handoff_unavailable',
        'Unable to queue the image as a follow-up conversation message. Try again.',
        { retryable: true },
      )
    }

    return toolOkJson('read_image', {
      path: visiblePath,
      mimeType: normalizedMimeType,
      mode: supportsVision ? 'vision' : 'ocr',
      message: 'The image has been added as a new user message for the next turn. Do not call more tools; answer directly from that next message.',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (isSubagentPermissionDenied(error)) {
      return toolErrorJson('read_image', SUBAGENT_PERMISSION_DENIED, message)
    }
    if (error instanceof ReadImagePreparationError) {
      return toolErrorJson('read_image', error.code, error.message)
    }
    if (message.includes('File not found') || message.includes('NotFoundError') || message.includes('not found')) {
      return toolErrorJson('read_image', 'file_not_found', `Image file not found: ${path}`)
    }
    return toolErrorJson('read_image', 'internal_error', `Unable to read image: ${message}`, { retryable: true })
  }
}

export const readImagePromptDoc: ToolPromptDoc = {
  category: 'file-ops',
  lines: [
    '- `read_image(path)` - Read an authorized image into a visible follow-up user message. This ends the current tool flow; answer directly in the next turn from the image or OCR text.',
  ],
}
