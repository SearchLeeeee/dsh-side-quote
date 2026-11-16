/**
 * Zero-dependency browser driver for the I001-F01 end-to-end layer.
 *
 * Plain Node 24: global `fetch` and global `WebSocket`, no npm package, no
 * runtime dependency, nothing shipped in the artifact (`files` excludes `test`).
 *
 * Environment facts come from outside this repository:
 *   - `SIDE_QUOTE_E2E_BASE_URL`  the isolated DSH instance (default http://127.0.0.1:3181)
 *   - `SIDE_QUOTE_E2E_CDP`       a Chromium DevTools endpoint (`ws://…` or `http://host:port`)
 *   - `SIDE_QUOTE_E2E_EVIDENCE_DIR`  where screenshots and their sidecars are written
 *   - `SIDE_QUOTE_E2E_PROFILE`   optional; the profile name recorded in the sidecars
 *   - `SIDE_QUOTE_E2E_ALLOW_LIVE`  optional escape hatch for the live-port guard
 *
 * A missing driver or a missing instance makes the suites `skip`, never pass.
 * Every interaction below goes through public, human-visible affordances —
 * visible text, `aria-label`, `placeholder`, roles — and real mouse/key input.
 * No builtin plugin data attribute, CSS-module class or DOM hierarchy is used.
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
export const SKIP_LIVE_INSTANCE = '拒绝对 live 端口 3081 运行端到端用例'

/** Fixed viewport, so every screenshot can name the size it was taken at. */
export const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }

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
    consoleErrors: console_.errors,
    send,
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
     * Read the viewport centre of a page-side element expression.
     * @param {string} expression - expression resolving to an Element or null.
     * @returns {Promise<{x: number, y: number}|null>} the point.
     */
    async centerOf(expression) {
      return page.evaluate(`(() => {
        const element = ${expression};
        if (!element) return null;
        element.scrollIntoView({ block: 'center', inline: 'center' });
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      })()`)
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
     * bind the image to a build, an instance and a viewport.
     * @param {string} name - case id, used as the file stem.
     * @param {{evidenceDir: string, baseUrl: string, port: string, profile: string}} evidence - run identity.
     * @returns {Promise<string>} the written image path.
     */
    async screenshot(name, evidence) {
      if (evidence === undefined || evidence.evidenceDir === '') {
        throw new Error(`${SKIP_NO_EVIDENCE_DIR}：${name} 无法写出证据`)
      }
      const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      await mkdir(evidence.evidenceDir, { recursive: true })
      const path = join(evidence.evidenceDir, `${name}.png`)
      await writeFile(path, Buffer.from(data, 'base64'))
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
 * Disable this plugin through the visible plugin inventory.
 *
 * The inventory exposes each installed plugin as a `[role="switch"]` whose
 * `aria-label` names the plugin, so the control is found by role + label and the
 * resulting state is read back from `aria-checked`.
 * @param {object} page - the page.
 * @param {string} pluginId - the package name shown in the inventory.
 * @param {{timeoutMs?: number}} [options] - bound.
 * @returns {Promise<string>} the activation path used for the switch.
 */
export async function disablePlugin(page, pluginId, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30000
  const inventory = clickableByText(['插件', 'Plugins'])
  if ((await page.evaluate(`(() => ${inventory} !== null)()`)) !== true) {
    throw new Error('the plugin inventory entry is not visible')
  }
  await activate(page, inventory, 'the plugin inventory entry')
  const switchExpression = `(() => {
    const id = ${JSON.stringify(pluginId)};
    return [...document.querySelectorAll('[role="switch"]')]
      .find((element) => (element.getAttribute('aria-label') || '').includes(id)) || null;
  })()`
  await page.waitFor(`(() => ${switchExpression} !== null)()`, {
    timeoutMs,
    label: `the enable switch for ${pluginId}`,
  })
  const path = await activate(page, switchExpression, `the enable switch for ${pluginId}`)
  await page.waitFor(`(() => {
    const id = ${JSON.stringify(pluginId)};
    const element = [...document.querySelectorAll('[role="switch"]')]
      .find((candidate) => (candidate.getAttribute('aria-label') || '').includes(id));
    return element === null || element.getAttribute('aria-checked') === 'false';
  })()`, { timeoutMs, label: `${pluginId} to report itself disabled` })
  return path
}
