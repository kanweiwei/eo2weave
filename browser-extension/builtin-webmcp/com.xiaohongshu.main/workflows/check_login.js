// Self-contained adapter workflow. Page observations and browser actions stay in this package.

export default {
  inputSchema: {
    type: 'object',
    properties: {},
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
    description: 'check_login',
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
      const response = await browser.webmcp.exec(
        'com.xiaohongshu.main.read_page',
        { ...input, view: 'check_login' },
        options,
      )
      if (
        response.tabId !== target.tabId ||
        response.result.status !== 'success'
      )
        throw new Error('Page reader failed')
      state.result = response.result.result
      return 'success'
    },
  },
  result({ state }) {
    return state.result
  },
}
