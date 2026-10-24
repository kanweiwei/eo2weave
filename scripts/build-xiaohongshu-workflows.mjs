// Build-time generator for com.xiaohongshu.main adapter workflows.
//
// Page logic lives in browser-extension/entrypoints/webmcp/xiaohongshu/*.ts.
// validatePackageSnapshot caps the whole builtin package snapshot at
// 2,000,000 characters, so workflows cannot each embed the full aggregator.
// Douban-package pattern, adapted: `read_page` inlines the FULL page runtime
// (every tool implementation) and registers it on a Symbol-keyed page global;
// read-only navigating workflows are thin orchestrators that boot through
// browser.webmcp.exec('com.xiaohongshu.main.read_page') and then re-dispatch
// their own tool inside the same document. Tools that drive real user input
// through the CDP channel (post_comment_to_feed, reply_comment_in_feed,
// like_feed, publish_content, publish_video) keep their self-contained
// dependency closure inlined, because their input session and file-transfer
// slots must exist inside the single eval that performs the interaction.
//
// Run: node scripts/build-xiaohongshu-workflows.mjs
import ts from '../web/node_modules/typescript/lib/typescript.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dir = 'browser-extension/entrypoints/webmcp/xiaohongshu'

function transpile(name) {
  const source = readFileSync(join(root, dir, `${name}.ts`), 'utf8')
  const out = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  })
  return out.outputText
}

function flatten(outputText) {
  return outputText
    // One flat scope: imports fold away, exports become declarations.
    .replace(/^import\s[^;\n]*;\s*$/gm, '')
    .replace(/^export\s+/gm, '')
}

const sources = new Map()
const imports = new Map()
for (const file of [
  'xiaohongshu-fields', 'xiaohongshu-feed-fields', 'xiaohongshu-comment-fields',
  'xiaohongshu-profile-fields', 'xiaohongshu-note-text', 'xiaohongshu-media',
  'xiaohongshu-comment-policy', 'xiaohongshu-publish-policy',
  'xiaohongshu-input-protocol', 'xiaohongshu-publish-transfer',
  'xiaohongshu-publish-video-transfer', 'xiaohongshu-publish-input',
  'xiaohongshu-publish-dom', 'xiaohongshu-page', 'xiaohongshu-filters',
  'xiaohongshu-comments', 'xiaohongshu-profile', 'xiaohongshu-session',
  'xiaohongshu-like', 'xiaohongshu-post-comment', 'xiaohongshu-reply-comment',
  'xiaohongshu-publish', 'xiaohongshu-publish-video', 'xiaohongshu-tools',
]) {
  const js = transpile(file)
  sources.set(file, flatten(js))
  imports.set(file, [...js.matchAll(/from\s+["']\.\/([\w-]+)["']/g)].map(match => match[1]))
}

function closure(entry) {
  const seen = new Set()
  const stack = [entry]
  while (stack.length) {
    const name = stack.pop()
    if (seen.has(name) || !sources.has(name)) continue
    seen.add(name)
    stack.push(...imports.get(name) ?? [])
  }
  return [...seen]
}

// The page runtime registers every implementation on a Symbol-keyed page
// global so a second eval in the same document reuses live journal/session
// state (publish operation journals must survive across the
// open/prepare/upload/configure calls).
const boot = `(() => {
  const KEY = Symbol.for('eo2.xhs.adapter-runtime');
  const w = window;
  if (!w[KEY]) w[KEY] = { impl: Object.assign({}, xiaohongshuFilterTools, xiaohongshuCommentTools, xiaohongshuProfileTools, xiaohongshuSessionTools, xiaohongshuPublishTools, xiaohongshuVideoPublishTools, xiaohongshuPostCommentTools, xiaohongshuReplyCommentTools, xiaohongshuLikeTools, xiaohongshuPageTools) };
  const runtime = w[KEY];
  return async (toolName, args) => {
    const impl = runtime.impl[toolName];
    if (!impl) throw new Error('Unknown adapter tool: ' + toolName);
    return await impl(args || {});
  };
})()`

// read_page is a package-level composition (page kind + sign-in state) rather
// than a PR38 implementation; it ships as the heavy entry workflow that also
// registers the persistent runtime every thin workflow reuses.
sources.set('xiaohongshu-entry', `
// ── xiaohongshu-entry (read_page composition) ──
const xiaohongshuPageTools = {
  async xhs_read_page_impl() {
    if (location.hostname !== HOST && location.hostname !== CREATOR_HOST) return error('UNSUPPORTED_PAGE', 'Not on a supported Xiaohongshu page.')
    const kind = pageKind()
    const base = { page_kind: kind, login_state: kind === 'creator' ? null : loginState() }
    if (kind === 'note') return result('ok', { ...base, note: await xiaohongshuToolImplementations.xhs_read_current_note() })
    if (kind === 'search') return result('ok', { ...base, search: await xiaohongshuToolImplementations.xhs_list_search_results({ limit: 10 }) })
    return result('ok', base)
  },
}
`)

const ENTRY_RUNTIME = ['xiaohongshu-entry', ...closure('xiaohongshu-tools')]

// Tools that must keep their self-contained inline closure (CDP input channel
// or file-transfer slots must live in the same eval that interacts).
const INLINE_TOOLS = new Set(['post_comment_to_feed', 'reply_comment_in_feed', 'like_feed', 'publish_content', 'publish_video'])

// Manifest tool name → module whose tool map registers the xhs_* implementation.
const TOOL_MODULE = {
  read_page: 'xiaohongshu-entry',
  check_login: 'xiaohongshu-tools',
  search_notes: 'xiaohongshu-tools',
  list_search_results: 'xiaohongshu-tools',
  get_search_filters: 'xiaohongshu-filters',
  apply_search_filters: 'xiaohongshu-filters',
  open_note: 'xiaohongshu-tools',
  read_current_note: 'xiaohongshu-tools',
  read_comments: 'xiaohongshu-comments',
  load_more_comments: 'xiaohongshu-comments',
  post_comment_to_feed: 'xiaohongshu-post-comment',
  reply_comment_in_feed: 'xiaohongshu-reply-comment',
  like_feed: 'xiaohongshu-like',
  open_home: 'xiaohongshu-profile',
  list_feeds: 'xiaohongshu-profile',
  open_profile: 'xiaohongshu-profile',
  read_profile: 'xiaohongshu-profile',
  select_profile_tab: 'xiaohongshu-profile',
  open_login: 'xiaohongshu-session',
  logout: 'xiaohongshu-session',
  publish_content: 'xiaohongshu-publish',
  publish_video: 'xiaohongshu-publish-video',
}

function heavyWorkflow(tool, modules) {
  const runtime = modules.map(name => `// ── ${name} ──\n${sources.get(name)}`).join('\n')
  const dispatchName = tool === 'read_page' ? 'xhs_read_page_impl' : tool
  return `// Generated by scripts/build-xiaohongshu-workflows.mjs — do not edit by hand.
// Page logic lives in browser-extension/entrypoints/webmcp/xiaohongshu/*.ts.
export default {
  inputSchema: { type: "object", properties: {} },
  outputSchema: {
    type: "object",
    properties: {
      status: { type: "string" },
      page_kind: { type: ["string", "null"] },
      login_state: { type: ["string", "null"] },
      message: { type: ["string", "null"] },
      error_code: { type: ["string", "null"] },
      data: { type: ["object", "null"] },
    },
    required: ["status"],
    additionalProperties: false,
  },
  tree: {
    type: "action",
    description: ${JSON.stringify(`Run ${tool} in the current tab`)},
    async run({ input, state, target }) {
      const source = (${JSON.stringify(`(() => {
  const __xhsArgs = __XHS_ARGS__;
${runtime}
  const dispatch = ${boot};

  return dispatch(${JSON.stringify(dispatchName)}, __xhsArgs);
})`)});
      const call = source
        .replace("__XHS_ARGS__", JSON.stringify(input ?? {}).replace(/</g, "\\\\u003c"));
      const page = await browser.eval(call, { tab: target.tabId, timeout: 30000 });
      if (page.tabId !== target.tabId) throw new Error("Browser returned another tab");
      state.result = page.result;
      return "success";
    },
  },
  result({ state }) {
    return state.result;
  },
};
`
}

function thinWorkflow(tool) {
  return `// Generated by scripts/build-xiaohongshu-workflows.mjs — do not edit by hand.
// Thin orchestrator: boots the shared page runtime through the read_page
// workflow, then re-dispatches ${tool} inside the same document.
export default {
  inputSchema: { type: "object", properties: {} },
  outputSchema: {
    type: "object",
    properties: {
      status: { type: "string" },
      message: { type: ["string", "null"] },
      error_code: { type: ["string", "null"] },
      data: { type: ["object", "null"] },
    },
    required: ["status"],
    additionalProperties: false,
  },
  tree: {
    type: "sequence",
    children: [
      {
        type: "action",
        description: "Boot the shared Xiaohongshu page runtime in this tab",
        async run({ target }) {
          const response = await browser.webmcp.exec(
            "com.xiaohongshu.main.read_page",
            {},
            { tab: target.tabId, timeout: 30000 },
          );
          if (response.result.status !== "success") throw new Error("Page runtime did not start");
          return "success";
        },
      },
      {
        type: "action",
        description: ${JSON.stringify(`Dispatch ${tool} against the booted runtime`)},
        async run({ input, state, target }) {
          const source = (${JSON.stringify(`(() => {
  const __xhsArgs = __XHS_ARGS__;
  const runtime = window[Symbol.for('eo2.xhs.adapter-runtime')];
  if (!runtime) throw new Error('Xiaohongshu page runtime is not registered in this document.');
  return runtime.impl(${JSON.stringify(tool)}, __xhsArgs);
})`)});
          const call = source
            .replace("__XHS_ARGS__", JSON.stringify(input ?? {}).replace(/</g, "\\\\u003c"));
          const page = await browser.eval(call, { tab: target.tabId, timeout: 30000 });
          if (page.tabId !== target.tabId) throw new Error("Browser returned another tab");
          state.result = page.result;
          return "success";
        },
      },
    ],
  },
  result({ state }) {
    return state.result;
  },
};
`
}

const manifest = JSON.parse(readFileSync(join(root, 'browser-extension/builtin-webmcp/com.xiaohongshu.main/manifest.json'), 'utf8'))
let total = 0
for (const entry of manifest.tools) {
  const tool = entry.name
  const module = TOOL_MODULE[tool]
  if (!module) throw new Error(`No module mapping for tool: ${tool.name}`)
  const text = INLINE_TOOLS.has(tool) || tool === 'read_page'
    ? heavyWorkflow(tool, tool === 'read_page' ? ENTRY_RUNTIME : [...new Set(closure(module))])
    : thinWorkflow(tool)
  writeFileSync(join(root, `browser-extension/builtin-webmcp/com.xiaohongshu.main/${entry.path}`), text)
  total += text.length
  console.log(`${tool.padEnd(22)} ${String(text.length).padStart(8)} chars`)
}
console.log(`generated ${manifest.tools.length} workflows, total ${total} chars`)
