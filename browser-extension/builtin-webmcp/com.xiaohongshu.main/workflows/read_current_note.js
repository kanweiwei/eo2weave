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
    description: 'read_current_note',
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

          // Package-local observation: xiaohongshu-note-text.ts
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
            const rendered2 =
              typeof domValue === 'string'
                ? domValue.replace(/\s+/g, ' ').trim()
                : ''
            if (!rendered2)
              return {
                value: null,
                scope: 'unavailable',
                complete: null,
                truncated: false,
                length: null,
                returnedLength: null,
              }
            const truncated = rendered2.length > limit
            return {
              value: rendered2.slice(0, limit),
              scope: 'currently_rendered_dom',
              complete: truncated ? false : null,
              truncated,
              length: rendered2.length,
              returnedLength: Math.min(rendered2.length, limit),
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
          function metricText(root, selectors) {
            const text2 = textAt(root, selectors, 40)
            return text2 && /\d/.test(text2) ? text2 : null
          }
          async function waitForNote() {
            const start = Date.now()
            while (Date.now() - start < 12e3) {
              if (isUnavailablePage()) return 'unavailable'
              if (loginState() === 'logged_out') return 'login'
              const stateNote = loadedStateNote()
              const renderedText = document.body.innerText
              const mediaRoot = document.querySelector(
                '#noteContainer, .note-container, .note-detail, .note-scroller',
              )
              const renderedMedia =
                !!mediaRoot &&
                Array.from(
                  mediaRoot.querySelectorAll(
                    'video, .note-slider-img, .swiper-slide img',
                  ),
                ).some(visible)
              if (
                textAt(
                  document,
                  '#detail-title, .note-content .title, .note-scroller .title',
                ) ||
                visibleStateValue(stateNote?.title, renderedText, 500) ||
                visibleStateValue(stateNote?.desc, renderedText, 1e3) ||
                (stateNote &&
                  renderedMedia &&
                  (Array.isArray(stateNote.imageList) || !!stateNote.video))
              )
                return 'ready'
              await new Promise((resolve) => setTimeout(resolve, 250))
            }
            return 'timeout'
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

          // Package-local observation: xiaohongshu-tools.ts
          var xiaohongshuToolImplementations = {
            async read_current_note() {
              if (location.hostname !== HOST)
                return error(
                  'UNSUPPORTED_PAGE',
                  'Not on a supported Xiaohongshu page.',
                )
              if (isUnavailablePage()) return unavailableNote()
              if (!currentNoteId())
                return error('NOT_NOTE_PAGE', 'Open a Xiaohongshu note first.')
              const readiness = await waitForNote()
              if (readiness === 'unavailable') return unavailableNote()
              if (readiness === 'login')
                return error(
                  'LOGIN_REQUIRED',
                  'Sign in on the current Xiaohongshu tab first.',
                )
              if (readiness === 'timeout')
                return error(
                  'PAGE_TIMEOUT',
                  'The note did not reach a recognizable loaded state.',
                )
              const data = readNote()
              const hasImages =
                Array.isArray(data.imageList) && data.imageList.length > 0
              if (!data.title && !data.body && !hasImages && !data.video)
                return error(
                  'NOTE_UNAVAILABLE',
                  'The note loaded, but no readable title, body or note media could be obtained.',
                )
              return result('ok', data)
            },
          }

          // Workflow entrypoint
          async function stdin_default(args) {
            return xiaohongshuToolImplementations.read_current_note(args)
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
