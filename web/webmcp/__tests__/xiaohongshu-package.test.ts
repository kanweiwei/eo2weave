// @vitest-environment node
import { beforeAll, expect, it } from 'vitest'
import { readFile, writeFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { Window } from 'happy-dom'
import { executeAdapterWorkflow } from '../../../browser-extension/entrypoints/webmcp/adapter-runtime'
import { builtinResources } from '../../../browser-extension/entrypoints/webmcp/builtin-resources'
import {
  parseWorkflow,
  validatePackage,
  validatePackageSnapshot,
} from '@creatorweave/shared/webmcp-adapter'
import type { BrowserRequest } from '../../../browser-extension/lib/bash-commands/browser/command'
import type { JsonValue } from '@creatorweave/quickjs-runtime'
let wasm: WebAssembly.Module
beforeAll(async () => {
  const require = createRequire(import.meta.url)
  const runtime = createRequire(require.resolve('@creatorweave/quickjs-runtime/package.json'))
  wasm = await WebAssembly.compile(await readFile(runtime.resolve('quickjs-wasi/quickjs.wasm')))
})
const prefix = 'com.xiaohongshu.main/'
const manifest = JSON.parse(builtinResources[prefix + 'manifest.json'])
it('validates every package contract and stays below the package snapshot limit', () => {
  const sources = Object.fromEntries(
    manifest.tools.map((tool: { path: string }) => [
      tool.path,
      builtinResources[prefix + tool.path],
    ])
  )
  for (const source of Object.values(sources)) parseWorkflow(source as string)
  validatePackage(manifest, sources, manifest.id)
  const snapshot = Object.entries(builtinResources)
    .filter(([path]) => path.endsWith('/manifest.json'))
    .map(([, source]) => {
      const manifest = JSON.parse(source)
      const sources = Object.fromEntries(
        manifest.tools.map((tool: { path: string }) => [
          tool.path,
          builtinResources[manifest.id + '/' + tool.path],
        ])
      )
      return { manifest, sources }
    })
  expect(() => validatePackageSnapshot(snapshot)).not.toThrow()

  expect(
    Object.values(sources).reduce((n, source) => n + (source as string).length, 0)
  ).toBeLessThan(2_000_000)
})
function fixture(
  url = 'https://www.xiaohongshu.com/explore',
  pageGlobals: Record<string, unknown> = {},
  behavior: { failClick?: (selector: string) => boolean } = {}
) {
  const window = new Window({ url })
  window.document.write('<html><body></body></html>')
  Object.defineProperty(window.HTMLElement.prototype, 'getClientRects', {
    configurable: true,
    value: () => [{}],
  })
  const requests: BrowserRequest[] = []
  const execute = async (name: string, input: Record<string, unknown> = {}): Promise<any> => {
    const tool = manifest.tools.find((tool: { name: string }) => tool.name === name)
    return executeAdapterWorkflow(
      wasm,
      builtinResources[prefix + tool.path],
      input as JsonValue,
      browser,
      new AbortController().signal,
      { tabId: 7, url: window.location.href }
    )
  }
  const browser = async (request: BrowserRequest): Promise<JsonValue> => {
    requests.push(request)
    expect(request.options.tab).toBe('7')
    if (request.command === 'webmcp') {
      const child = await execute(
        request.positionals[1].split('.').pop()!,
        JSON.parse(request.positionals[2])
      )
      if (!child.ok) throw new Error(child.error.message)
      return { tabId: 7, result: child.value }
    }
    if (request.command === 'eval') {
      const result = await runInNewContext(`(${request.positionals[0]})()`, {
        window,
        sessionStorage: window.sessionStorage,
        setTimeout,
        clearTimeout,
        Node: window.Node,
        NodeFilter: window.NodeFilter,
        MouseEvent: window.MouseEvent,
        Event: window.Event,
        AbortController,
        Blob,
        TextEncoder,
        document: window.document,
        location: window.location,
        URL,
        URLSearchParams,
        HTMLElement: window.HTMLElement,
        HTMLInputElement: window.HTMLInputElement,
        HTMLImageElement: window.HTMLImageElement,
        getComputedStyle: window.getComputedStyle.bind(window),
        crypto: globalThis.crypto,
        CSS: window.CSS,
        atob,
        btoa,
        File,
        ...pageGlobals,
      })
      return { tabId: 7, result: JSON.parse(JSON.stringify(result ?? null)) }
    }
    if (request.command === 'goto') window.happyDOM.setURL(request.positionals[0])
    if (request.command === 'fill' || request.command === 'type') {
      const el = window.document.querySelector(request.positionals[0]) as any
      if (!el) throw new Error('Fixture edit target unavailable')
      const text = request.positionals[1]
      if ('value' in el) el.value = request.command === 'fill' ? text : el.value + text
      else el.innerText = request.command === 'fill' ? text : el.innerText + text
    }
    if (request.command === 'click') {
      const selector = request.positionals[0]
      if (behavior.failClick?.(selector))
        throw new Error('Fixture click failure')
      ;(window.document.querySelector(selector) as any)?.click()
    }
    return { tabId: 7 }
  }
  return { execute, window, requests }
}
it('executes the actual QuickJS workflow, nested webmcp command and page observation without installing a runtime', async () => {
  const page = fixture()
  expect(await page.execute('read_page')).toMatchObject({
    ok: true,
    value: { result: { status: 'ok', data: { page_kind: 'home' } } },
  })
  page.requests.length = 0
  const result = await page.execute('check_login')
  expect(result).toMatchObject({
    ok: true,
    value: {
      status: 'success',
      result: { status: 'ok', data: { page_kind: 'home' } },
    },
  })
  expect(page.requests.map((request) => request.command)).toEqual(['webmcp', 'eval'])
  expect(Object.getOwnPropertySymbols(page.window).map(String)).not.toContain(
    'Symbol(eo2.xhs.adapter-runtime)'
  )
})
it('navigates only the exact tab and rejects a foreign note URL before navigating', async () => {
  const page = fixture()
  expect(await page.execute('search_notes', { keyword: '测试' })).toMatchObject({
    ok: true,
    value: { result: { status: 'navigated' } },
  })
  expect(page.window.location.search).toContain('keyword=')
  const invalid = await page.execute('open_note', {
    note_url: 'https://example.com/explore/12345678',
  })
  expect(invalid).toMatchObject({
    ok: true,
    value: {
      result: { status: 'error', data: { error_code: 'INVALID_TARGET' } },
    },
  })
  expect(page.requests.filter((request) => request.command === 'goto')).toHaveLength(1)
})
it('permits one click on unavailable state and verifies an already liked note', async () => {
  const page = fixture('https://www.xiaohongshu.com/explore/12345678')
  page.window.document.body.innerHTML =
    '<div class="interact-container"><div class="left"><button class="like-lottie"></button></div></div>'
  expect((await page.execute('like_feed')).ok).toBe(true)
  expect(page.requests.filter((request) => request.command === 'click')).toHaveLength(1)
  page.requests.length = 0
  page.window.document.querySelector('button')!.setAttribute('aria-pressed', 'true')
  expect(await page.execute('like_feed', { liked: true })).toMatchObject({
    ok: true,
    value: { result: { status: 'ok', data: { verified: true } } },
  })
})
it('rejects malformed transfer inputs at the actual contract boundary', async () => {
  const page = fixture('https://creator.xiaohongshu.com/publish/publish')
  expect(
    (
      await page.execute('begin_file_transfer', {
        name: 'a.mp4',
        mime: 'video/mp4',
        size: 4294967297,
      })
    ).ok
  ).toBe(false)
  expect(
    (
      await page.execute('write_file_chunk', {
        transfer_id: 'id',
        offset: -1,
        base64: 'YQ==',
      })
    ).ok
  ).toBe(false)
  expect(page.requests).toHaveLength(0)
})

// A file-backed OPFS fixture: the real package still crosses QuickJS, command parsing
// and page evaluation. Browser-specific File/DataTransfer behavior is checked separately.
async function storageFixture() {
  const path = await mkdtemp(join(tmpdir(), 'cw-xhs-package-'))
  const directory = (path: string): any => ({
    kind: 'directory',
    async getDirectoryHandle(name: string, options: { create?: boolean } = {}) {
      const child = join(path, name)
      if (options.create) await mkdir(child, { recursive: true })
      else await readdir(child)
      return directory(child)
    },
    async getFileHandle(name: string, options: { create?: boolean } = {}) {
      const child = join(path, name)
      if (options.create) {
        try {
          await readFile(child)
        } catch {
          await writeFile(child, '')
        }
      } else await readFile(child)
      return {
        kind: 'file',
        async getFile() {
          return new File([await readFile(child)], name)
        },
        async createWritable() {
          let data: string | Uint8Array = ''
          return {
            async write(value: string | Uint8Array) {
              data = value
            },
            async close() {
              await writeFile(child, data)
            },
            async abort() {},
          }
        },
      }
    },
    async *entries() {
      for (const entry of await readdir(path, { withFileTypes: true })) {
        const handle = entry.isDirectory()
          ? directory(join(path, entry.name))
          : await this.getFileHandle(entry.name)
        yield [entry.name, handle]
      }
    },
    async removeEntry(name: string) {
      await rm(join(path, name), { recursive: true })
    },
  })
  return {
    root: directory(path),
    async cleanup() {
      await rm(path, { recursive: true, force: true })
    },
  }
}
it('transfers a full-sized chunk through the real workflow, resumes after document replacement, and enforces offsets and completeness', async () => {
  const storage = await storageFixture()
  try {
    const globals = {
      navigator: {
        storage: {
          getDirectory: async () => storage.root,
          estimate: async () => ({ quota: 1024 ** 3, usage: 0 }),
        },
        locks: {
          request: async (_name: string, run: () => Promise<unknown>) => run(),
        },
      },
    }
    const page = fixture('https://creator.xiaohongshu.com/publish/publish', globals)
    const started = await page.execute('begin_file_transfer', {
      name: 'test.mp4',
      mime: 'video/mp4',
      size: 1048580,
    })
    expect(started).toMatchObject({
      ok: true,
      value: { result: { data: { chunk_size: 1048576, next_offset: 0 } } },
    })
    const id = started.value.result.data.transfer_id
    expect((await page.execute('finish_file_transfer', { transfer_id: id })).ok).toBe(false)
    const bytes = Buffer.alloc(1048576, 7).toString('base64')
    expect(
      await page.execute('write_file_chunk', {
        transfer_id: id,
        offset: 0,
        base64: bytes,
      })
    ).toMatchObject({
      ok: true,
      value: { result: { data: { next_offset: 1048576, duplicate: false } } },
    })
    const refreshed = fixture('https://creator.xiaohongshu.com/publish/publish', globals)
    expect(
      await refreshed.execute('write_file_chunk', {
        transfer_id: id,
        offset: 0,
        base64: bytes,
      })
    ).toMatchObject({
      ok: true,
      value: { result: { data: { next_offset: 1048576, duplicate: true } } },
    })
    expect(
      (
        await refreshed.execute('write_file_chunk', {
          transfer_id: id,
          offset: 0,
          base64: Buffer.alloc(1048576, 8).toString('base64'),
        })
      ).ok
    ).toBe(false)
    expect(
      (
        await refreshed.execute('write_file_chunk', {
          transfer_id: id,
          offset: 2097152,
          base64: 'AQIDBA==',
        })
      ).ok
    ).toBe(false)
    expect(
      await refreshed.execute('write_file_chunk', {
        transfer_id: id,
        offset: 1048576,
        base64: 'AQIDBA==',
      })
    ).toMatchObject({
      ok: true,
      value: { result: { data: { next_offset: 1048580 } } },
    })
    expect(await refreshed.execute('finish_file_transfer', { transfer_id: id })).toMatchObject({
      ok: true,
      value: { result: { data: { file_id: id, size: 1048580 } } },
    })
    expect(await refreshed.execute('finish_file_transfer', { transfer_id: id })).toMatchObject({
      ok: true,
      value: { result: { data: { file_id: id } } },
    })
  } finally {
    await storage.cleanup()
  }
}, 20000)

it('reads the open note through the registered reader without installing business state', async () => {
  const page = fixture('https://www.xiaohongshu.com/explore/12345678')
  page.window.document.body.innerHTML =
    '<div class="note-content"><h1 id="detail-title">Fixture title</h1><div id="detail-desc">Fixture body</div></div>'
  const noteResult = await page.execute('read_current_note')
  expect(noteResult).toMatchObject({
    ok: true,
    value: {
      result: {
        status: 'ok',
        data: {
          note_id: '12345678',
          title: 'Fixture title',
          body: 'Fixture body',
        },
      },
    },
  })
})

it('requires an explicit suggestion identity before selecting topics or products', async () => {
  const page = fixture('https://creator.xiaohongshu.com/publish/publish')
  page.window.document.body.innerHTML =
    '<div id="creator-editor-topic-container"><button class="item">Unrequested topic</button></div><div class="multi-goods-selector-modal"><div class="good-card-container">Unrequested product</div></div>'
  for (const tool of ['publish_content', 'publish_video']) {
    expect((await page.execute(tool, { action: 'select_topic' })).ok).toBe(false)
    expect((await page.execute(tool, { action: 'select_product' })).ok).toBe(false)
  }
  expect(page.requests.some((request) => request.command === 'click')).toBe(false)
})

it('prefers a rendered exact-ID note card and keeps its token; stale search cards do not navigate', async () => {
  const page = fixture('https://www.xiaohongshu.com/search_result?keyword=test')
  page.window.document.body.innerHTML =
    '<section class="note-item"><a href="/explore/12345678?xsec_token=card-token&xsec_source=pc_search">Cover</a><span class="title">Result</span></section>'
  const result = await page.execute('open_note', {
    note_url: 'https://www.xiaohongshu.com/explore/12345678',
  })
  expect(result).toMatchObject({
    ok: true,
    value: {
      result: {
        status: 'navigated',
        data: {
          navigation_method: 'page_click',
          url: expect.stringContaining('card-token'),
        },
      },
    },
  })
  expect(page.requests.filter((r) => r.command === 'click')).toHaveLength(1)
  expect(page.requests.some((r) => r.command === 'goto')).toBe(false)
  page.window.happyDOM.setURL('https://www.xiaohongshu.com/search_result?keyword=test')
  const stale = await page.execute('open_note', {
    note_url: 'https://www.xiaohongshu.com/explore/87654321?xsec_token=old',
  })
  expect(stale).toMatchObject({
    ok: true,
    value: {
      result: { status: 'error', data: { error_code: 'STALE_RESULT' } },
    },
  })
  expect(page.requests.filter((r) => r.command === 'click')).toHaveLength(1)
})
it('opens delayed login panels through site controls and omits private fields', async () => {
  const page = fixture()
  ;(page.window as any).__INITIAL_STATE__ = {
    user: { userInfo: { guest: true } },
  }
  page.window.document.body.innerHTML =
    '<div class="main-container"><div class="side-bar"><button>登录</button></div></div>'
  page.window.document
    .querySelector('button')!
    .addEventListener('click', () =>
      setTimeout(
        () =>
          page.window.document.body.insertAdjacentHTML(
            'beforeend',
            '<div class="login-container"><img class="qrcode-img" src="PRIVATE_QR"><input value="PRIVATE_PHONE"></div>'
          ),
        30
      )
    )
  const result = await page.execute('open_login')
  expect(result).toMatchObject({
    ok: true,
    value: {
      result: {
        status: 'ok',
        data: { login_panel_visible: true, qr_visible: true },
      },
    },
  })
  expect(JSON.stringify(result)).not.toContain('PRIVATE_')
})
it('submits once, waits for delayed comment evidence, and resumes without duplicate submission', async () => {
  const page = fixture('https://www.xiaohongshu.com/explore/12345678')
  page.window.document.body.innerHTML =
    '<div class="comments-container"></div><div class="comment-input"><textarea></textarea><button>发送</button></div>'
  let submitted = 0
  page.window.document.querySelector('button')!.addEventListener('click', () => {
    submitted++
    setTimeout(
      () =>
        page.window.document
          .querySelector('.comments-container')!
          .insertAdjacentHTML('beforeend', '<div class="comment-item">Hello workflow</div>'),
      40
    )
  })
  const input = { content: 'Hello workflow', operation_id: 'comment-fixture' }
  const commentResult = await page.execute('post_comment_to_feed', input)
  expect(commentResult).toMatchObject({
    ok: true,
    value: {
      result: { status: 'ok', data: { submitted: true, verified: true } },
    },
  })
  expect(await page.execute('post_comment_to_feed', input)).toMatchObject({
    ok: true,
    value: {
      result: { status: 'ok', data: { verified: true, resubmitted: false } },
    },
  })
  expect(submitted).toBe(1)
})
it('falls back to the legacy comment editor entry, input, and submit controls', async () => {
  const page = fixture('https://www.xiaohongshu.com/explore/12345678')
  page.window.document.body.innerHTML =
    '<div class="comments-container"></div><div class="input-box"><div class="content-edit"><span>说点什么</span></div></div><div class="bottom"><button class="submit">发送</button></div>'
  let entryClicks = 0
  let submitted = 0
  page.window.document.querySelector('.content-edit span')!.addEventListener('click', () => {
    entryClicks++
    page.window.document
      .querySelector('.content-edit')!
      .insertAdjacentHTML('beforeend', '<p class="content-input" contenteditable="true"></p>')
  })
  page.window.document.querySelector('.bottom .submit')!.addEventListener('click', () => {
    submitted++
    const content = page.window.document.querySelector('.content-input')!.textContent
    page.window.document
      .querySelector('.comments-container')!
      .insertAdjacentHTML('beforeend', '<div class="comment-item">' + content + '</div>')
  })
  const legacyCommentResult = await page.execute('post_comment_to_feed', {
    content: 'Legacy comment',
  })
  expect(legacyCommentResult).toMatchObject({
    ok: true,
    value: { result: { status: 'ok', data: { verified: true } } },
  })
  expect(entryClicks).toBe(1)
  expect(submitted).toBe(1)
})
it('expands an existing collapsed comment editor before submitting and verifies unique IDs', async () => {
  const page = fixture('https://www.xiaohongshu.com/explore/12345678')
  page.window.document.body.innerHTML =
    '<div class="comments-container"><div class="parent-comment" data-comment-id="p1"><div class="comment-item" data-comment-id="p1">Existing parent</div><div class="reply-item" data-comment-id="r1">Existing reply</div></div></div><div class="input-box"><div class="content-edit"><span>说点什么</span><p class="content-input" contenteditable="true"></p></div></div><div class="bottom" style="opacity:0;height:0px"><button class="submit">发送</button></div>'
  const bottom = page.window.document.querySelector(
    '.bottom'
  ) as unknown as HTMLElement
  let entryClicks = 0
  let submitted = 0
  page.window.document.querySelector('.content-edit span')!.addEventListener('click', () => {
    entryClicks++
    bottom.style.opacity = '1'
    bottom.style.height = '56px'
  })
  page.window.document.querySelector('.bottom .submit')!.addEventListener('click', () => {
    submitted++
    page.window.document
      .querySelector('.comments-container')!
      .insertAdjacentHTML(
        'afterbegin',
        '<div class="comment-item" data-comment-id="c-new">Collapsed editor comment</div>'
      )
  })
  const input = {
    content: 'Collapsed editor comment',
    operation_id: 'collapsed-comment',
  }
  expect(await page.execute('post_comment_to_feed', input)).toMatchObject({
    ok: true,
    value: {
      result: {
        status: 'ok',
        data: {
          submitted: true,
          verified: true,
          ids: ['p1', 'r1'],
        },
      },
    },
  })
  expect(entryClicks).toBe(1)
  expect(submitted).toBe(1)
  expect(
    await page.execute('post_comment_to_feed', {
      action: 'status',
      operation_id: 'collapsed-comment',
    })
  ).toMatchObject({
    ok: true,
    value: {
      result: {
        status: 'ok',
        data: { submitted: true, verified: true, resubmitted: false },
      },
    },
  })
})
it('records an uncertain comment click and never resubmits it automatically', async () => {
  let browserClickAttempts = 0
  const page = fixture(
    'https://www.xiaohongshu.com/explore/12345678',
    {},
    { failClick: () => ++browserClickAttempts === 2 }
  )
  page.window.document.body.innerHTML =
    '<div class="comments-container"></div><div class="input-box"><div class="content-edit"><span>说点什么</span><p class="content-input" contenteditable="true"></p></div></div><div class="bottom" style="opacity:0;height:0px"><button class="submit">发送</button></div>'
  const bottom = page.window.document.querySelector(
    '.bottom'
  ) as unknown as HTMLElement
  page.window.document.querySelector('.content-edit span')!.addEventListener('click', () => {
    bottom.style.opacity = '1'
    bottom.style.height = '56px'
  })
  expect(
    await page.execute('post_comment_to_feed', {
      content: 'Uncertain comment',
      operation_id: 'uncertain-comment',
    })
  ).toMatchObject({
    ok: true,
    value: {
      result: {
        status: 'pending',
        data: {
          phase: 'click_uncertain',
          submission_attempted: true,
          click_completed: false,
          submission_uncertain: true,
          requires_inspection: true,
          submitted: false,
          verified: false,
        },
      },
    },
  })
  expect(browserClickAttempts).toBe(2)
  expect(
    await page.execute('post_comment_to_feed', {
      action: 'status',
      operation_id: 'uncertain-comment',
    })
  ).toMatchObject({
    ok: true,
    value: {
      result: {
        status: 'pending',
        data: {
          phase: 'click_uncertain',
          submission_uncertain: true,
          resubmitted: false,
        },
      },
    },
  })
  expect(browserClickAttempts).toBe(2)
})
it('does not verify comment evidence after the page leaves the original note', async () => {
  const page = fixture('https://www.xiaohongshu.com/explore/12345678')
  page.window.document.body.innerHTML =
    '<div class="comments-container"></div><div class="comment-input"><textarea></textarea><button>发送</button></div>'
  page.window.document.querySelector('button')!.addEventListener('click', () => {
    page.window.happyDOM.setURL('https://www.xiaohongshu.com/explore/87654321')
    page.window.document
      .querySelector('.comments-container')!
      .insertAdjacentHTML(
        'beforeend',
        '<div class="comment-item" data-comment-id="other-note">Changed-page comment</div>'
      )
  })
  expect(
    await page.execute('post_comment_to_feed', {
      content: 'Changed-page comment',
      operation_id: 'changed-page-comment',
    })
  ).toMatchObject({
    ok: true,
    value: {
      result: {
        status: 'pending',
        data: {
          submitted: false,
          verified: false,
          page_changed: true,
          submission_uncertain: true,
          requires_inspection: true,
        },
      },
    },
  })
})
it('finds a reply target by author ID using the workflow rather than requiring a comment ID', async () => {
  const page = fixture('https://www.xiaohongshu.com/explore/12345678')
  page.window.document.body.innerHTML =
    '<div class="comments-container"><div class="comment-item" data-comment-id="c1"><a href="/user/profile/author123">Alice</a><button class="reply">回复</button></div></div><div class="comment-input"><textarea></textarea><button>发送</button></div>'
  let replyClicked = false
  page.window.document.querySelector('.reply')!.addEventListener('click', () => {
    replyClicked = true
  })
  page.window.document
    .querySelector('.comment-input button')!
    .addEventListener('click', () =>
      page.window.document
        .querySelector('.comments-container')!
        .insertAdjacentHTML('beforeend', '<div class="reply-item">Workflow reply</div>')
    )
  const replyResult = await page.execute('reply_comment_in_feed', {
    user_id: 'author123',
    content: 'Workflow reply',
  })
  expect(replyResult).toMatchObject({
    ok: true,
    value: { result: { status: 'ok', data: { verified: true } } },
  })
  expect(replyClicked).toBe(true)
})
it('falls back to the legacy reply editor entry, input, and submit controls', async () => {
  const page = fixture('https://www.xiaohongshu.com/explore/12345678')
  page.window.document.body.innerHTML =
    '<div class="comments-container"><div class="comment-item" data-comment-id="c1"><a href="/user/profile/author123">Alice</a><button class="reply">回复</button></div></div><div class="bottom"><button class="submit">发送</button></div>'
  let entryClicks = 0
  let submitted = 0
  page.window.document.querySelector('.reply')!.addEventListener('click', () => {
    page.window.document.body.insertAdjacentHTML(
      'afterbegin',
      '<div class="input-box"><div class="content-edit"><span>说点什么</span></div></div>'
    )
    // Install the fixture's handler synchronously with its rendered control.
    // A polling timer races the workflow's immediate click under suite load.
    page.window.document.querySelector('.content-edit span')!.addEventListener('click', () => {
      entryClicks++
      page.window.document
        .querySelector('.content-edit')!
        .insertAdjacentHTML('beforeend', '<p class="content-input" contenteditable="true"></p>')
    })
  })
  page.window.document.querySelector('.bottom .submit')!.addEventListener('click', () => {
    submitted++
    const content = page.window.document.querySelector('.content-input')!.textContent
    page.window.document
      .querySelector('.comments-container')!
      .insertAdjacentHTML('beforeend', '<div class="reply-item">' + content + '</div>')
  })
  expect(
    await page.execute('reply_comment_in_feed', {
      user_id: 'author123',
      content: 'Legacy reply',
    })
  ).toMatchObject({
    ok: true,
    value: { result: { status: 'ok', data: { verified: true } } },
  })
  expect(entryClicks).toBe(1)
  expect(submitted).toBe(1)
})
it('keeps reply input and submission scoped to the selected comment', async () => {
  const page = fixture('https://www.xiaohongshu.com/explore/12345678')
  page.window.document.body.innerHTML =
    '<div class="comments-container"><div class="parent-comment" data-comment-id="p1"><div class="comment-item" data-comment-id="c1"><a href="/user/profile/stale">Stale</a><button class="reply">回复</button></div><div class="comment-input"><textarea></textarea><button class="stale-submit">发送</button></div></div><div class="parent-comment" data-comment-id="p2"><div class="comment-item" data-comment-id="c2"><a href="/user/profile/target">Target</a><button class="reply">回复</button></div></div></div>'
  let staleSubmissions = 0
  let targetSubmissions = 0
  page.window.document
    .querySelector('.stale-submit')!
    .addEventListener('click', () => {
      staleSubmissions++
    })
  page.window.document
    .querySelectorAll('.reply')[1]!
    .addEventListener('click', () => {
      page.window.document
        .querySelector('[data-comment-id="p2"]')!
        .insertAdjacentHTML(
          'beforeend',
          '<div class="comment-input"><textarea></textarea><button class="target-submit">发送</button></div>'
        )
      page.window.document
        .querySelector('.target-submit')!
        .addEventListener('click', () => {
          targetSubmissions++
          const content = (
            page.window.document.querySelector(
              '[data-comment-id="p2"] .comment-input textarea'
            ) as unknown as HTMLTextAreaElement
          ).value
          page.window.document
            .querySelector('.comments-container')!
            .insertAdjacentHTML(
              'beforeend',
              '<div class="reply-item" data-comment-id="r-new">' +
                content +
                '</div>'
            )
        })
    })
  expect(
    await page.execute('reply_comment_in_feed', {
      user_id: 'target',
      content: 'Scoped reply',
    })
  ).toMatchObject({
    ok: true,
    value: { result: { status: 'ok', data: { verified: true } } },
  })
  expect(staleSubmissions).toBe(0)
  expect(targetSubmissions).toBe(1)
})
it('expands a collapsed reply editor and supports status lookup without repeating the body', async () => {
  const page = fixture('https://www.xiaohongshu.com/explore/12345678')
  page.window.document.body.innerHTML =
    '<div class="comments-container"><div class="comment-item" data-comment-id="c1"><a href="/user/profile/author123">Alice</a><button class="reply">回复</button></div></div><div class="input-box"><div class="content-edit"><span>说点什么</span><p class="content-input" contenteditable="true"></p></div></div><div class="bottom" style="opacity:0;height:0px"><button class="submit">发送</button></div>'
  const bottom = page.window.document.querySelector(
    '.bottom'
  ) as unknown as HTMLElement
  let entryClicks = 0
  let submitted = 0
  page.window.document.querySelector('.reply')!.addEventListener('click', () => {})
  page.window.document.querySelector('.content-edit span')!.addEventListener('click', () => {
    entryClicks++
    bottom.style.opacity = '1'
    bottom.style.height = '56px'
  })
  page.window.document.querySelector('.bottom .submit')!.addEventListener('click', () => {
    submitted++
    page.window.document
      .querySelector('.comments-container')!
      .insertAdjacentHTML(
        'beforeend',
        '<div class="reply-item" data-comment-id="r-new">Collapsed reply editor</div>'
      )
  })
  expect(
    await page.execute('reply_comment_in_feed', {
      user_id: 'author123',
      content: 'Collapsed reply editor',
      operation_id: 'collapsed-reply',
    })
  ).toMatchObject({
    ok: true,
    value: {
      result: {
        status: 'ok',
        data: { submitted: true, verified: true },
      },
    },
  })
  expect(entryClicks).toBe(1)
  expect(submitted).toBe(1)
  expect(
    await page.execute('reply_comment_in_feed', {
      action: 'status',
      operation_id: 'collapsed-reply',
    })
  ).toMatchObject({
    ok: true,
    value: {
      result: {
        status: 'ok',
        data: { submitted: true, verified: true, resubmitted: false },
      },
    },
  })
})
it.each(['post_comment_to_feed', 'reply_comment_in_feed'] as const)(
  'returns immediately when %s starts note navigation',
  async (tool) => {
    const page = fixture()
    const input =
      tool === 'post_comment_to_feed'
        ? {
            note_url:
              'https://www.xiaohongshu.com/explore/87654321?xsec_token=fixture',
            content: 'Navigation comment',
            operation_id: 'navigation-comment',
          }
        : {
            note_url:
              'https://www.xiaohongshu.com/explore/87654321?xsec_token=fixture',
            content: 'Navigation reply',
            operation_id: 'navigation-reply',
            user_id: 'author123',
          }
    expect(await page.execute(tool, input)).toMatchObject({
      ok: true,
      value: {
        result: {
          status: 'navigated',
          data: { submission_attempted: false },
        },
      },
    })
    expect(page.requests.filter((request) => request.command === 'fill')).toHaveLength(
      0
    )
    expect(page.requests.filter((request) => request.command === 'type')).toHaveLength(
      0
    )
  }
)
it('runs batch publishing steps and resumes the journal without inserting a topic twice', async () => {
  const page = fixture('https://creator.xiaohongshu.com/publish/publish')
  page.window.document.body.innerHTML =
    '<div class="d-input"><input></div><div role="textbox" contenteditable="true"></div><div id="creator-editor-topic-container"><button class="item">Topic one</button></div>'
  let selected = 0
  page.window.document.querySelector('.item')!.addEventListener('click', () => {
    selected++
  })
  const configured = await page.execute('publish_content', {
    action: 'configure',
    operation_id: 'draft-fixture',
    title: 'Title',
    content: 'Body',
    tags: ['Topic one'],
  })
  expect(configured).toMatchObject({
    ok: true,
    value: {
      result: {
        data: { completed_steps: 3, total_steps: 3, next_action: 'status' },
      },
    },
  })
  expect(selected).toBe(1)
  expect(
    await page.execute('publish_content', {
      action: 'resume',
      operation_id: 'draft-fixture',
    })
  ).toMatchObject({
    ok: true,
    value: { result: { data: { completed_steps: 3 } } },
  })
  expect(selected).toBe(1)
})
it('treats a hidden exact-video as uploaded media and allows configuring the video draft', async () => {
  const page = fixture('https://creator.xiaohongshu.com/publish/publish')
  expect(
    await page.execute('publish_video', {
      action: 'prepare',
      operation_id: 'ready-video',
      file_ids: ['ready-video-file'],
    })
  ).toMatchObject({ ok: true })
  page.window.document.body.innerHTML =
    '<div class="d-input"><input></div><div role="textbox" contenteditable="true"></div><div class="video-preview"><video class="exact-video"></video></div><div class="upload-status">检测为高清视频</div>'
  const video = page.window.document.querySelector('video')!
  Object.defineProperty(video, 'getClientRects', {
    configurable: true,
    value: () => [],
  })
  Object.defineProperty(video, 'getBoundingClientRect', {
    configurable: true,
    value: () => new page.window.DOMRect(0, 0, 0, 0),
  })
  page.window.sessionStorage.setItem(
    'cw-xhs-uploads-video',
    JSON.stringify([
      {
        file_id: 'ready-video-file',
        supplied: true,
        phase: 'supplied',
        started_at: Date.now(),
      },
    ])
  )
  expect(await page.execute('publish_video', { action: 'wait' })).toMatchObject({
    ok: true,
    value: {
      result: {
        status: 'ok',
        data: {
          preview_count: 1,
          visible_preview_count: 0,
          processed: true,
        },
      },
    },
  })
  expect(
    await page.execute('publish_video', {
      action: 'configure',
      title: 'Hidden video title',
      content: 'Hidden video body',
    })
  ).toMatchObject({
    ok: true,
    value: {
      result: {
        status: 'pending',
        data: { completed_steps: 1, total_steps: 1, next_action: 'status' },
      },
    },
  })
  expect(page.window.document.querySelector('input')!.value).toBe(
    'Hidden video title'
  )
  expect(
    page.window.document.querySelector('[role="textbox"]')!.textContent
  ).toBe('Hidden video body')
})
it.each(['publish_content', 'publish_video'] as const)(
  'finds the publish button in xhs-publish-btn shadow state and reports published only from the URL for %s',
  async (tool) => {
    const page = fixture('https://creator.xiaohongshu.com/publish/publish')
    page.window.document.body.innerHTML =
      '<div class="d-input"><input></div><div role="textbox" contenteditable="true"></div><xhs-publish-btn></xhs-publish-btn>'
    const host = page.window.document.querySelector('xhs-publish-btn')!
    const shadow = host.attachShadow({ mode: 'closed' })
    shadow.innerHTML =
      '<div class="publish-page-publish-btn"><button class="ce-btn white">暂存离开</button><button class="ce-btn bg-red">发布</button></div>'
    Object.defineProperty(host, '_sr', { value: shadow })
    expect(await page.execute(tool, { action: 'status' })).toMatchObject({
      ok: true,
      value: {
        result: {
          status: 'ok',
          data: { publish_button_ready: true, published: null },
        },
      },
    })
    page.window.happyDOM.setURL(
      'https://creator.xiaohongshu.com/publish/publish?source=official&published=true'
    )
    expect(await page.execute(tool, { action: 'status' })).toMatchObject({
      ok: true,
      value: {
        result: {
          status: 'ok',
          data: { publish_button_ready: true, published: true },
        },
      },
    })
  }
)
it('demonstrates that the actual adapter sandbox cannot directly call Bash or read a workspace file', async () => {
  const source = `export default {inputSchema:{type:'object'},outputSchema:{type:'object'},tree:{type:'action',async run({state}){state.result={bash:typeof bash,fs:typeof fs,fetch:typeof fetch};try{await browser.exec('read-file',['/workspace/media.png']);state.result.read=true}catch(error){state.result.read=false;state.result.error=error.message}return 'success'}},result({state}){return state.result}}`
  const result = await executeAdapterWorkflow(
    wasm,
    source,
    {},
    async () => {
      throw new Error('Unexpected browser call')
    },
    new AbortController().signal,
    { tabId: 7, url: 'https://creator.xiaohongshu.com/publish/publish' }
  )
  expect(result).toMatchObject({
    ok: true,
    value: {
      result: {
        bash: 'undefined',
        fs: 'undefined',
        fetch: 'undefined',
        read: false,
      },
    },
  })
})

it('downloads a remote source in bounded chunks, validates its media signature, and finishes idempotently', async () => {
  const storage = await storageFixture()
  try {
    const data = new Uint8Array(1048580)
    data.set([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109])
    let fetches = 0
    const page = fixture('https://creator.xiaohongshu.com/publish/publish', {
      navigator: {
        storage: {
          getDirectory: async () => storage.root,
          estimate: async () => ({ quota: 1024 ** 3, usage: 0 }),
        },
        locks: {
          request: async (_name: string, run: () => Promise<unknown>) => run(),
        },
      },
      fetch: async () => {
        fetches++
        return new Response(data, {
          headers: {
            'content-length': String(data.length),
            'content-type': 'video/mp4',
            etag: 'fixture-v1',
          },
        })
      },
    })
    const downloaded = await page.execute('transfer_remote_file', {
      url: 'https://media.example/test.mp4',
    })
    expect(downloaded).toMatchObject({
      ok: true,
      value: {
        result: {
          status: 'ok',
          data: { complete: true, next_offset: data.length },
        },
      },
    })
    const { file_id, transfer_id } = downloaded.value.result.data
    expect(await page.execute('prepare_media', { file_id })).toMatchObject({
      ok: true,
      value: {
        result: {
          status: 'ok',
          data: {
            file_id,
            mime: 'video/mp4',
            signature_verified: true,
            converted: false,
          },
        },
      },
    })
    expect(
      await page.execute('transfer_remote_file', {
        url: 'https://media.example/test.mp4',
        transfer_id,
      })
    ).toMatchObject({
      ok: true,
      value: { result: { status: 'ok', data: { file_id } } },
    })
    expect(
      await page.execute('transfer_remote_file', {
        url: 'https://media.example/changed.mp4',
        transfer_id,
      })
    ).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('source URL changed') },
    })
    expect(fetches).toBe(1)
  } finally {
    await storage.cleanup()
  }
})
it('reveals filters and verifies both selection and a refreshed result fingerprint', async () => {
  const page = fixture('https://www.xiaohongshu.com/search_result?keyword=test')
  page.window.document.body.innerHTML =
    '<div class="filter">筛选</div><div id="results"><section class="note-item"><a href="/explore/12345678?xsec_token=old">Old</a><span class="title">Old</span></section></div>'
  page.window.document.querySelector('.filter')!.addEventListener('mouseenter', () => {
    if (page.window.document.querySelector('.filters')) return
    page.window.document.body.insertAdjacentHTML(
      'beforeend',
      '<div class="filter-panel"><div class="filters"><span>排序依据</span><div class="tags" aria-selected="true">综合</div><div class="tags">最新</div><div class="tags">最多点赞</div><div class="tags">最多评论</div><div class="tags">最多收藏</div></div></div>'
    )
    const tags = Array.from(page.window.document.querySelectorAll('.tags'))
    tags.forEach((el, i) =>
      Object.defineProperty(el, 'getBoundingClientRect', {
        value: () => new page.window.DOMRect(10 + i * 80, 10, 70, 28),
      })
    )
    Object.defineProperty(page.window.document, 'elementFromPoint', {
      configurable: true,
      value: (x: number, y: number) =>
        tags.find((el) => {
          const r = el.getBoundingClientRect()
          return x > r.left && x < r.right && y > r.top && y < r.bottom
        }) || null,
    })
    tags[1].addEventListener('click', () => {
      tags[0].setAttribute('aria-selected', 'false')
      tags[1].setAttribute('aria-selected', 'true')
      page.window.document.querySelector('#results')!.innerHTML =
        '<section class="note-item"><a href="/explore/87654321?xsec_token=new">New</a><span class="title">New</span></section>'
    })
  })
  const revealed = await page.execute('get_search_filters')
  expect(revealed).toMatchObject({
    ok: true,
    value: { result: { status: 'ok' } },
  })
  expect(page.window.document.querySelector('.filters')).not.toBeNull()
  const applied = await page.execute('apply_search_filters', {
    filters: { sort_by: '最新' },
  })
  expect(applied).toMatchObject({
    ok: true,
    value: {
      result: {
        status: 'ok',
        data: { selection_verified: true, results_refresh: 'observed' },
      },
    },
  })
  expect(page.window.sessionStorage.getItem('cw-xhs-filter-refresh')).toBe('null')
})
it('loads multiple reply-expansion rounds and stops at the configured limit', async () => {
  const page = fixture('https://www.xiaohongshu.com/explore/12345678')
  ;(page.window as any).__INITIAL_STATE__ = {
    user: { userInfo: { guest: false, userId: 'fixture' } },
  }
  page.window.document.body.innerHTML =
    '<div class="note-scroller"><div class="comments-container"><div class="parent-comment" data-comment-id="p1"><div class="comment-item"><span class="user-name">Alice</span><div class="content">Parent</div></div><div class="reply-container"></div><div class="show-more">展开 2 条回复</div></div></div></div>'
  let clicks = 0
  const control = page.window.document.querySelector('.show-more')!
  control.addEventListener('click', () => {
    clicks++
    page.window.document
      .querySelector('.reply-container')!
      .insertAdjacentHTML(
        'beforeend',
        `<div class="comment-item" data-comment-id="r${clicks}"><span class="user-name">Bob</span><div class="content">Reply ${clicks}</div></div>`
      )
  })
  const result = await page.execute('load_more_comments', {
    expand_replies: true,
    max_rounds: 2,
    reply_limit: 10,
  })
  expect(result).toMatchObject({
    ok: true,
    value: {
      result: {
        data: {
          attempted_rounds: 2,
          loaded_reply_count: 2,
          stop_reason: 'round_limit',
        },
      },
    },
  })
  expect(clicks).toBe(2)
})
it('retries an observed incorrect like state once and verifies the second click', async () => {
  const page = fixture('https://www.xiaohongshu.com/explore/12345678')
  ;(page.window as any).__INITIAL_STATE__ = {
    note: {
      noteDetailMap: {
        '12345678': { note: { interactInfo: { liked: false } } },
      },
    },
  }
  page.window.document.body.innerHTML =
    '<div class="interact-container"><div class="left"><button class="like-lottie"></button></div></div>'
  let clicks = 0
  page.window.document.querySelector('button')!.addEventListener('click', () => {
    clicks++
    if (clicks === 2)
      (page.window as any).__INITIAL_STATE__.note.noteDetailMap[
        '12345678'
      ].note.interactInfo.liked = true
  })
  expect(await page.execute('like_feed', { liked: true })).toMatchObject({
    ok: true,
    value: {
      result: { status: 'ok', data: { verified: true, click_attempts: 2 } },
    },
  })
  expect(clicks).toBe(2)
}, 12000)
it.each(['publish_content', 'publish_video'] as const)(
  'preserves manually edited text during partial configuration for %s',
  async (tool) => {
    const page = fixture('https://creator.xiaohongshu.com/publish/publish')
    page.window.document.body.innerHTML =
      '<div class="d-input"><input></div><div role="textbox" contenteditable="true"></div><div class="permission-card-wrapper"><div class="d-select-content">公开可见</div></div>'
    expect(
      await page.execute(tool, {
        action: 'prepare',
        operation_id: 'prepared-draft',
        title: 'Initial title',
        content: 'Retained body',
      })
    ).toMatchObject({
      ok: true,
      value: { result: { data: { operation_id: 'prepared-draft' } } },
    })
    expect(
      await page.execute(tool, {
        action: 'configure',
        title: 'Updated title',
      })
    ).toMatchObject({
      ok: true,
      value: {
        result: {
          data: {
            operation_id: 'prepared-draft',
            completed_steps: 1,
            total_steps: 1,
          },
        },
      },
    })
    expect(page.window.document.querySelector('input')!.value).toBe('Updated title')
    expect(page.window.document.querySelector('[role="textbox"]')!.textContent).toBe(
      'Retained body'
    )
    const input = page.window.document.querySelector('input')!
    const editor = page.window.document.querySelector('[role="textbox"]') as unknown as HTMLElement
    input.value = 'Manually edited title'
    editor.innerText = 'Manually edited body'
    expect(
      await page.execute(tool, {
        action: 'configure',
        visibility: '公开可见',
      })
    ).toMatchObject({
      ok: true,
      value: {
        result: {
          data: {
            operation_id: 'prepared-draft',
            completed_steps: 1,
            total_steps: 1,
          },
        },
      },
    })
    expect(input.value).toBe('Manually edited title')
    expect(editor.innerText).toBe('Manually edited body')
    expect(
      await page.execute(tool, {
        action: 'prepare',
        operation_id: 'ordered-files',
        file_ids: ['expected-file'],
      })
    ).toMatchObject({ ok: true })
    const invalid = await page.execute(tool, {
      action: 'upload',
      file_id: 'another-file',
    })
    expect(invalid).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('prepared file_id order') },
    })
  }
)
it.each(['publish_content', 'publish_video'] as const)(
  'preserves manual edits when visibility is the first configure call for %s',
  async (tool) => {
    const page = fixture('https://creator.xiaohongshu.com/publish/publish')
    page.window.document.body.innerHTML =
      '<div class="d-input"><input></div><div role="textbox" contenteditable="true"></div><div class="permission-card-wrapper"><div class="d-select-content">公开可见</div></div>'
    expect(
      await page.execute(tool, {
        action: 'prepare',
        operation_id: 'manual-first-configure',
        title: 'Prepared title',
        content: 'Prepared body',
      })
    ).toMatchObject({ ok: true })
    const input = page.window.document.querySelector('input')!
    const editor = page.window.document.querySelector('[role="textbox"]') as unknown as HTMLElement
    input.value = 'Manual title'
    editor.innerText = 'Manual body'
    expect(
      await page.execute(tool, {
        action: 'configure',
        visibility: '公开可见',
      })
    ).toMatchObject({
      ok: true,
      value: {
        result: {
          data: {
            operation_id: 'manual-first-configure',
            completed_steps: 1,
            total_steps: 1,
          },
        },
      },
    })
    expect(input.value).toBe('Manual title')
    expect(editor.innerText).toBe('Manual body')
  }
)

it('opens profiles from user IDs in the exact tab without waiting on site resources', async () => {
  const page = fixture()
  const result = await page.execute('open_profile', { user_id: '5571492f8a75e13d9393c020' })
  expect(result).toMatchObject({ ok: true, value: { result: { status: 'navigated' } } })
  expect(page.requests.find((request) => request.command === 'goto')).toMatchObject({
    positionals: ['https://www.xiaohongshu.com/user/profile/5571492f8a75e13d9393c020'],
    options: { tab: '7', 'wait-until': 'commit' },
  })
  page.requests.length = 0
  expect(await page.execute('open_profile', { user_id: '../invalid' })).toMatchObject({
    ok: true,
    value: { result: { status: 'error', data: { error_code: 'INVALID_TARGET' } } },
  })
  expect(page.requests.some((request) => request.command === 'goto')).toBe(false)
})

it('uses the same search reader for read_page and list_search_results', async () => {
  const page = fixture('https://www.xiaohongshu.com/search_result?keyword=test')
  page.window.document.body.innerHTML =
    '<section class="note-item"><a href="/explore/12345678?xsec_token=token">Cover</a><span class="title">Result</span></section>'
  const direct = await page.execute('list_search_results', { limit: 20 })
  const unified = await page.execute('read_page', { view: 'list_search_results', limit: 20 })
  expect(unified.value.result).toEqual(direct.value.result)
  expect(unified.value.result.data.items).toHaveLength(1)
})

it('navigates and verifies a like in one invocation rather than reporting navigation as completion', async () => {
  const page = fixture()
  page.window.document.body.innerHTML =
    '<div class="interact-container"><div class="left"><button class="like-lottie" aria-pressed="false"></button></div></div>'
  const button = page.window.document.querySelector('button')!
  button.addEventListener('click', () => button.setAttribute('aria-pressed', 'true'))
  const result = await page.execute('like_feed', {
    feed_id: '12345678',
    xsec_token: 'fixture',
    liked: true,
  })
  expect(result).toMatchObject({
    ok: true,
    value: { result: { status: 'ok', data: { verified: true, click_attempts: 1 } } },
  })
})

it.each(['publish_content', 'publish_video'])(
  'returns a cross-origin continuation and recoverable editor errors for %s',
  async (tool) => {
    const page = fixture()
    const opened = await page.execute(tool, { action: 'open' })
    expect(opened).toMatchObject({
      ok: true,
      value: {
        result: {
          data: {
            continuation: {
              tab_id: 7,
              origin: 'https://creator.xiaohongshu.com',
              tool_name: 'com.xiaohongshu.main.' + tool,
            },
          },
        },
      },
    })
    for (const action of ['write_text', 'configure']) {
      expect(await page.execute(tool, { action, title: 'Test' })).toMatchObject({
        ok: true,
        value: {
          result: {
            status: 'error',
            data: { error_code: 'MEDIA_REQUIRED', next_action: 'upload' },
          },
        },
      })
    }
    const kind = tool === 'publish_content' ? 'image' : 'video'
    page.window.sessionStorage.setItem(
      'cw-xhs-uploads-' + kind,
      JSON.stringify([
        { file_id: 'consumed', supplied: true, phase: 'supplied', started_at: Date.now() - 310000 },
      ])
    )
    page.window.sessionStorage.setItem('unrelated', 'keep')
    expect(await page.execute(tool, { action: 'wait' })).toMatchObject({
      ok: true,
      value: {
        result: {
          status: 'error',
          data: { error_code: 'UPLOAD_STALLED', next_action: 'reset' },
        },
      },
    })
    expect(await page.execute(tool, { action: 'reset' })).toMatchObject({
      ok: true,
      value: { result: { status: 'ok' } },
    })
    expect(page.window.sessionStorage.getItem('cw-xhs-uploads-' + kind)).toBeNull()
    expect(page.window.sessionStorage.getItem('unrelated')).toBe('keep')
  }
)

it('keeps open_home discoverable on notes, profiles and the creator origin', () => {
  const home = manifest.tools.find((tool: { name: string }) => tool.name === 'open_home')
  for (const url of [
    'https://www.xiaohongshu.com/explore/12345678',
    'https://www.xiaohongshu.com/user/profile/12345678',
    'https://creator.xiaohongshu.com/publish/publish',
  ]) {
    expect(new RegExp(home.urlRegex).test(url)).toBe(true)
  }
})

it('rejects an image on the video input before consuming the file and permits operation reset', async () => {
  const storage = await storageFixture()
  try {
    const page = fixture('https://creator.xiaohongshu.com/publish/publish', {
      navigator: {
        storage: {
          getDirectory: async () => storage.root,
          estimate: async () => ({ quota: 1024 ** 3, usage: 0 }),
        },
        locks: { request: async (_: string, run: () => Promise<unknown>) => run() },
      },
    })
    page.window.document.body.innerHTML =
      '<input class="upload-input" type="file" accept="video/*">'
    const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
    const begun = await page.execute('begin_file_transfer', {
      name: 'test.png',
      mime: 'image/png',
      size: bytes.length,
    })
    const id = begun.value.result.data.transfer_id
    await page.execute('write_file_chunk', {
      transfer_id: id,
      offset: 0,
      base64: bytes.toString('base64'),
    })
    await page.execute('finish_file_transfer', { transfer_id: id })
    const uploaded = await page.execute('publish_content', { action: 'upload', file_id: id })
    expect(uploaded).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('File input unavailable') },
    })
    const directory = await (
      await storage.root.getDirectoryHandle('cw-xhs-files')
    ).getDirectoryHandle(id)
    const meta = JSON.parse(
      await (await (await directory.getFileHandle('metadata.json')).getFile()).text()
    )
    expect(meta.state).toBe('ready')
    expect(page.window.document.querySelector('input')!.files?.length).toBe(0)
    expect(await page.execute('publish_content', { action: 'reset' })).toMatchObject({ ok: true })
    expect(
      JSON.parse(await (await (await directory.getFileHandle('metadata.json')).getFile()).text())
        .state
    ).toBe('ready')
  } finally {
    await storage.cleanup()
  }
})

it.each(['publish_content', 'publish_video'])(
  'ignores hidden publishing tabs for %s',
  async (tool) => {
    const page = fixture('https://creator.xiaohongshu.com/publish/publish')
    const label = tool === 'publish_content' ? '上传图文' : '上传视频'
    page.window.document.body.innerHTML = `<div aria-hidden="true" class="creator-tab">${label}</div><div class="creator-tab" id="offcanvas">${label}</div><div class="creator-tab" id="real">${label}</div>`
    Object.defineProperty(
      page.window.document.querySelector('#offcanvas'),
      'getBoundingClientRect',
      {
        value: () => new page.window.DOMRect(-9999, -9999, 96, 40),
      }
    )
    page.window.document
      .querySelector('#real')!
      .addEventListener('click', () =>
        page.window.document.querySelector('#real')!.classList.add('active')
      )
    expect(await page.execute(tool, { action: 'prepare' })).toMatchObject({ ok: true })
    const clicks = page.requests.filter((r) => r.command === 'click')
    expect(clicks).toHaveLength(1)
    expect(page.window.document.querySelector('#real')!.classList.contains('active')).toBe(true)
    expect(page.window.document.querySelector('#offcanvas')!.classList.contains('active')).toBe(
      false
    )
  }
)

it.each(['publish_content', 'publish_video'])(
  'handles closed and open visibility menus for %s',
  async (tool) => {
    const page = fixture('https://creator.xiaohongshu.com/publish/publish')
    page.window.document.body.innerHTML =
      '<div class="permission-card-wrapper"><div class="d-select-content">公开可见</div></div><div class="d-options" style="display:none"><div class="custom-option">仅自己可见</div></div>'
    const content = page.window.document.querySelector('.d-select-content')!
    const menu = page.window.document.querySelector('.d-options')! as unknown as HTMLElement
    content.addEventListener('click', () => {
      menu.style.display = menu.style.display === 'none' ? '' : 'none'
    })
    page.window.document.querySelector('.custom-option')!.addEventListener('click', () => {
      content.textContent = '仅自己可见'
      menu.style.display = 'none'
    })
    for (const open of [false, true]) {
      content.textContent = '公开可见'
      menu.style.display = open ? '' : 'none'
      page.requests.length = 0
      expect(
        await page.execute(tool, { action: 'visibility', visibility: '仅自己可见' })
      ).toMatchObject({ ok: true, value: { result: { status: 'ok', data: { verified: true } } } })
      expect(page.requests.filter((r) => r.command === 'click')).toHaveLength(open ? 1 : 2)
    }
  }
)

it.each(['publish_content', 'publish_video'])(
  'reads nested switches and avoids disabled originality for %s',
  async (tool) => {
    const page = fixture('https://creator.xiaohongshu.com/publish/publish')
    page.window.document.body.innerHTML =
      '<div class="post-time-wrapper"><div class="d-switch"><span class="d-switch-simulator unchecked"><input type="checkbox"></span></div></div><div class="date-picker-container"><input></div><div class="custom-switch-card">原创声明<div class="d-switch disabled"><span class="d-switch-simulator unchecked"><input type="checkbox" disabled></span></div></div>'
    const checkbox = page.window.document.querySelector(
      '.post-time-wrapper input'
    )! as unknown as HTMLInputElement
    page.window.document
      .querySelector('.post-time-wrapper .d-switch')!
      .addEventListener('click', () => {
        checkbox.checked = !checkbox.checked
      })
    const schedule_at = new Date(Date.now() + 86400000).toISOString()
    for (let i = 0; i < 2; i++) {
      expect(await page.execute(tool, { action: 'schedule', schedule_at })).toMatchObject({
        ok: true,
        value: { result: { status: 'ok', data: { verified: true } } },
      })
      expect(checkbox.checked).toBe(true)
    }
    expect(page.requests.filter((r) => r.command === 'click')).toHaveLength(1)
    page.requests.length = 0
    expect(await page.execute(tool, { action: 'original', is_original: true })).toMatchObject({
      ok: true,
      value: {
        result: { status: 'error', data: { error_code: 'ORIGINAL_UNAVAILABLE', disabled: true } },
      },
    })
    expect(page.requests.some((r) => r.command === 'click')).toBe(false)
    const original = page.window.document.querySelector(
      '.custom-switch-card input'
    )! as unknown as HTMLInputElement
    original.disabled = false
    original.checked = true
    expect(
      await page.execute(tool, { action: 'confirm_original', is_original: true })
    ).toMatchObject({
      ok: true,
      value: { result: { status: 'ok', data: { already_declared: true } } },
    })
    expect(page.requests.some((r) => r.command === 'click')).toBe(false)
  }
)

it('reads profile cards only from the panel that is not clipped to zero height', async () => {
  const page = fixture('https://www.xiaohongshu.com/user/profile/12345678')
  page.window.document.body.innerHTML =
    '<div class="user-page"><div class="user-nickname">Fixture</div><div class="reds-tab-item sub-tab-list">笔记</div><div class="reds-tab-item active sub-tab-list">收藏</div><div class="tab-content-item" style="height:0px;overflow:hidden"><section class="note-item"><a href="/explore/11111111">Old</a><span class="title">Old note</span></section></div><div class="tab-content-item" style="height:auto;overflow:visible"><section class="note-item"><a href="/explore/22222222">New</a><span class="title">Favorite</span></section></div></div>'
  for (const tool of ['read_profile', 'read_page']) {
    const result = await page.execute(tool, tool === 'read_page' ? { view: 'read_profile' } : {})
    expect(result).toMatchObject({
      ok: true,
      value: {
        result: {
          status: 'ok',
          data: { profile_tab: 'favorites', items: [{ title: 'Favorite' }] },
        },
      },
    })
    expect(result.value.result.data.items).toHaveLength(1)
  }
})

it.each(['read_current_note', 'read_page'])(
  '%s matches the author profile by ID and excludes comments',
  async (tool) => {
    const page = fixture('https://www.xiaohongshu.com/explore/12345678')
    ;(page.window as any).__INITIAL_STATE__ = {
      note: {
        noteDetailMap: {
          '12345678': { note: { user: { userId: 'author123', nickname: 'Author' } } },
        },
      },
    }
    page.window.document.body.innerHTML = `<div class="note-scroller"><h1 id="detail-title">Title</h1>
    <div class="author-container"><a href="/user/profile/wrong1234">Wrong</a><a href="/user/profile/author123?xsec_token=author-token">Author</a></div>
    <div class="comments-container"><div class="author"><a href="/user/profile/commenter123">Commenter</a></div></div></div>`
    const input = tool === 'read_page' ? { view: 'read_current_note' } : {}
    const result = await page.execute(tool, input)
    expect(result.value.result.data.author_profile_url).toContain('/user/profile/author123?')
    page.window.document.querySelector('.author-container')!.remove()
    expect((await page.execute(tool, input)).value.result.data.author_profile_url).toBeNull()
  }
)

it.each(['get_search_filters', 'read_page', 'apply_search_filters'])(
  '%s merges duplicate filter values and preserves conflicting evidence',
  async (tool) => {
    const page = fixture('https://www.xiaohongshu.com/search_result?keyword=test')
    page.window.document.body.innerHTML = `<div class="filter-panel"><div class="filters"><span>位置距离</span>
    <div class="tags active">不限</div><div class="tags active">不限</div>
    <div class="tags">同城</div><div class="tags">同城</div>
    <div class="tags">附近</div><div class="tags">附近</div></div></div>`
    const input =
      tool === 'read_page'
        ? { view: 'get_search_filters' }
        : tool === 'apply_search_filters'
          ? { filters: { location: '不限' } }
          : {}
    const result = await page.execute(tool, input)
    expect(result.value.result.data.groups).toEqual([
      {
        key: 'location',
        label: '位置距离',
        selected_value: '不限',
        options: [
          { value: '不限', selected: true },
          { value: '同城', selected: null },
          { value: '附近', selected: null },
        ],
      },
    ])
    page.window.document.querySelectorAll('.tags')[1].setAttribute('aria-selected', 'false')
    const conflict = await page.execute(tool, input)
    expect(conflict.value.result.data.groups[0].selected_value).toBeNull()
    expect(conflict.value.result.data.groups[0].options[0].selected).toBeNull()
  }
)
