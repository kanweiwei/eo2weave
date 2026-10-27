export default {
  inputSchema: {
    type: 'object',
    properties: { file_id: { type: 'string', minLength: 1 } },
    required: ['file_id'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string' },
      data: { type: ['object', 'null'] },
    },
    required: ['status', 'data'],
    additionalProperties: false,
  },
  tree: {
    type: 'action',
    description:
      'Validate media signatures and convert browser-decodable images to PNG',
    async run({ input, state, target }) {
      const transfer = async function (args) {
        if (location.hostname !== 'creator.xiaohongshu.com')
          throw new Error(
            'Transfer files on the creator tab; storage is origin-specific',
          )
        if (!navigator.storage?.getDirectory || !navigator.locks)
          throw new Error('OPFS and Web Locks are required')
        const CHUNK = 1024 * 1024,
          TTL = 24 * 60 * 60 * 1000
        return navigator.locks.request('cw-xhs-files', async () => {
          const root = await (
            await navigator.storage.getDirectory()
          ).getDirectoryHandle('cw-xhs-files', { create: true })
          const read = async (dir) =>
            JSON.parse(
              await (
                await (await dir.getFileHandle('metadata.json')).getFile()
              ).text(),
            )
          const save = async (dir, meta) => {
            const stream = await (
              await dir.getFileHandle('metadata.json', { create: true })
            ).createWritable()
            try {
              await stream.write(JSON.stringify(meta))
              await stream.close()
            } catch (e) {
              await stream.abort().catch(() => {})
              throw e
            }
          }
          // Sweep only this package's expired storage, including abandoned transfers after refresh.
          if (args.action === 'begin')
            for await (const [id, handle] of root.entries()) {
              if (handle.kind !== 'directory') continue
              try {
                const m = await read(handle)
                if (m.expires_at < Date.now())
                  await root.removeEntry(id, { recursive: true })
              } catch (e) {
                if (e.name === 'NotFoundError' || e.name === 'SyntaxError')
                  await root.removeEntry(id, { recursive: true })
                else throw e
              }
            }
          if (args.action === 'begin') {
            if (
              !Number.isSafeInteger(args.size) ||
              args.size < 1 ||
              args.size > 4 * 1024 ** 3 ||
              typeof args.name !== 'string' ||
              !args.name ||
              args.name.length > 255 ||
              /[\\/\0]/.test(args.name) ||
              !/^(image|video)\/[a-zA-Z0-9.+-]+$/.test(args.mime)
            )
              throw new Error('Invalid file metadata')
            const quota = await navigator.storage.estimate()
            if (
              typeof quota.quota !== 'number' ||
              quota.quota - (quota.usage || 0) < args.size * 2.1 + CHUNK
            )
              throw new Error('Insufficient storage quota')
            const id = crypto.randomUUID()
            const dir = await root.getDirectoryHandle(id, { create: true })
            const meta = {
              id,
              name: args.name,
              mime: args.mime,
              size: args.size,
              offset: 0,
              state: 'writing',
              chunks: 0,
              expires_at: Date.now() + TTL,
            }
            await save(dir, meta)
            return {
              transfer_id: id,
              chunk_size: CHUNK,
              next_offset: 0,
              expires_at: meta.expires_at,
            }
          }
          const id = args.transfer_id || args.file_id
          if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id))
            throw new Error('Invalid transfer/file ID')
          const dir = await root.getDirectoryHandle(id)
          const meta = await read(dir)
          if (meta.expires_at < Date.now()) {
            await root.removeEntry(id, { recursive: true })
            throw new Error('Transfer expired')
          }
          if (args.action === 'inspect')
            return {
              transfer_id: id,
              name: meta.name,
              mime: meta.mime,
              size: meta.size,
              next_offset: meta.offset,
              state: meta.state,
            }
          if (args.action === 'write') {
            if (meta.state !== 'writing')
              throw new Error('Transfer is no longer writable')
            if (
              !Number.isSafeInteger(args.offset) ||
              args.offset < 0 ||
              args.offset > meta.offset ||
              args.offset % CHUNK !== 0
            )
              throw new Error('Out-of-order chunk')
            if (
              typeof args.base64 !== 'string' ||
              args.base64.length > 4 * Math.ceil(CHUNK / 3) ||
              !args.base64.length ||
              args.base64.length % 4 !== 0 ||
              !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
                args.base64,
              )
            )
              throw new Error('Invalid base64 chunk')
            const binary = atob(args.base64)
            if (btoa(binary) !== args.base64)
              throw new Error('Noncanonical base64')
            const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
            const expected = Math.min(CHUNK, meta.size - args.offset)
            if (bytes.length !== expected)
              throw new Error('Chunk size mismatch')
            const name = String(args.offset / CHUNK)
            if (args.offset < meta.offset) {
              const file = await (await dir.getFileHandle(name)).getFile()
              const old = new Uint8Array(await file.arrayBuffer())
              if (
                old.length !== bytes.length ||
                old.some((value, i) => value !== bytes[i])
              )
                throw new Error('Duplicate chunk differs')
              return { next_offset: meta.offset, duplicate: true }
            }
            const stream = await (
              await dir.getFileHandle(name, { create: true })
            ).createWritable()
            try {
              await stream.write(bytes)
              await stream.close()
            } catch (e) {
              await stream.abort().catch(() => {})
              throw e
            }
            meta.offset += bytes.length
            meta.chunks++
            await save(dir, meta)
            return { next_offset: meta.offset, duplicate: false }
          }
          if (args.action === 'finish') {
            if (meta.state === 'ready') return { file_id: id, size: meta.size }
            if (meta.state !== 'writing' || meta.offset !== meta.size)
              throw new Error('Transfer incomplete or already consumed')
            let count = 0
            for await (const [name, handle] of dir.entries()) {
              if (name === 'metadata.json') continue
              if (
                handle.kind !== 'file' ||
                !/^\d+$/.test(name) ||
                String(Number(name)) !== name ||
                Number(name) >= meta.chunks
              )
                throw new Error('Invalid stored chunk')
              const chunk = await handle.getFile()
              if (
                chunk.size !== Math.min(CHUNK, meta.size - Number(name) * CHUNK)
              )
                throw new Error('Stored chunk size mismatch')
              count++
            }
            if (count !== meta.chunks) throw new Error('Missing stored chunks')
            meta.state = 'ready'
            await save(dir, meta)
            return { file_id: id, size: meta.size }
          }
          if (args.action === 'consume') {
            if (meta.state !== 'ready')
              throw new Error(
                'File unavailable or already handed off; inspect the page before retrying',
              )
            if (!meta.mime.startsWith(args.kind + '/'))
              throw new Error('File media type does not match publishing tool')
            const input = document.querySelector(args.selector)
            if (!(input instanceof HTMLInputElement) || input.type !== 'file')
              throw new Error('File input unavailable')
            const quota = await navigator.storage.estimate()
            if (
              typeof quota.quota !== 'number' ||
              quota.quota - (quota.usage || 0) < meta.size
            )
              throw new Error(
                'Insufficient quota for file assembly and handoff',
              )
            // Each Blob references a committed OPFS file, never an accumulated byte buffer.
            const parts = []
            let size = 0
            for (let i = 0; i < meta.chunks; i++) {
              const part = await (await dir.getFileHandle(String(i))).getFile()
              if (part.size !== Math.min(CHUNK, meta.size - size))
                throw new Error('Corrupt stored chunk')
              parts.push(part)
              size += part.size
            }
            if (size !== meta.size) throw new Error('Stored size mismatch')
            const file = new File(parts, meta.name, { type: meta.mime })
            if (file.size !== meta.size)
              throw new Error('File assembly mismatch')
            const data = new DataTransfer()
            data.items.add(file)
            // Persist uncertainty before the side effect: retries never upload twice after refresh/crash.
            meta.state = 'consuming'
            await save(dir, meta)
            input.files = data.files
            if (
              input.files.length !== 1 ||
              input.files[0].size !== meta.size ||
              input.files[0].name !== meta.name
            )
              throw new Error(
                'File-input handoff failed; inspect page before retrying',
              )
            input.dispatchEvent(new Event('input', { bubbles: true }))
            input.dispatchEvent(new Event('change', { bubbles: true }))
            meta.state = 'consumed'
            await save(dir, meta)
            // File inputs may read backing files asynchronously. Keep them until expiry.
            // The consumed tombstone prevents repeat handoff after refresh or retry.
            return {
              file_id: id,
              supplied: true,
              name: meta.name,
              size: meta.size,
              accepted: false,
              next_action: 'status',
            }
          }
          throw new Error('Unknown file operation')
        })
      }
      const prepare = async ({ id, transferSource }) => {
        const transfer = eval('(' + transferSource + ')')
        const meta = await transfer({ action: 'inspect', transfer_id: id })
        if (meta.state !== 'ready')
          throw new Error('Media is incomplete or already consumed')
        const root = await navigator.storage.getDirectory(),
          dir = await (
            await root.getDirectoryHandle('cw-xhs-files')
          ).getDirectoryHandle(id)
        const first = await (await dir.getFileHandle('0')).getFile()
        const bytes = new Uint8Array(await first.slice(0, 32).arrayBuffer())
        const text = String.fromCharCode(...bytes)
        let detected = null
        if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
          detected = 'image/jpeg'
        else if (bytes[0] === 137 && text.slice(1, 4) === 'PNG')
          detected = 'image/png'
        else if (text.startsWith('GIF87a') || text.startsWith('GIF89a'))
          detected = 'image/gif'
        else if (text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP')
          detected = 'image/webp'
        else if (text.slice(4, 8) === 'ftyp')
          detected = /avif|avis|heic|heix|mif1/.test(text.slice(8))
            ? 'image/avif'
            : 'video/mp4'
        else if (
          bytes[0] === 26 &&
          bytes[1] === 69 &&
          bytes[2] === 223 &&
          bytes[3] === 163
        )
          detected = 'video/webm'
        if (
          detected &&
          [
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'video/mp4',
            'video/webm',
          ].includes(detected)
        ) {
          if (
            meta.mime !== detected &&
            !(detected === 'video/mp4' && meta.mime === 'video/quicktime')
          )
            throw new Error('Declared MIME does not match media signature')
          return {
            file_id: id,
            mime: detected,
            signature_verified: true,
            converted: false,
          }
        }
        if (!meta.mime.startsWith('image/'))
          throw new Error('Unrecognized video signature')
        if (meta.size > 20 * 1024 * 1024)
          throw new Error('Image conversion exceeds the 20 MiB bound')
        const key = 'cw-xhs-converted-' + id,
          previous = sessionStorage.getItem(key)
        if (previous) {
          const ready = await transfer({
            action: 'inspect',
            transfer_id: previous,
          })
          if (ready.state === 'ready')
            return { file_id: previous, mime: 'image/png', converted: true }
          throw new Error('Converted media already handed off')
        }
        const parts = []
        for (let offset = 0; offset < meta.size; offset += 1048576)
          parts.push(
            await (await dir.getFileHandle(String(offset / 1048576))).getFile(),
          )
        const image = await createImageBitmap(
          new Blob(parts, { type: meta.mime }),
        )
        let blob
        try {
          if (image.width * image.height > 40000000)
            throw new Error('Image conversion exceeds the pixel bound')
          const canvas = new OffscreenCanvas(image.width, image.height)
          canvas.getContext('2d').drawImage(image, 0, 0)
          blob = await canvas.convertToBlob({ type: 'image/png' })
        } finally {
          image.close()
        }
        const started = await transfer({
          action: 'begin',
          name: meta.name.replace(/\.[^.]+$/, '') + '.png',
          mime: 'image/png',
          size: blob.size,
        })
        for (let offset = 0; offset < blob.size; offset += 1048576) {
          const bytes = new Uint8Array(
            await blob.slice(offset, offset + 1048576).arrayBuffer(),
          )
          let binary = ''
          for (const value of bytes) binary += String.fromCharCode(value)
          await transfer({
            action: 'write',
            transfer_id: started.transfer_id,
            offset,
            base64: btoa(binary),
          })
        }
        const finished = await transfer({
          action: 'finish',
          transfer_id: started.transfer_id,
        })
        sessionStorage.setItem(key, finished.file_id)
        return { ...finished, mime: 'image/png', converted: true }
      }
      const response = await browser.eval(
        '() => (' +
          prepare.toString() +
          ')(' +
          JSON.stringify({
            id: input.file_id,
            transferSource: transfer.toString(),
          }) +
          ')',
        { tab: target.tabId, timeout: 25000 },
      )
      if (response.tabId !== target.tabId)
        throw new Error('Browser returned another tab')
      state.result = { status: 'ok', data: response.result }
      return 'success'
    },
  },
  result({ state }) {
    return state.result
  },
}
