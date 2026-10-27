// Self-contained adapter workflow.
export default {
  inputSchema: {
    type: 'object',
    properties: {
      note_url: { type: 'string', minLength: 1 },
      feed_id: { type: 'string', minLength: 1 },
      xsec_token: { type: 'string', minLength: 1 },
      operation_id: { type: 'string', minLength: 1 },
      action: { type: 'string', enum: ['submit', 'status'] },
      user_id: { type: 'string', minLength: 1 },
      content: {
        type: 'string',
        minLength: 1,
        maxLength: 1000,
      },
      comment_id: {
        type: 'string',
        minLength: 1,
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
    description: 'reply_comment_in_feed',
    async run({ input, state, target }) {
      const controls = (args) => {
        const visible = (el) =>
          el instanceof HTMLElement &&
          el.getClientRects().length &&
          getComputedStyle(el).visibility !== 'hidden' &&
          getComputedStyle(el).display !== 'none'
        let root = document
        if (args.root_selector) {
          root = document.querySelector(args.root_selector)
          if (!root || !visible(root)) return { found: false }
        } else if (args.comment_id) {
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
          (el) => !args.label || el.innerText.trim() === args.label,
        )
        if (!el) return { found: false }
        const marker = 'cw-xhs-' + crypto.randomUUID()
        el.setAttribute('data-cw-xhs-control', marker)
        const active =
          el.getAttribute('aria-selected') === 'true' ||
          el.getAttribute('aria-pressed') === 'true' ||
          el.getAttribute('aria-checked') === 'true' ||
          el.classList.contains('checked') ||
          el.classList.contains('is-active') ||
          el.classList.contains('active') ||
          el.classList.contains('selected')
        return {
          found: true,
          selector: '[data-cw-xhs-control="' + marker + '"]',
          active,
          text: el.innerText,
        }
      }

      const options = { tab: target.tabId, timeout: 15000 }
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
      const commentInputSelector =
        '.comment-input [contenteditable="true"], .comment-input [role="textbox"], .comment-input textarea, #content-textarea, div.input-box div.content-edit p.content-input'
      const commentEditorState = ({ selector, scope_selector }) => {
        const scope = scope_selector
          ? document.querySelector(scope_selector)
          : null
        const candidates = Array.from(
          (scope || document).querySelectorAll(selector),
        )
        const input =
          candidates.find(
            (candidate) =>
              candidate instanceof HTMLElement &&
              candidate.getClientRects().length,
          ) || candidates[0]
        if (!(input instanceof HTMLElement))
          return { found: false, expanded: false }
        const box = input.closest('.comment-input, .input-box')
        let bottom =
          box?.querySelector('div.bottom') ||
          (box?.nextElementSibling?.matches('div.bottom')
            ? box.nextElementSibling
            : null)
        if (!bottom && !scope_selector)
          bottom = document.querySelector('div.bottom')
        let expanded = true
        if (bottom instanceof HTMLElement) {
          const style = getComputedStyle(bottom)
          expanded =
            !bottom.hidden &&
            style.visibility !== 'hidden' &&
            style.display !== 'none' &&
            (style.opacity === '' || Number(style.opacity) >= 0.01) &&
            style.height !== '0px'
        }
        const marker = 'cw-xhs-' + crypto.randomUUID()
        input.setAttribute('data-cw-xhs-control', marker)
        return {
          found: true,
          expanded,
          selector: '[data-cw-xhs-control="' + marker + '"]',
        }
      }
      const waitForCommentEditor = async (
        scopeSelector,
        timeout = 4000,
      ) => {
        const deadline = Date.now() + timeout
        do {
          const state = await page(commentEditorState, {
            selector: commentInputSelector,
            scope_selector: scopeSelector || null,
          })
          if (state.found && state.expanded) return state
          await pause(100)
        } while (Date.now() < deadline)
        return { found: false, expanded: false }
      }
      const prepareCommentInput = async ({
        activateEntry = false,
        scopeSelector = null,
      } = {}) => {
        let state = await page(commentEditorState, {
          selector: commentInputSelector,
          scope_selector: scopeSelector,
        })
        if (!state.found && scopeSelector)
          state = await page(commentEditorState, {
            selector: commentInputSelector,
            scope_selector: null,
          })
        if ((!state.found || !state.expanded) && activateEntry) {
          let entry = { found: false }
          if (scopeSelector)
            entry = await page(controls, {
              root_selector: scopeSelector,
              selector:
                'div.input-box div.content-edit span, .content-edit span',
            })
          if (!entry.found)
            entry = await page(controls, {
              selector: 'div.input-box div.content-edit span',
            })
          if (!entry.found)
            throw new Error('Reply input unavailable; no reply was submitted')
          await click(entry.selector)
          state = await waitForCommentEditor(scopeSelector)
          if (!state.found && scopeSelector)
            state = await waitForCommentEditor(null)
        }
        if (!state.found)
          throw new Error('Reply input unavailable; no reply was submitted')
        if (!state.expanded)
          throw new Error(
            'Reply editor did not expand; no reply was submitted',
          )
        return state.selector
      }

      const action = input.action || 'submit'
      if (action !== 'status' && input.feed_id) {
        const current = await page(() => location.pathname.split('/').pop())
        if (current !== input.feed_id) {
          if (!input.xsec_token)
            throw new Error('xsec_token required to open target')
          const url =
            'https://www.xiaohongshu.com/explore/' +
            encodeURIComponent(input.feed_id) +
            '?xsec_token=' +
            encodeURIComponent(input.xsec_token) +
            '&xsec_source=pc_feed'
          await browser.goto(url, {
            ...options,
            'wait-until': 'domcontentloaded',
          })
          state.result = {
            status: 'navigated',
            data: { url, submitted: false },
          }
          return 'success'
        }
      }
      if (action !== 'status' && input.note_url) {
        const opened = await browser.webmcp.exec(
          'com.xiaohongshu.main.open_note',
          { note_url: input.note_url },
          options,
        )
        if (opened.tabId !== target.tabId || opened.result.status !== 'success')
          throw new Error('Unable to open note')
        if (opened.result.result.status === 'error') {
          state.result = opened.result.result
          return 'success'
        }
        if (opened.result.result.status === 'navigated') {
          state.result = {
            status: 'navigated',
            data: {
              ...opened.result.result.data,
              note_url: input.note_url,
              submission_attempted: false,
              next_action: 'reply_comment_in_feed',
              retry_args: input,
              continuation: {
                tab_id: target.tabId,
                origin: 'https://www.xiaohongshu.com',
                tool_name: 'com.xiaohongshu.main.reply_comment_in_feed',
                args: input,
                rediscover: true,
              },
            },
            message:
              'Note navigation started; no reply was submitted. Call reply_comment_in_feed again on the opened note.',
          }
          return 'success'
        }
      }
      if (
        action === 'status' &&
        (typeof input.operation_id !== 'string' || !input.operation_id)
      )
        throw new Error('operation_id is required to query reply status')
      if (
        input.content !== undefined &&
        (typeof input.content !== 'string' || !input.content)
      )
        throw new Error('content must be a nonempty string when supplied')
      if (
        action !== 'status' &&
        input.content === undefined &&
        !input.operation_id
      )
        throw new Error('content is required when operation_id is omitted')

      const journalKey =
        'cw-xhs-reply-' +
        (input.operation_id ||
          JSON.stringify([
            input.content,
            input.comment_id || null,
            input.user_id || null,
          ]))
      const previous = await page((key) => {
        const raw = sessionStorage.getItem(key)
        return raw ? JSON.parse(raw) : null
      }, journalKey)
      const captureComments = ({ content }) => {
        const rows = Array.from(
          new Set(
            document.querySelectorAll(
              '.comment-item, .parent-comment, .reply-item',
            ),
          ),
        )
        const idOf = (el) =>
          (
            el.getAttribute('data-comment-id') ||
            el.getAttribute('data-id') ||
            el.id ||
            ''
          ).replace(/^comment-/, '')
        const ids = rows.map(idOf).filter(Boolean)
        const contentIds = rows
          .filter((el) => el.innerText.includes(content))
          .map(idOf)
          .filter(Boolean)
        return {
          url: location.href,
          note_id:
            location.pathname.match(
              /\/(?:explore|search_result|discovery\/item)\/([a-zA-Z0-9_-]{8,80})/,
            )?.[1] || null,
          rows: rows.length,
          ids: Array.from(new Set(ids)),
          content_ids: Array.from(new Set(contentIds)),
          content_present: rows.some((el) => el.innerText.includes(content)),
        }
      }
      const verifyComments = (
        current,
        { seen_ids, content_present_before },
      ) => {
        const newContent = current.content_ids.some(
          (id) => !seen_ids.includes(id),
        )
        return (
          current.content_present &&
          (newContent || !content_present_before)
        )
      }
      const currentLocation = await page(() => ({
        url: location.href,
        note_id:
          location.pathname.match(
            /\/(?:explore|search_result|discovery\/item)\/([a-zA-Z0-9_-]{8,80})/,
          )?.[1] || null,
      }))
      const sameNote =
        previous &&
        ((previous.note_id && previous.note_id === currentLocation.note_id) ||
          (!previous.note_id && previous.url === currentLocation.url))
      if (
        previous &&
        input.content !== undefined &&
        input.content !== previous.content
      )
        throw new Error('operation_id content mismatch')
      if (sameNote) {
        const current = await page(captureComments, {
          content: previous.content,
        })
        const verified = verifyComments(current, {
          seen_ids: previous.seen_ids || [],
          content_present_before: previous.content_present_before === true,
        })
        state.result = {
          status: verified ? 'ok' : 'pending',
          data: {
            ...previous,
            phase: verified ? 'verified' : previous.phase,
            submitted: verified,
            verified,
            submission_uncertain: !verified,
            requires_inspection: !verified,
            resubmitted: false,
            next_action: verified ? null : 'read_comments',
            message: verified
              ? null
              : 'The reply is not yet verified. Inspect the page; do not resubmit automatically.',
          },
        }
        return 'success'
      }
      if (previous) {
        state.result = {
          status: 'pending',
          data: {
            ...previous,
            submitted: false,
            verified: false,
            submission_uncertain: true,
            requires_inspection: true,
            resubmitted: false,
            next_action: 'read_comments',
            message:
              'A reply attempt for this operation already exists on another page. Inspect it before retrying.',
          },
        }
        return 'success'
      }
      if (action === 'status') {
        state.result = {
          status: 'pending',
          data: {
            submitted: false,
            verified: false,
            operation_id: input.operation_id,
            next_action: 'reply_comment_in_feed',
            message: 'No matching reply attempt was found in this tab.',
          },
        }
        return 'success'
      }
      const content =
        typeof input.content === 'string' ? input.content : previous?.content
      if (typeof content !== 'string' || !content)
        throw new Error('No reply content available for this operation')
      const targetCheck = await page(() => {
        const match = location.pathname.match(
          /\/(?:explore|search_result|discovery\/item)\/([a-zA-Z0-9_-]{8,80})/,
        )
        if (!match) throw new Error('Open the target note first')
        return true
      })
      if (!targetCheck) throw new Error('Open the target note first')
      const snapshot = await page(captureComments, { content })
      if (!input.comment_id && !input.user_id)
        throw new Error('comment_id or user_id required')
      let replyControl
      const searchKey =
        'cw-xhs-reply-search-' +
        JSON.stringify([
          snapshot.url,
          input.comment_id || null,
          input.user_id || null,
        ])
      const search = (await page(
        (key) => JSON.parse(sessionStorage.getItem(key) || 'null'),
        searchKey,
      )) || {
        started_at: Date.now(),
        rounds: 0,
        expand_rounds: 0,
        stagnant: 0,
        lastCount: -1,
      }
      let stagnant = search.stagnant,
        lastCount = search.lastCount
      const searchDeadline = Date.now() + 18000
      for (
        let round = 0;
        search.rounds < 25 &&
        Date.now() < searchDeadline &&
        Date.now() - search.started_at < 90000;
        round++
      ) {
        const found = await page((args) => {
          const visible = (el) =>
            el.getClientRects().length &&
            getComputedStyle(el).display !== 'none'
          const rows = Array.from(
            document.querySelectorAll(
              '.comment-item, .parent-comment, .reply-item, [data-comment-id]',
            ),
          )
          const row = rows.find((el) => {
            const id = (
              el.getAttribute('data-comment-id') ||
              el.getAttribute('data-id') ||
              el.id ||
              ''
            ).replace(/^comment-/, '')
            if (args.comment_id && id !== args.comment_id) return false
            return (
              !args.user_id ||
              el.querySelector(
                '[data-user-id="' + CSS.escape(args.user_id) + '"]',
              ) ||
              Array.from(el.querySelectorAll('a[href]')).some((a) => {
                try {
                  return (
                    new URL(a.href).pathname === '/user/profile/' + args.user_id
                  )
                } catch {
                  return false
                }
              })
            )
          })
          const el =
            row &&
            Array.from(
              row.querySelectorAll(
                '.reply, .reply-button, button, [role="button"]',
              ),
            ).find((el) => visible(el) && el.innerText.trim() === '回复')
          if (!el) return { found: false, count: rows.length }
          const marker = crypto.randomUUID()
          el.setAttribute('data-cw-xhs-control', marker)
          const target = row.closest('.parent-comment') || row
          const targetMarker = crypto.randomUUID()
          target.setAttribute('data-cw-xhs-reply-target', targetMarker)
          el.scrollIntoView?.({ block: 'center' })
          return {
            found: true,
            selector: '[data-cw-xhs-control="' + marker + '"]',
            scope_selector:
              '[data-cw-xhs-reply-target="' + targetMarker + '"]',
          }
        }, input)
        if (found.found) {
          replyControl = found
          break
        }
        stagnant = found.count === lastCount ? stagnant + 1 : 0
        lastCount = found.count
        if (stagnant >= 10) break
        const loaded = await browser.webmcp.exec(
          'com.xiaohongshu.main.load_more_comments',
          {
            expand_replies: search.expand_rounds < 5,
            max_comment_items: 100,
            max_rounds: 1,
          },
          options,
        )
        if (loaded.tabId !== target.tabId)
          throw new Error('Browser returned another tab')
        search.rounds++
        if (search.expand_rounds < 5) search.expand_rounds++
        search.stagnant = stagnant
        search.lastCount = lastCount
        await page(
          ({ key, value }) =>
            sessionStorage.setItem(key, JSON.stringify(value)),
          { key: searchKey, value: search },
        )
      }
      if (!replyControl) {
        state.result = {
          status: 'pending',
          data: {
            target_found: false,
            search,
            next_action: 'reply_comment_in_feed',
            stop_reason:
              search.rounds >= 25
                ? 'scroll_limit'
                : stagnant >= 10
                  ? 'stagnant'
                  : Date.now() - search.started_at >= 90000
                    ? 'search_timeout'
                    : 'call_budget',
          },
        }
        return 'success'
      }
      await click(replyControl.selector)
      const selector = await prepareCommentInput({
        activateEntry: true,
        scopeSelector: replyControl.scope_selector,
      })
      await typeText(selector, content)
      const submitSelector =
        '.comment-input button, .comment-container .submit, .input-box .submit, .comment-input .submit, div.bottom button.submit'
      let control = await page(controls, {
        root_selector: replyControl.scope_selector,
        selector: submitSelector,
        label: '发送',
      })
      if (!control.found)
        control = await page(controls, {
          selector: submitSelector,
          label: '发送',
        })
      if (!control.found)
        throw new Error('Submit control unavailable; comment was not submitted')
      const same = await page((url) => location.href === url, snapshot.url)
      if (!same) throw new Error('Page changed; comment was not submitted')
      // Persist the attempt before clicking so an uncertain click is never retried blindly.
      await page(
        ({
          key,
          url,
          content,
          note_id,
          seen_ids,
          content_present_before,
        }) =>
          sessionStorage.setItem(
            key,
            JSON.stringify({
              url,
              content,
              note_id,
              seen_ids,
              content_present_before,
              submitted: false,
              verified: false,
              submission_attempted: true,
              submission_uncertain: false,
              requires_inspection: false,
              click_completed: false,
              phase: 'click_pending',
            }),
          ),
        {
          key: journalKey,
          url: snapshot.url,
          content,
          note_id: snapshot.note_id,
          seen_ids: snapshot.ids,
          content_present_before: snapshot.content_present,
        },
      )
      try {
        await click(control.selector)
      } catch (error) {
        await page(
          ({ key, message }) => {
            const current = JSON.parse(sessionStorage.getItem(key) || '{}')
            sessionStorage.setItem(
              key,
              JSON.stringify({
                ...current,
                phase: 'click_uncertain',
                click_completed: false,
                submission_uncertain: true,
                requires_inspection: true,
                last_error: message,
              }),
            )
          },
          {
            key: journalKey,
            message: String(error?.message || error),
          },
        )
        const uncertain = await page(
          (key) => JSON.parse(sessionStorage.getItem(key) || 'null'),
          journalKey,
        )
        state.result = {
          status: 'pending',
          data: {
            ...uncertain,
            submitted: false,
            verified: false,
            resubmitted: false,
            next_action: 'read_comments',
            message:
              'The submit click did not complete. Reply submission is uncertain; inspect the page and do not resubmit blindly.',
          },
        }
        return 'success'
      }
      await page(
        (key) => {
          const current = JSON.parse(sessionStorage.getItem(key) || '{}')
          sessionStorage.setItem(
            key,
            JSON.stringify({
              ...current,
              phase: 'submitted_unverified',
              click_completed: true,
              submission_uncertain: true,
              requires_inspection: true,
            }),
          )
        },
        journalKey,
      )
      let verified = false
      let pageChanged = false
      const deadline = Date.now() + 8000
      while (Date.now() < deadline) {
        const current = await page(captureComments, { content })
        pageChanged =
          current.url !== snapshot.url ||
          (snapshot.note_id !== null &&
            current.note_id !== snapshot.note_id)
        if (pageChanged) break
        verified = verifyComments(current, {
          seen_ids: snapshot.ids,
          content_present_before: snapshot.content_present,
        })
        if (verified) break
        await pause(250)
      }
      const verifiedSnapshot = {
        ...snapshot,
        content,
        phase: verified ? 'verified' : 'submitted_unverified',
        submitted: verified,
        verified,
        submission_attempted: true,
        submission_uncertain: !verified,
        requires_inspection: !verified,
        click_completed: true,
        page_changed: pageChanged,
      }
      await page(
        ({ key, snapshot }) =>
          sessionStorage.setItem(key, JSON.stringify(snapshot)),
        { key: journalKey, snapshot: verifiedSnapshot },
      )
      state.result = {
        status: verified ? 'ok' : 'pending',
        data: {
          ...verifiedSnapshot,
          resubmitted: false,
          next_action: verified ? null : 'read_comments',
          message: verified
            ? null
            : pageChanged
              ? 'The page changed after the submit click. Inspect the note before retrying.'
              : 'Do not automatically resubmit an unverified reply.',
        },
      }
      return 'success'
    },
  },
  result({ state }) {
    return state.result
  },
}
