/**
 * Zero-dependency browser driver for the I001-F01 / I001-F02 end-to-end layer.
 *
 * Plain Node 24: global `fetch` and global `WebSocket`, no npm package, no
 * runtime dependency, nothing shipped in the artifact (`files` excludes `test`).
 *
 * Environment facts come from outside this repository:
 *   - `SIDE_QUOTE_E2E_BASE_URL`  the isolated DSH instance (default http://127.0.0.1:3181)
 *   - `SIDE_QUOTE_E2E_CDP`       a Chromium DevTools endpoint (`ws://…` or `http://host:port`)
 *   - `SIDE_QUOTE_E2E_EVIDENCE_DIR`  where screenshots and their sidecars are written
 *   - `SIDE_QUOTE_E2E_PROFILE`   required; the profile name recorded in the sidecars
 *   - `SIDE_QUOTE_E2E_ALLOW_LIVE`  optional escape hatch for the live-port guard
 *
 * A missing driver or a missing instance makes the suites `skip`, never pass.
 * Every interaction below goes through public, human-visible affordances —
 * visible text, `aria-label`, `placeholder`, roles — and real mouse/key input.
 * No builtin plugin data attribute, CSS-module class or DOM hierarchy is used.
 *
 * One measured exception, confined to the I001-F02 E-10 baseline: proving that
 * "takeover closed" really renders the built-in preview needs a hook on the
 * built-in frame, so `BUILTIN_HTML_FRAME_MARKER` is read there and nowhere else.
 * The ban is unchanged for product code: `client.js` must never read a builtin
 * plugin's `data-*` attribute to decide ownership, format or behaviour.
 *
 * The copy this driver asserts on is read from `code/client.js` itself, so the
 * harness can never drift from the shipped dictionaries or content constants.
 */
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadClientInternals } from '../load-client.mjs'

const { internals } = await loadClientInternals()

/** The isolated verification port. Never the operator's live 3081. */
export const DEFAULT_BASE_URL = 'http://127.0.0.1:3181'

/** The operator's live port: this driver refuses it unless explicitly allowed. */
export const LIVE_PORT = '3081'

/** Literal skip reasons required by the contract. */
export const SKIP_NO_INSTANCE = '未提供 DSH 实例'
export const SKIP_NO_DRIVER = '未提供浏览器驱动'
export const SKIP_NO_EVIDENCE_DIR = '未提供证据目录（SIDE_QUOTE_E2E_EVIDENCE_DIR）'
export const SKIP_NO_PROFILE = '未提供实例 profile（SIDE_QUOTE_E2E_PROFILE）'
export const SKIP_LIVE_INSTANCE = '拒绝对 live 端口 3081 运行端到端用例'

/** Fixed viewport, so every screenshot can name the size it was taken at. */
export const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }

/**
 * Stable product markers of the HTML takeover (I001-F02 implementation.md §7).
 *
 * These are the plugin's own attributes, shipped for acceptance assertions, so
 * locating them is not the "builtin data attribute" this driver otherwise bans.
 */
export const HTML_MARKERS = Object.freeze({
  toggle: 'data-side-quote-html-toggle',
  quote: 'data-side-quote-html-quote',
  body: 'data-side-quote-html',
  frame: 'data-side-quote-html-frame',
})

/**
 * The built-in HTML preview's own frame marker.
 *
 * Read only by the E-10 baseline assertions (see the module note). It is never
 * used to drive an interaction and never read by product code.
 */
export const BUILTIN_HTML_FRAME_MARKER = 'data-html-preview'

/** The persisted takeover preference (I001-F02 implementation.md §4). */
export const HTML_TAKEOVER_STORAGE_KEY = 'dsh-side-quote:html-takeover'

/**
 * Platform settings-surface copy used to drive the script gate.
 *
 * These are the shipped `settings` dictionary strings of DSH `0.2.2-rc.3`
 * (`dsh-client-ui-settings-general`: `trigger`, `general.nav`,
 * `developerTools.title`, `close`), located as public affordances by label.
 * None of this copy belongs to the plugin.
 */
export const SETTINGS_COPY = Object.freeze({
  trigger: ['设置', 'Settings'],
  general: ['通用设置', 'General'],
  developerTools: ['显示代码工作视图', 'Show coding view'],
  close: ['关闭', 'Close'],
})

/** Notice tiers as the composer renders them (F01: info is `status`, error is `alert`). */
export const isInfoNotice = (notice) => notice.role === 'status'
export const isErrorNotice = (notice) => notice.role === 'alert'

/** UI copy, read from the shipped dictionaries. */
export const QUOTE_LABEL = [...new Set(Object.values(internals.LOCALES).map((dictionary) => dictionary['quote.button']))]
/** The language-independent prefix of the sensitive-content warning, per dictionary. */
export const SENSITIVE_WARNING = [...new Set(Object.values(internals.LOCALES)
  .map((dictionary) => String(dictionary['info.sensitive']).split('{path}')[0]))]
/** Content copy: never localized, so it is one literal from the bundle. */
export const POINTER_LABEL = internals.POINTER_LABEL
export const SOURCE_LABEL = internals.SOURCE_LABEL
/** Every shipped error notice, so a case can assert that none was raised. */
export const ERROR_COPY = [...new Set(Object.values(internals.LOCALES)
  .flatMap((dictionary) => Object.entries(dictionary)
    .filter(([key]) => key.startsWith('error.'))
    .map(([, value]) => String(value).split('{')[0])))]

/**
 * Strip credentials and query values from an instance URL.
 *
 * The boot URL carries a session token; evidence is committed, so it records the
 * origin and path only.
 * @param {string} url - the instance URL.
 * @returns {string} the URL without its query or fragment.
 */
export function redactUrl(url) {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return String(url).split(/[?#]/u)[0]
  }
}

/**
 * One line describing the connected instance, printed by every suite so the run
 * summary names the port and profile it actually used.
 * @param {object} config - from {@link readE2eConfig}.
 * @returns {string} the summary line.
 */
export function describeRun(config) {
  return `[side-quote e2e] instance=${redactUrl(config.baseUrl)} port=${config.port} profile=${config.profile}`
    + ` driver=${config.cdp} evidence=${config.evidenceDir === '' ? '(none)' : config.evidenceDir}`
}

/**
 * Read the e2e configuration from the environment.
 * @param {NodeJS.ProcessEnv} [env] - environment source.
 * @returns {{baseUrl: string, baseUrlProvided: boolean, port: string, cdp: string, evidenceDir: string, profile: string}} configuration.
 */
export function readE2eConfig(env = process.env) {
  const baseUrl = (env.SIDE_QUOTE_E2E_BASE_URL ?? '').trim()
  const resolved = baseUrl === '' ? DEFAULT_BASE_URL : baseUrl.replace(/\/+$/u, '')
  return {
    baseUrl: resolved,
    baseUrlProvided: baseUrl !== '',
    port: portOf(resolved),
    cdp: (env.SIDE_QUOTE_E2E_CDP ?? '').trim(),
    evidenceDir: (env.SIDE_QUOTE_E2E_EVIDENCE_DIR ?? '').trim(),
    profile: (env.SIDE_QUOTE_E2E_PROFILE ?? '').trim() || 'unspecified',
  }
}

/**
 * Read the port out of an instance URL.
 * @param {string} url - instance URL.
 * @returns {string} the port, or an empty string when it cannot be read.
 */
function portOf(url) {
  try {
    const parsed = new URL(url)
    if (parsed.port !== '') return parsed.port
    return parsed.protocol === 'https:' ? '443' : '80'
  } catch {
    return ''
  }
}

/**
 * Decide why this suite cannot run, or `false` when it can.
 * @param {object} config - from {@link readE2eConfig}.
 * @param {NodeJS.ProcessEnv} [env] - environment source for the live-port escape hatch.
 * @returns {Promise<string|false>} the literal skip reason, or false.
 */
export async function resolveSkipReason(config, env = process.env) {
  if (config.cdp === '') return SKIP_NO_DRIVER
  if (config.evidenceDir === '') return SKIP_NO_EVIDENCE_DIR
  // Evidence has to prove which instance produced it, so a run that writes
  // screenshots must also name the profile it ran against.
  if (config.profile === '' || config.profile === 'unspecified') {
    return `${SKIP_NO_PROFILE}：证据 sidecar 需要它证明实例隔离，请设置该变量`
  }
  if (config.port === LIVE_PORT && (env.SIDE_QUOTE_E2E_ALLOW_LIVE ?? '') !== '1') {
    return `${SKIP_LIVE_INSTANCE}（${config.baseUrl}；如确需运行，设置 SIDE_QUOTE_E2E_ALLOW_LIVE=1）`
  }
  if (!(await isInstanceUp(config.baseUrl))) return SKIP_NO_INSTANCE
  return false
}

/**
 * Read the current git revision for the evidence sidecar.
 * @returns {string} the revision, or `unknown` outside a work tree.
 */
export function gitRevision() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

/**
 * Probe the DSH instance without assuming its route table.
 * @param {string} baseUrl - instance origin.
 * @returns {Promise<boolean>} whether anything answered.
 */
export async function isInstanceUp(baseUrl) {
  try {
    const response = await fetch(baseUrl, { signal: AbortSignal.timeout(5000) })
    return response.status < 500
  } catch {
    return false
  }
}

/**
 * Turn either accepted CDP form into a browser-level WebSocket URL.
 * @param {string} value - `ws://…` or `http://host:port` (or bare `host:port`).
 * @returns {Promise<string>} the WebSocket URL.
 */
export async function resolveCdpWebSocketUrl(value) {
  const raw = value.trim()
  if (raw === '') throw new Error(SKIP_NO_DRIVER)
  if (/^wss?:\/\//u.test(raw)) return raw
  const origin = (/^https?:\/\//u.test(raw) ? raw : `http://${raw}`).replace(/\/+$/u, '')
  const response = await fetch(`${origin}/json/version`, { signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw new Error(`CDP ${origin}/json/version answered ${response.status}`)
  const info = await response.json()
  if (typeof info.webSocketDebuggerUrl !== 'string' || info.webSocketDebuggerUrl === '') {
    throw new Error(`CDP ${origin}/json/version carried no webSocketDebuggerUrl`)
  }
  return info.webSocketDebuggerUrl
}

/**
 * Minimal DevTools-protocol client over the browser WebSocket, with flat sessions.
 * @param {string} url - browser-level WebSocket URL.
 * @returns {Promise<object>} the client.
 */
export async function connectCdp(url) {
  const socket = await new Promise((resolve, reject) => {
    const candidate = new WebSocket(url)
    const fail = () => reject(new Error(`CDP socket could not connect to ${url}`))
    candidate.addEventListener('open', () => resolve(candidate), { once: true })
    candidate.addEventListener('error', fail, { once: true })
  })

  let nextId = 1
  const pending = new Map()
  const listeners = new Set()

  socket.addEventListener('message', (event) => {
    let message
    try {
      message = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data))
    } catch {
      return
    }
    if (message.id !== undefined) {
      const waiting = pending.get(message.id)
      if (waiting === undefined) return
      pending.delete(message.id)
      if (message.error !== undefined) waiting.reject(new Error(`${message.method ?? 'CDP'}: ${message.error.message}`))
      else waiting.resolve(message.result)
      return
    }
    for (const listener of [...listeners]) listener(message)
  })

  /**
   * Send one protocol command.
   * @param {string} method - protocol method.
   * @param {object} [params] - method parameters.
   * @param {string} [sessionId] - flat session to address.
   * @param {number} [timeoutMs] - per-command timeout.
   * @returns {Promise<object>} the result.
   */
  function send(method, params = {}, sessionId, timeoutMs = 30000) {
    const id = nextId
    nextId += 1
    const payload = sessionId === undefined ? { id, method, params } : { id, method, params, sessionId }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`CDP ${method} timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      })
      socket.send(JSON.stringify(payload))
    })
  }

  return {
    send,
    /** @param {(message: object) => void} listener - protocol event sink. @returns {() => void} unsubscribe. */
    on(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close() {
      for (const waiting of pending.values()) waiting.reject(new Error('CDP connection closed'))
      pending.clear()
      listeners.clear()
      try {
        socket.close()
      } catch {
        // Already closed.
      }
    },
  }
}

/** Collect every console error and page exception so a suite can assert silence. */
function createConsoleRecorder() {
  const errors = []
  return {
    errors,
    /** @param {object} message - a protocol event. */
    handle(message) {
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        errors.push(message.params.args.map((arg) => String(arg.value ?? arg.description ?? '')).join(' '))
      }
      if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params.exceptionDetails
        errors.push(String(details.exception?.description ?? details.text ?? 'exception'))
      }
    },
  }
}

/**
 * Open one page and bind the helpers the suites use.
 * @param {object} client - from {@link connectCdp}.
 * @param {string} url - page URL.
 * @returns {Promise<object>} the page.
 */
export async function openPage(client, url) {
  const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true })
  const console_ = createConsoleRecorder()
  const off = client.on((message) => {
    if (message.sessionId === sessionId) console_.handle(message)
  })

  const send = (method, params = {}) => client.send(method, params, sessionId)

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', VIEWPORT)
  const loaded = new Promise((resolve) => {
    const stop = client.on((message) => {
      if (message.sessionId === sessionId && message.method === 'Page.loadEventFired') {
        stop()
        resolve()
      }
    })
  })
  await send('Page.navigate', { url })
  await Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, 30000))])

  const page = {
    targetId,
    sessionId,
    /** The browser-level client, for `Target.*` commands that are not page-scoped. */
    client,
    consoleErrors: console_.errors,
    send,
    /**
     * Forget the console errors seen so far.
     *
     * A case that reloads the page or changes the plugin inventory first drops
     * the noise produced by that transition, then asserts silence for the
     * window it actually cares about.
     */
    resetConsoleErrors() {
      console_.errors.length = 0
    },
    /**
     * Evaluate an expression in the page.
     * @param {string} expression - page-side expression.
     * @returns {Promise<any>} the value.
     */
    async evaluate(expression) {
      const result = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
      })
      if (result.exceptionDetails !== undefined) {
        const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text
        throw new Error(`page evaluation failed: ${detail}\n--- expression ---\n${expression}`)
      }
      return result.result.value
    },
    /**
     * Poll an expression until it is truthy.
     * @param {string} expression - page-side predicate.
     * @param {{timeoutMs?: number, intervalMs?: number, label?: string}} [options] - polling controls.
     * @returns {Promise<any>} the last truthy value.
     */
    async waitFor(expression, options = {}) {
      const timeoutMs = options.timeoutMs ?? 20000
      const intervalMs = options.intervalMs ?? 100
      const deadline = Date.now() + timeoutMs
      let last
      for (;;) {
        last = await page.evaluate(expression)
        if (last) return last
        if (Date.now() > deadline) {
          throw new Error(`timed out after ${timeoutMs}ms waiting for ${options.label ?? expression}`)
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs))
      }
    },
    /**
     * Click a point with a real mouse sequence, so `mousedown` handlers and the
     * browser's own click synthesis both run.
     * @param {number} x - viewport x.
     * @param {number} y - viewport y.
     */
    async mouseClick(x, y) {
      const base = { x, y, button: 'left', clickCount: 1 }
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base })
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base })
    },
    /**
     * Take a screenshot and write its evidence sidecar.
     *
     * The directory is mandatory: a case that must produce evidence cannot pass
     * by writing nothing. The sidecar carries the identity a reviewer needs to
     * bind the image to a build, an instance and a viewport, plus the takeover
     * state, the selection drive that produced it, the observed iframe `sandbox`
     * attribute and the developer-tools gate value when it is known.
     * @param {string} name - case id, used as the file stem.
     * @param {{evidenceDir: string, baseUrl: string, port: string, profile: string}} evidence - run identity.
     * @param {{clip?: {x: number, y: number, width: number, height: number}, takeover?: 'off'|'on'|'unavailable', selectionDrive?: 'mouse'|'synthetic-range'|null, iframeSandbox?: string|null, developerTools?: boolean|null}} [options] - crop and state.
     * @returns {Promise<string>} the written image path.
     */
    async screenshot(name, evidence, options = {}) {
      if (evidence === undefined || evidence.evidenceDir === '') {
        throw new Error(`${SKIP_NO_EVIDENCE_DIR}：${name} 无法写出证据`)
      }
      const clip = options.clip === undefined || options.clip === null ? null : normalizeClip(options.clip)
      const shot = { format: 'png', captureBeyondViewport: false }
      if (clip !== null) shot.clip = { ...clip, scale: 1 }
      const { data } = await send('Page.captureScreenshot', shot)
      await mkdir(evidence.evidenceDir, { recursive: true })
      const path = join(evidence.evidenceDir, `${name}.png`)
      await writeFile(path, Buffer.from(data, 'base64'))
      const takeover = options.takeover ?? evidence.takeover ?? 'unavailable'
      const selectionDrive = options.selectionDrive ?? evidence.selectionDrive ?? null
      const iframeSandbox = options.iframeSandbox ?? evidence.iframeSandbox ?? null
      const developerTools = options.developerTools ?? evidence.developerTools ?? null
      await writeFile(
        join(evidence.evidenceDir, `${name}.json`),
        `${JSON.stringify({
          case: name,
          gitRevision: gitRevision(),
          baseUrl: redactUrl(evidence.baseUrl),
          port: evidence.port,
          profile: evidence.profile,
          viewport: `${VIEWPORT.width}x${VIEWPORT.height}`,
          capturedAt: new Date().toISOString(),
          takeover,
          selectionDrive,
          iframeSandbox,
          developerTools,
          clip,
        }, null, 2)}\n`,
        'utf8',
      )
      return path
    },
    /** Close the tab and release the recorder. */
    async close() {
      off()
      try {
        await client.send('Target.closeTarget', { targetId })
      } catch {
        // The tab may already be gone.
      }
    },
  }
  return page
}

/**
 * Dismiss any modal the app shows on first load (the preview notice).
 *
 * A `[role="dialog"]` mounts a full-viewport mask over the page; while it is up
 * every CDP mouse event lands on the mask and no control is reachable by a real
 * pointer. Dismissal is a DOM activation of the dialog's own continue control.
 * @param {object} page - the page.
 * @returns {Promise<boolean>} whether any dialog was dismissed.
 */
export async function dismissOverlays(page) {
  let dismissed = false
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const hasDialog = await page.evaluate('(() => document.querySelector(\'[role="dialog"]\') !== null)()')
    if (hasDialog !== true) return dismissed
    const control = `(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return null;
      const wanted = ['继续', 'Continue', '知道了', 'Got it', '关闭', 'Close', '确定', 'OK'];
      const buttons = [...dialog.querySelectorAll('button, [role="button"]')];
      return buttons.find((element) => wanted.includes((element.textContent || '').trim())) || buttons[0] || null;
    })()`
    if ((await page.evaluate(`(() => ${control} !== null)()`)) !== true) return dismissed
    await page.evaluate(`(() => { const element = ${control}; element.click(); return true; })()`)
    dismissed = true
    await new Promise((resolve) => setTimeout(resolve, 800))
  }
  return dismissed
}

/**
 * Wait until the app shell has restored, so navigation affordances exist.
 * @param {object} page - the page.
 * @param {number} [timeoutMs] - bound.
 */
export async function waitForAppShell(page, timeoutMs = 30000) {
  await page.waitFor(
    '(() => document.querySelectorAll(\'[role="tab"], [contenteditable="true"]\').length > 0)()',
    { timeoutMs, label: 'the app shell' },
  )
  // The right sidebar restores its tabs one commit after the shell appears.
  await new Promise((resolve) => setTimeout(resolve, 800))
  await dismissOverlays(page)
}

/* -------------------------------------------------------------------------- *
 * Public-affordance UI helpers
 *
 * Everything below locates controls by visible text, `aria-label`, `placeholder`
 * or ARIA role, and activates them the way a pointer would. No builtin plugin
 * data attribute, CSS-module class or DOM hierarchy is used.
 * -------------------------------------------------------------------------- */

/**
 * Build a page-side expression that finds a clickable element by visible text.
 * @param {string[]} texts - accepted visible strings.
 * @param {{exact?: boolean}} [options] - `exact: false` matches substrings.
 * @returns {string} an expression resolving to an Element or null.
 */
export function clickableByText(texts, options = {}) {
  const literal = JSON.stringify(texts)
  const exact = options.exact === false ? 'false' : 'true'
  return `(() => {
    const wanted = ${literal};
    const exact = ${exact};
    const selector = 'button, [role="button"], [role="tab"], [role="option"], [role="menuitem"], a, [role="treeitem"]';
    const matches = [...document.querySelectorAll(selector)].filter((element) => {
      const text = (element.textContent || '').replace(/\\s+/gu, ' ').trim();
      if (text === '') return false;
      const hit = exact ? wanted.includes(text) : wanted.some((needle) => text.includes(needle));
      if (!hit) return false;
      return ![...element.querySelectorAll(selector)].some((child) => {
        const childText = (child.textContent || '').replace(/\\s+/gu, ' ').trim();
        return childText !== '' && (exact ? wanted.includes(childText) : wanted.some((needle) => childText.includes(needle)));
      });
    });
    return matches[0] || null;
  })()`
}

/**
 * Activate a control, preferring a real pointer gesture.
 *
 * Preference order, and why:
 *   1. CDP mouse gesture at the element's box centre — a genuine user click,
 *      used only when `document.elementFromPoint` at that centre resolves to the
 *      element itself (otherwise the gesture would land on an overlay).
 *   2. `element.click()` — a DOM activation of the same visible control. The
 *      shipped tab strip covers header controls with a drag layer, so the
 *      pointer gesture cannot reach them; the React handler still runs and reads
 *      the click-time DOM selection.
 *
 * @param {object} page - the page.
 * @param {string} expression - expression resolving to an Element.
 * @param {string} [label] - failure label.
 * @returns {Promise<'mouse'|'dom'>} which path was used.
 */
export async function activate(page, expression, label) {
  const hit = await page.evaluate(`(() => {
    const element = ${expression};
    if (!element) return { found: false };
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const top = document.elementFromPoint(x, y);
    return { found: true, point: [x, y], reachable: top === element || element.contains(top) };
  })()`)
  if (!hit.found) throw new Error(`could not find ${label ?? expression}`)
  if (hit.reachable) {
    await page.mouseClick(hit.point[0], hit.point[1])
    return 'mouse'
  }
  const clicked = await page.evaluate(`(() => { const element = ${expression}; if (!element) return false; element.click(); return true; })()`)
  if (!clicked) throw new Error(`could not activate ${label ?? expression}`)
  return 'dom'
}

/**
 * Wait until a sidebar tab whose visible title carries the file name exists.
 * @param {object} page - the page.
 * @param {string} fileName - the file name.
 * @param {number} [timeoutMs] - bound.
 */
export async function waitForPreviewTab(page, fileName, timeoutMs = 30000) {
  await page.waitFor(`(() => {
    const name = ${JSON.stringify(fileName)};
    return [...document.querySelectorAll('[role="tab"], [role="tablist"] a, [role="tablist"] button')]
      .some((element) => (element.textContent || '').includes(name));
  })()`, { timeoutMs, label: `a preview tab titled ${fileName}` })
}

/**
 * Read the quote button's presence and enabled state.
 * @param {object} page - the page.
 * @returns {Promise<{present: boolean, disabled: boolean|null, label: string|null}>} the state.
 */
export async function readQuoteButton(page) {
  const literal = JSON.stringify(QUOTE_LABEL)
  return page.evaluate(`(() => {
    const wanted = ${literal};
    const button = [...document.querySelectorAll('button, [role="button"]')]
      .find((element) => wanted.includes((element.getAttribute('aria-label') || '').trim())
        || wanted.includes((element.textContent || '').trim()));
    if (!button) return { present: false, disabled: null, label: null };
    return {
      present: true,
      disabled: button.disabled === true || button.getAttribute('aria-disabled') === 'true',
      label: (button.getAttribute('aria-label') || button.textContent || '').trim(),
    };
  })()`)
}

/**
 * Expression for the quote button itself, for activation.
 * @returns {string} an expression resolving to the button or null.
 */
export function quoteButtonExpression() {
  return `(() => {
    const wanted = ${JSON.stringify(QUOTE_LABEL)};
    return [...document.querySelectorAll('button, [role="button"]')]
      .find((element) => wanted.includes((element.getAttribute('aria-label') || '').trim())) || null;
  })()`
}

/**
 * Wait until the quote button exists with the wanted enabled state.
 * @param {object} page - the page.
 * @param {boolean} enabled - wanted state.
 * @param {number} [timeoutMs] - bound.
 * @returns {Promise<object>} the final state.
 */
export async function waitForQuoteButton(page, enabled, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  let last = { present: false, disabled: null, label: null }
  for (;;) {
    last = await readQuoteButton(page)
    if (last.present && last.disabled === !enabled) return last
    if (Date.now() > deadline) {
      throw new Error(`quote button did not become ${enabled ? 'enabled' : 'disabled'}: ${JSON.stringify(last)}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

/**
 * Select a literal phrase inside the preview.
 *
 * Two measured facts shape this helper:
 *   1. A CDP mouse drag produced a collapsed selection in the shipped preview,
 *      while a DOM Range produced a real one and fired `selectionchange`.
 *   2. The phrase can also occur in the composer, which is an editable region;
 *      selecting there would exercise the plugin against a target outside the
 *      sidebar. Editable fields are therefore skipped by role and attribute.
 * The text is read back through `getRangeAt(0)`, because the preview answers ''
 * from `Selection.toString()` while the range holds the text.
 * @param {object} page - the page.
 * @param {string} phrase - the literal text to select; it must sit in one text node.
 * @param {{timeoutMs?: number}} [options] - how long to wait for the text to render.
 * @returns {Promise<string>} the selected text.
 */
export async function selectPhrase(page, phrase, options = {}) {
  const literal = JSON.stringify(phrase)
  const deadline = Date.now() + (options.timeoutMs ?? 8000)
  for (;;) {
    const selected = await page.evaluate(`(() => {
      const needle = ${literal};
      const skip = 'input, textarea, select, [contenteditable="true"], [role="textbox"], script, style, noscript';
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const parent = node.parentElement;
        const value = node.nodeValue || '';
        const index = value.indexOf(needle);
        if (index >= 0 && parent !== null && parent.closest(skip) === null) {
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + needle.length);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          return selection.rangeCount > 0 ? selection.getRangeAt(0).toString() : '';
        }
        node = walker.nextNode();
      }
      return '';
    })()`)
    if (selected !== '') return selected
    if (Date.now() > deadline) {
      throw new Error(`could not select the phrase ${literal} outside editable fields within the timeout`)
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
}


/**
 * Read the composer's visible text, which is what a user and the model see.
 * @param {object} page - the page.
 * @returns {Promise<string>} the composer text.
 */
export async function readComposerText(page) {
  return page.evaluate(`(() => {
    const editors = [...document.querySelectorAll('[contenteditable="true"]')];
    if (editors.length === 0) return '';
    return editors.map((element) => element.innerText || element.textContent || '').join('\\n').trim();
  })()`)
}

/**
 * Read the notice regions the composer renders (banners and inline notices).
 *
 * Notices are located by ARIA live-region semantics only, and each entry keeps
 * its role so a caller can tell an `error` from an `info` without guessing at
 * markup or class names.
 * @param {object} page - the page.
 * @returns {Promise<{role: string, text: string}[]>} the visible notices.
 */
export async function readNotices(page) {
  return page.evaluate(`(() => {
    const selector = '[role="alert"], [role="status"], [role="log"], [aria-live]';
    return [...document.querySelectorAll(selector)]
      .map((element) => ({
        role: element.getAttribute('role') || ('aria-live:' + (element.getAttribute('aria-live') || '')),
        text: (element.innerText || element.textContent || '').replace(/\\s+/gu, ' ').trim(),
      }))
      .filter((entry) => entry.text !== '');
  })()`)
}

/**
 * Wait until the notice regions satisfy a predicate.
 * @param {object} page - the page.
 * @param {(notices: {role: string, text: string}[]) => boolean} predicate - acceptance test.
 * @param {{timeoutMs?: number, label?: string}} [options] - bound and failure label.
 * @returns {Promise<{role: string, text: string}[]>} the notices at acceptance.
 */
export async function waitForNotices(page, predicate, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15000
  const deadline = Date.now() + timeoutMs
  let notices = []
  for (;;) {
    notices = await readNotices(page)
    if (predicate(notices)) return notices
    if (Date.now() > deadline) {
      throw new Error(`no notice matched ${options.label ?? 'the predicate'}; saw ${JSON.stringify(notices)}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

/**
 * Make an already-open preview tab active.
 * @param {object} page - the page.
 * @param {string} fileName - the file name shown in the tab title.
 * @returns {Promise<boolean>} whether such a tab existed and was activated.
 */
export async function activatePreviewTab(page, fileName) {
  const expression = `(() => {
    const name = ${JSON.stringify(fileName)};
    return [...document.querySelectorAll('[role="tab"]')]
      .find((element) => (element.textContent || '').includes(name)) || null;
  })()`
  if ((await page.evaluate(`(() => ${expression} !== null)()`)) !== true) return false
  await activate(page, expression, `the ${fileName} preview tab`)
  return true
}

/**
 * Open a workspace file's document preview through the Files sidebar and leave
 * that preview active.
 *
 * Sequence, all by visible name: reuse an already-open preview tab when there is
 * one, otherwise open the Files page (its own tab, or its guide entry), walk the
 * tree (`directories` are expanded in order) and activate the file row.
 * @param {object} page - the page.
 * @param {{directories?: string[], fileName: string, timeoutMs?: number}} options - tree path and bound.
 */
export async function openFilePreview(page, options) {
  const timeoutMs = options.timeoutMs ?? 30000
  const fileName = options.fileName
  const directories = options.directories ?? []
  await waitForAppShell(page, timeoutMs)
  // A fresh profile starts with the column collapsed, so no tab strip and no
  // guide entry exist yet; its toggle is the only public way in.
  if ((await page.evaluate('(() => document.querySelectorAll(\'[role="tab"]\').length > 0)()')) !== true) {
    const openSidebar = `(() => {
      const wanted = ['打开右侧边栏', 'Open right sidebar', 'Open sidebar'];
      return [...document.querySelectorAll('[aria-label]')]
        .find((element) => wanted.includes((element.getAttribute('aria-label') || '').trim())) || null;
    })()`
    if ((await page.evaluate(`(() => ${openSidebar} !== null)()`)) === true) {
      await activate(page, openSidebar, 'the right sidebar toggle')
      await page.waitFor('(() => document.querySelectorAll(\'[role="tab"]\').length > 0)()', {
        timeoutMs,
        label: 'the right sidebar tab strip',
      })
    }
  }
  if (await activatePreviewTab(page, fileName)) {
    await waitForPreviewTab(page, fileName, timeoutMs)
    await new Promise((resolve) => setTimeout(resolve, 600))
    return
  }
  // The Files page: its own tab when one exists, otherwise the guide entry that opens it.
  const filesTab = clickableByText(['文件', 'Files'])
  const guideEntry = clickableByText(['工作区文件', 'Workspace files'], { exact: false })
  if ((await page.evaluate(`(() => ${filesTab} !== null)()`)) === true) {
    await activate(page, filesTab, 'the Files tab')
  } else if ((await page.evaluate(`(() => ${guideEntry} !== null)()`)) === true) {
    await activate(page, guideEntry, 'the workspace files guide entry')
  }
  for (const directory of directories) {
    const row = clickableByText([directory])
    await page.waitFor(`(() => ${row} !== null)()`, { timeoutMs, label: `the directory row ${directory}` })
    // A directory row is a toggle: clicking an already-expanded one would hide
    // the children the caller came for.
    const expanded = await page.evaluate(`(() => {
      const element = ${row};
      return element === null ? null : element.getAttribute('aria-expanded');
    })()`)
    if (expanded === 'true') continue
    await activate(page, row, `the directory row ${directory}`)
    await new Promise((resolve) => setTimeout(resolve, 600))
  }
  const fileRow = clickableByText([fileName])
  const found = await page.evaluate(`(() => ${fileRow} !== null)()`)
  if (found !== true) {
    throw new Error(
      `the Files tree does not list ${fileName}. The fixture must exist in the session workspace`
      + ' and, for a dot-prefixed name, hidden entries must be shown in the Files page.',
    )
  }
  await activate(page, fileRow, `the file row ${fileName}`)
  await waitForPreviewTab(page, fileName, timeoutMs)
}

/**
 * Assert one plugin's inventory switch to a wanted state through the visible UI.
 *
 * The inventory exposes each installed plugin as a `[role="switch"]` whose
 * `aria-label` names the plugin, so the control is found by role + label and the
 * resulting state is read back from `aria-checked`. Idempotent: an already
 * correct switch is left alone, because clicking it would invert the intent.
 * @param {object} page - the page.
 * @param {string} pluginId - the package name shown in the inventory.
 * @param {boolean} enabled - wanted state.
 * @param {{timeoutMs?: number}} [options] - bound.
 * @returns {Promise<string>} the activation path used for the switch, or 'unchanged'.
 */
export async function setPluginEnabled(page, pluginId, enabled, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30000
  const inventory = clickableByText(['插件', 'Plugins'])
  await page.waitFor(`(() => ${inventory} !== null)()`, { timeoutMs, label: 'the plugin inventory entry' })
  await activate(page, inventory, 'the plugin inventory entry')
  const switchExpression = pluginSwitchExpression(pluginId)
  await page.waitFor(`(() => ${switchExpression} !== null)()`, {
    timeoutMs,
    label: `the enable switch for ${pluginId}`,
  })
  const state = await page.evaluate(pluginSwitchStateExpression(pluginId))
  let path = 'unchanged'
  if (state !== null && state.checked !== enabled) {
    await page.waitFor(`(() => {
      const state = ${pluginSwitchStateExpression(pluginId)};
      return state === null || state.disabled === false;
    })()`, { timeoutMs, label: `the enable switch for ${pluginId} to become operable` })
    path = await activate(page, switchExpression, `the enable switch for ${pluginId}`)
  }
  await page.waitFor(`(() => {
    const state = ${pluginSwitchStateExpression(pluginId)};
    return state === null || state.checked === ${JSON.stringify(enabled)};
  })()`, { timeoutMs, label: `${pluginId} to report itself ${enabled ? 'enabled' : 'disabled'}` })
  // A re-enabled plugin re-runs its activation effects; a disabled one unmounts.
  await new Promise((resolve) => setTimeout(resolve, enabled ? 1500 : 400))
  return path
}

/**
 * Disable this plugin through the visible plugin inventory.
 * @param {object} page - the page.
 * @param {string} pluginId - the package name shown in the inventory.
 * @param {{timeoutMs?: number}} [options] - bound.
 * @returns {Promise<string>} the activation path used for the switch.
 */
export async function disablePlugin(page, pluginId, options = {}) {
  return setPluginEnabled(page, pluginId, false, options)
}

/** @param {string} pluginId - the package name. @returns {string} expression resolving to its switch or null. */
function pluginSwitchExpression(pluginId) {
  return `(() => {
    const id = ${JSON.stringify(pluginId)};
    return [...document.querySelectorAll('[role="switch"]')]
      .find((element) => (element.getAttribute('aria-label') || '').includes(id)) || null;
  })()`
}

/** @param {string} pluginId - the package name. @returns {string} expression resolving to its switch state or null. */
function pluginSwitchStateExpression(pluginId) {
  return `(() => {
    const element = ${pluginSwitchExpression(pluginId)};
    if (!element) return null;
    return {
      checked: element.getAttribute('aria-checked') === 'true',
      disabled: element.disabled === true || element.getAttribute('aria-disabled') === 'true',
    };
  })()`
}

/* -------------------------------------------------------------------------- *
 * I001-F02: HTML preview takeover
 *
 * Everything below is additive: the I001-F01 layer above is unchanged. The
 * helpers split into four groups — evidence crops, the child-frame driver, the
 * persisted switch and body readers, and the platform surfaces the suite needs
 * (settings script gate, plugin inventory, composer notices).
 * -------------------------------------------------------------------------- */

/**
 * Round a page rectangle into a screenshot clip inside the fixed viewport.
 * @param {{x: number, y: number, width: number, height: number}} rect - page rectangles in CSS pixels.
 * @param {{viewport?: {width: number, height: number}}} [options] - viewport override.
 * @returns {{x: number, y: number, width: number, height: number}} the clip.
 */
export function clipFromRect(rect, options = {}) {
  const viewport = options.viewport ?? VIEWPORT
  const x = Math.max(0, Math.round(rect.x))
  const y = Math.max(0, Math.round(rect.y))
  const right = Math.min(viewport.width, Math.round(rect.x + rect.width))
  const bottom = Math.min(viewport.height, Math.round(rect.y + rect.height))
  const clip = { x, y, width: right - x, height: bottom - y }
  if (clip.width <= 0 || clip.height <= 0) {
    throw new Error(`the preview body has no drawable area: ${JSON.stringify(rect)}`)
  }
  return clip
}

/** @param {{x: number, y: number, width: number, height: number}} clip - a clip. @returns {object} the integer clip. */
function normalizeClip(clip) {
  return {
    x: Math.round(clip.x),
    y: Math.round(clip.y),
    width: Math.round(clip.width),
    height: Math.round(clip.height),
  }
}

/**
 * Whether one clip lies completely inside another.
 * @param {{x: number, y: number, width: number, height: number}} outer - container.
 * @param {{x: number, y: number, width: number, height: number}} inner - contained region.
 * @returns {boolean} containment.
 */
export function clipContains(outer, inner) {
  return inner.x >= outer.x && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width
    && inner.y + inner.height <= outer.y + outer.height
}

/**
 * Read the rendered document area of the active preview.
 *
 * A document preview owns one frame that fills its body slot, so the frame's
 * own rectangle *is* the `sidebar.right.tab.document` body region: it excludes
 * the header (where the takeover toggle lives) and it is the tightest region the
 * parent page can measure, since the frame's document is not readable from here.
 * The built-in frame marker is consulted only when the takeover frame is absent,
 * i.e. in the E-10 baseline (see the module note).
 * @param {object} page - the page.
 * @param {{allowBuiltinBaseline?: boolean}} [options] - allow the built-in marker.
 * @returns {Promise<{found: boolean, source?: string, x?: number, y?: number, width?: number, height?: number}>} the rectangle.
 */
export async function readPreviewBodyRect(page, options = {}) {
  const allowBuiltin = options.allowBuiltinBaseline !== false
  const takeover = `[${HTML_MARKERS.frame}]`
  const builtin = allowBuiltin
    ? `[...document.querySelectorAll('[${BUILTIN_HTML_FRAME_MARKER}]')].filter((element) => element.getClientRects().length > 0)[0] || null`
    : 'null'
  return page.evaluate(`(() => {
    const takeover = [...document.querySelectorAll('${takeover}')]
      .filter((element) => element.getClientRects().length > 0)[0] || null;
    const builtin = ${builtin};
    const element = takeover || builtin;
    if (!element) return { found: false };
    const rect = element.getBoundingClientRect();
    return {
      found: true,
      source: takeover ? 'takeover' : 'builtin',
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    };
  })()`)
}

/**
 * Drag with a real pointer: press, several moves with the button held, release.
 *
 * The browser decides what the coordinates hit, so this reaches into an opaque
 * `blob:` iframe without any same-origin access — the primary selection drive
 * required by `core/testing-and-acceptance.md` §4.2.
 * @param {object} page - the page.
 * @param {{x: number, y: number}} from - viewport point to press.
 * @param {{x: number, y: number}} to - viewport point to release.
 * @param {number} [steps] - intermediate moves; more steps make Chromium extend the selection.
 * @param {{delayMs?: number}} [options] - pause between protocol events.
 * @returns {Promise<{steps: number, from: object, to: object}>} what was dispatched.
 */
export async function mouseDrag(page, from, to, steps = 12, options = {}) {
  const count = Math.max(1, Math.trunc(steps))
  const delayMs = options.delayMs ?? 16
  const pause = () => new Promise((resolve) => setTimeout(resolve, delayMs))
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y })
  await pause()
  await page.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1,
  })
  await pause()
  for (let step = 1; step <= count; step += 1) {
    const x = from.x + ((to.x - from.x) * step) / count
    const y = from.y + ((to.y - from.y) * step) / count
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 })
    await pause()
  }
  await page.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: to.x, y: to.y, button: 'left', buttons: 0, clickCount: 1,
  })
  return { steps: count, from, to }
}

/**
 * Attach to the browsing context of one iframe in the page.
 *
 * The takeover frame is an opaque-origin document: the parent cannot read
 * `contentDocument`, so the driver reaches the frame the DevTools way. Two
 * routes are tried, because Chromium decides per frame whether a sandboxed
 * document lives out of process:
 *   1. `Target.getTargets` → an `iframe` target → `Target.attachToTarget` (flat);
 *   2. `Page.getFrameTree` → `Page.createIsolatedWorld` → `Runtime.evaluate` with
 *      that `executionContextId` (works for a cross-origin frame kept in-process).
 * The isolated world is created **without** universal access, so the page's own
 * origin checks still apply inside it: the isolation assertions below stay real.
 * @param {object} page - the page.
 * @param {string} selector - CSS selector of the iframe element.
 * @param {{timeoutMs?: number}} [options] - bound for the element to appear.
 * @returns {Promise<object>} the handle (`evaluate`, `detach`, `kind`, `url`, `rect`).
 */
export async function attachChildFrame(page, selector, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15000
  const deadline = Date.now() + timeoutMs
  let element
  for (;;) {
    element = await page.evaluate(`(() => {
      const frame = document.querySelector(${JSON.stringify(selector)});
      if (!frame) return { found: false };
      const rect = frame.getBoundingClientRect();
      return {
        found: true,
        src: frame.getAttribute('src') || '',
        name: frame.getAttribute('name') || '',
        rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      };
    })()`)
    if (element.found === true) break
    if (Date.now() > deadline) throw new Error(`no element matches ${selector} within ${timeoutMs}ms`)
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  const baseUrl = await page.evaluate('document.baseURI')
  let wanted = element.src
  if (wanted !== '') {
    try {
      wanted = new URL(wanted, baseUrl).href
    } catch {
      // Keep the raw attribute; matching below tolerates an unresolved value.
    }
  }
  const target = await findIframeTarget(page, wanted)
  if (target !== null) {
    const { sessionId } = await page.client.send('Target.attachToTarget', { targetId: target.targetId, flatten: true })
    return {
      kind: 'target',
      url: target.url,
      sessionId,
      targetId: target.targetId,
      rect: element.rect,
      /** @param {string} expression - frame-side expression. @returns {Promise<any>} its value. */
      async evaluate(expression) {
        const result = await page.client.send('Runtime.evaluate', {
          expression, returnByValue: true, awaitPromise: true, userGesture: true,
        }, sessionId)
        if (result.exceptionDetails !== undefined) {
          const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text
          throw new Error(`frame evaluation failed: ${detail}\n--- expression ---\n${expression}`)
        }
        return result.result.value
      },
      async detach() {
        try {
          await page.client.send('Target.detachFromTarget', { sessionId })
        } catch {
          // The frame may already be gone.
        }
      },
    }
  }
  const frame = await findFrameInTree(page, wanted)
  if (frame === null) {
    throw new Error(`could not locate the child frame for ${selector} (${wanted === '' ? 'no src attribute' : wanted})`)
  }
  const { executionContextId } = await page.send('Page.createIsolatedWorld', {
    frameId: frame.id,
    worldName: 'side-quote-e2e',
    grantUniveralAccess: false,
  })
  return {
    kind: 'world',
    url: frame.url,
    frameId: frame.id,
    contextId: executionContextId,
    rect: element.rect,
    /** @param {string} expression - frame-side expression. @returns {Promise<any>} its value. */
    async evaluate(expression) {
      const result = await page.send('Runtime.evaluate', {
        expression, contextId: executionContextId, returnByValue: true, awaitPromise: true, userGesture: true,
      })
      if (result.exceptionDetails !== undefined) {
        const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text
        throw new Error(`frame evaluation failed: ${detail}\n--- expression ---\n${expression}`)
      }
      return result.result.value
    },
    async detach() {
      // An isolated world disappears with its frame; nothing to release.
    },
  }
}

/**
 * Find an out-of-process `iframe` target whose URL matches the frame element.
 * @param {object} page - the page.
 * @param {string} wanted - absolute frame URL, '' for `srcdoc`.
 * @returns {Promise<{targetId: string, url: string}|null>} the target.
 */
async function findIframeTarget(page, wanted) {
  let infos
  try {
    const result = await page.client.send('Target.getTargets')
    infos = result.targetInfos
  } catch {
    return null
  }
  const frames = infos.filter((info) => info.type === 'iframe')
  if (wanted === '') {
    const srcdoc = frames.filter((info) => info.url === 'about:srcdoc')
    return srcdoc.length === 1 ? srcdoc[0] : null
  }
  const exact = frames.find((info) => info.url === wanted)
  return exact ?? null
}

/**
 * Find a child frame in the page's own frame tree.
 * @param {object} page - the page.
 * @param {string} wanted - absolute frame URL, '' for `srcdoc`.
 * @returns {Promise<{id: string, url: string}|null>} the frame.
 */
async function findFrameInTree(page, wanted) {
  const { frameTree } = await page.send('Page.getFrameTree')
  const frames = []
  const walk = (node) => {
    frames.push(node.frame)
    for (const child of node.childFrames ?? []) walk(child)
  }
  walk(frameTree)
  const children = frames.slice(1)
  if (wanted !== '') return children.find((frame) => frame.url === wanted) ?? null
  const srcdoc = children.filter((frame) => frame.url === 'about:srcdoc')
  return srcdoc.length === 1 ? srcdoc[0] : null
}

/**
 * Evaluate in a child frame, retrying while the frame swaps documents.
 *
 * The takeover bootstrap calls `document.open()` on the frame, which retires the
 * first execution context; a driver that had already attached sees one failed
 * evaluation before the replacement context answers.
 * @param {object} frame - from {@link attachChildFrame}.
 * @param {string} expression - frame-side expression.
 * @param {number} [timeoutMs] - bound.
 * @returns {Promise<any>} the value.
 */
async function evaluateWithRetry(frame, expression, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      return await frame.evaluate(expression)
    } catch (error) {
      if (Date.now() > deadline) throw error
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }
}

/**
 * Evaluate in a child frame until the expression is truthy.
 * @param {object} frame - from {@link attachChildFrame}.
 * @param {string} expression - frame-side predicate.
 * @param {number} [timeoutMs] - bound.
 * @returns {Promise<any>} the first truthy value.
 */
async function pollFrame(frame, expression, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  let last
  for (;;) {
    try {
      last = await frame.evaluate(expression)
      if (last) return last
    } catch {
      last = undefined
    }
    if (Date.now() > deadline) {
      throw new Error(`the child frame never satisfied the poll within ${timeoutMs}ms`)
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}

/**
 * Wait until a frame has rendered non-empty text.
 * @param {object} page - the page.
 * @param {string} selector - CSS selector of the iframe element.
 * @param {{timeoutMs?: number}} [options] - bound.
 */
export async function waitForFrameContent(page, selector, options = {}) {
  const timeoutMs = options.timeoutMs ?? 20000
  const frame = await attachChildFrame(page, selector, { timeoutMs })
  try {
    await pollFrame(frame, `(() => document.readyState === 'complete'
      && document.body !== null
      && (document.body.innerText || document.body.textContent || '').trim().length > 0)()`, timeoutMs)
  } finally {
    await frame.detach()
  }
}

/**
 * Measure where a piece of rendered text sits, from inside the child frame.
 *
 * The child session is used only to read geometry; the selection itself is made
 * by the browser from a real pointer drag. The returned points are in the parent
 * page's viewport coordinates, ready for {@link mouseDrag}.
 * @param {object} page - the page.
 * @param {string} selector - CSS selector of the iframe element.
 * @param {{index?: number, minLength?: number, maxChars?: number, timeoutMs?: number}} [options] - which block to measure.
 * @returns {Promise<{kind: string, url: string, text: string, lines: number, from: object, to: object}>} the drag points.
 */
export async function measureSelectionTargetInFrame(page, selector, options = {}) {
  const minLength = options.minLength ?? 24
  const maxChars = options.maxChars ?? 40
  const wantedIndex = options.index ?? 0
  const timeoutMs = options.timeoutMs ?? 20000
  const frame = await attachChildFrame(page, selector, { timeoutMs })
  try {
    let measured
    try {
      measured = await pollFrame(frame, `(() => {
        const minLength = ${minLength};
        const maxChars = ${maxChars};
        const wantedIndex = ${wantedIndex};
        const candidates = [...document.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, td, th, pre, blockquote')]
          .filter((element) => element.getClientRects().length > 0);
        let index = -1;
        for (const element of candidates) {
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
          const node = walker.nextNode();
          if (!node) continue;
          const raw = node.nodeValue || '';
          const lead = raw.length - raw.replace(/^\\s+/u, '').length;
          const value = raw.slice(lead).replace(/\\s+$/u, '');
          if (value.length < minLength) continue;
          index += 1;
          if (index !== wantedIndex) continue;
          const text = value.slice(0, Math.min(value.length, maxChars));
          const range = document.createRange();
          range.setStart(node, lead);
          range.setEnd(node, lead + text.length);
          const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
          if (rects.length === 0) continue;
          const first = rects[0];
          const last = rects[rects.length - 1];
          return {
            text: range.toString(),
            lines: rects.length,
            from: { x: first.left + 3, y: first.top + first.height / 2 },
            to: { x: last.right - 3, y: last.top + last.height / 2 },
          };
        }
        return null;
      })()`, timeoutMs)
    } catch (error) {
      throw new Error(`could not measure text block ${wantedIndex} inside ${selector}: ${error.message}`)
    }
    return {
      kind: frame.kind,
      url: frame.url,
      text: measured.text,
      lines: measured.lines,
      from: { x: frame.rect.x + measured.from.x, y: frame.rect.y + measured.from.y },
      to: { x: frame.rect.x + measured.to.x, y: frame.rect.y + measured.to.y },
    }
  } finally {
    await frame.detach()
  }
}

/**
 * Read the selection the frame currently holds.
 *
 * Used after a real drag to compare "what the user selected" with "what the
 * composer received", without synthesising anything.
 * @param {object} page - the page.
 * @param {string} selector - CSS selector of the iframe element.
 * @param {{timeoutMs?: number}} [options] - bound.
 * @returns {Promise<string>} the selected text, or ''.
 */
export async function readChildFrameSelection(page, selector, options = {}) {
  const frame = await attachChildFrame(page, selector, { timeoutMs: options.timeoutMs ?? 15000 })
  try {
    const text = await evaluateWithRetry(frame, `(() => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return '';
      return String(selection.getRangeAt(0).toString() || selection.toString() || '');
    })()`, options.timeoutMs ?? 15000)
    return typeof text === 'string' ? text : ''
  } finally {
    await frame.detach()
  }
}

/**
 * Synthetic selection fallback: build a `Range` inside the child frame.
 *
 * A caller that uses this **must** record `selectionDrive: 'synthetic-range'` in
 * the sidecar; it is never reported as a physical drag. The bridge listens for
 * user-driven events, so the synthetic path also dispatches `selectionchange`,
 * `mouseup` and `keyup` on the frame's `window`.
 * @param {object} page - the page.
 * @param {string} selector - CSS selector of the iframe element.
 * @param {string} phrase - literal text to select; it must sit in one text node.
 * @param {{timeoutMs?: number}} [options] - bound.
 * @returns {Promise<{selected: string, kind: string, url: string}>} what was selected.
 */
export async function syntheticRangeInChildFrame(page, selector, phrase, options = {}) {
  const frame = await attachChildFrame(page, selector, { timeoutMs: options.timeoutMs ?? 15000 })
  try {
    const selected = await evaluateWithRetry(frame, `(() => {
      const needle = ${JSON.stringify(phrase)};
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const value = node.nodeValue || '';
        const index = value.indexOf(needle);
        if (index >= 0) {
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + needle.length);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          window.dispatchEvent(new Event('selectionchange'));
          window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          window.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
          return String(range.toString());
        }
        node = walker.nextNode();
      }
      return '';
    })()`, options.timeoutMs ?? 15000)
    return { selected: typeof selected === 'string' ? selected : '', kind: frame.kind, url: frame.url }
  } finally {
    await frame.detach()
  }
}

/**
 * Read the child frame's isolation facts: its origin and whether it can reach
 * the host page. This is the "no host object" assertion, measured inside the
 * frame rather than inferred from the `sandbox` attribute alone.
 * @param {object} page - the page.
 * @param {string} selector - CSS selector of the iframe element.
 * @param {{timeoutMs?: number}} [options] - bound.
 * @returns {Promise<{origin: string, parentReachable: boolean, hostGlobals: string[], canPostToParent: boolean}>} the facts.
 */
export async function readChildFrameIsolation(page, selector, options = {}) {
  const frame = await attachChildFrame(page, selector, { timeoutMs: options.timeoutMs ?? 15000 })
  try {
    return await evaluateWithRetry(frame, `(() => {
      const facts = { origin: String(window.location.origin), parentReachable: false, hostGlobals: [], canPostToParent: false };
      try {
        void window.parent.document.documentElement;
        facts.parentReachable = true;
      } catch (error) {
        facts.parentReachable = false;
      }
      const hostLike = /(__DSH|__dsd|__ModuleLoader__|dshSideQuote|dsh-side-quote)/u;
      facts.hostGlobals = Object.keys(window).filter((key) => hostLike.test(key));
      try {
        window.parent.postMessage({ probe: true }, '*');
        facts.canPostToParent = true;
      } catch (error) {
        facts.canPostToParent = false;
      }
      return facts;
    })()`, options.timeoutMs ?? 15000)
  } finally {
    await frame.detach()
  }
}

/**
 * Reload the page and wait for the app shell to come back.
 * @param {object} page - the page.
 * @param {number} [timeoutMs] - bound.
 */
export async function reloadPage(page, timeoutMs = 30000) {
  const loaded = new Promise((resolve) => {
    const stop = page.client.on((message) => {
      if (message.sessionId === page.sessionId && message.method === 'Page.loadEventFired') {
        stop()
        resolve()
      }
    })
  })
  await page.send('Page.reload', {})
  await Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, timeoutMs))])
  await waitForAppShell(page, timeoutMs)
}

/**
 * Write or delete the persisted takeover switch in the page's `localStorage`.
 *
 * `'on'` stores `'on'`; `'off'` stores a non-`'on'` value (which the product also
 * reads as closed); `null` removes the key entirely. The page is reloaded
 * afterwards, because activation reads the key once per plugin activation.
 * @param {object} page - the page.
 * @param {'on'|'off'|null} value - the wanted stored value.
 * @param {{reload?: boolean}} [options] - skip the reload when false.
 * @returns {Promise<{stored: string|null, reloaded: boolean}>} what the store now holds.
 */
export async function setHtmlTakeover(page, value, options = {}) {
  if (value !== 'on' && value !== 'off' && value !== null) {
    throw new Error(`setHtmlTakeover accepts 'on', 'off' or null, got ${JSON.stringify(value)}`)
  }
  const literal = value === null ? 'null' : JSON.stringify(value)
  const stored = await page.evaluate(`(() => {
    const key = ${JSON.stringify(HTML_TAKEOVER_STORAGE_KEY)};
    const value = ${literal};
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
      return localStorage.getItem(key);
    } catch (error) {
      return 'unavailable:' + String(error);
    }
  })()`)
  const reload = options.reload !== false
  if (reload) await reloadPage(page)
  return { stored: typeof stored === 'string' ? stored : null, reloaded: reload }
}

/**
 * Read one plugin-marked control by its stable `data-*` marker.
 * @param {object} page - the page.
 * @param {string} marker - attribute name.
 * @returns {Promise<{present: boolean, pressed: boolean|null, disabled: boolean|null, hint: string, text: string}>} the state.
 */
async function readMarkedControl(page, marker) {
  return page.evaluate(`(() => {
    const element = [...document.querySelectorAll('[${marker}]')]
      .find((candidate) => candidate.getClientRects().length > 0) || null;
    if (!element) return { present: false, pressed: null, disabled: null, hint: '', text: '' };
    const described = (element.getAttribute('aria-describedby') || '')
      .split(/\\s+/u)
      .filter((id) => id !== '')
      .map((id) => {
        const node = document.getElementById(id);
        return node ? (node.innerText || node.textContent || '') : '';
      })
      .filter((text) => text.trim() !== '');
    const hint = [element.getAttribute('title') || '', element.getAttribute('aria-label') || '', ...described]
      .filter((text) => String(text).trim() !== '')
      .join(' | ')
      .replace(/\\s+/gu, ' ')
      .trim();
    const pressed = element.getAttribute('aria-pressed');
    return {
      present: true,
      pressed: pressed === 'true' ? true : pressed === 'false' ? false : null,
      disabled: element.disabled === true || element.getAttribute('aria-disabled') === 'true',
      hint,
      text: (element.innerText || element.textContent || '').replace(/\\s+/gu, ' ').trim(),
    };
  })()`)
}

/** @param {object} page - the page. @returns {Promise<object>} the takeover toggle state. */
export async function readHtmlToggle(page) {
  return readMarkedControl(page, HTML_MARKERS.toggle)
}

/** @param {object} page - the page. @returns {Promise<object>} the HTML quote-button state. */
export async function readHtmlQuoteButton(page) {
  return readMarkedControl(page, HTML_MARKERS.quote)
}

/**
 * Expression resolving to a plugin-marked control, for {@link activate}.
 * @param {string} marker - attribute name.
 * @returns {string} the expression.
 */
export function markedControlExpression(marker) {
  return `(() => [...document.querySelectorAll('[${marker}]')]
    .find((candidate) => candidate.getClientRects().length > 0) || null)()`
}

/**
 * Wait until a plugin-marked control satisfies the wanted state.
 * @param {object} page - the page.
 * @param {string} marker - attribute name.
 * @param {{present?: boolean, pressed?: boolean, disabled?: boolean}} wanted - expected fields.
 * @param {number} [timeoutMs] - bound.
 * @param {string} [label] - failure label.
 * @returns {Promise<object>} the final state.
 */
export async function waitForMarkedControl(page, marker, wanted = {}, timeoutMs = 25000, label = marker) {
  const deadline = Date.now() + timeoutMs
  let last = { present: false, pressed: null, disabled: null, hint: '', text: '' }
  for (;;) {
    last = await readMarkedControl(page, marker)
    const matches = (wanted.present === undefined || last.present === wanted.present)
      && (wanted.pressed === undefined || last.pressed === wanted.pressed)
      && (wanted.disabled === undefined || last.disabled === wanted.disabled)
    if (matches) return last
    if (Date.now() > deadline) {
      throw new Error(`${label} never matched ${JSON.stringify(wanted)}: ${JSON.stringify(last)}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

/** @param {object} page - the page. @param {object} wanted - expected fields. @param {number} [timeoutMs] - bound. @returns {Promise<object>} the state. */
export async function waitForHtmlToggle(page, wanted = {}, timeoutMs) {
  return waitForMarkedControl(page, HTML_MARKERS.toggle, wanted, timeoutMs, 'the HTML takeover toggle')
}

/** @param {object} page - the page. @param {object} wanted - expected fields. @param {number} [timeoutMs] - bound. @returns {Promise<object>} the state. */
export async function waitForHtmlQuoteButton(page, wanted = {}, timeoutMs) {
  return waitForMarkedControl(page, HTML_MARKERS.quote, wanted, timeoutMs, 'the HTML quote button')
}

/**
 * Read the HTML preview body: which renderer is mounted and each frame's
 * `sandbox` attribute. The observed value is what the sidecar records; nothing
 * here hardcodes `allow-scripts`.
 * @param {object} page - the page.
 * @returns {Promise<{takeover: object[], builtin: object[], body: number}>} the frames.
 */
export async function readHtmlBodyState(page) {
  return page.evaluate(`(() => {
    const visible = (element) => element.getClientRects().length > 0;
    const describe = (element) => ({
      sandbox: element.getAttribute('sandbox'),
      src: element.getAttribute('src'),
      srcdoc: element.hasAttribute('srcdoc'),
    });
    const takeover = [...document.querySelectorAll('[${HTML_MARKERS.frame}]')].filter(visible).map(describe);
    const builtin = [...document.querySelectorAll('[${BUILTIN_HTML_FRAME_MARKER}]')].filter(visible).map(describe);
    return {
      takeover,
      builtin,
      body: [...document.querySelectorAll('[${HTML_MARKERS.body}]')].filter(visible).length,
    };
  })()`)
}

/**
 * Count elements matching a selector.
 * @param {object} page - the page.
 * @param {string} selector - CSS selector.
 * @returns {Promise<number>} the count.
 */
export async function countElements(page, selector) {
  return page.evaluate(`(() => document.querySelectorAll(${JSON.stringify(selector)}).length)()`)
}

/**
 * Wait until a selector matches a wanted number of elements.
 * @param {object} page - the page.
 * @param {string} selector - CSS selector.
 * @param {number} wanted - expected count.
 * @param {{timeoutMs?: number, atLeast?: boolean}} [options] - bound and comparison mode.
 * @returns {Promise<number>} the final count.
 */
export async function waitForElementCount(page, selector, wanted, options = {}) {
  const timeoutMs = options.timeoutMs ?? 20000
  const atLeast = options.atLeast === true
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const count = await countElements(page, selector)
    if (atLeast ? count >= wanted : count === wanted) return count
    if (Date.now() > deadline) {
      throw new Error(`${selector} did not reach ${wanted} element(s) within ${timeoutMs}ms (saw ${count})`)
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

/**
 * Return the notices that appeared after `before`, as a multiset difference.
 * @param {{role: string, text: string}[]} before - the earlier snapshot.
 * @param {{role: string, text: string}[]} after - the later snapshot.
 * @returns {{role: string, text: string}[]} the added notices.
 */
export function noticesAdded(before, after) {
  const remaining = new Map()
  const key = (notice) => `${notice.role}\u0000${notice.text}`
  for (const notice of before) remaining.set(key(notice), (remaining.get(key(notice)) ?? 0) + 1)
  const added = []
  for (const notice of after) {
    const count = remaining.get(key(notice)) ?? 0
    if (count > 0) remaining.set(key(notice), count - 1)
    else added.push(notice)
  }
  return added
}

/**
 * Count the notices on the page that match a predicate.
 * @param {object} page - the page.
 * @param {(notice: {role: string, text: string}) => boolean} [predicate] - acceptance test.
 * @returns {Promise<number>} the count.
 */
export async function countNotices(page, predicate = () => true) {
  return (await readNotices(page)).filter(predicate).length
}

/**
 * Wait until at least `atLeast` notices appeared after a snapshot.
 * @param {object} page - the page.
 * @param {{role: string, text: string}[]} before - the snapshot taken before the action.
 * @param {{atLeast?: number, timeoutMs?: number, label?: string}} [options] - bound and threshold.
 * @returns {Promise<{role: string, text: string}[]>} the added notices.
 */
export async function waitForAddedNotices(page, before, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15000
  const atLeast = options.atLeast ?? 1
  const deadline = Date.now() + timeoutMs
  let added = []
  for (;;) {
    added = noticesAdded(before, await readNotices(page))
    if (added.length >= atLeast) return added
    if (Date.now() > deadline) {
      throw new Error(`no new notice appeared within ${timeoutMs}ms`
        + ` while waiting for ${options.label ?? 'a notice'}; saw ${JSON.stringify(added)}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

/**
 * Wait until the settings dialog reports no open dialog.
 * @param {object} page - the page.
 * @returns {Promise<string>} the expression used.
 */
function settingsDialogExpression() {
  return `(() => document.querySelector('[role="dialog"][aria-modal="true"]') !== null)()`
}

/** @returns {string} expression resolving to the settings close button or null. */
function settingsCloseExpression() {
  return `(() => {
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
    if (!dialog) return null;
    const wanted = ${JSON.stringify(SETTINGS_COPY.close)};
    return [...dialog.querySelectorAll('button')]
      .find((element) => wanted.includes((element.textContent || '').replace(/\\s+/gu, ' ').trim())) || null;
  })()`
}

/** @returns {string} expression resolving to the developer-tools switch or null. */
function developerToolsSwitchExpression() {
  return `(() => {
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
    const scope = dialog || document;
    const wanted = ${JSON.stringify(SETTINGS_COPY.developerTools)};
    return [...scope.querySelectorAll('[role="switch"]')]
      .find((element) => {
        const label = (element.getAttribute('aria-label') || '').trim();
        if (wanted.includes(label)) return true;
        // Fallback for a switch whose primitive renders the label as a hidden
        // text node instead of an accessible name: read its own row.
        const row = element.closest('div');
        const rowText = row === null ? '' : (row.textContent || '').replace(/\\s+/gu, ' ').trim();
        return wanted.some((needle) => rowText.includes(needle));
      }) || null;
  })()`
}

/** @returns {string} expression resolving to that switch's state or null. */
function developerToolsStateExpression() {
  return `(() => {
    const element = ${developerToolsSwitchExpression()};
    if (!element) return null;
    return {
      checked: element.getAttribute('aria-checked') === 'true',
      disabled: element.disabled === true || element.getAttribute('aria-disabled') === 'true',
    };
  })()`
}

/**
 * Open Settings → General and leave the dialog up.
 * @param {object} page - the page.
 * @param {number} timeoutMs - bound.
 */
async function openSettingsGeneral(page, timeoutMs) {
  if ((await page.evaluate(settingsDialogExpression())) === true) return
  // The settings trigger lives in the app shell, which also has to shed the
  // first-load notice before a real pointer can reach anything.
  await waitForAppShell(page, timeoutMs)
  const trigger = `(() => {
    const wanted = ${JSON.stringify(SETTINGS_COPY.trigger)};
    return [...document.querySelectorAll('[aria-label]')]
      .find((element) => wanted.includes((element.getAttribute('aria-label') || '').trim())) || null;
  })()`
  await page.waitFor(`(() => ${trigger} !== null)()`, { timeoutMs, label: 'the settings trigger' })
  await activate(page, trigger, 'the settings trigger')
  await page.waitFor(settingsDialogExpression(), { timeoutMs, label: 'the settings dialog' })
  const general = `(() => {
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
    if (!dialog) return null;
    const wanted = ${JSON.stringify(SETTINGS_COPY.general)};
    return [...dialog.querySelectorAll('button')]
      .find((element) => wanted.includes((element.textContent || '').replace(/\\s+/gu, ' ').trim())) || null;
  })()`
  if ((await page.evaluate(`(() => ${general} !== null)()`)) === true) {
    await activate(page, general, 'the General settings section')
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
}

/**
 * Close the settings dialog if it is open.
 * @param {object} page - the page.
 * @param {{timeoutMs?: number}} [options] - bound.
 * @returns {Promise<boolean>} whether a dialog was open.
 */
export async function closeSettings(page, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15000
  if ((await page.evaluate(settingsDialogExpression())) !== true) return false
  const close = settingsCloseExpression()
  if ((await page.evaluate(`(() => ${close} !== null)()`)) === true) {
    await activate(page, close, 'the settings close button')
  } else {
    await page.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27,
    })
    await page.send('Input.dispatchKeyEvent', {
      type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27,
    })
  }
  await page.waitFor(`(() => ${settingsDialogExpression()} === false)()`, { timeoutMs, label: 'the settings dialog to close' })
  await new Promise((resolve) => setTimeout(resolve, 300))
  return true
}

/**
 * Read the platform script gate (`ui-settings` → developer tools) through the
 * Settings surface, which is the only browser-reachable view of the value.
 * @param {object} page - the page.
 * @param {{timeoutMs?: number}} [options] - bound.
 * @returns {Promise<boolean>} whether page scripts are enabled.
 */
export async function readDeveloperTools(page, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30000
  await openSettingsGeneral(page, timeoutMs)
  const state = await page.evaluate(developerToolsStateExpression())
  await closeSettings(page, { timeoutMs })
  if (state === null) throw new Error('the developer-tools switch is not visible in Settings → General')
  return state.checked
}

/**
 * Assert the platform script gate through the Settings surface.
 *
 * The takeover only registers while this gate is true, so the browser layer has
 * to drive it rather than assume it. Idempotent, and it always closes the dialog
 * again so the preview stays reachable.
 * @param {object} page - the page.
 * @param {boolean} enabled - wanted value.
 * @param {{timeoutMs?: number}} [options] - bound.
 * @returns {Promise<{changed: boolean, enabled: boolean}>} what happened.
 */
export async function setDeveloperTools(page, enabled, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30000
  await openSettingsGeneral(page, timeoutMs)
  const before = await page.evaluate(developerToolsStateExpression())
  if (before === null) {
    throw new Error('the developer-tools switch is not visible in Settings → General')
  }
  if (before.checked === enabled) {
    await closeSettings(page, { timeoutMs })
    return { changed: false, enabled }
  }
  await page.waitFor(`(() => {
    const state = ${developerToolsStateExpression()};
    return state !== null && state.disabled === false;
  })()`, { timeoutMs, label: 'the developer-tools switch to become operable' })
  await activate(page, developerToolsSwitchExpression(), 'the developer-tools switch')
  await page.waitFor(`(() => {
    const state = ${developerToolsStateExpression()};
    return state !== null && state.checked === ${JSON.stringify(enabled)};
  })()`, { timeoutMs, label: `the developer-tools gate to become ${enabled ? 'enabled' : 'disabled'}` })
  await closeSettings(page, { timeoutMs })
  return { changed: true, enabled }
}
