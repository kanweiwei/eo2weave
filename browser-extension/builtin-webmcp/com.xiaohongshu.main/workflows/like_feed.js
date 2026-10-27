// Self-contained adapter workflow. Page observations and browser actions stay in this package.

export default {
  inputSchema: {
    type: 'object',
    properties: {
      feed_id: { type: 'string', minLength: 1 },
      xsec_token: { type: 'string', minLength: 1 },
      unlike: { type: 'boolean' },
      liked: {
        type: 'boolean',
        default: true,
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
    description: 'like_feed',
    async run({ input, state, target }) {
      const options = { tab: target.tabId, timeout: 12000 }
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

      const observeLike = () => {
        const id = location.pathname.match(
          /\/(?:explore|search_result|discovery\/item)\/([a-zA-Z0-9_-]{8,80})/,
        )?.[1]
        if (!id) throw new Error('Open the target note first')
        const entry = window.__INITIAL_STATE__?.note?.noteDetailMap?.[id]
        const note = entry?.note ?? entry
        const el = document.querySelector(
          '.interact-container .left .like-lottie',
        )
        if (!el) throw new Error('Like control unavailable')
        const raw = note?.interactInfo?.liked
        const state = note && (raw === undefined || raw === null) ? false : raw
        const aria = el.getAttribute('aria-pressed')
        return {
          note_id: id,
          liked:
            typeof state === 'boolean'
              ? state
              : aria === 'true'
                ? true
                : aria === 'false'
                  ? false
                  : null,
        }
      }
      if (input.feed_id) {
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
            'wait-until': 'commit',
          })
          const ready = await page(async () => {
            const deadline = Date.now() + 5000
            do {
              if (document.querySelector('.interact-container .left .like-lottie')) return true
              await new Promise(resolve => setTimeout(resolve, 200))
            } while (Date.now() < deadline)
            return false
          })
          if (!ready) {
            state.result = { status: 'pending', data: {
              phase: 'navigation', url, click_attempted: false,
              next_action: 'like_feed', retry_args: input,
            } }
            return 'success'
          }
        }
      }
      const before = await page(observeLike)
      const desired = input.unlike === true ? false : input.liked !== false
      let after = before,
        attempts = 0
      for (let attempt = 0; attempt < 2 && after.liked !== desired; attempt++) {
        if (attempt > 0 && after.liked === null) break
        if (after.note_id !== before.note_id)
          throw new Error('Page changed during like operation')
        await click('.interact-container .left .like-lottie')
        attempts++
        after = await page(
          async ({ observeSource, id, want }) => {
            const observe = eval('(' + observeSource + ')')
            const deadline = Date.now() + 4000
            let current
            do {
              current = observe()
              if (current.note_id !== id) throw new Error('Page changed')
              if (current.liked === want || current.liked === null)
                return current
              await new Promise((resolve) => setTimeout(resolve, 500))
            } while (Date.now() < deadline)
            return current
          },
          {
            observeSource: observeLike.toString(),
            id: before.note_id,
            want: desired,
          },
        )
      }
      state.result = {
        status:
          after.note_id === before.note_id && after.liked === desired
            ? 'ok'
            : 'pending',
        data: {
          ...after,
          click_attempts: attempts,
          desired,
          verified: after.note_id === before.note_id && after.liked === desired,
        },
      }
      return 'success'
    },
  },
  result({ state }) {
    return state.result
  },
}
