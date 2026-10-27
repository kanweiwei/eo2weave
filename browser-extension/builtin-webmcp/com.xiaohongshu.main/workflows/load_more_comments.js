// Self-contained adapter workflow. Page observations and browser actions stay in this package.

export default {
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: 100 },
      max_comment_items: { type: 'integer', maximum: 10000 },
      max_rounds: { type: 'integer', minimum: 1, maximum: 500 },
      scroll_speed: { type: 'string', enum: ['slow', 'normal', 'fast'] },
      expand_replies: {
        type: 'boolean',
        default: false,
      },
      reply_limit: {
        type: 'integer',
        default: 10,
      },
    },
    required: [],
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
    description: 'load_more_comments',
    async run({ input, state, target }) {
      const options = { tab: target.tabId, timeout: 25000 }
      const observe = async (args) => {
        var workflow = (() => {
          var __defProp = Object.defineProperty
          var __getOwnPropDesc = Object.getOwnPropertyDescriptor
          var __getOwnPropNames = Object.getOwnPropertyNames
          var __hasOwnProp = Object.prototype.hasOwnProperty
          var __export = (target, all) => {
            for (var name in all)
              __defProp(target, name, { get: all[name], enumerable: true })
          }
          var __copyProps = (to, from, except, desc) => {
            if (
              (from && typeof from === 'object') ||
              typeof from === 'function'
            ) {
              for (let key of __getOwnPropNames(from))
                if (!__hasOwnProp.call(to, key) && key !== except)
                  __defProp(to, key, {
                    get: () => from[key],
                    enumerable:
                      !(desc = __getOwnPropDesc(from, key)) || desc.enumerable,
                  })
            }
            return to
          }
          var __toCommonJS = (mod) =>
            __copyProps(__defProp({}, '__esModule', { value: true }), mod)

          // Workflow entrypoint
          var stdin_exports = {}
          __export(stdin_exports, {
            default: () => stdin_default,
          })

          // Package-local observation: xiaohongshu-fields.ts
          function fieldRecord(value) {
            if (!value || typeof value !== 'object' || Array.isArray(value))
              return null
            const ref = value
            const object = ref.value ?? ref._value ?? value
            return object &&
              typeof object === 'object' &&
              !Array.isArray(object)
              ? object
              : null
          }
          function fieldText(value) {
            return typeof value === 'string' && value.trim() ? value : null
          }
          function readUser(value) {
            const user = fieldRecord(value)
            if (!user) return null
            let avatar = null
            const source = fieldText(user.avatar)
            if (source) {
              try {
                const url = new URL(source)
                if (
                  ['http:', 'https:'].includes(url.protocol) &&
                  !url.username &&
                  !url.password
                )
                  avatar = url.href
              } catch {}
            }
            return {
              userId: fieldText(user.userId),
              nickname: fieldText(user.nickname),
              nickName: fieldText(user.nickName),
              avatar,
            }
          }

          // Package-local observation: xiaohongshu-page.ts
          var XIAOHONGSHU_PACKAGE_VERSION = '0.9.0'
          var HOST = 'www.xiaohongshu.com'
          var ERROR_SELECTOR =
            '.access-wrapper, .error-wrapper, .not-found-wrapper, .blocked-wrapper'
          var NOTE_PATH =
            /^\/(?:explore|search_result|discovery\/item)\/([a-zA-Z0-9_-]{8,80})\/?$/
          function clean(value) {
            return typeof value === 'string'
              ? value.replace(/\s+/g, ' ').trim()
              : ''
          }
          function limited(value, max) {
            const text = clean(value)
            return text ? text.slice(0, max) : null
          }
          function visible(element) {
            if (!(element instanceof HTMLElement)) return false
            const style = getComputedStyle(element)
            return (
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              element.getClientRects().length > 0
            )
          }
          function textAt(root, selectors, max = 4e3) {
            for (const selector of selectors.split(',')) {
              const element = root.querySelector(selector.trim())
              if (visible(element)) {
                const value = limited(element.innerText, max)
                if (value) return value
              }
            }
            return null
          }
          function isUnavailablePage() {
            return (
              location.pathname === '/404' ||
              Array.from(document.querySelectorAll(ERROR_SELECTOR)).some(
                visible,
              )
            )
          }
          function pageKind() {
            if (location.hostname === 'creator.xiaohongshu.com')
              return 'creator'
            if (location.hostname !== HOST) return 'unknown'
            if (isUnavailablePage()) return 'unavailable'
            if (NOTE_PATH.test(location.pathname)) return 'note'
            if (
              /^\/user\/profile\/[a-zA-Z0-9_-]{8,80}\/?$/.test(
                location.pathname,
              )
            )
              return 'profile'
            if (location.pathname === '/search_result') return 'search'
            if (visible(document.querySelector('.login-container .qrcode-img')))
              return 'login'
            if (location.pathname === '/' || location.pathname === '/explore')
              return 'home'
            return 'unknown'
          }
          function result(status, data = null) {
            return {
              status,
              adapter_version: XIAOHONGSHU_PACKAGE_VERSION,
              page_url: location.href,
              page_kind: pageKind(),
              data,
              error_code: null,
              message: null,
            }
          }
          function error(code, message) {
            return { ...result('error'), error_code: code, message }
          }
          function unavailableNote() {
            const params = new URLSearchParams(location.search)
            return {
              ...error(
                'NOTE_UNAVAILABLE',
                'The site could not display this note. The page does not establish the cause.',
              ),
              data: {
                site_error_code: params.get('error_code'),
                site_error_message: params.get('error_msg'),
              },
            }
          }
          function initialState() {
            const state = window.__INITIAL_STATE__
            return state && typeof state === 'object' ? state : null
          }
          function loginState() {
            const state = initialState()
            const userInfo =
              state?.user?.userInfo?.value ??
              state?.user?.userInfo?._value ??
              state?.user?.userInfo
            if (userInfo && typeof userInfo === 'object') {
              if (userInfo.guest === true) return 'logged_out'
              if (
                userInfo.guest === false &&
                (userInfo.userId || userInfo.user_id)
              )
                return 'logged_in'
            }
            if (
              visible(
                document.querySelector(
                  '.main-container .user .link-wrapper .channel',
                ),
              )
            )
              return 'logged_in'
            if (visible(document.querySelector('.login-container .qrcode-img')))
              return 'logged_out'
            return 'unknown'
          }
          function currentNoteId() {
            return location.pathname.match(NOTE_PATH)?.[1] ?? null
          }
          function metricText(root, selectors) {
            const text = textAt(root, selectors, 40)
            return text && /\d/.test(text) ? text : null
          }

          // Package-local observation: xiaohongshu-comment-fields.ts
          function array(value) {
            if (Array.isArray(value)) return value
            const ref = value && typeof value === 'object' ? value : null
            const list = ref?.value ?? ref?._value
            return Array.isArray(list) ? list : null
          }
          function commentState(state, noteId) {
            const output = {
              entries: /* @__PURE__ */ new Map(),
              noteId,
              scope: 'unavailable',
              partial: true,
              cursor: null,
              hasMore: null,
            }
            const detail = fieldRecord(
              fieldRecord(
                fieldRecord(fieldRecord(state)?.note)?.noteDetailMap,
              )?.[noteId],
            )
            const note = fieldRecord(detail?.note)
            if (note?.noteId != null && note.noteId !== noteId) return output
            const comments = fieldRecord(detail?.comments)
            if (!comments) return output
            output.scope = 'current_note_page_state'
            output.cursor =
              typeof comments.cursor === 'string' ? comments.cursor : null
            output.hasMore =
              typeof comments.hasMore === 'boolean' ? comments.hasMore : null
            const list = array(comments.list)
            if (!list) return output
            output.partial = false
            const pending = list.map((raw) => ({ raw, parentId: null }))
            const visited = /* @__PURE__ */ new WeakSet()
            let examined = 0
            while (pending.length && examined++ < 1e4) {
              const item = pending.pop()
              const raw = fieldRecord(item.raw)
              const id = fieldText(raw?.id)
              if (!raw || !id) {
                output.partial = true
                continue
              }
              if (visited.has(raw)) {
                output.entries.set(id, null)
                output.partial = true
                continue
              }
              visited.add(raw)
              if (output.entries.has(id)) {
                output.entries.set(id, null)
                output.partial = true
              } else output.entries.set(id, { raw, parentId: item.parentId })
              if (raw.noteId != null && raw.noteId !== noteId) {
                output.partial = true
                continue
              }
              const replies = array(raw.subComments)
              if (replies)
                for (const reply of replies)
                  pending.push({ raw: reply, parentId: id })
              else if (raw.subComments != null) output.partial = true
            }
            if (pending.length) output.partial = true
            return output
          }
          function commentFields(state, id, parentId, hasDomId) {
            const entry = hasDomId ? state.entries.get(id) : void 0
            const source = entry?.raw
            const mismatch =
              source?.noteId != null && source.noteId !== state.noteId
            const parent =
              parentId === null ? void 0 : state.entries.get(parentId)
            const parentMismatch =
              !!entry &&
              (entry.parentId !== parentId ||
                (parentId !== null &&
                  (!parent ||
                    (parent.raw.noteId != null &&
                      parent.raw.noteId !== state.noteId))))
            const raw = mismatch || parentMismatch ? void 0 : source
            const fieldsScope = raw ? 'current_note_page_state' : 'unavailable'
            const match = !hasDomId
              ? 'no_dom_id'
              : entry === null
                ? 'ambiguous_id'
                : mismatch
                  ? 'note_mismatch'
                  : parentMismatch
                    ? 'parent_mismatch'
                    : raw
                      ? 'matched'
                      : 'not_found'
            const time = raw?.createTime
            const tags = array(raw?.showTags)
            return {
              id: raw ? fieldText(raw.id) : null,
              noteId: fieldText(raw?.noteId),
              content: fieldText(raw?.content),
              likeCount: fieldText(raw?.likeCount),
              createTime:
                typeof time === 'number' &&
                Number.isSafeInteger(time) &&
                time >= 0
                  ? time
                  : null,
              ipLocation: fieldText(raw?.ipLocation),
              liked: typeof raw?.liked === 'boolean' ? raw.liked : null,
              userInfo: readUser(raw?.userInfo),
              subCommentCount: fieldText(raw?.subCommentCount),
              showTags:
                tags && tags.every((tag) => typeof tag === 'string')
                  ? tags
                  : null,
              fields_scope: fieldsScope,
              state_match: match,
            }
          }
          function stateReplyIds(state, id) {
            const list = array(state.entries.get(id)?.raw.subComments)
            if (!list) return null
            const ids = list.map((entry) => fieldText(fieldRecord(entry)?.id))
            return ids.every((entry) => entry !== null) ? ids : null
          }

          // Package-local observation: xiaohongshu-comment-policy.ts
          var COMMENT_POLICY = {
            parentTarget: 20,
            replyLimit: 10,
            clickAttempts: 3,
            clickRetryMs: 100,
            buttonClickInterval: 3,
            largeScrollTrigger: 5,
            stagnantLimit: 20,
            minScrollDelta: 10,
            // The EO2 relay times out after 60s. Yield progress before that boundary.
            callBudgetMs: 12e3,
          }
          function normalizeCommentTarget(value, fallback) {
            if (value === void 0) return fallback
            if (typeof value !== 'number' || !Number.isSafeInteger(value))
              return null
            return value <= 0 ? fallback : value
          }
          function skipReplyControl(text, threshold) {
            const match = /^展开\s*(\d+)\s*条\s*回复$/.exec(text)
            return !!match && Number(match[1]) > threshold
          }
          function commentScrollDelta(viewportHeight, speed, large) {
            const ratio =
              (speed === 'slow' ? 0.5 : speed === 'fast' ? 0.9 : 0.7) *
              (large ? 2 : 1)
            const delta = Math.max(
              400,
              viewportHeight * (ratio + Math.random() * 0.2),
            )
            return delta + Math.floor(Math.random() * 100) - 50
          }
          function commentScrollNotch() {
            return 100 + Math.random() * 40
          }
          function commentScrollInterval() {
            return 20 + Math.floor(Math.random() * 45)
          }

          // Package-local observation: xiaohongshu-comments.ts
          var COMMENTS =
            '.comments-container, .comments-el, .comments-list, .comment-list'
          var REPLIES =
            '.reply-container, .replies, .reply-list, .child-comments, .sub-comments'
          var REPLY_ROWS =
            '.child-comment, .reply-item, .sub-comment, .reply-comment'
          var EXPAND_TEXT = /^展开\s*(\d+\s*条|更多)\s*回复$/
          var POLL_MS = 250
          var ROUND_TIMEOUT_MS = 2500
          function rendered(element, boundary) {
            if (!visible(element) || element.hidden) return false
            for (
              let ancestor = element.parentElement;
              ancestor;
              ancestor = ancestor.parentElement
            ) {
              const style = getComputedStyle(ancestor)
              if (
                ancestor.hidden ||
                style.display === 'none' ||
                style.visibility === 'hidden'
              )
                return false
              if (ancestor === boundary) break
            }
            return true
          }
          function commentRoot() {
            return (
              Array.from(document.querySelectorAll(COMMENTS)).find((element) =>
                rendered(element),
              ) ?? null
            )
          }
          function guard(noteId, pageUrl) {
            if (
              noteId &&
              (currentNoteId() !== noteId || location.href !== pageUrl)
            ) {
              return error(
                'PAGE_CHANGED',
                'The tab navigated while loading comments. Read the new page before continuing.',
              )
            }
            if (location.hostname !== HOST)
              return error(
                'UNSUPPORTED_PAGE',
                'Not on a supported Xiaohongshu page.',
              )
            if (isUnavailablePage()) return unavailableNote()
            if (!currentNoteId())
              return error('NOT_NOTE_PAGE', 'Open a Xiaohongshu note first.')
            if (loginState() === 'logged_out')
              return error(
                'LOGIN_REQUIRED',
                'Sign in on the current Xiaohongshu tab first.',
              )
            return null
          }
          function signature(text) {
            let hash = 2166136261
            for (let i = 0; i < text.length; i++)
              hash = Math.imul(hash ^ text.charCodeAt(i), 16777619)
            return (hash >>> 0).toString(16)
          }
          function ownField(row, selector, excluded, max) {
            const elements = Array.from(row.querySelectorAll(selector))
            for (const element of elements) {
              if (
                !rendered(element, row) ||
                excluded.some(
                  (other) => other === element || other.contains(element),
                )
              )
                continue
              const walker = document.createTreeWalker(
                element,
                NodeFilter.SHOW_TEXT,
              )
              const pieces = []
              let node
              while ((node = walker.nextNode())) {
                const parent = node.parentElement
                if (
                  parent &&
                  rendered(parent, element) &&
                  !excluded.some((other) => other.contains(parent))
                ) {
                  pieces.push(node.textContent ?? '')
                }
              }
              const fullText = clean(pieces.join(' '))
              if (fullText)
                return {
                  text: fullText.slice(0, max),
                  truncated: fullText.length > max,
                }
            }
            return { text: null, truncated: false }
          }
          function parseComment(row, parentId, excluded, fallbackId) {
            const body = ownField(
              row,
              '.comment-content, .content',
              excluded,
              4e3,
            )
            if (!body.text) return null
            const author = ownField(
              row,
              '.user-name, .author .name, .author-wrapper .name, .name',
              excluded,
              120,
            ).text
            const published = ownField(
              row,
              '.date, .comment-time, .time',
              excluded,
              120,
            ).text
            const rawId = domId(
              clean(
                row.getAttribute('data-comment-id') ||
                  row.getAttribute('data-id') ||
                  row.id ||
                  fallbackId,
              ),
            )
            const id =
              rawId ||
              `signature:${signature([parentId, author, body.text, published].join(''))}`
            return {
              comment_id: id,
              id_source: rawId ? 'dom' : 'content_signature',
              parent_comment_id: parentId,
              author,
              text: body.text,
              text_truncated: body.truncated,
              published_at: published,
              likes_text: ownField(
                row,
                '.like-wrapper .count, .like-count, .like .count',
                excluded,
                40,
              ).text,
            }
          }
          function domId(value) {
            return value.startsWith('comment-')
              ? value.slice('comment-'.length)
              : value
          }
          function readRows(root) {
            const comments = []
            const seen = /* @__PURE__ */ new Set()
            const add = (comment) => {
              if (!comment) return
              const key = `${comment.parent_comment_id ?? ''}/${comment.comment_id}`
              if (!seen.has(key)) {
                seen.add(key)
                comments.push(comment)
              }
            }
            for (const thread of root.querySelectorAll('.parent-comment')) {
              if (
                !rendered(thread, root) ||
                thread.parentElement?.closest('.parent-comment')
              )
                continue
              const replyContainers = Array.from(
                thread.querySelectorAll(REPLIES),
              )
              const explicitReplies = Array.from(
                thread.querySelectorAll(REPLY_ROWS),
              )
              const row =
                Array.from(thread.querySelectorAll('.comment-item')).find(
                  (candidate) =>
                    !replyContainers.some((container) =>
                      container.contains(candidate),
                    ) && !explicitReplies.includes(candidate),
                ) ?? thread
              const replies = Array.from(
                thread.querySelectorAll(`${REPLY_ROWS}, .comment-item`),
              )
                .filter(
                  (candidate) => candidate !== row && !candidate.contains(row),
                )
                .filter(
                  (candidate, _, all) =>
                    !all.some(
                      (other) =>
                        other !== candidate && other.contains(candidate),
                    ),
                )
              const excluded = [...replyContainers, ...replies]
              const parent = parseComment(
                row,
                null,
                excluded,
                thread.getAttribute('data-comment-id') ||
                  thread.getAttribute('data-id') ||
                  thread.id,
              )
              if (!parent) continue
              add(parent)
              for (const reply of replies) {
                if (rendered(reply, root))
                  add(parseComment(reply, parent.comment_id, []))
              }
            }
            return comments
          }
          function expansionText(element) {
            const walker = document.createTreeWalker(
              element,
              NodeFilter.SHOW_TEXT,
            )
            const pieces = []
            let node
            while ((node = walker.nextNode())) {
              const parent = node.parentElement
              if (parent && !parent.closest('svg') && rendered(parent, element))
                pieces.push(node.textContent ?? '')
            }
            return clean(pieces.join(' '))
          }
          function expansionControls(root) {
            return Array.from(root.querySelectorAll('.show-more'))
              .filter((element) => rendered(element, root))
              .map((element) => ({
                element,
                text: expansionText(element),
                disabled:
                  element.hasAttribute('disabled') ||
                  element.getAttribute('aria-disabled') === 'true',
              }))
          }
          function expansionButtons(root) {
            return expansionControls(root)
              .filter(
                (control) =>
                  !control.disabled && EXPAND_TEXT.test(control.text),
              )
              .map((control) => control.element)
          }
          function clickExpansion(element, root) {
            element.scrollIntoView?.({
              block: 'center',
              inline: 'nearest',
              behavior: 'instant',
            })
            if (
              !element.isConnected ||
              !root.contains(element) ||
              !rendered(element, root)
            )
              return false
            const rect = element.getBoundingClientRect()
            if (
              rect.width > 0 &&
              rect.height > 0 &&
              typeof document.elementFromPoint === 'function'
            ) {
              const hit = document.elementFromPoint(
                rect.left + rect.width / 2,
                rect.top + rect.height / 2,
              )
              if (!hit || !element.contains(hit)) return false
            }
            element.click()
            return true
          }
          function endVisible(root) {
            return Array.from(root.querySelectorAll('.end-container')).some(
              (element) =>
                rendered(element, root) &&
                /THE\s*END/i.test(clean(element.innerText)),
            )
          }
          function emptyVisible(root) {
            return Array.from(
              root.querySelectorAll(
                '.no-comments-text, .no-comments, .comments-empty',
              ),
            ).some(
              (element) =>
                rendered(element, root) &&
                /这是一片荒地|暂无评论|还没有评论/.test(
                  clean(element.innerText),
                ),
            )
          }
          function loadingVisible(root) {
            return Array.from(
              root.querySelectorAll(
                '.loading, .loading-container, [aria-busy="true"]',
              ),
            ).some((element) => rendered(element, root))
          }
          function snapshot(root, limit, includeReplies) {
            const rows = readRows(root)
            const eligible = rows.filter(
              (row) => includeReplies || row.parent_comment_id === null,
            )
            const state = commentState(initialState(), currentNoteId())
            const selected = eligible.slice(0, limit).map((row) => ({
              ...row,
              ...commentFields(
                state,
                row.comment_id,
                row.parent_comment_id,
                row.id_source === 'dom',
              ),
            }))
            const withReplies = (
              row,
              ancestors = /* @__PURE__ */ new Set(),
            ) => {
              const ids =
                row.fields_scope === 'current_note_page_state'
                  ? stateReplyIds(state, row.comment_id)
                  : null
              const next = new Set(ancestors).add(row.comment_id)
              const replies = selected.filter(
                (reply) =>
                  reply.parent_comment_id === row.comment_id &&
                  reply.fields_scope === 'current_note_page_state' &&
                  !next.has(reply.comment_id),
              )
              return {
                ...row,
                subComments: ids
                  ? replies.map((reply) => withReplies(reply, next))
                  : null,
                sub_comments_scope: ids
                  ? 'returned_visible_replies'
                  : 'unavailable',
                sub_comments_partial:
                  ids === null ||
                  ids.length !== replies.length ||
                  ids.some((id) => !replies.some((reply) => reply.id === id)),
              }
            }
            const comments = selected.map((row) => withReplies(row))
            const total =
              metricText(
                root,
                '.total, .comments-total, .comment-count, .comments-header',
              ) ??
              metricText(
                document,
                '.interact-container .chat-wrapper .count, .interact-container .chat-wrapper .count-num',
              )
            return {
              note_id: currentNoteId(),
              comments,
              total_comments_text: total,
              loaded_parent_count: rows.filter(
                (row) => row.parent_comment_id === null,
              ).length,
              loaded_reply_count: rows.filter(
                (row) => row.parent_comment_id !== null,
              ).length,
              loaded_count: rows.length,
              returned_count: comments.length,
              truncated:
                eligible.length > limit ||
                comments.some((row) => row.text_truncated),
              include_replies: includeReplies,
              comments_scope: 'currently_loaded_dom',
              comment_state_scope: state.scope,
              comment_state_partial: state.partial,
              cursor: state.cursor,
              hasMore: state.hasMore,
              id_policy:
                'DOM IDs (with the site comment- prefix removed) when available; otherwise content signatures. Only exact IDs and parent relationships receive state fields; signatures are not server comment IDs.',
              end_of_comments_visible: endVisible(root),
              empty_comments_visible: emptyVisible(root),
              has_unexpanded_replies: expansionButtons(root).length > 0,
              completeness:
                'Only currently rendered comments are returned. A list end marker does not establish that all replies are loaded.',
            }
          }
          function validateLimit(args) {
            const limit = args.limit === void 0 ? 20 : Number(args.limit)
            return Number.isInteger(limit) && limit >= 1 && limit <= 100
              ? limit
              : null
          }
          function scrollContainer(root) {
            const candidates = [root.closest('.note-scroller'), root]
            return (
              candidates.find(
                (element) =>
                  !!element &&
                  rendered(element) &&
                  element.scrollHeight > element.clientHeight &&
                  element.clientHeight > 0,
              ) ?? null
            )
          }
          function rowKeys(root) {
            return new Set(
              readRows(root).map(
                (row) => `${row.parent_comment_id ?? ''}/${row.comment_id}`,
              ),
            )
          }
          function parentCount(root) {
            return readRows(root).filter(
              (row) => row.parent_comment_id === null,
            ).length
          }
          var pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
          async function scrollComments(
            container,
            speed,
            stagnant,
            deadline,
            checkPage,
          ) {
            const before = container.scrollTop
            const viewportHeight = window.innerHeight || container.clientHeight
            const large = stagnant >= COMMENT_POLICY.largeScrollTrigger
            const pushCount = large ? 3 + Math.floor(Math.random() * 3) : 1
            const push = async (delta) => {
              for (
                let remaining = delta;
                remaining > 0 && Date.now() < deadline;
              ) {
                if (checkPage()) return
                const step = Math.min(remaining, commentScrollNotch())
                container.scrollTop = Math.min(
                  container.scrollHeight - container.clientHeight,
                  container.scrollTop + step,
                )
                remaining -= step
                if (remaining > 0) await pause(commentScrollInterval())
              }
              await pause(Math.min(150, Math.max(0, deadline - Date.now())))
            }
            for (
              let index = 0;
              index < pushCount && Date.now() < deadline;
              index++
            ) {
              await push(commentScrollDelta(viewportHeight, speed, large))
              if (checkPage()) break
            }
            if (
              container.scrollTop - before < COMMENT_POLICY.minScrollDelta &&
              Date.now() < deadline &&
              !checkPage()
            ) {
              await push(viewportHeight * 3)
            }
            return container.scrollTop - before
          }
          var xiaohongshuCommentTools = {
            async read_comments(args) {
              const invalidPage = guard()
              if (invalidPage) return invalidPage
              const limit = validateLimit(args)
              if (!limit)
                return error(
                  'INVALID_LIMIT',
                  'limit must be an integer from 1 to 100.',
                )
              if (
                args.include_replies !== void 0 &&
                typeof args.include_replies !== 'boolean'
              )
                return error(
                  'INVALID_ARGUMENT',
                  'include_replies must be a boolean.',
                )
              const root = commentRoot()
              if (!root)
                return error(
                  'COMMENTS_UNSUPPORTED',
                  'No recognizable visible comments container is present. Open or scroll to the comments section first.',
                )
              const data = snapshot(root, limit, args.include_replies !== false)
              if (
                !data.loaded_count &&
                !data.empty_comments_visible &&
                !data.end_of_comments_visible
              ) {
                return error(
                  'COMMENTS_NOT_READY',
                  'The comments section has no readable rows or explicit empty state yet.',
                )
              }
              return result('ok', data)
            },
            async load_more_comments(args) {
              const invalidPage = guard()
              if (invalidPage) return invalidPage
              const limit = validateLimit(args)
              if (!limit)
                return error(
                  'INVALID_LIMIT',
                  'limit must be an integer from 1 to 100.',
                )
              if (
                args.expand_replies !== void 0 &&
                typeof args.expand_replies !== 'boolean'
              )
                return error(
                  'INVALID_ARGUMENT',
                  'expand_replies must be a boolean.',
                )
              const maxCommentItems = normalizeCommentTarget(
                args.max_comment_items,
                COMMENT_POLICY.parentTarget,
              )
              const replyLimit = normalizeCommentTarget(
                args.reply_limit,
                COMMENT_POLICY.replyLimit,
              )
              if (maxCommentItems === null || replyLimit === null)
                return error(
                  'INVALID_ARGUMENT',
                  'max_comment_items and reply_limit must be safe integers. Omitted/nonpositive values use upstream defaults 20 and 10.',
                )
              const scrollSpeed =
                args.scroll_speed === void 0 || args.scroll_speed === ''
                  ? 'normal'
                  : args.scroll_speed
              if (
                scrollSpeed !== 'slow' &&
                scrollSpeed !== 'normal' &&
                scrollSpeed !== 'fast'
              )
                return error(
                  'INVALID_ARGUMENT',
                  'scroll_speed must be slow, normal or fast.',
                )
              const expandRequested = args.expand_replies === true
              const loadParents =
                !expandRequested || args.max_comment_items !== void 0
              const defaultRounds = loadParents
                ? Math.min(maxCommentItems * 3, 500)
                : 2
              const maxRounds =
                args.max_rounds === void 0
                  ? defaultRounds
                  : Number(args.max_rounds)
              if (
                !Number.isInteger(maxRounds) ||
                maxRounds < 1 ||
                maxRounds > 500
              )
                return error(
                  'INVALID_ARGUMENT',
                  'max_rounds must be an integer from 1 to 500. Calls yield within 50 seconds even when more rounds are requested.',
                )
              let root = commentRoot()
              if (!root)
                return error(
                  'COMMENTS_UNSUPPORTED',
                  'No recognizable visible comments container is present.',
                )
              const noteId = currentNoteId()
              const pageUrl = location.href
              const initiallySeen = rowKeys(root)
              const initialReplies = new Set(
                readRows(root)
                  .filter((row) => row.parent_comment_id !== null)
                  .map((row) => `${row.parent_comment_id}/${row.comment_id}`),
              )
              const seen = new Set(initiallySeen)
              const seenReplies = new Set(initialReplies)
              const startedAt = Date.now()
              const deadline = startedAt + COMMENT_POLICY.callBudgetMs
              const initialParentCount = parentCount(root)
              let stagnantRounds = 0
              let clickAttempts = 0
              const skippedControls = /* @__PURE__ */ new Set()
              let stopReason = 'round_limit'
              let rounds = 0
              const actions = []
              const expansionDiagnostics = []
              let clickedCount = 0
              let expansionError = null
              let expansionMessage = ''
              for (let round = 0; round < maxRounds; round++) {
                const invalid = guard(noteId, pageUrl)
                if (invalid) return invalid
                if (Date.now() >= deadline) {
                  stopReason = 'time_limit'
                  break
                }
                const tryExpansion =
                  expandRequested &&
                  (!loadParents ||
                    round % COMMENT_POLICY.buttonClickInterval === 0 ||
                    endVisible(root))
                const buttons = tryExpansion ? expansionButtons(root) : []
                for (const button of buttons) {
                  if (
                    skipReplyControl(expansionText(button), replyLimit) &&
                    !skippedControls.has(button)
                  ) {
                    skippedControls.add(button)
                    if (expansionDiagnostics.length < 30)
                      expansionDiagnostics.push({
                        round: round + 1,
                        text: expansionText(button).slice(0, 80),
                        clicked: false,
                        skipped: 'reply_limit',
                        reply_limit: replyLimit,
                      })
                  }
                }
                const expand = buttons.find(
                  (button) =>
                    !skipReplyControl(expansionText(button), replyLimit),
                )
                if (tryExpansion && !expand && !loadParents) {
                  expansionDiagnostics.push({
                    round: round + 1,
                    controls: expansionControls(root)
                      .slice(0, 5)
                      .map(({ text, disabled }) => ({
                        text: text.slice(0, 80),
                        disabled,
                        recognized: EXPAND_TEXT.test(text),
                      })),
                    clicked: false,
                  })
                  stopReason = buttons.length
                    ? 'reply_limit'
                    : 'no_expand_controls'
                  if (!clickedCount && !buttons.length) {
                    expansionError = 'REPLY_EXPAND_UNAVAILABLE'
                    expansionMessage =
                      'No enabled visible .show-more reply expansion control was recognized. No scroll fallback was performed. Inspect reply_expansion.diagnostics; scroll separately with expand_replies=false if needed.'
                  }
                  break
                }
                if (
                  loadParents &&
                  !expand &&
                  parentCount(root) >= maxCommentItems
                ) {
                  stopReason = 'target_reached'
                  break
                }
                if (!expand && (endVisible(root) || emptyVisible(root))) {
                  stopReason = 'end_of_list'
                  break
                }
                const before = rowKeys(root)
                const beforeReplies = new Set(
                  readRows(root)
                    .filter((row) => row.parent_comment_id !== null)
                    .map((row) => `${row.parent_comment_id}/${row.comment_id}`),
                )
                if (expand) {
                  const diagnostic = {
                    round: round + 1,
                    text: expansionText(expand).slice(0, 80),
                    clicked: false,
                    added_reply_count: 0,
                    click_attempts: 0,
                  }
                  expansionDiagnostics.push(diagnostic)
                  let clicked = false
                  for (
                    let attempt = 0;
                    attempt < COMMENT_POLICY.clickAttempts &&
                    Date.now() < deadline;
                    attempt++
                  ) {
                    const invalid2 = guard(noteId, pageUrl)
                    if (invalid2) return invalid2
                    clickAttempts++
                    diagnostic.click_attempts++
                    try {
                      clicked = clickExpansion(expand, root)
                    } catch {}
                    if (clicked) break
                    if (attempt + 1 < COMMENT_POLICY.clickAttempts)
                      await pause(
                        Math.min(
                          COMMENT_POLICY.clickRetryMs,
                          Math.max(0, deadline - Date.now()),
                        ),
                      )
                  }
                  const pageError = guard(noteId, pageUrl)
                  if (pageError) return pageError
                  if (!clicked) {
                    expansionError = 'REPLY_EXPAND_CLICK_FAILED'
                    expansionMessage =
                      'The reply expansion control could not be clicked after scrolling it into view. It may be obscured or detached. No scroll fallback was performed.'
                    stopReason = 'expand_click_failed'
                    break
                  }
                  diagnostic.clicked = true
                  clickedCount++
                  actions.push('expand_replies')
                } else {
                  const container = scrollContainer(root)
                  if (!container) {
                    return {
                      ...error(
                        'COMMENTS_SCROLL_UNSUPPORTED',
                        'No recognizable scrollable note/comments container is present.',
                      ),
                      data: snapshot(root, limit, true),
                    }
                  }
                  const previousTop = container.scrollTop
                  const scrollingRoot = root
                  Array.from(scrollingRoot.querySelectorAll('.parent-comment'))
                    .filter((row) => rendered(row, scrollingRoot))
                    .at(-1)
                    ?.scrollIntoView?.({
                      block: 'end',
                      inline: 'nearest',
                      behavior: 'instant',
                    })
                  await scrollComments(
                    container,
                    scrollSpeed,
                    stagnantRounds,
                    deadline,
                    () => guard(noteId, pageUrl),
                  )
                  const pageError = guard(noteId, pageUrl)
                  if (pageError) return pageError
                  actions.push(
                    container.scrollTop !== previousTop
                      ? 'scroll_changed'
                      : 'scroll_unchanged',
                  )
                }
                rounds++
                let changed = false
                const started = Date.now()
                while (
                  Date.now() - started < ROUND_TIMEOUT_MS &&
                  Date.now() < deadline
                ) {
                  const pageError = guard(noteId, pageUrl)
                  if (pageError) return pageError
                  const currentRoot = commentRoot()
                  if (!currentRoot)
                    return error(
                      'COMMENTS_UNSUPPORTED',
                      'The comments container disappeared while loading. Read the page again.',
                    )
                  root = currentRoot
                  const currentKeys = rowKeys(root)
                  for (const key of currentKeys) seen.add(key)
                  const currentReplies = readRows(root)
                    .filter((row) => row.parent_comment_id !== null)
                    .map((row) => `${row.parent_comment_id}/${row.comment_id}`)
                  for (const key of currentReplies) seenReplies.add(key)
                  const newReplyCount = currentReplies.filter(
                    (key) => !beforeReplies.has(key),
                  ).length
                  if (expand)
                    expansionDiagnostics[
                      expansionDiagnostics.length - 1
                    ].added_reply_count = newReplyCount
                  changed = expand
                    ? newReplyCount > 0
                    : Array.from(currentKeys).some((key) => !before.has(key))
                  if (
                    changed ||
                    (!expand && (endVisible(root) || emptyVisible(root)))
                  )
                    break
                  await pause(
                    Math.min(POLL_MS, Math.max(0, deadline - Date.now())),
                  )
                }
                if (!changed) {
                  stopReason =
                    !expand && (endVisible(root) || emptyVisible(root))
                      ? 'end_of_list'
                      : loadingVisible(root)
                        ? 'timeout'
                        : 'no_new_comments'
                  if (expand) {
                    expansionError = 'REPLY_EXPAND_NOT_OBSERVED'
                    expansionMessage =
                      'A reply expansion click was dispatched, but no additional rendered reply was observed within the loading window. Do not report expansion as successful.'
                    stopReason = loadingVisible(root)
                      ? 'timeout'
                      : 'no_new_replies'
                    break
                  }
                  if (Date.now() >= deadline) {
                    stopReason = 'time_limit'
                    break
                  }
                  if (endVisible(root) || emptyVisible(root)) {
                    stopReason = 'end_of_list'
                    break
                  }
                  stagnantRounds++
                  if (stagnantRounds >= COMMENT_POLICY.stagnantLimit) {
                    stopReason = 'stagnant_limit'
                    break
                  }
                  if (round + 1 === maxRounds) break
                  continue
                }
                stagnantRounds = 0
                stopReason = 'round_limit'
                if (loadParents && parentCount(root) >= maxCommentItems) {
                  stopReason = 'target_reached'
                  break
                }
                if (
                  endVisible(root) &&
                  !(
                    args.expand_replies === true &&
                    expansionButtons(root).length > 0
                  )
                ) {
                  stopReason = 'end_of_list'
                  break
                }
              }
              const finalError = guard(noteId, pageUrl)
              if (finalError) return finalError
              const addedCount = Array.from(seen).filter(
                (key) => !initiallySeen.has(key),
              ).length
              const addedReplyCount = Array.from(seenReplies).filter(
                (key) => !initialReplies.has(key),
              ).length
              const data = {
                ...snapshot(root, limit, true),
                attempted_rounds: rounds,
                actions,
                added_count: addedCount,
                load_succeeded: loadParents
                  ? addedCount > 0
                  : addedReplyCount > 0,
                stop_reason: stopReason,
                elapsed_ms: Date.now() - startedAt,
                loading_policy: {
                  mode: loadParents
                    ? 'load_parent_comments'
                    : 'expand_replies_only',
                  max_comment_items: maxCommentItems,
                  reply_limit: replyLimit,
                  scroll_speed: scrollSpeed,
                  max_rounds: maxRounds,
                  call_budget_ms: COMMENT_POLICY.callBudgetMs,
                  returned_limit: limit,
                },
                initial_parent_count: initialParentCount,
                added_parent_count: Array.from(seen).filter(
                  (key) => key.startsWith('/') && !initiallySeen.has(key),
                ).length,
                parent_target_evaluated: loadParents,
                parent_target_reached:
                  loadParents && parentCount(root) >= maxCommentItems,
                loading_partial:
                  loadParents &&
                  parentCount(root) < maxCommentItems &&
                  !endVisible(root) &&
                  !emptyVisible(root),
                retry_summary: {
                  click_attempts: clickAttempts,
                  stagnant_rounds: stagnantRounds,
                },
                reply_expansion: {
                  requested: expandRequested,
                  clicked_count: clickedCount,
                  added_reply_count: addedReplyCount,
                  succeeded: expandRequested && addedReplyCount > 0,
                  skipped_by_reply_limit: skippedControls.size,
                  diagnostics: expansionDiagnostics.slice(0, 30),
                  diagnostics_partial: expansionDiagnostics.length > 30,
                },
              }
              return expansionError
                ? { ...error(expansionError, expansionMessage), data }
                : result('ok', data)
            },
          }

          // Workflow entrypoint
          async function stdin_default(args) {
            return xiaohongshuCommentTools.load_more_comments(args)
          }
          return __toCommonJS(stdin_exports)
        })()

        return workflow.default(args)
      }
      const response = await browser.eval(
        '() => (' + observe.toString() + ')(' + JSON.stringify(input) + ')',
        options,
      )
      if (response.tabId !== target.tabId)
        throw new Error('Browser returned another tab')
      const result = response.result
      if (result.status === 'navigated') {
        const plan = result.data
        if (plan.selector) {
          await browser.eval(
            '() => {const el=document.querySelector(' +
              JSON.stringify(plan.selector) +
              ');if(!el)throw new Error("Navigation card disappeared");el.setAttribute("href",' +
              JSON.stringify(plan.url) +
              ');el.setAttribute("target","_self");}',
            options,
          )
          await browser.click(plan.selector, undefined, options)
        } else
          await browser.goto(result.target_url, {
            ...options,
            'wait-until': 'domcontentloaded',
          })
      }
      state.result = {
        status: result.status,
        data:
          result.status === 'error'
            ? { ...result.data, error_code: result.error_code }
            : result.data,
        message: result.message,
      }
      return 'success'
    },
  },
  result({ state }) {
    return state.result
  },
}
