// Self-contained adapter workflow.
export default {
  inputSchema: {
    type: 'object',
    properties: {
      confirm: {
        type: 'boolean',
        const: true,
      },
    },
    required: ['confirm'],
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
    description: 'logout',
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

          // Package-local observation: xiaohongshu-session.ts
          var NAVIGATION =
            '.main-container .side-bar, .main-container .sidebar, .main-container .navigation, .main-container > nav, .main-container > header, #app > nav, #app > header'
          var ACCOUNT_MENUS =
            '.account-menu, .user-menu, .more-menu, .sidebar-more, .side-bar .dropdown-menu, .side-bar [role="menu"]'
          var PORTAL_MENUS =
            '[role="menu"], .dropdown-container, .dropdown-menu, .menu-container'
          var CONTENT =
            '.note-item, .note-content, .note-scroller, .note-detail, .comments-container, .comment-item, .parent-comment, [contenteditable="true"]'
          var CONTROLS =
            'button, a, [role="button"], [role="menuitem"], li, .menu-item, .dropdown-item, .channel, .more-item, .more-button, .login-btn, .login-button, .login-trigger, .logout-btn, .logout-button'
          var LOGIN_TRIGGERS = '.login-btn, .login-button, .login-trigger'
          var LOGIN_PANELS = '.login-container, .login-modal, .login-dialog'
          var WAIT_MS = 4e3
          var POLL_MS = 250
          function rendered(element) {
            if (!visible(element)) return false
            for (let node = element; node; node = node.parentElement) {
              const style = getComputedStyle(node)
              if (
                node.hidden ||
                style.display === 'none' ||
                style.visibility === 'hidden'
              )
                return false
            }
            return true
          }
          function outsideContent(element) {
            return !element.closest(CONTENT)
          }
          function roots(selector) {
            return Array.from(document.querySelectorAll(selector)).filter(
              (element) => rendered(element) && outsideContent(element),
            )
          }
          function exactControl(containers, labels) {
            for (const container of containers) {
              const candidates = [
                container,
                ...Array.from(container.querySelectorAll(CONTROLS)),
              ]
              const control = candidates.find(
                (element) =>
                  element.matches(CONTROLS) &&
                  rendered(element) &&
                  outsideContent(element) &&
                  !element.hasAttribute('disabled') &&
                  element.getAttribute('aria-disabled') !== 'true' &&
                  labels.includes(clean(element.innerText)),
              )
              if (control) return control
            }
            return null
          }
          function sessionInfo() {
            const panels = roots(LOGIN_PANELS)
            return {
              login_state: loginState(),
              login_panel_visible: panels.length > 0,
              qr_visible: panels.some((panel) =>
                Array.from(
                  panel.querySelectorAll('.qrcode-img, .qrcode, .qr-code'),
                ).some(rendered),
              ),
              session_scope:
                'Xiaohongshu session in this browser; other Xiaohongshu tabs may be affected.',
            }
          }
          function loginResult() {
            const info = sessionInfo()
            const loggedIn = info.login_state === 'logged_in'
            return result('ok', {
              ...info,
              requires_user_action: !loggedIn,
              next_step: loggedIn
                ? 'Already signed in.'
                : 'Complete sign-in directly in the visible website panel, then call check_login. QR images and credentials are not returned.',
            })
          }
          function logoutResult() {
            return result('ok', {
              ...sessionInfo(),
              logout_verified: true,
              requires_user_action: false,
              next_step:
                'The page reports signed out. Use open_login to sign in again.',
            })
          }
          function actionRequired(message) {
            return {
              ...error('SESSION_ACTION_REQUIRED', message),
              data: {
                ...sessionInfo(),
                logout_verified: false,
                requires_user_action: true,
              },
            }
          }
          function visibleSessionChallenge() {
            if (
              roots(
                '.captcha-container, .captcha-modal, .verify-container, .verify-dialog',
              ).length
            )
              return true
            return roots(
              '[role="dialog"], .modal, .dialog, .confirm-dialog, .confirm-container',
            ).some((dialog) => {
              const text = clean(dialog.innerText)
              return (
                /退出登录|确定退出|确认退出/.test(text) &&
                /取消|确认|确定/.test(text)
              )
            })
          }
          function pageError(startUrl) {
            if (location.hostname !== HOST)
              return error(
                'UNSUPPORTED_PAGE',
                'Not on a supported Xiaohongshu page.',
              )
            if (startUrl && location.href !== startUrl)
              return actionRequired(
                'The page navigated during the session action. Check the current page and call check_login to verify the session.',
              )
            return null
          }
          var xiaohongshuSessionTools = {
            async open_login() {
              const invalidPage = pageError()
              if (invalidPage) return invalidPage
              if (
                loginState() === 'logged_in' ||
                roots(LOGIN_PANELS).length > 0
              )
                return loginResult()
              const trigger = exactControl(
                [...roots(NAVIGATION), ...roots(LOGIN_TRIGGERS)],
                [
                  '\u767B\u5F55',
                  '\u7ACB\u5373\u767B\u5F55',
                  '\u767B\u5F55\u5C0F\u7EA2\u4E66',
                ],
              )
              if (!trigger)
                return error(
                  'LOGIN_ENTRY_UNSUPPORTED',
                  'No recognizable sign-in control is available in site navigation. Open the website sign-in panel manually.',
                )
              const startUrl = location.href
              trigger.click()
              const started = Date.now()
              while (Date.now() - started < WAIT_MS) {
                if (
                  loginState() === 'logged_in' ||
                  roots(LOGIN_PANELS).length > 0
                )
                  return loginResult()
                const changed = pageError(startUrl)
                if (changed) return changed
                if (visibleSessionChallenge())
                  return actionRequired(
                    'The website requires verification. Complete it in the website, then check login status again.',
                  )
                await new Promise((resolve) => setTimeout(resolve, POLL_MS))
              }
              return error(
                'SESSION_TIMEOUT',
                'The sign-in control was clicked, but no recognizable login panel or signed-in state appeared.',
              )
            },
            async logout(args) {
              if (args.confirm !== true)
                return error(
                  'CONFIRMATION_REQUIRED',
                  'Set confirm to true only when the user requested signing out of Xiaohongshu in this browser. Other Xiaohongshu tabs may also sign out.',
                )
              const invalidPage = pageError()
              if (invalidPage) return invalidPage
              if (loginState() === 'logged_out') return logoutResult()
              if (visibleSessionChallenge())
                return actionRequired(
                  'The website requires a session confirmation or verification. Complete it manually, then call check_login.',
                )
              const startUrl = location.href
              let logout = exactControl(
                [...roots(NAVIGATION), ...roots(ACCOUNT_MENUS)],
                ['\u9000\u51FA\u767B\u5F55'],
              )
              if (!logout) {
                const more = exactControl(roots(NAVIGATION), [
                  '\u66F4\u591A',
                  '\u66F4\u591A\u9009\u9879',
                  '\u8D26\u6237',
                  '\u8D26\u53F7',
                  '\u5E10\u53F7',
                ])
                if (!more)
                  return error(
                    'LOGOUT_ENTRY_UNSUPPORTED',
                    'No recognizable sign-out or account menu control is available in site navigation. Sign out manually in the website.',
                  )
                const existingPortals = new Set(roots(PORTAL_MENUS))
                more.click()
                const menuStarted = Date.now()
                while (Date.now() - menuStarted < WAIT_MS) {
                  if (loginState() === 'logged_out') return logoutResult()
                  const changed = pageError(startUrl)
                  if (changed) return changed
                  if (visibleSessionChallenge())
                    return actionRequired(
                      'The website requires confirmation or verification. Complete it manually, then call check_login.',
                    )
                  const newlyVisibleMenus = roots(PORTAL_MENUS).filter(
                    (menu) => !existingPortals.has(menu),
                  )
                  logout = exactControl(
                    [
                      ...roots(NAVIGATION),
                      ...roots(ACCOUNT_MENUS),
                      ...newlyVisibleMenus,
                    ],
                    ['\u9000\u51FA\u767B\u5F55'],
                  )
                  if (logout) break
                  await new Promise((resolve) => setTimeout(resolve, POLL_MS))
                }
                if (!logout)
                  return error(
                    'LOGOUT_ENTRY_UNSUPPORTED',
                    'The account menu did not expose a recognizable sign-out control. Sign out manually in the website.',
                  )
              }
              logout.click()
              const started = Date.now()
              while (Date.now() - started < WAIT_MS) {
                if (loginState() === 'logged_out') return logoutResult()
                const changed = pageError(startUrl)
                if (changed) return changed
                if (visibleSessionChallenge())
                  return actionRequired(
                    'The website requests a second confirmation or verification for sign-out. Complete it manually, then call check_login; sign-out is not yet verified.',
                  )
                await new Promise((resolve) => setTimeout(resolve, POLL_MS))
              }
              return {
                ...error(
                  'SESSION_TIMEOUT',
                  'The sign-out control was clicked, but the page did not establish a signed-out state. Check the website before trying again.',
                ),
                data: { ...sessionInfo(), logout_verified: false },
              }
            },
          }

          // Workflow entrypoint
          async function stdin_default(args) {
            return xiaohongshuSessionTools.logout(args)
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
