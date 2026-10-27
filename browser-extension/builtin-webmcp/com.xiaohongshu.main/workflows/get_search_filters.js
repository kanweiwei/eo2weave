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
    description: 'get_search_filters',
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
          function visible(element) {
            if (!(element instanceof HTMLElement)) return false
            const style = getComputedStyle(element)
            return (
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              element.getClientRects().length > 0
            )
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
          function searchCards() {
            return Array.from(
              document.querySelectorAll('section.note-item, .note-item'),
            ).filter(visible)
          }
          function visibleEmptySearch() {
            const empty = document.querySelector(
              '.search-empty, .empty-state, .no-result, .no-results',
            )
            if (visible(empty)) return true
            const main = document.querySelector('#app, main')
            const text = visible(main) ? clean(main.innerText) : ''
            return /暂无搜索结果|没有找到相关内容|没有搜索到相关内容/.test(text)
          }

          // Package-local observation: xiaohongshu-filters.ts
          var searchFilterValues = {
            sort_by: [
              '\u7EFC\u5408',
              '\u6700\u65B0',
              '\u6700\u591A\u70B9\u8D5E',
              '\u6700\u591A\u8BC4\u8BBA',
              '\u6700\u591A\u6536\u85CF',
            ],
            note_type: ['\u4E0D\u9650', '\u89C6\u9891', '\u56FE\u6587'],
            publish_time: [
              '\u4E0D\u9650',
              '\u4E00\u5929\u5185',
              '\u4E00\u5468\u5185',
              '\u534A\u5E74\u5185',
            ],
            search_scope: [
              '\u4E0D\u9650',
              '\u5DF2\u770B\u8FC7',
              '\u672A\u770B\u8FC7',
              '\u5DF2\u5173\u6CE8',
            ],
            location: ['\u4E0D\u9650', '\u540C\u57CE', '\u9644\u8FD1'],
          }
          var labels = {
            sort_by: ['\u6392\u5E8F\u4F9D\u636E'],
            note_type: ['\u7B14\u8BB0\u7C7B\u578B'],
            publish_time: ['\u53D1\u5E03\u65F6\u95F4'],
            search_scope: ['\u641C\u7D22\u8303\u56F4'],
            location: ['\u4F4D\u7F6E\u8DDD\u79BB'],
          }
          var pause = () => new Promise((resolve) => setTimeout(resolve, 150))
          var pendingRefresh = JSON.parse(
            sessionStorage.getItem('cw-xhs-filter-refresh') || 'null',
          )
          function guard(startUrl) {
            if (location.hostname !== HOST)
              return error(
                'UNSUPPORTED_PAGE',
                'Not on a supported Xiaohongshu page.',
              )
            if (startUrl && location.href !== startUrl)
              return error(
                'PAGE_CHANGED',
                'The search page changed during the filter operation.',
              )
            if (location.pathname !== '/search_result')
              return error(
                'NOT_SEARCH_PAGE',
                'Open a search result page first.',
              )
            if (loginState() === 'logged_out')
              return error('LOGIN_REQUIRED', 'Sign in on this tab first.')
            return null
          }
          function selection(element) {
            for (const attr of [
              'aria-selected',
              'aria-checked',
              'data-selected',
            ]) {
              const value = element.getAttribute(attr)
              if (value === 'true') return true
              if (value === 'false') return false
            }
            if (
              Array.from(element.classList).some((name) =>
                /^(active|selected|checked|is-active|is-selected)$/.test(name),
              )
            )
              return true
            return null
          }
          function rendered(element) {
            if (!visible(element)) return false
            for (
              let ancestor = element;
              ancestor;
              ancestor = ancestor.parentElement
            ) {
              const style = getComputedStyle(ancestor)
              if (
                ancestor.hidden ||
                style.display === 'none' ||
                style.visibility === 'hidden' ||
                (style.opacity !== '' && Number(style.opacity) === 0)
              )
                return false
            }
            return true
          }
          function hitState(element) {
            if (typeof document.elementFromPoint !== 'function')
              return 'unavailable'
            if (
              !rendered(element) ||
              element.hasAttribute('disabled') ||
              element.getAttribute('aria-disabled') === 'true'
            )
              return 'blocked_or_clipped'
            const rect = element.getBoundingClientRect()
            const width =
              document.documentElement.clientWidth || window.innerWidth
            const height =
              document.documentElement.clientHeight || window.innerHeight
            if (
              ![
                rect.left,
                rect.top,
                rect.right,
                rect.bottom,
                width,
                height,
              ].every(Number.isFinite) ||
              width <= 0 ||
              height <= 0
            )
              return 'unavailable'
            let left = Math.max(0, rect.left)
            let top = Math.max(0, rect.top)
            let right = Math.min(width, rect.right)
            let bottom = Math.min(height, rect.bottom)
            for (
              let ancestor = element.parentElement;
              ancestor;
              ancestor = ancestor.parentElement
            ) {
              const style = getComputedStyle(ancestor)
              const bounds = ancestor.getBoundingClientRect()
              if (
                /^(hidden|clip|auto|scroll)$/.test(
                  style.overflowX || style.overflow,
                )
              ) {
                left = Math.max(left, bounds.left)
                right = Math.min(right, bounds.right)
              }
              if (
                /^(hidden|clip|auto|scroll)$/.test(
                  style.overflowY || style.overflow,
                )
              ) {
                top = Math.max(top, bounds.top)
                bottom = Math.min(bottom, bounds.bottom)
              }
            }
            if (right <= left || bottom <= top) return 'blocked_or_clipped'
            for (const xRatio of [0.5, 0.15, 0.85]) {
              for (const yRatio of [0.5, 0.15, 0.85]) {
                const hit = document.elementFromPoint(
                  left + (right - left) * xRatio,
                  top + (bottom - top) * yRatio,
                )
                if (hit && (hit === element || element.contains(hit)))
                  return 'reachable'
              }
            }
            return 'blocked_or_clipped'
          }
          function disambiguate(options) {
            if (options.length < 2) return options
            const states = options.map((option) => hitState(option.element))
            const reachable = options.filter(
              (_, index) => states[index] === 'reachable',
            )
            return reachable.length === 1 && !states.includes('unavailable')
              ? reachable
              : options
          }
          function rawOptions(group) {
            return Array.from(group.querySelectorAll('.tags'))
              .filter(rendered)
              .filter((element) => element.closest('.filters') === group)
              .map((element) => ({
                value: clean(element.innerText),
                selected: selection(element),
                element,
              }))
              .filter((option) => option.value)
          }
          function canonicalOptions(group) {
            const raw = rawOptions(group)
            const canonical = raw
              .filter(
                (option) =>
                  !raw.some(
                    (ancestor) =>
                      ancestor !== option &&
                      ancestor.value === option.value &&
                      ancestor.element.contains(option.element),
                  ),
              )
              .map((outer) => {
                const cluster = raw.filter(
                  (option) =>
                    option.value === outer.value &&
                    outer.element.contains(option.element),
                )
                const evidence = new Set(
                  cluster
                    .map((option) => option.selected)
                    .filter((state) => state !== null),
                )
                const controls = cluster.filter((option) =>
                  option.element.matches(
                    'button, [role="option"], [role="radio"]',
                  ),
                )
                return {
                  value: outer.value,
                  selected:
                    evidence.size === 1 ? Array.from(evidence)[0] : null,
                  element:
                    controls.length === 1 ? controls[0].element : outer.element,
                }
              })
            return Array.from(
              new Set(canonical.map((option) => option.value)),
            ).flatMap((value) =>
              disambiguate(
                canonical.filter((option) => option.value === value),
              ),
            )
          }
          function optionDiagnostics(key, value) {
            return groups()
              .filter((group) => group.key === key)
              .map((group) => ({
                group: key,
                value,
                canonical_control_count: group.options.filter(
                  (option) => option.value === value,
                ).length,
                controls: group.options
                  .filter((option) => option.value === value)
                  .map((option) => ({
                    tag: option.element.tagName.toLowerCase(),
                    classes: option.element.className.slice(0, 160),
                    role: option.element.getAttribute('role'),
                    hit_test: hitState(option.element),
                    rect: (() => {
                      const rect = option.element.getBoundingClientRect()
                      return {
                        x: rect.x,
                        y: rect.y,
                        width: rect.width,
                        height: rect.height,
                      }
                    })(),
                    parent_chain: (() => {
                      const chain = []
                      for (
                        let parent = option.element.parentElement;
                        parent && chain.length < 4;
                        parent = parent.parentElement
                      ) {
                        const style = getComputedStyle(parent)
                        chain.push({
                          tag: parent.tagName.toLowerCase(),
                          classes: parent.className.slice(0, 160),
                          display: style.display,
                          visibility: style.visibility,
                          opacity: style.opacity,
                          pointer_events: style.pointerEvents,
                          overflow_x: style.overflowX,
                          overflow_y: style.overflowY,
                        })
                      }
                      return chain
                    })(),
                    same_value_descendant_count: Array.from(
                      option.element.querySelectorAll('.tags'),
                    )
                      .filter(rendered)
                      .filter((element) => clean(element.innerText) === value)
                      .length,
                  })),
              }))
          }
          function groups() {
            const found = []
            for (const panel of Array.from(
              document.querySelectorAll('.filter-panel'),
            ).filter(rendered)) {
              for (const element of Array.from(
                panel.querySelectorAll('.filters'),
              ).filter(rendered)) {
                const heading = Array.from(element.children).find(
                  (child) => child.tagName === 'SPAN' && visible(child),
                )
                const label = heading ? clean(heading.innerText) : ''
                const key = Object.keys(labels).find((candidate) =>
                  labels[candidate].includes(label),
                )
                if (!key) continue
                const options = canonicalOptions(element)
                found.push({ key, label, element, options })
              }
            }
            return Object.keys(labels).flatMap((key) => {
              const matching = found.filter((group) => group.key === key)
              if (matching.length < 2) return matching
              const states = matching.map((group) =>
                group.options.map((option) => hitState(option.element)),
              )
              const reachable = matching.filter((_, index) =>
                states[index].includes('reachable'),
              )
              return reachable.length === 1 &&
                states.every((state) => !state.includes('unavailable'))
                ? reachable
                : matching
            })
          }
          function snapshot() {
            return groups().map(({ key, label, options }) => {
              // Reading merges duplicate controls; action targeting keeps them separate.
              const logicalOptions = Array.from(
                new Set(options.map((option) => option.value)),
              ).map((value) => {
                const evidence = new Set(
                  options
                    .filter((option) => option.value === value)
                    .map((option) => option.selected)
                    .filter((selected) => selected !== null),
                )
                return {
                  value,
                  selected:
                    evidence.size === 1 ? Array.from(evidence)[0] : null,
                }
              })
              const selected = logicalOptions.filter(
                (option) => option.selected === true,
              )
              return {
                key,
                label,
                options: logicalOptions,
                selected_value:
                  selected.length === 1 ? selected[0].value : null,
              }
            })
          }
          async function reveal(startUrl) {
            if (groups().length) return null
            const triggers = Array.from(document.querySelectorAll('div.filter'))
              .filter(visible)
              .filter(
                (element) =>
                  !element.closest(
                    '.note-item, .note-detail, .comments-container',
                  ),
              )
            if (triggers.length !== 1)
              return error(
                'FILTER_UI_UNAVAILABLE',
                'No unique visible search filter control was found.',
              )
            triggers[0].dispatchEvent(
              new MouseEvent('mouseover', { bubbles: true }),
            )
            triggers[0].dispatchEvent(
              new MouseEvent('mouseenter', { bubbles: false }),
            )
            const deadline = Date.now() + 1800
            while (Date.now() < deadline) {
              const failure = guard(startUrl)
              if (failure) return failure
              if (groups().length) return null
              await pause()
            }
            return error(
              'FILTER_UI_UNAVAILABLE',
              'The filter panel did not become readable. Open it on the page and retry.',
            )
          }
          function fingerprint() {
            return JSON.stringify({
              cards: searchCards()
                .filter(visible)
                .map((card) => ({
                  urls: Array.from(card.querySelectorAll('a[href]')).map(
                    (link) => link.href,
                  ),
                })),
              empty: visibleEmptySearch(),
            })
          }
          async function waitForFilterResults() {
            if (!pendingRefresh) return null
            if (pendingRefresh.pageUrl !== location.href) {
              pendingRefresh = null
              return null
            }
            const startUrl = location.href
            const before = pendingRefresh.before
            const deadline = Date.now() + 3e3
            let candidate = null
            let stableSince = 0
            while (Date.now() < deadline) {
              const failure = guard(startUrl)
              if (failure) return failure
              const loading = Array.from(
                document.querySelectorAll(
                  '.search-loading, .feeds-loading, .filter-loading, [aria-busy="true"]',
                ),
              ).some(visible)
              const ready =
                searchCards().filter(visible).length > 0 || visibleEmptySearch()
              const current = fingerprint()
              if (!loading && ready && current !== before) {
                if (candidate !== current) {
                  candidate = current
                  stableSince = Date.now()
                }
                if (Date.now() - stableSince >= 450) {
                  pendingRefresh = null
                  return null
                }
              } else {
                candidate = null
              }
              await pause()
            }
            return error(
              'FILTER_RESULTS_UNCONFIRMED',
              'Filter controls changed, but a stable refreshed result list has not been observed. Do not attribute the previous cards to the new filters.',
            )
          }
          function findOption(key, value) {
            const candidates = groups().filter((group) => group.key === key)
            if (candidates.length !== 1) return null
            const options = candidates[0].options.filter(
              (option) => option.value === value,
            )
            return options.length === 1 &&
              hitState(options[0].element) === 'reachable'
              ? options[0]
              : null
          }
          var xiaohongshuFilterTools = {
            async get_search_filters() {
              return persistCall(async () => {
                const failure = guard()
                if (failure) return failure
                const unavailable = await reveal(location.href)
                if (unavailable) return unavailable
                const diagnostics = groups().flatMap((group) =>
                  Array.from(
                    new Set(group.options.map((option) => option.value)),
                  )
                    .filter(
                      (value) =>
                        group.options.filter((option) => option.value === value)
                          .length > 1,
                    )
                    .flatMap((value) => optionDiagnostics(group.key, value)),
                )
                return result('ok', {
                  groups: snapshot(),
                  results_scope: 'visible_filter_controls',
                  option_diagnostics: diagnostics,
                })
              })
            },
            async apply_search_filters(args) {
              const failure = guard()
              if (failure) return failure
              if (
                !args.filters ||
                typeof args.filters !== 'object' ||
                Array.isArray(args.filters)
              ) {
                return error(
                  'INVALID_FILTERS',
                  'filters must be an object with at least one supported filter.',
                )
              }
              const requested = Object.entries(args.filters)
              if (
                !requested.length ||
                requested.some(
                  ([key, value]) =>
                    !Object.hasOwn(searchFilterValues, key) ||
                    !searchFilterValues[key].includes(value),
                )
              ) {
                return error(
                  'INVALID_FILTERS',
                  'Use the documented filter keys and exact supported values.',
                )
              }
              const startUrl = location.href
              const unavailable = await reveal(startUrl)
              if (unavailable) return unavailable
              for (const [key, value] of requested) {
                if (!findOption(key, value)) {
                  return {
                    ...error(
                      'FILTER_UNAVAILABLE',
                      `No unique visible option exists for ${key}: ${value}.`,
                    ),
                    data: {
                      groups: snapshot(),
                      option_diagnostics: optionDiagnostics(key, value),
                    },
                  }
                }
              }
              const applied = []
              const fail = (response) => ({
                ...response,
                data: {
                  requested: args.filters,
                  applied_keys: applied,
                  groups: snapshot(),
                  selection_verified: false,
                },
              })
              let changed = false
              let beforeLastChange = fingerprint()
              for (const [key, value] of requested) {
                const failure2 = guard(startUrl)
                if (failure2) return fail(failure2)
                const option = findOption(key, value)
                if (!option)
                  return fail(
                    error(
                      'FILTER_UI_UNAVAILABLE',
                      'The filter panel changed or closed during selection.',
                    ),
                  )
                if (option.selected !== true) {
                  beforeLastChange = fingerprint()
                  pendingRefresh = {
                    pageUrl: startUrl,
                    before: beforeLastChange,
                  }
                  changed = true
                  option.element.click()
                  const deadline = Date.now() + 1500
                  while (Date.now() < deadline) {
                    const interrupted = guard(startUrl)
                    if (interrupted) return fail(interrupted)
                    if (findOption(key, value)?.selected === true) break
                    await pause()
                  }
                }
                if (findOption(key, value)?.selected !== true) {
                  return fail(
                    error(
                      'FILTER_SELECTION_UNVERIFIED',
                      'The page did not confirm the requested selection. Read the controls before retrying.',
                    ),
                  )
                }
                applied.push(key)
              }
              let refresh = changed ? 'unconfirmed' : 'not_requested'
              if (changed || pendingRefresh?.pageUrl === startUrl) {
                const refreshed = await waitForFilterResults()
                if (
                  refreshed &&
                  refreshed.error_code !== 'FILTER_RESULTS_UNCONFIRMED'
                )
                  return fail(refreshed)
                refresh = refreshed ? 'unconfirmed' : 'observed'
              }
              if (
                requested.some(
                  ([key, value]) => findOption(key, value)?.selected !== true,
                )
              ) {
                return fail(
                  error(
                    'FILTER_SELECTION_UNVERIFIED',
                    'The final control state no longer confirms every requested filter.',
                  ),
                )
              }
              return {
                ...result('ok', {
                  requested: args.filters,
                  groups: snapshot(),
                  selection_verified: true,
                  results_refresh: refresh,
                }),
                message:
                  refresh === 'unconfirmed'
                    ? 'Filter selections are confirmed; result refresh is unconfirmed. Do not claim the existing cards satisfy the new filters.'
                    : null,
              }
            },
          }
          async function persistCall(run) {
            try {
              return await run()
            } finally {
              sessionStorage.setItem(
                'cw-xhs-filter-refresh',
                JSON.stringify(pendingRefresh),
              )
            }
          }

          // Workflow entrypoint
          async function stdin_default(args) {
            return xiaohongshuFilterTools.get_search_filters(args)
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
