// Self-contained adapter workflow.
export default {
  inputSchema: {
    type: 'object',
    properties: {
      file_ids: {
        type: 'array',
        items: { type: 'string', minLength: 1 },
        maxItems: 18,
      },
      operation_id: { type: 'string', minLength: 1 },
      tags: {
        type: 'array',
        items: { type: 'string', minLength: 1, maxLength: 100 },
        maxItems: 10,
      },
      products: {
        type: 'array',
        items: { type: 'string', minLength: 1, maxLength: 1000 },
        maxItems: 20,
      },
      topic_fallback: { type: 'boolean', default: true },

      action: {
        type: 'string',
        enum: [
          'write_text',
          'resume',
          'wait',
          'open',
          'reset',
          'prepare',
          'upload',
          'configure',
          'status',
          'topic',
          'select_topic',
          'visibility',
          'schedule',
          'original',
          'confirm_original',
          'product',
          'select_product',
          'save_products',
        ],
      },
      file_id: {
        type: 'string',
        minLength: 1,
      },
      title: {
        type: 'string',
        maxLength: 40,
      },
      content: {
        type: 'string',
      },
      visibility: {
        type: 'string',
        enum: [
          '\u516c\u5f00\u53ef\u89c1',
          '\u4ec5\u81ea\u5df1\u53ef\u89c1',
          '\u4ec5\u4e92\u5173\u597d\u53cb\u53ef\u89c1',
        ],
      },
      schedule_at: {
        type: 'string',
      },
      is_original: {
        type: 'boolean',
      },
      tag: {
        type: 'string',
        minLength: 1,
        maxLength: 100,
      },
      product: {
        type: 'string',
        minLength: 1,
        maxLength: 1000,
      },
    },
    required: ['action'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
      },
      data: {
        type: ['object', 'null'],
      },
      message: {
        type: ['string', 'null'],
      },
    },
    required: ['status', 'data'],
    additionalProperties: false,
  },
  tree: {
    type: 'action',
    description: 'publish_content',
    async run({ input, state, target }) {
      const controls = (args) => {
        const visible = (el) => {
          if (!(el instanceof HTMLElement) || !el.getClientRects().length)
            return false
          for (let node = el; node; node = node.parentElement) {
            const style = getComputedStyle(node)
            if (node.hidden || node.getAttribute('aria-hidden') === 'true' ||
                style.visibility === 'hidden' || style.display === 'none' ||
                (style.opacity !== '' && Number(style.opacity) < 0.01))
              return false
          }
          // Off-canvas duplicates still have client rects. Keep scrollable content.
          return el.getBoundingClientRect().right >= 0
        }
        let root = document
        if (args.comment_id) {
          const id = CSS.escape(args.comment_id)
          root = document.querySelector(
            '[data-id="' + id + '"], #comment-' + id + ', #' + id,
          )
          if (!root || !visible(root)) return { found: false }
        }
        const nodes = Array.from(
          root.querySelectorAll(
            args.selector ||
              'button, a, [role="button"], .reds-tab-item, .creator-tab, .channel, .more-item',
          ),
        ).filter(visible)
        const el = nodes.find(
          (el) => (!args.label || el.innerText.trim() === args.label) &&
            (!args.cardLabel || el.closest('.custom-switch-card')?.innerText.includes(args.cardLabel)),
        )
        if (!el) return { found: false }
        const marker = 'cw-xhs-' + crypto.randomUUID()
        el.setAttribute('data-cw-xhs-control', marker)
        const checkbox = el.querySelector('input[type="checkbox"]')
        const simulator = el.querySelector('.d-switch-simulator, .d-checkbox-simulator')
        const active = checkbox ? checkbox.checked :
          simulator ? simulator.classList.contains('checked') :
          el.getAttribute('aria-selected') === 'true' ||
          el.getAttribute('aria-pressed') === 'true' ||
          el.getAttribute('aria-checked') === 'true' ||
          el.classList.contains('checked') ||
          el.classList.contains('is-checked') ||
          el.classList.contains('is-active') ||
          el.classList.contains('active') ||
          el.classList.contains('selected')
        return {
          found: true,
          selector: '[data-cw-xhs-control="' + marker + '"]',
          active,
          disabled: !!checkbox?.disabled || el.classList.contains('disabled') ||
            el.getAttribute('aria-disabled') === 'true',
          text: el.innerText,
        }
      }

      const fileTransfer = async function (args) {
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
            const accept = (input.accept || '').toLowerCase().split(',').map(value => value.trim())
            const extension = '.' + meta.name.split('.').pop().toLowerCase()
            if (!accept.some(value => value === meta.mime.toLowerCase() || value === args.kind + '/*' || value === extension))
              throw new Error('File input does not accept this media type; prepare the correct publishing tab first')
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
      const options = { tab: target.tabId, timeout: 25000 }
      const page = async (fn, args = {}) => {
        const response = await browser.eval(
          '() => (' + fn.toString() + ')(' + JSON.stringify(args) + ')',
          options,
        )
        if (response.tabId !== target.tabId)
          throw new Error('Browser returned another tab')
        return response.result
      }
      // Input policy is implemented using the existing browser commands.
      const pause = (ms) =>
        page(async (ms) => {
          await new Promise((resolve) => setTimeout(resolve, ms))
          return true
        }, ms)
      const timing = (mu, sigma, min, max) =>
        Math.max(
          min,
          Math.min(
            max,
            Math.exp(
              mu +
                sigma *
                  Math.sqrt(-2 * Math.log(1 - Math.random())) *
                  Math.cos(2 * Math.PI * Math.random()),
            ) * 1000,
          ),
        )
      let pointer = { x: 0, y: 0 }
      const click = async (selector) => {
        const point = await page((selector) => {
          const el = document.querySelector(selector)
          if (!el) throw new Error('Input target disappeared')
          el.scrollIntoView?.({ block: 'center', inline: 'nearest' })
          const r = el.getBoundingClientRect()
          if (!r.width || !r.height) return null
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        }, selector)
        if (point) {
          const from = pointer,
            dx = point.x - from.x,
            dy = point.y - from.y,
            bend =
              (Math.random() - 0.5) * Math.min(80, Math.hypot(dx, dy) * 0.2)
          for (let i = 1; i <= 6; i++) {
            const t = i / 6,
              s = t * t * (3 - 2 * t)
            await browser.mouse.move(
              from.x + dx * s - bend * Math.sin(Math.PI * t),
              from.y + dy * s + bend * Math.sin(Math.PI * t),
              options,
            )
            await pause(5 + Math.floor(Math.random() * 5))
          }
          pointer = point
          await pause(timing(-1.2, 0.35, 200, 1200))
        }
        await browser.click(selector, undefined, options)
      }
      const typeText = async (selector, text) => {
        const characters = Array.from(text),
          chunk = Math.max(4, Math.ceil(characters.length / 120))
        await browser.fill(selector, '', options)
        for (let at = 0; at < characters.length; at += chunk) {
          await browser.type(
            selector,
            characters.slice(at, at + chunk).join(''),
            options,
          )
          await pause(timing(-2.12, 0.5, 30, 140))
        }
      }
      const observeMedia = ({ kind }) => {
        const rendered = (el) => {
          if (!el.getClientRects().length) return false
          for (let node = el; node; node = node.parentElement) {
            const style = getComputedStyle(node)
            if (
              node.hidden ||
              style.visibility === 'hidden' ||
              style.display === 'none' ||
              (style.opacity !== '' && Number(style.opacity) < 0.01)
            )
              return false
          }
          return true
        }
        const elements =
          kind === 'video'
            ? Array.from(
                new Set(
                  document.querySelectorAll(
                    'video.exact-video, .video-container video',
                  ),
                ),
              )
            : Array.from(
                new Set(
                  document.querySelectorAll(
                    '.img-preview-area .pr, .image-item',
                  ),
                ),
              )
        const visibleElements = elements.filter(rendered)
        const busyElements = Array.from(
          document.querySelectorAll(
            '.uploading, .upload-progress, .processing, [aria-busy="true"]',
          ),
        ).filter(rendered)
        const errors = Array.from(
          document.querySelectorAll('.upload-error, .error-message'),
        )
          .filter(rendered)
          .map((el) => el.innerText)
        const pageText = document.body?.innerText || ''
        return {
          preview_count:
            kind === 'video' ? elements.length : visibleElements.length,
          visible_preview_count:
            visibleElements.length,
          processing: busyElements.length > 0,
          processed:
            kind === 'video' &&
            /检测为高清视频|视频处理完成|视频上传成功/.test(pageText),
          errors,
        }
      }
      const uploadsObserved = (media, uploads, baseline) => {
        if (uploads.some((item) => !item.supplied)) return false
        if (kind === 'video' && uploads.length)
          return (
            media.preview_count >= baseline + uploads.length ||
            (media.preview_count >= 1 && media.processed)
          )
        return media.preview_count >= baseline + uploads.length
      }

      const kind = 'image'
      if (input.action === 'open') {
        await browser.goto(
          'https://creator.xiaohongshu.com/publish/publish?source=official',
          { ...options, 'wait-until': 'commit' },
        )
        state.result = {
          status: 'navigated',
          data: {
            next_action: 'prepare',
            continuation: {
              tab_id: target.tabId,
              origin: 'https://creator.xiaohongshu.com',
              tool_name: 'com.xiaohongshu.main.publish_content',
              args: { action: 'prepare' },
              rediscover: true,
            },
          },
        }
        return 'success'
      }
      const onCreator = await page(
        () =>
          location.hostname === 'creator.xiaohongshu.com' &&
          location.pathname.startsWith('/publish/'),
      )
      if (!onCreator) throw new Error('Call open on the creator tab first')
      const journalKey = 'cw-xhs-publish-publish_content'
      const loadJournal = () =>
        page((key) => {
          const raw = sessionStorage.getItem(key)
          return raw ? JSON.parse(raw) : null
        }, journalKey)
      const saveJournal = (journal) =>
        page(
          ({ key, journal }) =>
            sessionStorage.setItem(key, JSON.stringify(journal)),
          { key: journalKey, journal },
        )
      const planKey = 'cw-xhs-publish-plan-' + kind
      const savedPlan = await page(
        (key) => JSON.parse(sessionStorage.getItem(key) || 'null'),
        planKey,
      )
      if (input.action === 'reset') {
        // Clear only this operation's journals. OPFS consumption tombstones survive.
        await page(({ planKey, journalKey, kind }) => {
          sessionStorage.removeItem(planKey)
          sessionStorage.removeItem(journalKey)
          sessionStorage.removeItem('cw-xhs-uploads-' + kind)
        }, { planKey, journalKey, kind })
        state.result = { status: 'ok', data: {
          phase: 'reset', next_action: 'prepare',
          page_cleared: false, media_preserved: true, text_preserved: true,
          message: 'Operation reset. Existing page media and consumed file records are preserved. Use a new file_id for another handoff.',
        } }
        return 'success'
      }
      if (['write_text', 'configure', 'resume'].includes(input.action)) {
        const readiness = await page(() => {
          const visible = el => !!el && !!el.getClientRects().length
          const title = document.querySelector('div.d-input input')
          const editor = document.querySelector('div[role="textbox"][contenteditable="true"], div.tiptap[contenteditable="true"], div.ql-editor')
          const busy = Array.from(document.querySelectorAll('.uploading, .upload-progress, .processing, [aria-busy="true"]')).some(visible)
          return { ready: visible(title) && visible(editor), processing: busy }
        })
        if (!readiness.ready) {
          state.result = { status: readiness.processing ? 'pending' : 'error', data: {
            ...readiness, error_code: readiness.processing ? null : 'MEDIA_REQUIRED',
            next_action: readiness.processing ? 'wait' : 'upload',
            message: 'Upload media and wait for the editor before configuring the draft.',
          } }
          return 'success'
        }
      }
      if (
        input.operation_id &&
        savedPlan &&
        input.operation_id !== savedPlan.operation_id &&
        input.action !== 'prepare'
      )
        throw new Error('Publish operation_id mismatch')
      const publishFields = [
        'title',
        'content',
        'tags',
        'schedule_at',
        'is_original',
        'visibility',
        'products',
      ]
      const configuredFields = new Set(
        publishFields.filter((field) =>
          Object.prototype.hasOwnProperty.call(input, field),
        ),
      )
      const existingJournal =
        input.action === 'configure' ? await loadJournal() : null
      const partialConfigure =
        input.action === 'configure' &&
        existingJournal &&
        existingJournal.inflight === null &&
        existingJournal.index >= existingJournal.steps.length
      let observedDraft = null
      if (input.action === 'configure') {
        if (partialConfigure) {
          input = {
            operation_id: savedPlan?.operation_id || input.operation_id,
            ...input,
            action: 'configure',
          }
        } else {
          const observed = await page(() => ({
            title: document.querySelector('div.d-input input')?.value || '',
            content:
              document.querySelector(
                'div[role="textbox"][contenteditable="true"],div.tiptap[contenteditable="true"],div.ql-editor',
              )?.innerText || '',
          }))
          observedDraft = observed
          input = {
            ...observed,
            ...savedPlan?.request,
            operation_id: savedPlan?.operation_id,
            ...input,
            action: 'configure',
          }
        }
      }
      if (input.action === 'resume' || input.action === 'configure') {
        let journal = await loadJournal()
        if (input.action === 'configure') {
          const request = JSON.stringify(input)
          if (journal && journal.request === request) {
            // Continue the existing operation rather than overwriting an uncertain step.
          } else {
            if (journal && journal.inflight !== null)
              throw new Error(
                'Existing publish operation unfinished; resume or inspect it first',
              )
            const steps = []
            const writeTitle =
              configuredFields.has('title') ||
              (!partialConfigure && !observedDraft?.title && !!input.title)
            const writeContent =
              configuredFields.has('content') ||
              (!partialConfigure && !observedDraft?.content && !!input.content)
            if (writeTitle || writeContent) {
              const writeText = { action: 'write_text' }
              if (writeTitle) writeText.title = input.title
              if (writeContent) writeText.content = input.content
              steps.push(writeText)
            }
            for (const tag of input.tags || [input.tag].filter(Boolean)) {
              steps.push(
                { action: 'topic', tag },
                {
                  action: 'select_topic',
                  tag,
                  topic_fallback: input.topic_fallback !== false,
                },
              )
            }
            if (input.visibility)
              steps.push({ action: 'visibility', visibility: input.visibility })
            if (input.schedule_at)
              steps.push({ action: 'schedule', schedule_at: input.schedule_at })
            if (input.is_original)
              steps.push(
                { action: 'original', is_original: true },
                { action: 'confirm_original', is_original: true },
              )
            for (const product of input.products ||
              [input.product].filter(Boolean)) {
              steps.push(
                { action: 'product', product },
                { action: 'select_product', product },
              )
            }
            if (input.products?.length || input.product)
              steps.push({ action: 'save_products' })
            journal = {
              operation_id: input.operation_id || 'publish-' + Date.now(),
              request,
              url: await page(() => location.href),
              steps,
              index: 0,
              inflight: null,
              results: [],
            }
            await saveJournal(journal)
          }
        }
        if (!journal) throw new Error('No publish operation to resume')
        if (input.operation_id && input.operation_id !== journal.operation_id)
          throw new Error('Publish operation_id mismatch')
        if (journal.url !== (await page(() => location.href)))
          throw new Error(
            'Publish page changed; inspect the draft before continuing',
          )
        if (journal.inflight !== null) {
          const confirmed = await page((step) => {
            const visible = (el) => el.getClientRects().length
            const text = (selector) =>
              Array.from(document.querySelectorAll(selector))
                .filter(visible)
                .map((el) => el.innerText)
                .join(' ')
            if (step.action === 'write_text') {
              const titleMatches =
                !Object.prototype.hasOwnProperty.call(step, 'title') ||
                document.querySelector('div.d-input input')?.value ===
                  step.title
              const contentMatches =
                !Object.prototype.hasOwnProperty.call(step, 'content') ||
                text(
                  'div[role="textbox"][contenteditable="true"], div.tiptap[contenteditable="true"], div.ql-editor',
                ) === step.content
              return titleMatches && contentMatches
            }
            if (step.action === 'topic')
              return text('div[contenteditable="true"]').includes(step.tag)
            if (step.action === 'select_topic')
              return text('[data-type="topic"], .topic').includes(step.tag)
            if (step.action === 'visibility')
              return text(
                'div.permission-card-wrapper div.d-select-content',
              ).includes(step.visibility)
            if (step.action === 'schedule')
              return (
                document.querySelector('.date-picker-container input')
                  ?.value === step.schedule_at.slice(0, 16).replace('T', ' ')
              )
            if (step.action === 'product')
              return Array.from(document.querySelectorAll('input')).some(
                (el) => el.value === step.product,
              )
            if (step.action === 'select_product')
              return Array.from(
                document.querySelectorAll(
                  '.goods-item, .product-item, .goods-list-item',
                ),
              ).some(
                (el) =>
                  el.innerText.includes(step.product) &&
                  el.querySelector(
                    'input:checked, [aria-checked="true"], .checked',
                  ),
              )
            if (step.action === 'save_products')
              return (
                !Array.from(
                  document.querySelectorAll('.goods-dialog, .product-dialog'),
                ).some(visible) &&
                !!document.querySelector('.goods-card, .selected-goods-item')
              )
            return false
          }, journal.steps[journal.inflight])
          if (confirmed) {
            journal.index = journal.inflight + 1
            journal.inflight = null
            await saveJournal(journal)
          }
        }
        if (journal.inflight !== null) {
          state.result = {
            status: 'pending',
            data: {
              ...journal,
              requires_inspection: true,
              message:
                'The previous step has an uncertain result; inspect the form before retrying.',
            },
          }
          return 'success'
        }
        for (
          let count = 0;
          count < 3 && journal.index < journal.steps.length;
          count++
        ) {
          const step = journal.steps[journal.index]
          journal.inflight = journal.index
          await saveJournal(journal)
          let response
          try {
            response = await browser.webmcp.exec(
              'com.xiaohongshu.main.publish_content',
              step,
              options,
            )
            if (
              response.tabId !== target.tabId ||
              response.result.status !== 'success'
            )
              throw new Error('Publish step failed')
          } catch (error) {
            journal.results.push({
              step: journal.index,
              status: 'error',
              message: String(error.message || error),
            })
            if (
              ['product', 'select_product', 'save_products'].includes(
                step.action,
              )
            ) {
              journal.index += step.action === 'product' ? 2 : 1
              journal.inflight = null
              await saveJournal(journal)
              continue
            }
            await saveJournal(journal)
            throw error
          }
          const outcome = response.result.result
          journal.results.push({ step: journal.index, ...outcome })
          if (outcome.status === 'error') {
            await saveJournal(journal)
            state.result = {
              status: 'pending',
              data: { ...journal, requires_inspection: true },
            }
            return 'success'
          }
          journal.inflight = null
          journal.index++
          await saveJournal(journal)
        }
        state.result = {
          status: 'pending',
          data: {
            operation_id: journal.operation_id,
            completed_steps: journal.index,
            total_steps: journal.steps.length,
            results: journal.results,
            next_action:
              journal.index === journal.steps.length ? 'status' : 'resume',
            final_publish: 'manual',
          },
        }
        return 'success'
      }
      if (input.action === 'wait') {
        const uploads = await page(key => JSON.parse(sessionStorage.getItem(key) || '[]'), 'cw-xhs-uploads-' + kind)
        const started = uploads.length ? Math.max(...uploads.map(item => item.started_at)) : Date.now()
        const stalled = uploads.length > 0 && Date.now() - started > 300000
        const baseline = savedPlan?.existing_previews || 0
        const progress = await page(async ({ kind, baseline, uploadCount, budget }) => {
          const deadline = Date.now() + budget
          const observe = () => {
            const rendered = (el) => {
              if (!el.getClientRects().length) return false
              for (let node = el; node; node = node.parentElement) {
                const style = getComputedStyle(node)
                if (node.hidden || style.visibility === 'hidden' ||
                    style.display === 'none' ||
                    (style.opacity !== '' && Number(style.opacity) < 0.01))
                  return false
              }
              return true
            }
            const elements = kind === 'video'
              ? Array.from(new Set(document.querySelectorAll(
                  'video.exact-video, .video-container video',
                )))
              : Array.from(new Set(document.querySelectorAll(
                  '.img-preview-area .pr, .image-item',
                )))
            const visibleElements = elements.filter(rendered)
            const errors = Array.from(
              document.querySelectorAll('.upload-error, .error-message'),
            ).filter(rendered).map(el => el.innerText)
            const processing = Array.from(document.querySelectorAll(
              '.uploading, .upload-progress, .processing, [aria-busy="true"]',
            )).some(rendered)
            const processed = kind === 'video' &&
              /检测为高清视频|视频处理完成|视频上传成功/.test(
                document.body?.innerText || '',
              )
            const previewCount = kind === 'video'
              ? elements.length
              : visibleElements.length
            const observed = kind === 'video'
              ? uploadCount > 0
                ? previewCount >= baseline + uploadCount ||
                  (previewCount >= 1 && processed)
                : previewCount > baseline ||
                  (baseline === 0 && previewCount >= 1 && processed)
              : previewCount >= baseline + Math.max(1, uploadCount)
            return {
              ready: !errors.length && !processing && observed,
              observed,
              processing,
              errors,
              preview_count: previewCount,
              visible_preview_count: kind === 'video'
                ? visibleElements.length
                : previewCount,
              processed,
            }
          }
          do {
            const observation = observe()
            if (observation.errors.length || observation.ready)
              return {
                ...observation,
                next_action: observation.errors.length ||
                  !observation.preview_count ? 'reset' : 'status',
              }
            await new Promise((resolve) => setTimeout(resolve, 250))
          } while (Date.now() < deadline)
          const observation = observe()
          return {
            ...observation,
            ready: false,
            timed_out: true,
            error_code: observation.processing ? null : 'UPLOAD_NOT_READY',
            next_action: observation.processing ? 'wait' : 'reset',
          }
        }, {
          kind,
          baseline,
          uploadCount: uploads.length,
          budget: stalled ? 0 : 12000,
        })
        if (stalled && !progress.ready) {
          progress.processing = false
          progress.error_code = 'UPLOAD_STALLED'
          progress.next_action = 'reset'
        }
        state.result = {
          status: progress.ready ? 'ok' : progress.processing ? 'pending' : 'error',
          data: { ...progress, elapsed_ms: Date.now() - started },
        }
        return 'success'
      }
      if (input.action === 'prepare') {
        const tab = await page(controls, {
          selector: '.creator-tab',
          label: kind === 'image' ? '上传图文' : '上传视频',
        })
        if (tab.found && !tab.active) await click(tab.selector)
        const selected = await page(controls, {
          selector: '.creator-tab', label: kind === 'image' ? '上传图文' : '上传视频',
        })
        if (selected.found && !selected.active) {
          state.result = { status: 'pending', data: {
            phase: 'select_media_type', next_action: 'prepare',
            message: 'Publishing tab is not ready; no media was handed off.',
          } }
          return 'success'
        }
        const operation_id =
          input.operation_id ||
          savedPlan?.operation_id ||
          'publish-' + Date.now()
        const media = await page(observeMedia, { kind })
        const baseline = media.preview_count
        const plan = {
          operation_id,
          request: { ...savedPlan?.request, ...input },
          file_ids: input.file_ids || savedPlan?.file_ids || null,
          existing_previews:
            savedPlan?.operation_id === operation_id
              ? savedPlan.existing_previews
              : baseline,
        }
        if (savedPlan && savedPlan.operation_id !== operation_id) {
          await page(
            ({ journalKey, kind }) => {
              sessionStorage.removeItem(journalKey)
              sessionStorage.removeItem('cw-xhs-uploads-' + kind)
            },
            { journalKey, kind },
          )
        }
        await page(
          ({ key, plan }) => sessionStorage.setItem(key, JSON.stringify(plan)),
          { key: planKey, plan },
        )
        state.result = {
          status: 'pending',
          data: {
            operation_id,
            next_action: 'upload',
            message:
              'Transfer the file on this creator tab, finish the transfer, then upload using its file_id.',
          },
        }
        return 'success'
      }
      if (input.action === 'upload') {
        if (!input.file_id)
          throw new Error('file_id from finish_file_transfer is required')
        const uploadKey = 'cw-xhs-uploads-' + kind
        const uploads = await page(
          (key) => JSON.parse(sessionStorage.getItem(key) || '[]'),
          uploadKey,
        )
        const previous = uploads.find((item) => item.file_id === input.file_id)
        if (previous) {
          state.result = {
            status: 'pending',
            data: { ...previous, repeated_handoff: false, next_action: 'wait' },
          }
          return 'success'
        }
        if (
          savedPlan?.file_ids &&
          savedPlan.file_ids[uploads.length] !== input.file_id
        )
          throw new Error('Upload must follow the prepared file_id order')
        const mediaState = await page(observeMedia, { kind })
        if (
          !uploadsObserved(
            mediaState,
            uploads,
            savedPlan?.existing_previews || 0,
          )
        ) {
          state.result = {
            status: 'pending',
            data: {
              next_action: 'wait',
              message:
                'Observe previous uploads before handing off another file.',
            },
          }
          return 'success'
        }
        const record = {
          file_id: input.file_id,
          url: await page(() => location.href),
          phase: 'preparing',
          supplied: false,
          started_at: Date.now(),
        }
        const preparedMedia = await browser.webmcp.exec(
          'com.xiaohongshu.main.prepare_media',
          { file_id: input.file_id },
          options,
        )
        if (
          preparedMedia.tabId !== target.tabId ||
          preparedMedia.result.status !== 'success' ||
          preparedMedia.result.result.status !== 'ok'
        )
          throw new Error('Media preparation failed')
        record.prepared_file_id = preparedMedia.result.result.data.file_id
        record.phase = 'handoff_pending'
        uploads.push(record)
        await page(
          ({ key, uploads }) =>
            sessionStorage.setItem(key, JSON.stringify(uploads)),
          { key: uploadKey, uploads },
        )
        const data = await page(fileTransfer, {
          action: 'consume',
          file_id: preparedMedia.result.result.data.file_id,
          kind,
          selector:
            kind === 'image'
              ? 'input[type="file"][accept*="image"], input[type="file"][accept*=".jpg"], input[type="file"][accept*=".png"]'
              : 'input[type="file"][accept*="video"], input[type="file"][accept*=".mp4"]',
        })
        record.phase = 'supplied'
        record.supplied = true
        await page(
          ({ key, uploads }) =>
            sessionStorage.setItem(key, JSON.stringify(uploads)),
          { key: uploadKey, uploads },
        )
        state.result = {
          status: 'pending',
          data: { ...data, next_action: 'wait' },
        }
        return 'success'
      }
      const editorSelector =
        'div[role="textbox"][contenteditable="true"], div.tiptap[contenteditable="true"], div.ql-editor'
      if (input.action === 'topic') {
        if (
          typeof input.tag !== 'string' ||
          !input.tag.trim() ||
          input.tag.length > 100
        )
          throw new Error('tag required, max 100 characters')
        await click(editorSelector)
        await browser.press('ControlOrMeta+End', options)
        await browser.type(
          editorSelector,
          ' #' + input.tag.replace(/^#+/, ''),
          options,
        )
        state.result = {
          status: 'pending',
          data: {
            next_action: 'select_topic',
            tag: input.tag,
            message:
              'Read rendered suggestions before selection; do not repeat topic insertion.',
          },
        }
        return 'success'
      }
      if (input.action === 'select_topic') {
        if (typeof input.tag !== 'string' || !input.tag.trim())
          throw new Error('Exact visible topic label required')
        const topic = await page(controls, {
          selector: '#creator-editor-topic-container .item',
          label: input.tag,
        })
        if (!topic.found) {
          const fallback = await page(async () => {
            const deadline = Date.now() + 1500
            while (Date.now() < deadline) {
              const el = Array.from(
                document.querySelectorAll(
                  '#creator-editor-topic-container .item',
                ),
              ).find((el) => el.getClientRects().length)
              if (el) {
                const marker = crypto.randomUUID()
                el.setAttribute('data-cw-xhs-control', marker)
                return {
                  selector: '[data-cw-xhs-control="' + marker + '"]',
                  text: el.innerText,
                }
              }
              await new Promise((resolve) => setTimeout(resolve, 150))
            }
            return null
          })
          if (fallback) {
            topic.found = true
            topic.selector = fallback.selector
            topic.text = fallback.text
          } else if (input.topic_fallback !== false) {
            await browser.type(editorSelector, ' ', options)
            state.result = {
              status: 'ok',
              data: {
                topic: input.tag,
                selected: false,
                method: 'plain_text_fallback',
              },
            }
            return 'success'
          } else throw new Error('Topic suggestion unavailable')
        }
        await click(topic.selector)
        state.result = {
          status: 'ok',
          data: { topic: input.tag, selected: true },
        }
        return 'success'
      }
      if (input.action === 'visibility') {
        if (
          !['公开可见', '仅自己可见', '仅互关好友可见'].includes(
            input.visibility,
          )
        )
          throw new Error('visibility required')
        const control = await page(controls, {
          selector: 'div.permission-card-wrapper div.d-select-content',
        })
        if (!control.found) throw new Error('Visibility control unavailable')
        if (control.text.includes(input.visibility)) {
          state.result = {
            status: 'ok',
            data: { visibility: input.visibility, verified: true },
          }
          return 'success'
        }
        const choiceArgs = {
          selector: '.d-options .custom-option, .d-select-option, [role="option"], .d-dropdown-item',
          label: input.visibility,
        }
        let choice = await page(controls, choiceArgs)
        if (!choice.found) {
          await click(control.selector)
          const deadline = Date.now() + 2000
          do {
            choice = await page(controls, choiceArgs)
            if (choice.found) break
            await pause(100)
          } while (Date.now() < deadline)
        }
        if (!choice.found) throw new Error('Visibility option unavailable')
        await click(choice.selector)
        const after = await page(controls, {
          selector: 'div.permission-card-wrapper div.d-select-content',
        })
        state.result = {
          status: after.text?.includes(input.visibility) ? 'ok' : 'pending',
          data: {
            visibility: input.visibility,
            verified: !!after.text?.includes(input.visibility),
          },
        }
        return 'success'
      }
      if (input.action === 'schedule') {
        const valid = await page((value) => {
          if (
            typeof value !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
              value,
            )
          )
            throw new Error('schedule_at must be RFC3339 with timezone')
          const [y, m, d, h, min, s] = value
            .slice(0, 19)
            .split(/[-T:]/)
            .map(Number)
          const date = new Date(0)
          date.setUTCFullYear(y, m - 1, d)
          date.setUTCHours(h, min, s, 0)
          const delta = Date.parse(value) - Date.now()
          if (
            date.getUTCFullYear() !== y ||
            date.getUTCMonth() !== m - 1 ||
            date.getUTCDate() !== d ||
            h > 23 ||
            min > 59 ||
            s > 59 ||
            !Number.isFinite(delta) ||
            delta < 3600000 ||
            delta > 14 * 86400000
          )
            throw new Error('Invalid schedule; must be 1 hour to 14 days ahead')
          return { wall_time: value.slice(0, 16).replace('T', ' ') }
        }, input.schedule_at)
        const control = await page(controls, { selector: '.post-time-wrapper .d-switch' })
        if (!control.found || control.disabled) {
          state.result = { status: 'error', data: { error_code: 'SCHEDULE_UNAVAILABLE', verified: false } }
          return 'success'
        }
        if (!control.active) await click(control.selector)
        await browser.fill(
          '.date-picker-container input',
          valid.wall_time,
          options,
        )
        const verified = await page(
          (value) =>
            document.querySelector('.date-picker-container input')?.value ===
            value,
          valid.wall_time,
        )
        state.result = {
          status: verified ? 'ok' : 'pending',
          data: { schedule_at: input.schedule_at, verified },
        }
        return 'success'
      }
      if (input.action === 'original') {
        const control = await page(controls, {
          selector: '.custom-switch-card .d-switch', cardLabel: '原创声明',
        })
        if (!control.found || control.disabled) {
          state.result = { status: 'error', data: {
            error_code: 'ORIGINAL_UNAVAILABLE', disabled: !!control.disabled,
            message: 'The page does not currently allow an original declaration.',
          } }
          return 'success'
        }
        if (input.is_original === false) {
          state.result = {
            status: 'ok',
            data: { changed: false, original: control.active },
          }
          return 'success'
        }
        if (!control.active) await click(control.selector)
        state.result = {
          status: 'pending',
          data: {
            next_action: 'confirm_original',
            message:
              'Review the original declaration notice before confirmation.',
          },
        }
        return 'success'
      }
      if (input.action === 'confirm_original') {
        if (input.is_original !== true)
          throw new Error('is_original=true required to confirm declaration')
        const existing = await page(() => {
          const dialogs = Array.from(
            document.querySelectorAll('div.footer'),
          ).filter(
            (el) =>
              el.getClientRects().length &&
              /原创声明须知|声明原创/.test(el.innerText),
          )
          return !dialogs.length
        })
        const original = await page(controls, {
          selector: '.custom-switch-card .d-switch', cardLabel: '原创声明',
        })
        if (existing && original.found && original.active) {
          state.result = { status: 'ok', data: { already_declared: true } }
          return 'success'
        }
        const notice = await page(controls, {
          selector: '.footer .d-checkbox',
        })
        if (notice.found && !notice.active) await click(notice.selector)
        const confirm = await page(controls, {
          selector: '.footer button.custom-button',
          label: '声明原创',
        })
        if (!confirm.found)
          throw new Error('Original declaration confirmation unavailable')
        await click(confirm.selector)
        state.result = {
          status: 'pending',
          data: { next_action: 'status', declaration_clicked: true },
        }
        return 'success'
      }
      if (input.action === 'product') {
        if (typeof input.product !== 'string' || !input.product)
          throw new Error('product keyword required')
        const control = await page(controls, {
          selector: 'button, .d-button',
          label: '添加商品',
        })
        if (
          !control.found &&
          !(await page(
            () => !!document.querySelector('.multi-goods-selector-modal'),
          ))
        )
          throw new Error('Add product control unavailable')
        const modalOpen = await page(() =>
          Array.from(
            document.querySelectorAll('.multi-goods-selector-modal'),
          ).some((el) => el.getClientRects().length),
        )
        if (!modalOpen) await click(control.selector)
        await browser.fill(
          '.multi-goods-selector-modal input[placeholder="搜索商品ID 或 商品名称"]',
          input.product,
          options,
        )
        await browser.press('Enter', options)
        state.result = {
          status: 'pending',
          data: {
            next_action: 'select_product',
            keyword: input.product,
            message: 'Inspect product identities before selecting a result.',
          },
        }
        return 'success'
      }
      if (input.action === 'select_product') {
        if (typeof input.product !== 'string' || !input.product.trim())
          throw new Error('Exact visible product label required')
        const control = await page(controls, {
          selector: '.multi-goods-selector-modal .good-card-container',
          label: input.product,
        })
        if (!control.found) {
          const fallback = await page(async () => {
            const deadline = Date.now() + 3000
            do {
              const loading = Array.from(
                document.querySelectorAll(
                  '.multi-goods-selector-modal .goods-list-loading',
                ),
              ).some((el) => el.getClientRects().length)
              const card = Array.from(
                document.querySelectorAll(
                  '.multi-goods-selector-modal .goods-list-normal .good-card-container',
                ),
              ).find((el) => el.getClientRects().length)
              if (!loading && card) {
                const marker = crypto.randomUUID()
                card.setAttribute('data-cw-xhs-control', marker)
                return {
                  found: true,
                  selector: '[data-cw-xhs-control="' + marker + '"]',
                  text: card.innerText,
                }
              }
              await new Promise((resolve) => setTimeout(resolve, 150))
            } while (Date.now() < deadline)
            return null
          })
          if (!fallback)
            throw new Error('Product search produced no selectable result')
          Object.assign(control, fallback)
        }
        const box = await page(controls, {
          selector: control.selector + ' .d-checkbox',
        })
        if (!box.found) throw new Error('Product checkbox unavailable')
        if (!box.active) await click(box.selector)
        state.result = {
          status: 'pending',
          data: {
            next_action: 'save_products',
            product: input.product,
            selected: control.text,
          },
        }
        return 'success'
      }
      if (input.action === 'save_products') {
        const control = await page(controls, {
          selector:
            '.multi-goods-selector-modal .goods-selected-footer button, .multi-goods-selector-modal .goods-selected-footer .d-button--primary',
        })
        if (!control.found) throw new Error('Product save control unavailable')
        await click(control.selector)
        state.result = {
          status: 'pending',
          data: { next_action: 'status', save_clicked: true },
        }
        return 'success'
      }

      if (input.action === 'write_text' && savedPlan?.file_ids) {
        const uploads = await page(
          (key) => JSON.parse(sessionStorage.getItem(key) || '[]'),
          'cw-xhs-uploads-' + kind,
        )
        const media = await page(observeMedia, { kind })
        if (
          uploads.length < savedPlan.file_ids.length ||
          !uploadsObserved(
            media,
            uploads,
            savedPlan.existing_previews,
          )
        )
          throw new Error(
            'Wait for all requested media previews before configuring',
          )
      }
      if (input.action === 'write_text') {
        const writeTitle = Object.prototype.hasOwnProperty.call(
          input,
          'title',
        )
        const writeContent = Object.prototype.hasOwnProperty.call(
          input,
          'content',
        )
        if (!writeTitle && !writeContent)
          throw new Error('title or content required for write_text')
        if (writeTitle) {
          if (typeof input.title !== 'string')
            throw new Error('title must be a string')
          let weighted = 0
          for (let i = 0; i < input.title.length; i++)
            weighted += input.title.charCodeAt(i) > 127 ? 2 : 1
          if (Math.ceil(weighted / 2) > 20)
            throw new Error('Title exceeds weighted 20-character limit')
          await typeText('div.d-input input', input.title)
        }
        if (writeContent) {
          if (typeof input.content !== 'string')
            throw new Error('content must be a string')
          await typeText(
            'div[role="textbox"][contenteditable="true"], div.tiptap[contenteditable="true"], div.ql-editor',
            input.content,
          )
        }
      }
      const media = await page(observeMedia, { kind })
      const data = await page(({ kind, media }) => {
        const visible = (el) => el.getClientRects().length
        const candidates = Array.from(
          document.querySelectorAll(
            '.publish-page-publish-btn button, button.publishBtn, .publishBtn',
          ),
        )
        const widget = document.querySelector('xhs-publish-btn')
        const shadow = widget?.shadowRoot || widget?._sr
        if (shadow) candidates.push(...shadow.querySelectorAll('button'))
        const button =
          candidates.find(
            (el) => visible(el) && el.innerText.trim() === '发布',
          ) || candidates.find(visible)
        const title = document.querySelector('div.d-input input')?.value || ''
        const editor = document.querySelector(
          'div[role="textbox"][contenteditable="true"], div.tiptap[contenteditable="true"], div.ql-editor',
        )
        const error = Array.from(
          document.querySelectorAll(
            '.length-error, .error-message, .upload-error',
          ),
        )
          .filter(visible)
          .map((el) => el.innerText)
        return {
          title,
          content: editor?.innerText || '',
          preview_count: media.preview_count,
          visible_preview_count: media.visible_preview_count,
          media_processed: kind === 'video' ? media.processed : null,
          publish_button_ready: button
            ? !button.disabled &&
              button.getAttribute('aria-disabled') !== 'true' &&
              !button.classList.contains('disabled')
            : null,
          errors: error,
          published:
            new URL(location.href).searchParams.get('published') === 'true'
              ? true
              : null,
          visibility:
            document.querySelector(
              'div.permission-card-wrapper div.d-select-content',
            )?.innerText || null,
          scheduled_at:
            document.querySelector('.date-picker-container input')?.value ||
            null,
          topics: Array.from(
            document.querySelectorAll('[data-type=\"topic\"], .topic'),
          ).map((el) => el.innerText),
          products: Array.from(
            document.querySelectorAll('.goods-card, .selected-goods-item'),
          ).map((el) => el.innerText),
          final_publish: 'manual',
        }
      }, { kind, media })
      data.operation = await loadJournal()
      data.uploads = await page(
        (key) => JSON.parse(sessionStorage.getItem(key) || '[]'),
        'cw-xhs-uploads-' + kind,
      )
      state.result = { status: 'ok', data }
      return 'success'
    },
  },
  result({ state }) {
    return state.result
  },
}
