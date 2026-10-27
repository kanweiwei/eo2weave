// Self-contained adapter workflow. Page observations and browser actions stay in this package.

export default {
  inputSchema: {
    type: 'object',
    properties: {
      keyword: {
        type: 'string',
        minLength: 1,
        maxLength: 100,
      },
    },
    required: ['keyword'],
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
    description: 'search_notes',
    async run({ input, state, target }) {
      const options = { tab: target.tabId, timeout: 10000 }
      const page = async (fn, args = {}) => {
        const response = await browser.eval(
          '() => (' + fn.toString() + ')(' + JSON.stringify(args) + ')',
          options,
        )
        if (response.tabId !== target.tabId)
          throw new Error('Browser returned another tab')
        return response.result
      }
      const url =
        'https://www.xiaohongshu.com/search_result?keyword=' +
        encodeURIComponent(input.keyword) +
        '&source=web_explore_feed'
      const valid = await page((url) => {
        const u = new URL(url)
        if (
          u.protocol !== 'https:' ||
          u.hostname !== 'www.xiaohongshu.com' ||
          u.username ||
          u.password
        )
          throw new Error('Invalid Xiaohongshu URL')
        return u.href
      }, url)
      await browser.goto(valid, {
        ...options,
        'wait-until': 'domcontentloaded',
      })
      state.result = { status: 'navigated', data: { url: valid } }
      return 'success'
    },
  },
  result({ state }) {
    return state.result
  },
}
