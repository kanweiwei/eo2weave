// Self-contained adapter workflow. Page observations and browser actions stay in this package.

export default {
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 20,
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
    description: 'list_search_results',
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

          // Package-local observation: xiaohongshu-media.ts
          function unwrap(value) {
            if (!value || typeof value !== 'object' || Array.isArray(value))
              return value
            const ref = value
            return ref.value ?? ref._value ?? value
          }
          function record(value) {
            const object = unwrap(value)
            return object &&
              typeof object === 'object' &&
              !Array.isArray(object)
              ? object
              : null
          }
          function dimension(value) {
            return typeof value === 'number' &&
              Number.isInteger(value) &&
              value > 0
              ? value
              : null
          }
          function text(value) {
            return typeof value === 'string' && value.trim()
              ? value.trim()
              : null
          }
          function mediaUrl(value) {
            const input = text(value)
            if (!input) return null
            try {
              const url = new URL(input, location.origin)
              return ['https:', 'http:'].includes(url.protocol) &&
                !url.username &&
                !url.password
                ? url.href
                : null
            } catch {
              return null
            }
          }
          function rendered(image) {
            if (!image.getClientRects().length) return false
            for (
              let element = image;
              element;
              element = element.parentElement
            ) {
              const style = getComputedStyle(element)
              if (
                style.display === 'none' ||
                style.visibility === 'hidden' ||
                style.visibility === 'collapse' ||
                style.opacity === '0'
              )
                return false
            }
            return true
          }
          function domImage(image) {
            const url = mediaUrl(image.currentSrc || image.getAttribute('src'))
            if (!url) return null
            return {
              width: dimension(image.naturalWidth),
              height: dimension(image.naturalHeight),
              urlDefault: url,
              urlPre: null,
              livePhoto: null,
            }
          }
          function readCardCover(card, stateCover) {
            const state = record(stateCover)
            const info = unwrap(state?.infoList)
            const infoList = Array.isArray(info)
              ? info.flatMap((entry) => {
                  const image2 = record(entry)
                  const url2 = mediaUrl(image2?.url)
                  return url2
                    ? [{ imageScene: text(image2?.imageScene), url: url2 }]
                    : []
                })
              : []
            const image = Array.from(
              card.querySelectorAll(
                '.cover img, img.cover, .note-cover img, .cover-container img',
              ),
            )
              .filter(rendered)
              .map(domImage)
              .find((entry) => entry !== null)
            const url = mediaUrl(state?.url)
            const urlPre = mediaUrl(state?.urlPre)
            const urlDefault = mediaUrl(state?.urlDefault)
            if (!url && !urlPre && !urlDefault && !infoList.length && !image)
              return null
            return {
              width: dimension(state?.width) ?? image?.width ?? null,
              height: dimension(state?.height) ?? image?.height ?? null,
              url,
              fileId: text(state?.fileId),
              urlPre,
              urlDefault: urlDefault ?? image?.urlDefault ?? null,
              infoList,
            }
          }

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
          function readInteractInfo(value) {
            const info = fieldRecord(value)
            if (!info) return null
            return {
              liked: typeof info.liked === 'boolean' ? info.liked : null,
              likedCount: fieldText(info.likedCount),
              sharedCount: fieldText(info.sharedCount),
              commentCount: fieldText(info.commentCount),
              collectedCount: fieldText(info.collectedCount),
              collected:
                typeof info.collected === 'boolean' ? info.collected : null,
            }
          }
          function readCardFields(value) {
            const card = fieldRecord(value)
            const video = fieldRecord(card?.video)
            const capa = fieldRecord(video?.capa)
            const duration = capa?.duration
            return {
              user: readUser(card?.user),
              interactInfo: readInteractInfo(card?.interactInfo),
              video: video
                ? {
                    capa: capa
                      ? {
                          duration:
                            typeof duration === 'number' &&
                            Number.isSafeInteger(duration) &&
                            duration >= 0
                              ? duration
                              : null,
                        }
                      : null,
                  }
                : null,
              fields_scope: card ? 'matched_card_page_state' : 'unavailable',
            }
          }

          // Package-local observation: xiaohongshu-feed-fields.ts
          function rawText(value) {
            return typeof value === 'string' ? value : null
          }
          function containsUnknown(value) {
            if (value === null) return true
            if (Array.isArray(value)) return value.some(containsUnknown)
            return (
              typeof value === 'object' &&
              value !== null &&
              Object.values(value).some(containsUnknown)
            )
          }
          function preserveEmptyStrings(parsed, source) {
            if (!parsed) return null
            const raw = fieldRecord(source)
            return Object.fromEntries(
              Object.entries(parsed).map(([key, value]) => [
                key,
                value === null && raw?.[key] === '' ? '' : value,
              ]),
            )
          }
          function rawMediaUrl(value) {
            if (typeof value !== 'string') return null
            if (value === '') return value
            try {
              const url = new URL(value)
              return ['http:', 'https:'].includes(url.protocol) &&
                !url.username &&
                !url.password
                ? value
                : null
            } catch {
              return null
            }
          }
          function nonnegativeInteger(value) {
            return typeof value === 'number' &&
              Number.isSafeInteger(value) &&
              value >= 0
              ? value
              : null
          }
          function readFeedCover(value) {
            const cover = fieldRecord(value)
            if (!cover) return { cover: null, partial: true }
            const source = cover.infoList
            const wrapper =
              source && typeof source === 'object' && !Array.isArray(source)
                ? source
                : null
            const info = wrapper
              ? (wrapper.value ?? wrapper._value ?? source)
              : source
            const infoList = Array.isArray(info)
              ? info.flatMap((entry) => {
                  const image = fieldRecord(entry)
                  return image
                    ? [
                        {
                          imageScene: rawText(image.imageScene),
                          url: rawMediaUrl(image.url),
                        },
                      ]
                    : []
                })
              : null
            return {
              cover: {
                width: nonnegativeInteger(cover.width),
                height: nonnegativeInteger(cover.height),
                url: rawMediaUrl(cover.url),
                fileId: rawText(cover.fileId),
                urlPre: rawMediaUrl(cover.urlPre),
                urlDefault: rawMediaUrl(cover.urlDefault),
                infoList,
              },
              partial: Array.isArray(info) && infoList?.length !== info.length,
            }
          }
          function readFeedFields(value, visibleNoteId) {
            const source = fieldRecord(value)
            if (
              !visibleNoteId ||
              source?.id !== visibleNoteId ||
              (source.modelType !== void 0 && source.modelType !== 'note')
            ) {
              return {
                feed: null,
                feed_scope: 'unavailable',
                feed_partial: true,
              }
            }
            const card = fieldRecord(source.noteCard)
            const fields = readCardFields(card)
            const cover = readFeedCover(card?.cover)
            const noteCard = card
              ? {
                  type: rawText(card.type),
                  displayTitle: rawText(card.displayTitle),
                  user: preserveEmptyStrings(fields.user, card.user),
                  interactInfo: preserveEmptyStrings(
                    fields.interactInfo,
                    card.interactInfo,
                  ),
                  // No DOM dimensions or URLs may substitute for upstream cover fields.
                  cover: cover.cover,
                  video: fields.video,
                }
              : null
            const feed = {
              id: visibleNoteId,
              modelType: rawText(source.modelType),
              xsecToken: rawText(source.xsecToken),
              index: nonnegativeInteger(source.index),
              noteCard,
            }
            const checkedCard = noteCard
              ? {
                  ...noteCard,
                  video:
                    card?.video === void 0 || card.video === null
                      ? []
                      : noteCard.video,
                }
              : null
            return {
              feed,
              feed_scope: 'matched_card_page_state',
              feed_partial:
                containsUnknown({ ...feed, noteCard: checkedCard }) ||
                cover.partial,
            }
          }
          function readListWindow(items, limit) {
            const truncated = items.length > limit
            return {
              items: items.slice(0, limit),
              loaded_count: items.length,
              returned_count: Math.min(items.length, limit),
              partial: truncated,
              return_truncated: truncated,
              results_scope: 'currently_loaded',
              loaded_count_scope: items.some(
                (item) => item.source === 'page_state_correlated_with_dom',
              )
                ? 'page_state_correlated_with_dom'
                : 'currently_rendered_dom',
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
            const text2 = clean(value)
            return text2 ? text2.slice(0, max) : null
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
          function loadedSearchFeeds() {
            const node = initialState()?.search?.feeds
            const feeds = node?.value ?? node?._value ?? node
            return Array.isArray(feeds)
              ? feeds.filter((feed) => feed?.modelType === 'note')
              : null
          }
          function normalizedNoteUrl(value) {
            if (typeof value !== 'string' || value.length > 3e3) return null
            try {
              const url = new URL(value, location.origin)
              if (
                url.protocol !== 'https:' ||
                url.hostname !== HOST ||
                url.port ||
                url.username ||
                url.password ||
                !NOTE_PATH.test(url.pathname)
              )
                return null
              url.hash = ''
              return url.href
            } catch {
              return null
            }
          }
          function noteUrlFromFeed(feed, originalUrl) {
            if (
              !feed.id ||
              !/^[a-zA-Z0-9_-]{8,80}$/.test(feed.id) ||
              !feed.xsecToken
            )
              return null
            const url = new URL(
              originalUrl ?? `/explore/${feed.id}`,
              `https://${HOST}`,
            )
            if (url.pathname.match(NOTE_PATH)?.[1] !== feed.id) return null
            url.searchParams.set('xsec_token', feed.xsecToken)
            if (!url.searchParams.has('xsec_source')) {
              url.searchParams.set(
                'xsec_source',
                location.pathname === '/search_result'
                  ? 'pc_search'
                  : 'pc_feed',
              )
            }
            return url.href
          }
          function hasAccessToken(url) {
            return !!new URL(url).searchParams.get('xsec_token')
          }
          function searchCards() {
            return Array.from(
              document.querySelectorAll('section.note-item, .note-item'),
            ).filter(visible)
          }
          function resolveCardNote(card, feeds) {
            const links = Array.from(card.querySelectorAll('a[href]')).flatMap(
              (element) => {
                const url2 = normalizedNoteUrl(element.href)
                return url2
                  ? [
                      {
                        element,
                        url: url2,
                        id: new URL(url2).pathname.match(NOTE_PATH)[1],
                      },
                    ]
                  : []
              },
            )
            const id = links[0]?.id
            const matchingLinks = links.filter((link) => link.id === id)
            const selected =
              matchingLinks.find(
                (link) => hasAccessToken(link.url) && visible(link.element),
              ) ??
              matchingLinks.find((link) => hasAccessToken(link.url)) ??
              matchingLinks.find((link) => visible(link.element)) ??
              matchingLinks[0]
            const feed = id
              ? feeds.find((candidate) => candidate.id === id)
              : void 0
            let url = selected?.url ?? null
            if (url && !hasAccessToken(url) && feed)
              url = noteUrlFromFeed(feed, url) ?? url
            const clickable =
              matchingLinks.find(
                (link) => visible(link.element) && hasAccessToken(link.url),
              ) ?? matchingLinks.find((link) => visible(link.element))
            return { id, url, feed, link: clickable?.element }
          }
          function metricText(root, selectors) {
            const text2 = textAt(root, selectors, 40)
            return text2 && /\d/.test(text2) ? text2 : null
          }
          function domSearchItems() {
            const cards = searchCards()
            const feeds = loadedSearchFeeds() ?? []
            const items = []
            const seen = /* @__PURE__ */ new Set()
            for (const card of cards) {
              const resolved = resolveCardNote(card, feeds)
              if (resolved.id && seen.has(resolved.id)) continue
              const title = textAt(card, '.title, .note-title, a.title', 300)
              const matched = resolved.feed
              const noteUrl = resolved.url
              if (!title && !noteUrl) continue
              if (resolved.id) seen.add(resolved.id)
              items.push({
                index: items.length,
                title: title ?? limited(matched?.noteCard?.displayTitle, 300),
                author: textAt(card, '.author .name, .author, .user-name', 120),
                note_url: noteUrl,
                note_type: matched?.noteCard?.type ?? null,
                cover: readCardCover(card, matched?.noteCard?.cover),
                ...readCardFields(matched?.noteCard),
                ...readFeedFields(matched, resolved.id),
                visible_metrics: {
                  likes_text: metricText(
                    card,
                    '.like-wrapper .count, .like-wrapper, .like-count',
                  ),
                },
                source: 'dom',
              })
            }
            return items
          }
          function correlatedStateItems() {
            const feeds = loadedSearchFeeds() ?? []
            const pageText = clean(document.body.innerText)
            const items = []
            for (const feed of feeds) {
              const title = clean(feed.noteCard?.displayTitle)
              if (
                !title ||
                !pageText.includes(title.slice(0, Math.min(8, title.length)))
              )
                continue
              items.push({
                index: items.length,
                title,
                author: limited(
                  feed.noteCard?.user?.nickname ??
                    feed.noteCard?.user?.nickName,
                  120,
                ),
                note_url: noteUrlFromFeed(feed),
                note_type: feed.noteCard?.type ?? null,
                cover: null,
                // Title-only correlation is insufficient for attaching an author's or interaction state.
                ...readCardFields(void 0),
                ...readFeedFields(void 0, void 0),
                visible_metrics: { likes_text: null },
                source: 'page_state_correlated_with_dom',
              })
            }
            return items
          }
          function searchItems() {
            const dom = domSearchItems()
            return dom.length > 0 ? dom : correlatedStateItems()
          }
          function visibleEmptySearch() {
            const empty = document.querySelector(
              '.search-empty, .empty-state, .no-result, .no-results',
            )
            if (visible(empty)) return true
            const main = document.querySelector('#app, main')
            const text2 = visible(main) ? clean(main.innerText) : ''
            return /暂无搜索结果|没有找到相关内容|没有搜索到相关内容/.test(
              text2,
            )
          }
          async function waitForSearch() {
            const start = Date.now()
            let emptySince = null
            while (Date.now() - start < 12e3) {
              if (loginState() === 'logged_out') return 'login'
              if (searchItems().length > 0) return 'ready'
              const feeds = loadedSearchFeeds()
              if (
                (visibleEmptySearch() || (feeds && feeds.length === 0)) &&
                document.readyState === 'complete'
              ) {
                emptySince ??= Date.now()
                if (Date.now() - emptySince > 1800) return 'empty'
              } else {
                emptySince = null
              }
              await new Promise((resolve) => setTimeout(resolve, 250))
            }
            return 'timeout'
          }

          // Package-local observation: xiaohongshu-filters.ts
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

          // Package-local observation: xiaohongshu-tools.ts
          var xiaohongshuToolImplementations = {
            async list_search_results(args) {
              if (location.hostname !== HOST)
                return error(
                  'UNSUPPORTED_PAGE',
                  'Not on a supported Xiaohongshu page.',
                )
              if (location.pathname !== '/search_result')
                return error(
                  'NOT_SEARCH_PAGE',
                  'Open a Xiaohongshu search result page first.',
                )
              const limit = args.limit === void 0 ? 10 : Number(args.limit)
              if (!Number.isInteger(limit) || limit < 1 || limit > 20)
                return error(
                  'INVALID_LIMIT',
                  'limit must be an integer from 1 to 20.',
                )
              const filterFailure = await waitForFilterResults()
              if (filterFailure) return filterFailure
              const readiness = await waitForSearch()
              if (readiness === 'login')
                return error(
                  'LOGIN_REQUIRED',
                  'Sign in on the current Xiaohongshu tab first.',
                )
              if (readiness === 'timeout')
                return error(
                  'PAGE_TIMEOUT',
                  'Search results did not reach a recognizable loaded state.',
                )
              const items = searchItems()
              return result('ok', {
                keyword: new URLSearchParams(location.search).get('keyword'),
                ...readListWindow(items, limit),
                is_empty: items.length === 0,
              })
            },
          }

          // Workflow entrypoint
          async function stdin_default(args) {
            return xiaohongshuToolImplementations.list_search_results(args)
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
