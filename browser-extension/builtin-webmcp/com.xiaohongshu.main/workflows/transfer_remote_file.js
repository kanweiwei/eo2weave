// Remote download orchestration and incremental OPFS writes belong to this adapter.
export default {
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', minLength: 1 },
      transfer_id: { type: 'string', minLength: 1 },
      name: { type: 'string', minLength: 1 },
      mime: { type: 'string', minLength: 1 },
      size: { type: 'integer', minimum: 1, maximum: 4294967296 },
    },
    required: ['url'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string' },
      data: { type: ['object', 'null'] },
      message: { type: ['string', 'null'] },
    },
    required: ['status', 'data'],
    additionalProperties: false,
  },
  tree: {
    type: 'action',
    description:
      'Download media incrementally into OPFS; resume using transfer_id',
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
              source: meta.source || null,
            }
          if (args.action === 'bind_source') {
            if (meta.source && meta.source !== args.identity)
              throw new Error('Remote source identity changed')
            meta.source = args.identity
            await save(dir, meta)
            return { bound: true }
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
      const download = async ({ input, transferSource }) => {
        const transfer = eval('(' + transferSource + ')')
        const url = new URL(input.url)
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          url.username ||
          url.password
        )
          throw new Error('A credential-free HTTP(S) media URL is required')
        const controller = new AbortController(),
          timer = setTimeout(() => controller.abort(), 18000)
        let meta = input.transfer_id
          ? await transfer({
              action: 'inspect',
              transfer_id: input.transfer_id,
            })
          : null
        if (meta?.source && JSON.parse(meta.source).url !== url.href) {
          clearTimeout(timer)
          throw new Error('Remote source URL changed')
        }
        const offset = meta?.next_offset || 0
        if (meta && offset === meta.size) {
          clearTimeout(timer)
          return {
            complete: true,
            ...(await transfer({
              action: 'finish',
              transfer_id: meta.transfer_id,
            })),
            transfer_id: meta.transfer_id,
            next_offset: offset,
          }
        }
        try {
          const response = await fetch(url.href, {
            credentials: 'omit',
            headers: offset ? { Range: 'bytes=' + offset + '-' } : {},
            signal: controller.signal,
          })
          if (!response.ok)
            throw new Error('Remote download returned HTTP ' + response.status)
          if (offset && response.status !== 206)
            throw new Error('Source cannot resume: Range was not honored')
          if (
            offset &&
            !new RegExp('^bytes ' + offset + '-').test(
              response.headers.get('content-range') || '',
            )
          )
            throw new Error('Source range does not match confirmed offset')
          if (!meta) {
            const size =
              input.size || Number(response.headers.get('content-length'))
            const mime =
              input.mime ||
              (response.headers.get('content-type') || '').split(';')[0]
            const name =
              input.name ||
              decodeURIComponent(url.pathname.split('/').pop() || 'media')
            const started = await transfer({
              action: 'begin',
              size,
              mime,
              name,
            })
            meta = { ...started, size, mime, name }
          }
          const identity = JSON.stringify({
            url: url.href,
            etag: response.headers.get('etag'),
            modified: response.headers.get('last-modified'),
          })
          await transfer({
            action: 'bind_source',
            transfer_id: meta.transfer_id,
            identity,
          })
          const reader = response.body?.getReader()
          if (!reader) throw new Error('Remote stream unavailable')
          const CHUNK = 1048576,
            buffer = new Uint8Array(CHUNK)
          let used = 0,
            next = offset
          const deadline = Date.now() + 10000
          try {
            while (Date.now() < deadline) {
              const part = await reader.read()
              if (part.done) {
                if (used) {
                  let binary = ''
                  for (let i = 0; i < used; i++)
                    binary += String.fromCharCode(buffer[i])
                  const written = await transfer({
                    action: 'write',
                    transfer_id: meta.transfer_id,
                    offset: next,
                    base64: btoa(binary),
                  })
                  next = written.next_offset
                }
                const finished = await transfer({
                  action: 'finish',
                  transfer_id: meta.transfer_id,
                })
                return {
                  complete: true,
                  ...finished,
                  transfer_id: meta.transfer_id,
                  next_offset: next,
                }
              }
              for (let at = 0; at < part.value.length; ) {
                const length = Math.min(CHUNK - used, part.value.length - at)
                buffer.set(part.value.subarray(at, at + length), used)
                used += length
                at += length
                if (used === CHUNK) {
                  let binary = ''
                  for (let i = 0; i < used; i++)
                    binary += String.fromCharCode(buffer[i])
                  const written = await transfer({
                    action: 'write',
                    transfer_id: meta.transfer_id,
                    offset: next,
                    base64: btoa(binary),
                  })
                  next = written.next_offset
                  used = 0
                }
              }
            }
            return {
              complete: false,
              transfer_id: meta.transfer_id,
              next_offset: next,
              next_action: 'transfer_remote_file',
            }
          } finally {
            await reader.cancel().catch(() => {})
          }
        } catch (error) {
          return {
            complete: false,
            transfer_id: meta?.transfer_id || null,
            next_offset: meta
              ? (
                  await transfer({
                    action: 'inspect',
                    transfer_id: meta.transfer_id,
                  })
                ).next_offset
              : 0,
            error: String(error.message || error),
            next_action: 'transfer_remote_file',
            caller_fallback:
              'If this origin cannot fetch the source, read it through an authorized caller and use write_file_chunk.',
          }
        } finally {
          clearTimeout(timer)
        }
      }
      const response = await browser.eval(
        '() => (' +
          download.toString() +
          ')(' +
          JSON.stringify({ input, transferSource: transfer.toString() }) +
          ')',
        { tab: target.tabId, timeout: 25000 },
      )
      if (response.tabId !== target.tabId)
        throw new Error('Browser returned another tab')
      state.result = {
        status: response.result.complete ? 'ok' : 'pending',
        data: response.result,
      }
      return 'success'
    },
  },
  result({ state }) {
    return state.result
  },
}
