// Self-contained adapter workflow. Page observations and browser actions stay in this package.

export default {
  inputSchema: {
    type: 'object',
    properties: {
      view: {
        type: 'string',
        enum: [
          'read_page',
          'check_login',
          'read_current_note',
          'list_search_results',
          'list_feeds',
          'read_profile',
          'read_comments',
          'get_search_filters',
        ],
        default: 'read_page',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
      },
      include_replies: {
        type: 'boolean',
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
    description: 'read_page',
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
      if (input.view === 'list_search_results') {
        const response = await browser.webmcp.exec(
          'com.xiaohongshu.main.list_search_results',
          input.limit === undefined ? {} : { limit: input.limit },
          { ...options, timeout: 20000 },
        )
        if (
          response.tabId !== target.tabId ||
          response.result.status !== 'success'
        )
          throw new Error('Search observation failed')
        state.result = response.result.result
        return 'success'
      }
      // All extraction functions below execute only inside the current page call.
      const readPage = (args) => {
        var observe = (() => {
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
            default: () => read,
          })

          // Page extraction: xiaohongshu-media.ts
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
          function stateImage(value) {
            const image = record(value)
            if (!image) return null
            const urlDefault = mediaUrl(image.urlDefault)
            const urlPre = mediaUrl(image.urlPre)
            if (!urlDefault && !urlPre) return null
            return {
              width: dimension(image.width),
              height: dimension(image.height),
              urlDefault,
              urlPre,
              livePhoto:
                typeof image.livePhoto === 'boolean' ? image.livePhoto : null,
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
          var streamIntegers = [
            'width',
            'height',
            'duration',
            'size',
            'fps',
            'rotate',
            'streamType',
            'hdrType',
            'videoBitrate',
            'videoDuration',
            'avgBitrate',
            'audioBitrate',
            'audioDuration',
            'audioChannels',
            'weight',
            'defaultStream',
          ]
          var streamDecimals = ['volume', 'vmaf', 'psnr', 'ssim']
          var streamStrings = [
            'format',
            'qualityType',
            'streamDesc',
            'videoCodec',
            'audioCodec',
          ]
          function numeric(value, integer = true) {
            return typeof value === 'number' &&
              Number.isFinite(value) &&
              (!integer || Number.isSafeInteger(value))
              ? value
              : null
          }
          function numericFields(state, keys, integer = true) {
            return Object.fromEntries(
              keys.map((key) => [key, numeric(state[key], integer)]),
            )
          }
          function stringFields(state, keys) {
            return Object.fromEntries(
              keys.map((key) => [key, text(state[key])]),
            )
          }
          function readNoteVideo(stateVideo) {
            const state = record(stateVideo)
            if (!state)
              return {
                video: null,
                video_scope: 'unavailable',
                video_partial: true,
                subtitles_scope: 'unavailable',
              }
            let partial = false
            const image = record(state.image)
            const capa = record(state.capa)
            const media = record(state.media)
            const meta = record(media?.video)
            const rawStreams = record(media?.stream)
            const stream = rawStreams
              ? Object.fromEntries(
                  Object.entries(rawStreams).flatMap(([encoding, entries]) => {
                    const list = unwrap(entries)
                    if (!Array.isArray(list)) {
                      partial = true
                      return []
                    }
                    return [
                      [
                        encoding,
                        list.flatMap((entry) => {
                          const item = record(entry)
                          if (!item) {
                            partial = true
                            return []
                          }
                          const masterUrl = mediaUrl(item.masterUrl)
                          if (item.masterUrl != null && !masterUrl)
                            partial = true
                          const rawBackups = unwrap(item.backupUrls)
                          let backupUrls = null
                          if (Array.isArray(rawBackups)) {
                            backupUrls = rawBackups.flatMap((value) => {
                              const url = mediaUrl(value)
                              if (!url) partial = true
                              return url ? [url] : []
                            })
                          } else if (rawBackups != null) partial = true
                          return [
                            {
                              ...numericFields(item, streamIntegers),
                              ...numericFields(item, streamDecimals, false),
                              ...stringFields(item, streamStrings),
                              masterUrl,
                              backupUrls,
                            },
                          ]
                        }),
                      ],
                    ]
                  }),
                )
              : null
            if (!media || !rawStreams) partial = true
            let rawSubtitles = state.subtitles
            let subtitlesScope =
              rawSubtitles == null ? 'unavailable' : 'video.subtitles'
            if (typeof state.mediaV2 === 'string' && state.mediaV2 !== '') {
              try {
                const decoded = JSON.parse(state.mediaV2)
                const copy = record(decoded)
                const videoCopy = record(copy?.video)
                if (
                  (decoded != null && !copy) ||
                  (copy?.video != null && !videoCopy)
                )
                  throw new Error('Invalid mediaV2 shape')
                const candidate = videoCopy?.subtitles
                if (candidate != null && !record(candidate))
                  throw new Error('Invalid mediaV2 subtitles')
                rawSubtitles = candidate
                subtitlesScope =
                  rawSubtitles == null ? 'unavailable' : 'video.mediaV2'
              } catch {
                partial = true
              }
            } else if (
              state.mediaV2 != null &&
              typeof state.mediaV2 !== 'string'
            )
              partial = true
            const subtitleMap = record(rawSubtitles)
            if (rawSubtitles != null && !subtitleMap) {
              partial = true
              subtitlesScope = 'unavailable'
            }
            const subtitles = subtitleMap
              ? Object.fromEntries(
                  Object.entries(subtitleMap).flatMap(([language, entries]) => {
                    const list = unwrap(entries)
                    if (!Array.isArray(list)) {
                      partial = true
                      return []
                    }
                    return [
                      [
                        language,
                        list.flatMap((entry) => {
                          const subtitle = record(entry)
                          const url = mediaUrl(subtitle?.url)
                          if (!url) {
                            partial = true
                            return []
                          }
                          return [
                            {
                              url,
                              language: text(subtitle?.language),
                              format: numeric(subtitle?.format),
                              type: numeric(subtitle?.type),
                            },
                          ]
                        }),
                      ],
                    ]
                  }),
                )
              : null
            const rawTypes = unwrap(meta?.streamTypes)
            const streamTypes = Array.isArray(rawTypes)
              ? rawTypes.flatMap((value) => {
                  const number = numeric(value)
                  if (number === null) partial = true
                  return number === null ? [] : [number]
                })
              : null
            if (rawTypes != null && !Array.isArray(rawTypes)) partial = true
            return {
              video: {
                // These are file IDs, not URLs; do not manufacture CDN addresses.
                image: image
                  ? stringFields(image, ['firstFrameFileid', 'thumbnailFileid'])
                  : null,
                capa: capa ? { duration: numeric(capa.duration) } : null,
                media: media
                  ? {
                      videoId: numeric(media.videoId),
                      // Preserve upstream units: capability/meta duration in seconds, stream duration in milliseconds.
                      video: meta
                        ? {
                            ...numericFields(meta, [
                              'duration',
                              'hdrType',
                              'drmType',
                              'bizName',
                            ]),
                            ...stringFields(meta, ['md5', 'bizId']),
                            streamTypes,
                          }
                        : null,
                      stream,
                    }
                  : null,
                subtitles,
              },
              video_scope: 'current_note_page_state',
              video_partial: partial,
              subtitles_scope: subtitlesScope,
            }
          }
          function readNoteImages(stateImages, root) {
            const raw = unwrap(stateImages)
            if (Array.isArray(raw)) {
              const imageList2 = raw
                .map(stateImage)
                .filter((image) => image !== null)
              if (imageList2.length || raw.length === 0)
                return {
                  imageList: imageList2,
                  image_list_scope: 'current_note_page_state',
                  image_list_partial: imageList2.length !== raw.length,
                }
            }
            const seen = /* @__PURE__ */ new Set()
            const imageList = Array.from(
              root.querySelectorAll(
                '.note-slider-img, .note-slider img, .swiper-slide img',
              ),
            )
              .filter(rendered)
              .flatMap((element) => {
                const image = domImage(element)
                if (!image?.urlDefault || seen.has(image.urlDefault)) return []
                seen.add(image.urlDefault)
                return [image]
              })
            return {
              imageList,
              image_list_scope: imageList.length
                ? 'currently_rendered_dom'
                : 'unavailable',
              image_list_partial: true,
            }
          }

          // Page extraction: xiaohongshu-fields.ts
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

          // Page extraction: xiaohongshu-feed-fields.ts
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

          // Page extraction: xiaohongshu-note-text.ts
          function textField(stateValue, domValue, limit) {
            if (typeof stateValue === 'string') {
              return {
                value: stateValue,
                scope: 'current_note_page_state',
                complete: true,
                truncated: false,
                length: stateValue.length,
                returnedLength: stateValue.length,
              }
            }
            const rendered4 =
              typeof domValue === 'string'
                ? domValue.replace(/\s+/g, ' ').trim()
                : ''
            if (!rendered4)
              return {
                value: null,
                scope: 'unavailable',
                complete: null,
                truncated: false,
                length: null,
                returnedLength: null,
              }
            const truncated = rendered4.length > limit
            return {
              value: rendered4.slice(0, limit),
              scope: 'currently_rendered_dom',
              complete: truncated ? false : null,
              truncated,
              length: rendered4.length,
              returnedLength: Math.min(rendered4.length, limit),
            }
          }
          function readNoteText(stateValue, noteId, domTitle, domBody) {
            const candidate = fieldRecord(stateValue)
            const state =
              noteId &&
              candidate &&
              (candidate.noteId === void 0 || candidate.noteId === noteId)
                ? candidate
                : null
            const title = textField(state?.title, domTitle, 500)
            const body = textField(state?.desc, domBody, 8e3)
            return {
              title: title.value,
              title_scope: title.scope,
              title_complete: title.complete,
              title_truncated: title.truncated,
              title_length: title.length,
              title_returned_length: title.returnedLength,
              body: body.value,
              body_scope: body.scope,
              body_complete: body.complete,
              body_truncated: body.truncated,
              body_length: body.length,
              body_returned_length: body.returnedLength,
              text_length_unit: 'utf16_code_units',
            }
          }

          // Page extraction: xiaohongshu-page.ts
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
            for (
              let parent = element.parentElement;
              parent;
              parent = parent.parentElement
            ) {
              const ancestor = getComputedStyle(parent)
              if (
                ancestor.display === 'none' ||
                ancestor.visibility === 'hidden' ||
                parent.getAttribute('aria-hidden') === 'true' ||
                (['hidden', 'clip'].includes(
                  ancestor.overflowY || ancestor.overflow,
                ) &&
                  ancestor.height === '0px') ||
                (['hidden', 'clip'].includes(
                  ancestor.overflowX || ancestor.overflow,
                ) &&
                  ancestor.width === '0px')
              )
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
          function loadedStateNote() {
            const id = currentNoteId()
            const detailMap = initialState()?.note?.noteDetailMap
            const note =
              id && detailMap && typeof detailMap === 'object'
                ? detailMap[id]?.note
                : null
            if (
              !note ||
              typeof note !== 'object' ||
              (note.noteId && note.noteId !== id)
            )
              return null
            return note
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
          function visibleStateValue(value, area, max) {
            const text2 = limited(value, max)
            return text2 &&
              clean(area).includes(text2.slice(0, Math.min(10, text2.length)))
              ? text2
              : null
          }
          function readComments() {
            return Array.from(document.querySelectorAll('.parent-comment'))
              .filter(visible)
              .slice(0, 10)
              .map((comment) => ({
                author: textAt(comment, '.user-name, .name', 120),
                text: textAt(comment, '.content, .comment-content', 1e3),
              }))
              .filter((comment) => comment.text)
          }
          function readNote() {
            const state = loadedStateNote()
            const container = document.querySelector(
              '.note-scroller, .note-detail, .note-content',
            )
            const area = visible(container)
              ? container.innerText
              : document.body.innerText
            const noteText = readNoteText(
              state,
              currentNoteId(),
              textAt(
                document,
                '#detail-title, .note-content .title, .note-scroller .title',
                Number.MAX_SAFE_INTEGER,
              ),
              textAt(
                document,
                '#detail-desc, .note-content .desc, .note-scroller .desc',
                Number.MAX_SAFE_INTEGER,
              ),
            )
            const stateAuthor = state?.user?.nickname ?? state?.user?.nickName
            const author =
              textAt(
                document,
                '.author-container .username, .author-container .name, .note-scroller .user-name',
                120,
              ) ?? visibleStateValue(stateAuthor, area, 120)
            const authorId = state?.user?.userId
            const authorProfileUrl =
              Array.from(
                document.querySelectorAll(
                  '.author-container a[href], .note-scroller .author a[href]',
                ),
              )
                .filter(visible)
                .filter(
                  (link) =>
                    !link.closest(
                      '.comments-container, .comment-item, .parent-comment',
                    ),
                )
                .map((link) => {
                  try {
                    const url = new URL(link.href)
                    const profileId = url.pathname.match(
                      /^\/user\/profile\/([a-zA-Z0-9_-]{8,80})\/?$/,
                    )?.[1]
                    return (!authorId || profileId === authorId) &&
                      url.protocol === 'https:' &&
                      url.hostname === HOST &&
                      !url.port &&
                      !url.username &&
                      !url.password &&
                      /^\/user\/profile\/[a-zA-Z0-9_-]{8,80}\/?$/.test(
                        url.pathname,
                      )
                      ? url.href
                      : null
                  } catch {
                    return null
                  }
                })
                .find((url) => url !== null) ?? null
            const publishedAt = textAt(
              document,
              '.publish-time, .note-time, .bottom-container .date',
              120,
            )
            const metricsRoot =
              document.querySelector('.interact-container') ?? document
            const metrics = {
              likes_text: metricText(
                metricsRoot,
                '.like-wrapper .count, .like-wrapper .count-num, .like-count',
              ),
              favorites_text: metricText(
                metricsRoot,
                '.collect-wrapper .count, .collect-wrapper .count-num, .collect-count',
              ),
              comments_text: metricText(
                metricsRoot,
                '.chat-wrapper .count, .chat-wrapper .count-num, .comment-count',
              ),
            }
            const noteType =
              state?.type ?? (document.querySelector('video') ? 'video' : null)
            const mediaRoot =
              document.querySelector(
                '#noteContainer, .note-container, .note-detail',
              ) ?? document
            return {
              note_url: location.href,
              note_id: currentNoteId(),
              ...noteText,
              author,
              author_profile_url: authorProfileUrl,
              published_at: publishedAt,
              note_type: noteType,
              user: readUser(state?.user),
              interactInfo: readInteractInfo(state?.interactInfo),
              time:
                typeof state?.time === 'number' &&
                Number.isSafeInteger(state.time) &&
                state.time >= 0
                  ? state.time
                  : null,
              ipLocation: fieldText(state?.ipLocation),
              xsecToken: fieldText(state?.xsecToken),
              fields_scope: state ? 'current_note_page_state' : 'unavailable',
              ...readNoteImages(state?.imageList, mediaRoot),
              ...readNoteVideo(state?.video),
              visible_metrics: metrics,
              loaded_comments: readComments(),
              comments_scope: 'currently_loaded',
            }
          }

          // Page extraction: xiaohongshu-profile-fields.ts
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
            const array2 = ref?.value ?? ref?._value
            return Array.isArray(array2) ? array2 : null
          }
          function readProfileFields(state, visible3) {
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
            if (ids.some((id) => id !== visible3.profileId))
              return unavailable('profile_id_mismatch')
            const nickname = normalized(basic.nickname)
            const visibleNickname = normalized(visible3.nickname)
            const redId = normalized(basic.redId)
            const visibleRedId = normalized(visible3.redIdText).replace(
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

          // Page extraction: xiaohongshu-profile.ts
          var PROFILE_PATH = /^\/user\/profile\/([a-zA-Z0-9_-]{8,80})\/?$/
          var PROFILE_TABS = {
            notes: '\u7B14\u8BB0',
            favorites: '\u6536\u85CF',
            liked: '\u70B9\u8D5E',
          }
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
          function profileMetric(root, labels2) {
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
              if (label && labels2.includes(label))
                return metricText(entry, '.count, .number, .value, .count-num')
              const content = clean(entry.innerText)
              for (const expected of labels2) {
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

          // Page extraction: xiaohongshu-comment-fields.ts
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

          // Page extraction: xiaohongshu-comments.ts
          var COMMENTS =
            '.comments-container, .comments-el, .comments-list, .comment-list'
          var REPLIES =
            '.reply-container, .replies, .reply-list, .child-comments, .sub-comments'
          var REPLY_ROWS =
            '.child-comment, .reply-item, .sub-comment, .reply-comment'
          var EXPAND_TEXT = /^展开\s*(\d+\s*条|更多)\s*回复$/
          function rendered2(element, boundary) {
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
                rendered2(element),
              ) ?? null
            )
          }
          function signature(text2) {
            let hash = 2166136261
            for (let i = 0; i < text2.length; i++)
              hash = Math.imul(hash ^ text2.charCodeAt(i), 16777619)
            return (hash >>> 0).toString(16)
          }
          function ownField(row, selector, excluded, max) {
            const elements = Array.from(row.querySelectorAll(selector))
            for (const element of elements) {
              if (
                !rendered2(element, row) ||
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
                  rendered2(parent, element) &&
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
                !rendered2(thread, root) ||
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
                if (rendered2(reply, root))
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
              if (
                parent &&
                !parent.closest('svg') &&
                rendered2(parent, element)
              )
                pieces.push(node.textContent ?? '')
            }
            return clean(pieces.join(' '))
          }
          function expansionControls(root) {
            return Array.from(root.querySelectorAll('.show-more'))
              .filter((element) => rendered2(element, root))
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
          function endVisible(root) {
            return Array.from(root.querySelectorAll('.end-container')).some(
              (element) =>
                rendered2(element, root) &&
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
                rendered2(element, root) &&
                /这是一片荒地|暂无评论|还没有评论/.test(
                  clean(element.innerText),
                ),
            )
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

          // Page extraction: xiaohongshu-filters.ts
          var labels = {
            sort_by: ['\u6392\u5E8F\u4F9D\u636E'],
            note_type: ['\u7B14\u8BB0\u7C7B\u578B'],
            publish_time: ['\u53D1\u5E03\u65F6\u95F4'],
            search_scope: ['\u641C\u7D22\u8303\u56F4'],
            location: ['\u4F4D\u7F6E\u8DDD\u79BB'],
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
          function rendered3(element) {
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
              !rendered3(element) ||
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
              .filter(rendered3)
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
          function groups() {
            const found = []
            for (const panel of Array.from(
              document.querySelectorAll('.filter-panel'),
            ).filter(rendered3)) {
              for (const element of Array.from(
                panel.querySelectorAll('.filters'),
              ).filter(rendered3)) {
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
          function snapshot2() {
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

          // Workflow entrypoint
          function read(args) {
            const kind = pageKind()
            const base = {
              url: location.href,
              page_kind: kind,
              login_state: loginState(),
              unavailable: isUnavailablePage(),
            }
            if (args.view === 'check_login' || args.view === 'read_page')
              return base
            if (args.view === 'read_current_note') {
              if (!currentNoteId()) throw new Error('Open a note first')
              return { ...base, ...readNote() }
            }
            if (args.view === 'list_search_results') {
              if (kind !== 'search')
                throw new Error('Open search results first')
              const items = searchItems()
              return {
                ...base,
                ...readListWindow(items, args.limit || 10),
                is_empty: items.length === 0,
              }
            }
            if (args.view === 'list_feeds') {
              if (kind !== 'home') throw new Error('Open home first')
              const items = visibleCards('feed')
              return {
                ...base,
                ...readListWindow(items, args.limit || 10),
                is_empty: items.length === 0,
              }
            }
            if (args.view === 'read_profile') {
              if (kind !== 'profile') throw new Error('Open a profile first')
              const root = profileRoot() || document
              const nickname = profileNickname()
              const redIdText = textAt(
                root,
                '.user-redId, .user-red-id, .red-id',
                120,
              )
              const id = location.pathname.split('/').pop()
              return {
                ...base,
                profile_id: id,
                nickname,
                red_id_text: redIdText,
                description: textAt(root, '.user-desc, .user-description', 2e3),
                profile_tab: selectedProfileTab(),
                visible_metrics: {
                  following_text: profileMetric(root, ['\u5173\u6CE8']),
                  followers_text: profileMetric(root, ['\u7C89\u4E1D']),
                  likes_and_favorites_text: profileMetric(root, [
                    '\u83B7\u8D5E\u4E0E\u6536\u85CF',
                  ]),
                },
                ...readListWindow(visibleCards('profile'), args.limit || 10),
                ...readProfileFields(initialState(), {
                  profileId: id,
                  nickname,
                  redIdText,
                }),
              }
            }
            if (args.view === 'read_comments') {
              const root = commentRoot()
              if (!root || !currentNoteId())
                throw new Error('Open a note with loaded comments first')
              return {
                ...base,
                ...snapshot(
                  root,
                  args.limit || 20,
                  args.include_replies !== false,
                ),
              }
            }
            if (args.view === 'get_search_filters') {
              if (kind !== 'search')
                throw new Error('Open search results first')
              return { ...base, groups: snapshot2() }
            }
            throw new Error('Unknown reader')
          }
          return __toCommonJS(stdin_exports)
        })()

        return observe.default({ view: 'read_page', ...args })
      }
      state.result = { status: 'ok', data: await page(readPage, input) }
      return 'success'
    },
  },
  result({ state }) {
    return state.result
  },
}
