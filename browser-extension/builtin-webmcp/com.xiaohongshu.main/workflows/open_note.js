// Self-contained adapter workflow. Page observations and browser actions stay in this package.

export default {
  inputSchema: {
    type: 'object',
    properties: {
      note_url: {
        type: 'string',
        minLength: 1,
      },
    },
    required: ['note_url'],
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
    description: 'open_note',
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
            // Inactive profile panels retain laid-out cards inside a zero-height clip.
            for (let parent = element.parentElement; parent; parent = parent.parentElement) {
              const ancestor = getComputedStyle(parent)
              if (ancestor.display === 'none' || ancestor.visibility === 'hidden' ||
                  parent.getAttribute('aria-hidden') === 'true' ||
                  (['hidden', 'clip'].includes(ancestor.overflowY || ancestor.overflow) && ancestor.height === '0px') ||
                  (['hidden', 'clip'].includes(ancestor.overflowX || ancestor.overflow) && ancestor.width === '0px'))
                return false
            }
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
          function navigation(url, message, link) {
            let selector = null
            if (link) {
              const marker = crypto.randomUUID()
              link.setAttribute('data-cw-xhs-navigation', marker)
              selector = '[data-cw-xhs-navigation="' + marker + '"]'
            }
            return {
              ...result('navigated', {
                navigation_method: link ? 'page_click' : 'url',
                selector,
                url,
              }),
              target_url: url,
              message,
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
          function loadedSearchFeeds() {
            const node = initialState()?.search?.feeds
            const feeds = node?.value ?? node?._value ?? node
            return Array.isArray(feeds)
              ? feeds.filter((feed) => feed?.modelType === 'note')
              : null
          }
          function currentNoteId() {
            return location.pathname.match(NOTE_PATH)?.[1] ?? null
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

          // Package-local observation: xiaohongshu-profile-fields.ts
          var normalized = (value) =>
            typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
          var sourceText = (value) => (typeof value === 'string' ? value : null)
          function imageUrl(value) {
            if (value === '') return ''
            if (typeof value !== 'string') return null
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
          function interactionArray(value) {
            if (Array.isArray(value)) return value
            const ref = value && typeof value === 'object' ? value : null
            const array = ref?.value ?? ref?._value
            return Array.isArray(array) ? array : null
          }
          function readProfileFields(state, visible2) {
            const unavailable = (match) => ({
              userBasicInfo: null,
              interactions: null,
              profile_fields_scope: 'unavailable',
              profile_state_match: match,
              profile_match_basis: null,
              profile_fields_partial: true,
            })
            const data = fieldRecord(
              fieldRecord(fieldRecord(state)?.user)?.userPageData,
            )
            if (!data) return unavailable('unavailable')
            const basic = fieldRecord(data.basicInfo)
            if (!basic) return unavailable('basic_info_unavailable')
            const ids = [data.userId, basic.userId].filter(
              (id) => id !== void 0 && id !== null && id !== '',
            )
            if (ids.some((id) => typeof id !== 'string'))
              return unavailable('invalid_profile_id')
            if (ids.some((id) => id !== visible2.profileId))
              return unavailable('profile_id_mismatch')
            const nickname = normalized(basic.nickname)
            const visibleNickname = normalized(visible2.nickname)
            const redId = normalized(basic.redId)
            const visibleRedId = normalized(visible2.redIdText).replace(
              /^小红书号\s*[:：]?\s*/,
              '',
            )
            if (nickname && visibleNickname && nickname !== visibleNickname)
              return unavailable('nickname_mismatch')
            if (redId && visibleRedId && redId !== visibleRedId)
              return unavailable('red_id_mismatch')
            const byId = ids.length > 0
            if (
              !byId &&
              !(
                redId &&
                redId === visibleRedId &&
                nickname &&
                nickname === visibleNickname
              )
            ) {
              return unavailable('identity_unverified')
            }
            const userBasicInfo = {
              gender:
                typeof basic.gender === 'number' &&
                Number.isSafeInteger(basic.gender)
                  ? basic.gender
                  : null,
              ipLocation: sourceText(basic.ipLocation),
              desc: sourceText(basic.desc),
              imageb: imageUrl(basic.imageb),
              nickname: sourceText(basic.nickname),
              images: imageUrl(basic.images),
              redId: sourceText(basic.redId),
            }
            const list = interactionArray(data.interactions)
            let partial =
              Object.values(userBasicInfo).some((value) => value === null) ||
              list === null
            const interactions =
              list?.flatMap((value) => {
                const entry = fieldRecord(value)
                if (!entry) {
                  partial = true
                  return []
                }
                const item = {
                  type: sourceText(entry.type),
                  name: sourceText(entry.name),
                  count: sourceText(entry.count),
                }
                if (Object.values(item).some((value2) => value2 === null))
                  partial = true
                return [item]
              }) ?? null
            return {
              userBasicInfo,
              interactions,
              profile_fields_scope: 'current_profile_page_state',
              profile_state_match: 'matched',
              profile_match_basis: byId
                ? 'state_profile_id'
                : 'visible_red_id_and_nickname',
              profile_fields_partial: partial,
            }
          }

          // Package-local observation: xiaohongshu-profile.ts
          var PROFILE_PATH = /^\/user\/profile\/([a-zA-Z0-9_-]{8,80})\/?$/
          var EMPTY_SELECTORS =
            '.feeds-empty, .note-list-empty, .empty-notes, .empty-state, .empty-container, .no-note, .no-content, .feeds-container .empty, .note-list .empty'
          var EMPTY_TEXT =
            /暂无笔记|暂无内容|暂无作品|还没有发布|还没有笔记|还没有内容|没有发布过|还没有收藏|还没有赞过/
          var PROFILE_TABS = {
            notes: '\u7B14\u8BB0',
            favorites: '\u6536\u85CF',
            liked: '\u70B9\u8D5E',
          }
          var pendingProfileTab = JSON.parse(
            sessionStorage.getItem('cw-xhs-profile-refresh') || 'null',
          )
          function profileTabs() {
            return Array.from(
              document.querySelectorAll(
                '.reds-tab-item.sub-tab-list, .user-page [role="tab"], .user-profile [role="tab"]',
              ),
            ).filter(visible)
          }
          function selectedProfileTab() {
            for (const tab of profileTabs()) {
              if (
                tab.getAttribute('aria-selected') !== 'true' &&
                !tab.classList.contains('active') &&
                !tab.classList.contains('selected')
              )
                continue
              const label = clean(tab.innerText)
              const entry = Object.entries(PROFILE_TABS).find(
                ([, text2]) => text2 === label,
              )
              if (entry) return entry[0]
            }
            return null
          }
          function normalizedProfileUrl(value) {
            if (typeof value !== 'string' || value.length > 3e3) return null
            if (/^https:\/\/[^/?#]*:\d+(?:[/?#]|$)/i.test(value)) return null
            try {
              const url = new URL(value)
              if (
                url.protocol !== 'https:' ||
                url.hostname !== HOST ||
                url.port ||
                url.username ||
                url.password ||
                !PROFILE_PATH.test(url.pathname)
              )
                return null
              url.hash = ''
              return url.href
            } catch {
              return null
            }
          }
          function unwrap2(value) {
            if (!value || typeof value !== 'object' || Array.isArray(value))
              return value
            const ref = value
            return ref.value ?? ref._value ?? value
          }
          function loadedCardReferences(kind) {
            const state = initialState()
            let feeds =
              kind === 'feed'
                ? unwrap2(state?.feed?.feeds)
                : unwrap2(state?.user?.notes)
            if (kind === 'profile' && Array.isArray(feeds)) {
              const active = unwrap2(state?.user?.activeTab)
              const selected = selectedProfileTab()
              const expectedQuery = selected
                ? { notes: 'note', favorites: 'fav', liked: 'liked' }[selected]
                : null
              feeds =
                active &&
                Number.isInteger(active.index) &&
                expectedQuery === active.query
                  ? feeds[Number(active.index)]
                  : []
            }
            if (!Array.isArray(feeds)) return []
            return feeds.flatMap((feed) => {
              if (
                !feed ||
                typeof feed !== 'object' ||
                typeof feed.id !== 'string'
              )
                return []
              if (feed.modelType && feed.modelType !== 'note') return []
              const noteCard = fieldRecord(feed.noteCard)
              return [{ ...feed, noteCard: noteCard ?? void 0 }]
            })
          }
          function visibleCards(kind) {
            const references = loadedCardReferences(kind)
            const items = []
            const seen = /* @__PURE__ */ new Set()
            for (const card of searchCards()) {
              const resolved = resolveCardNote(card, references)
              if (!resolved.id || !resolved.url || seen.has(resolved.id))
                continue
              seen.add(resolved.id)
              items.push({
                index: items.length,
                title: textAt(card, '.title, .note-title, a.title', 300),
                author: textAt(
                  card,
                  '.author .name, .author .author-name, .author .nickname, .user-name',
                  120,
                ),
                author_profile_url:
                  Array.from(card.querySelectorAll('a[href]'))
                    .filter(visible)
                    .map((link) => normalizedProfileUrl(link.href))
                    .find((url) => url !== null) ?? null,
                note_url: resolved.url,
                note_type:
                  typeof resolved.feed?.noteCard?.type === 'string'
                    ? resolved.feed.noteCard.type
                    : Array.from(
                          card.querySelectorAll(
                            'video, .play-icon, .video-icon',
                          ),
                        ).some(visible)
                      ? 'video'
                      : null,
                cover: readCardCover(card, resolved.feed?.noteCard?.cover),
                ...readCardFields(resolved.feed?.noteCard),
                ...readFeedFields(resolved.feed, resolved.id),
                visible_metrics: {
                  likes_text: metricText(
                    card,
                    '.like-wrapper .count, .like-wrapper .count-num, .like-count',
                  ),
                },
                source: 'dom',
              })
            }
            return items
          }
          function visibleEmpty(root = document) {
            return Array.from(root.querySelectorAll(EMPTY_SELECTORS)).some(
              (element) =>
                visible(element) && EMPTY_TEXT.test(clean(element.innerText)),
            )
          }
          function resultsLoading() {
            return Array.from(
              document.querySelectorAll(
                '.feeds-loading, .feeds-container .loading, .note-list .loading, .loading-wrapper, .user-page [aria-busy="true"], .user-profile [aria-busy="true"]',
              ),
            ).some(visible)
          }
          function resultsSignature() {
            return JSON.stringify({
              cards: searchCards().map((card) => ({
                links: Array.from(card.querySelectorAll('a[href]')).map(
                  (link) => link.href,
                ),
                text: clean(card.innerText),
              })),
              empty: visibleEmpty(),
            })
          }
          function pendingResultsReady() {
            if (!pendingProfileTab) return true
            const signature = resultsSignature()
            if (
              selectedProfileTab() !== pendingProfileTab.tab ||
              resultsLoading() ||
              (visibleCards('profile').length === 0 && !visibleEmpty()) ||
              signature === pendingProfileTab.previousSignature
            ) {
              pendingProfileTab.observedSignature = null
              pendingProfileTab.stableSince = null
              return false
            }
            if (signature !== pendingProfileTab.observedSignature) {
              pendingProfileTab.observedSignature = signature
              pendingProfileTab.stableSince = Date.now()
            }
            if (
              pendingProfileTab.stableSince !== null &&
              Date.now() - pendingProfileTab.stableSince >= 750
            ) {
              pendingProfileTab = null
              return true
            }
            return false
          }
          function profileRoot() {
            return (
              Array.from(
                document.querySelectorAll(
                  '.user-page, .user-profile, .user-info-container, .user-info',
                ),
              ).find(visible) ?? null
            )
          }
          function profileNickname() {
            const root = profileRoot()
            return textAt(
              root ?? document,
              '.user-nickname, .user-basic .nickname, .info-part .nickname, .user-info .nickname',
              120,
            )
          }
          function profileMetric(root, labels) {
            const entries = Array.from(
              root.querySelectorAll(
                '.user-interactions > *, .data-info > *, .user-stats > *, .interactions > *',
              ),
            ).filter(visible)
            for (const entry of entries) {
              const label = textAt(
                entry,
                '.shows, .label, .name, .text, .count-label',
                40,
              )
              if (label && labels.includes(label))
                return metricText(entry, '.count, .number, .value, .count-num')
              const content = clean(entry.innerText)
              for (const expected of labels) {
                const escaped = expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                const match =
                  content.match(
                    new RegExp(
                      `^([0-9][0-9.,\u4E07\u4EBF\u5343\u767EwWkKmM+ ]*)\\s*${escaped}$`,
                    ),
                  ) ??
                  content.match(
                    new RegExp(
                      `^${escaped}\\s*([0-9][0-9.,\u4E07\u4EBF\u5343\u767EwWkKmM+ ]*)$`,
                    ),
                  )
                if (match) return clean(match[1])
              }
            }
            return null
          }
          async function waitForCards(kind) {
            const start = Date.now()
            const pageUrl = location.href
            let emptySince = null
            while (Date.now() - start < 1e4) {
              if (location.href !== pageUrl) return 'changed'
              if (isUnavailablePage()) return 'unavailable'
              if (loginState() === 'logged_out') return 'login'
              const profileReady =
                kind === 'feed' ||
                (!!profileNickname() && pendingResultsReady())
              if (resultsLoading()) {
                emptySince = null
                await new Promise((resolve) => setTimeout(resolve, 250))
                continue
              }
              if (profileReady && visibleCards(kind).length > 0) return 'ready'
              if (profileReady && visibleEmpty()) {
                emptySince ??= Date.now()
                if (Date.now() - emptySince >= 1e3) return 'empty'
              } else {
                emptySince = null
              }
              await new Promise((resolve) => setTimeout(resolve, 250))
            }
            return kind === 'profile' && pendingProfileTab
              ? 'pending'
              : 'timeout'
          }
          function readLimit(value) {
            const limit = value === void 0 ? 10 : value
            if (typeof limit !== 'number') return null
            return Number.isInteger(limit) && limit >= 1 && limit <= 20
              ? limit
              : null
          }
          function readinessError(readiness, kind) {
            if (readiness === 'changed')
              return error(
                'PAGE_CHANGED',
                'The page changed while waiting. Read the current page again before continuing.',
              )
            if (readiness === 'pending')
              return error(
                'PROFILE_RESULTS_PENDING',
                'The requested profile tab is selected, but a stable new result list has not been observed. Do not attribute the old cards to this tab.',
              )
            if (readiness === 'login')
              return error(
                'LOGIN_REQUIRED',
                'Sign in on the current Xiaohongshu tab first.',
              )
            if (readiness === 'unavailable')
              return error(
                kind === 'profile' ? 'PROFILE_UNAVAILABLE' : 'FEED_UNAVAILABLE',
                'The site displays an unavailable page; it does not establish the cause.',
              )
            if (readiness === 'timeout')
              return error(
                'PAGE_TIMEOUT',
                'The page did not expose readable cards or an explicit empty state. It may still be loading or its layout may have changed.',
              )
            return null
          }
          var xiaohongshuProfileTools = {
            async open_home() {
              if (location.hostname !== HOST)
                return error(
                  'UNSUPPORTED_PAGE',
                  'Not on a supported Xiaohongshu page.',
                )
              if (location.pathname === '/' || location.pathname === '/explore')
                return result('ok', { home_url: location.href })
              return navigation(
                `https://${HOST}/explore`,
                'Home page navigation started in this tab. Call list_feeds next.',
              )
            },
            async list_feeds(args) {
              if (location.hostname !== HOST)
                return error(
                  'UNSUPPORTED_PAGE',
                  'Not on a supported Xiaohongshu page.',
                )
              if (isUnavailablePage())
                return error(
                  'FEED_UNAVAILABLE',
                  'The site displays an unavailable page.',
                )
              if (location.pathname !== '/' && location.pathname !== '/explore')
                return error(
                  'NOT_FEED_PAGE',
                  'Call open_home in this tab before listing home feed cards.',
                )
              const limit = readLimit(args.limit)
              if (limit === null)
                return error(
                  'INVALID_LIMIT',
                  'limit must be an integer from 1 to 20.',
                )
              const readiness = await waitForCards('feed')
              const failure = readinessError(readiness, 'feed')
              if (failure) return failure
              const items = visibleCards('feed')
              return result('ok', {
                ...readListWindow(items, limit),
                is_empty: readiness === 'empty',
              })
            },
            async open_profile(args) {
              if (location.hostname !== HOST)
                return error(
                  'UNSUPPORTED_PAGE',
                  'Not on a supported Xiaohongshu page.',
                )
              const target = normalizedProfileUrl(args.profile_url)
              if (!target)
                return error(
                  'INVALID_TARGET',
                  'profile_url must be a complete HTTPS www.xiaohongshu.com/user/profile/{id} URL from the page.',
                )
              const id = new URL(target).pathname.match(PROFILE_PATH)[1]
              if (
                location.pathname.match(PROFILE_PATH)?.[1] === id &&
                !isUnavailablePage()
              )
                return result('ok', {
                  profile_url: location.href,
                  profile_id: id,
                })
              const matches = Array.from(
                document.querySelectorAll('a[href]'),
              ).flatMap((link) => {
                if (!visible(link)) return []
                const url2 = normalizedProfileUrl(link.href)
                return url2 &&
                  new URL(url2).pathname.match(PROFILE_PATH)?.[1] === id
                  ? [{ link, url: url2 }]
                  : []
              })
              const selected =
                matches.find((match) =>
                  new URL(match.url).searchParams.get('xsec_token'),
                ) ?? matches[0]
              const url = new URL(target)
              if (selected) {
                for (const [key, value] of new URL(selected.url).searchParams) {
                  if (!url.searchParams.has(key))
                    url.searchParams.set(key, value)
                }
              }
              return navigation(
                url.href,
                'Profile navigation started in this tab. Call read_profile to verify the opened page.',
                selected?.link,
              )
            },
            async read_profile(args) {
              if (location.hostname !== HOST)
                return error(
                  'UNSUPPORTED_PAGE',
                  'Not on a supported Xiaohongshu page.',
                )
              if (isUnavailablePage())
                return error(
                  'PROFILE_UNAVAILABLE',
                  'The site displays an unavailable profile page; it does not establish the cause.',
                )
              const id = location.pathname.match(PROFILE_PATH)?.[1]
              if (!id)
                return error(
                  'NOT_PROFILE_PAGE',
                  'Call open_profile or manually open a user profile in this tab first.',
                )
              if (pendingProfileTab && pendingProfileTab.profileId !== id)
                pendingProfileTab = null
              const limit = readLimit(args.limit)
              if (limit === null)
                return error(
                  'INVALID_LIMIT',
                  'limit must be an integer from 1 to 20.',
                )
              const readiness = await waitForCards('profile')
              const failure = readinessError(readiness, 'profile')
              if (failure) return failure
              const root = profileRoot() ?? document
              const items = visibleCards('profile')
              const nickname = profileNickname()
              const redIdText = textAt(
                root,
                '.user-redId, .user-red-id, .red-id',
                120,
              )
              return result('ok', {
                profile_url: location.href,
                profile_id: id,
                nickname,
                description: textAt(
                  root,
                  '.user-desc, .user-description, .user-basic .desc, .info-part .desc',
                  2e3,
                ),
                red_id_text: redIdText,
                location_text: textAt(
                  root,
                  '.user-IP, .user-ip, .ip-location',
                  120,
                ),
                visible_metrics: {
                  following_text: profileMetric(root, ['\u5173\u6CE8']),
                  followers_text: profileMetric(root, ['\u7C89\u4E1D']),
                  likes_and_favorites_text: profileMetric(root, [
                    '\u83B7\u8D5E\u4E0E\u6536\u85CF',
                  ]),
                },
                profile_tab: selectedProfileTab(),
                ...readListWindow(items, limit),
                is_empty: readiness === 'empty',
                profile_scope: 'visible_dom',
                ...readProfileFields(initialState(), {
                  profileId: id,
                  nickname,
                  redIdText,
                }),
              })
            },
            async select_profile_tab(args) {
              if (location.hostname !== HOST)
                return error(
                  'UNSUPPORTED_PAGE',
                  'Not on a supported Xiaohongshu page.',
                )
              if (isUnavailablePage())
                return error(
                  'PROFILE_UNAVAILABLE',
                  'The site displays an unavailable profile page.',
                )
              const profileId = location.pathname.match(PROFILE_PATH)?.[1]
              if (!profileId)
                return error(
                  'NOT_PROFILE_PAGE',
                  'Open a user profile in this tab before selecting its notes tab.',
                )
              if (loginState() === 'logged_out')
                return error(
                  'LOGIN_REQUIRED',
                  'Sign in on the current Xiaohongshu tab first.',
                )
              const tab = args.tab
              if (typeof tab !== 'string' || !Object.hasOwn(PROFILE_TABS, tab))
                return error(
                  'INVALID_PROFILE_TAB',
                  'tab must be notes, favorites, or liked.',
                )
              const target = profileTabs().find(
                (element) => clean(element.innerText) === PROFILE_TABS[tab],
              )
              if (
                !target ||
                target.getAttribute('aria-disabled') === 'true' ||
                target.hasAttribute('disabled')
              )
                return error(
                  'PROFILE_TAB_UNAVAILABLE',
                  'The requested profile tab is not visibly available. It may be private or unsupported by this page.',
                )
              if (selectedProfileTab() === tab)
                return result('ok', {
                  profile_tab: tab,
                  selection_verified: true,
                  already_selected: true,
                  results_refresh_observed: false,
                  results_ready: !pendingProfileTab,
                })
              pendingProfileTab = {
                profileId,
                tab,
                previousSignature: resultsSignature(),
                observedSignature: null,
                stableSince: null,
              }
              target.click()
              const start = Date.now()
              let refreshed = false
              while (Date.now() - start < 3e3) {
                if (
                  location.hostname !== HOST ||
                  location.pathname.match(PROFILE_PATH)?.[1] !== profileId
                ) {
                  pendingProfileTab = null
                  return error(
                    'PAGE_CHANGED',
                    'The profile changed while selecting a tab. Read the current page again.',
                  )
                }
                if (loginState() === 'logged_out')
                  return error(
                    'LOGIN_REQUIRED',
                    'The site requires login to access this profile tab.',
                  )
                if (isUnavailablePage())
                  return error(
                    'PROFILE_UNAVAILABLE',
                    'The site could not display this profile tab.',
                  )
                refreshed = pendingResultsReady()
                if (selectedProfileTab() === tab && refreshed) break
                await new Promise((resolve) => setTimeout(resolve, 150))
              }
              if (selectedProfileTab() !== tab) {
                pendingProfileTab = null
                return error(
                  'PROFILE_TAB_NOT_APPLIED',
                  'The page did not confirm the requested tab selection.',
                )
              }
              return result('ok', {
                profile_tab: tab,
                selection_verified: true,
                already_selected: false,
                results_refresh_observed: refreshed,
                results_ready: refreshed,
                message: refreshed
                  ? 'The tab changed and stable results were observed. Call read_profile to read the visible cards.'
                  : 'The tab is selected, but stable new results have not been observed. read_profile will wait for confirmed results; current cards may still belong to the previous tab.',
              })
            },
          }

          // Package-local observation: xiaohongshu-tools.ts
          var xiaohongshuToolImplementations = {
            async open_note(args) {
              if (location.hostname !== HOST)
                return error(
                  'UNSUPPORTED_PAGE',
                  'Not on a supported Xiaohongshu page.',
                )
              let url = normalizedNoteUrl(args.note_url)
              if (!url)
                return error(
                  'INVALID_TARGET',
                  'note_url must be a Xiaohongshu note URL from the search results.',
                )
              const noteId = new URL(url).pathname.match(NOTE_PATH)[1]
              if (pageKind() === 'note' && currentNoteId() === noteId)
                return result('ok', { note_url: location.href })
              if (location.pathname === '/search_result') {
                const filterFailure = await waitForFilterResults()
                if (filterFailure) return filterFailure
                const known = searchItems().find(
                  (item) =>
                    item.note_url &&
                    new URL(item.note_url).pathname.match(NOTE_PATH)?.[1] ===
                      noteId,
                )
                if (!known)
                  return error(
                    'STALE_RESULT',
                    'The target note is not in the currently loaded search results. Read the results again.',
                  )
                url = known.note_url
                const feeds = loadedSearchFeeds() ?? []
                const card = searchCards()
                  .map((element) => resolveCardNote(element, feeds))
                  .find((item) => item.id === noteId)
                if (card?.link) {
                  return navigation(
                    url,
                    'Note card click scheduled in this tab. Call read_current_note to verify the opened page.',
                    card.link,
                  )
                }
              }
              if (
                (pageKind() === 'home' || pageKind() === 'profile') &&
                searchCards().some(
                  (element) => resolveCardNote(element, []).id === noteId,
                )
              ) {
                const reader =
                  pageKind() === 'profile'
                    ? xiaohongshuProfileTools.read_profile
                    : xiaohongshuProfileTools.list_feeds
                const loaded = await reader({ limit: 20 })
                if (loaded.status !== 'ok') return loaded
                const card = searchCards()
                  .map((element) => resolveCardNote(element, []))
                  .find((item) => item.id === noteId)
                if (!card?.link)
                  return error(
                    'STALE_RESULT',
                    'The target card is no longer rendered on this page. Read the current list again.',
                  )
                const target =
                  card.url && hasAccessToken(card.url) ? card.url : url
                return navigation(
                  target,
                  'Note card click scheduled in this tab. Call read_current_note to verify the opened page.',
                  card.link,
                )
              }
              if (!hasAccessToken(url)) {
                return error(
                  'NOTE_LINK_INCOMPLETE',
                  'This note URL has no access parameters and no current search card can be clicked. Search again and open its card, or open the note manually before reading.',
                )
              }
              return navigation(
                url,
                'Note navigation started. Call read_current_note on this tab next.',
              )
            },
          }

          // Workflow entrypoint
          async function stdin_default(args) {
            return xiaohongshuToolImplementations.open_note(args)
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
