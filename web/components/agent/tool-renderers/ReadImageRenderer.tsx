/**
 * Renderer for `read_image` tool results.
 *
 * Vision-capable runs return their image through a V2 envelope's contentParts.
 * Keep the base64 payload out of the textual result card and present it as an
 * accessible preview instead.
 */

import { ImageIcon, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Lightbox } from '../Lightbox'
import { registerRenderer } from './registry'
import type { ToolRenderCtx } from './types'

interface ImagePart {
  type: 'image'
  data: string
  mimeType: string
}

interface ReadImageData {
  path?: string
  mimeType?: string
  mode?: string
}

function getEnvelope(ctx: ToolRenderCtx): Record<string, unknown> | null {
  if (ctx.rawResult) {
    try {
      const parsed: unknown = JSON.parse(ctx.rawResult)
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
    } catch {
      return null
    }
  }
  return ctx.result
}

function getImagePart(ctx: ToolRenderCtx): ImagePart | null {
  const envelope = getEnvelope(ctx)
  const parts = envelope?.contentParts
  if (!Array.isArray(parts)) return null

  const image = parts.find((part): part is ImagePart => (
    !!part &&
    typeof part === 'object' &&
    (part as { type?: unknown }).type === 'image' &&
    typeof (part as { data?: unknown }).data === 'string' &&
    typeof (part as { mimeType?: unknown }).mimeType === 'string'
  ))
  return image ?? null
}

function getResultData(ctx: ToolRenderCtx): ReadImageData {
  const envelope = getEnvelope(ctx)
  const data = envelope?.data
  return data && typeof data === 'object' ? data as ReadImageData : {}
}

function toDataUrl(part: ImagePart): string {
  return part.data.startsWith('data:')
    ? part.data
    : `data:${part.mimeType};base64,${part.data}`
}

function formatBytes(base64: string): string {
  const payload = base64.startsWith('data:') ? base64.split(',', 2)[1] ?? '' : base64
  const bytes = Math.floor(payload.length * 0.75)
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function errorMessage(ctx: ToolRenderCtx): string {
  const error = ctx.result?.error
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  return 'Image read failed'
}

registerRenderer({
  name: 'read_image',
  icon: <ImageIcon className="h-3.5 w-3.5 text-neutral-400" />,
  Summary(ctx) {
    const data = getResultData(ctx)
    const path = data.path || (typeof ctx.args.path === 'string' ? ctx.args.path : '')
    const image = getImagePart(ctx)

    return (
      <>
        <code className="font-medium text-neutral-700 dark:text-foreground">read_image</code>
        {path && <span className="truncate text-xs text-neutral-500 dark:text-neutral-400">{path}</span>}
        {image && <span className="ml-auto shrink-0 text-xs text-neutral-400">{formatBytes(image.data)}</span>}
        {ctx.isExecuting && <Loader2 className="h-3 w-3 animate-spin text-blue-500" />}
      </>
    )
  },
  Detail(ctx) {
    const [lightboxOpen, setLightboxOpen] = useState(false)
    const image = getImagePart(ctx)
    const data = getResultData(ctx)
    const path = data.path || (typeof ctx.args.path === 'string' ? ctx.args.path : 'Image')

    if (ctx.isError) {
      return <div className="px-3 py-2 text-xs text-red-600 dark:text-red-400">{errorMessage(ctx)}</div>
    }

    if (!image) {
      return (
        <div className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400">
          {ctx.isExecuting ? 'Reading image…' : 'No image preview is available for this result'}
        </div>
      )
    }

    const src = toDataUrl(image)
    const alt = `Preview of ${path}`
    return (
      <div className="space-y-2 px-3 py-2">
        <button
          type="button"
          className="block w-full overflow-hidden rounded-md border border-neutral-200 bg-neutral-50 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
          onClick={() => setLightboxOpen(true)}
          aria-label={`View full-size image: ${path}`}
        >
          <img
            src={src}
            alt={alt}
            className="block max-h-[480px] w-full cursor-zoom-in object-contain"
          />
        </button>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-neutral-500 dark:text-neutral-400">
          <span className="break-all">Source: {path}</span>
          <span aria-hidden="true">·</span>
          <span>{image.mimeType} · {formatBytes(image.data)}</span>
        </div>
        {lightboxOpen && (
          <Lightbox src={src} alt={alt} onClose={() => setLightboxOpen(false)} />
        )}
      </div>
    )
  },
})
