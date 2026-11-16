/**
 * Unit layer, HTML takeover half: U-26…U-31 from
 * `core/testing-and-acceptance.md` §2 (plus the U-20 whitelist guard and the
 * header-control / body structure from `core/implementation.md` §4, §5.1, §7).
 *
 * U-26…U-31 and the header-control / body-component cases were added after the
 * implementation was wired (regression coverage); U-23…U-25 and part of the
 * structure cases in `html-bridge.test.mjs` were written first (red → green).
 * No red → green output was kept for either batch. Everything here is headless:
 * fake window, fake storage, fake blob-URL factory, manual clock and a minimal
 * hook runtime, so no browser and no DSH instance are involved.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { loadClientInternals } from './load-client.mjs'

const { internals } = await loadClientInternals()

const SESSION = 'session-1'
const KEY = internals.HTML_TAKEOVER_STORAGE_KEY
const BUTTON = { tag: 'html-quote-button' }
const FRAME = { tag: 'html-frame', contentWindow: { tag: 'frame-window' } }
const OTHER_FRAME = { tag: 'other-frame', contentWindow: { tag: 'other-window' } }
const THIRD_FRAME = { tag: 'third-frame', contentWindow: { tag: 'third-window' } }

/** Manual clock: the ready deadline is asserted, not waited on. */
function createManualTimers() {
  let nextId = 1
  const pending = new Map()
  const delays = []
  return {
    setTimer(callback, delay) {
      const id = nextId
      nextId += 1
      delays.push(delay)
      pending.set(id, callback)
      return () => {
        pending.delete(id)
      }
    },
    fireAll() {
      const callbacks = [...pending.values()]
      pending.clear()
      for (const callback of callbacks) callback()
    },
    pendingCount() {
      return pending.size
    },
    delays,
  }
}

/** Minimal window: message listener bookkeeping plus manual dispatch. */
function createFakeWindow() {
  const listeners = new Map()
  return {
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type).add(handler)
    },
    removeEventListener(type, handler) {
      const set = listeners.get(type)
      if (set !== undefined) set.delete(handler)
    },
    dispatch(type, event) {
      for (const handler of [...(listeners.get(type) ?? [])]) handler(event)
    },
    listenerCount() {
      let total = 0
      for (const set of listeners.values()) total += set.size
      return total
    },
  }
}

/**
 * A `localStorage`-shaped store whose reads and writes can be denied.
 * @param {Record<string, string>} [initial] - starting entries.
 * @param {{getThrows?: boolean, setThrows?: boolean}} [options] - denial switches.
 * @returns {object} the fake store.
 */
function createFakeStorage(initial = {}, options = {}) {
  const entries = new Map(Object.entries(initial))
  return {
    entries,
    getItem(key) {
      if (options.getThrows === true) throw new Error('storage denied')
      return entries.has(key) ? entries.get(key) : null
    },
    setItem(key, value) {
      if (options.setThrows === true) throw new Error('storage denied')
      entries.set(key, String(value))
    },
  }
}

/** Blob-URL factory that counts creations and releases. */
function createFakeUrl() {
  const created = []
  const revoked = []
  let next = 1
  return {
    created,
    revoked,
    createObjectURL(blob) {
      const url = `blob:side-quote/${next}`
      next += 1
      created.push({ url, blob })
      return url
    },
    revokeObjectURL(url) {
      revoked.push(url)
    },
  }
}

/**
 * The script gate snapshot, with manual notification.
 * @param {boolean} initialOpen - the starting value.
 * @returns {object} the fake service plus its control seam.
 */
function createFakeConfigForms(initialOpen) {
  const listeners = new Set()
  const state = { value: initialOpen === undefined ? true : initialOpen }
  function notifyAll() {
    for (const listener of [...listeners]) listener()
  }
  return {
    state,
    notifyAll,
    service: {
      developerTools: {
        enabled: {
          getSnapshot: () => state.value,
          subscribe(listener) {
            listeners.add(listener)
            return () => {
              listeners.delete(listener)
            }
          },
        },
      },
    },
    /** Change the accepted value and notify, exactly like the platform preference. */
    set(value) {
      state.value = value
      notifyAll()
    },
    subscriberCount() {
      return listeners.size
    },
  }
}

/**
 * Build a fake Cordis context plus its injectable browser host.
 * @param {object} [options] - `gateOpen`, `storage`, `mounted` overrides.
 * @returns {object} the harness.
 */
function createFakeContext(options = {}) {
  const disposers = []
  const definitions = new Map()
  const registrations = []
  const notifications = []
  const inserted = []
  const timers = createManualTimers()
  const window = createFakeWindow()
  const url = createFakeUrl()
  const storage = options.storage === undefined ? createFakeStorage({ [KEY]: internals.HTML_TAKEOVER_ON }) : options.storage
  const configForms = createFakeConfigForms(options.gateOpen)
  const targets = new WeakMap([[BUTTON, { sessionId: SESSION, occurrence: { id: 'occurrence-1' } }]])
  const ctx = {
    effect(callback) {
      const dispose = callback()
      if (typeof dispose === 'function') disposers.push(dispose)
      return () => {}
    },
    slots: {
      inject(key, callback) {
        const dispose = callback()
        return typeof dispose === 'function' ? dispose : () => {}
      },
      register(slotOptions, component) {
        const entry = { options: slotOptions, component }
        registrations.push(entry)
        return () => {
          const index = registrations.indexOf(entry)
          if (index >= 0) registrations.splice(index, 1)
        }
      },
    },
    documentPreviews: {
      // The platform throws on a duplicate id, so the fake must too (plan §2.2 item 2).
      register(definition) {
        if (definitions.has(definition.id)) {
          throw new Error(`documentPreviews: duplicate implementation "${definition.id}"`)
        }
        definitions.set(definition.id, definition)
        return () => {
          definitions.delete(definition.id)
        }
      },
    },
    configForms: configForms.service,
    locale: {
      register() {
        return () => {}
      },
      bind() {
        return (key) => key
      },
    },
    timer: { timeout: timers.setTimer },
    sidebarRight: {
      mounted: {
        getSnapshot: () => (options.mounted === undefined ? SESSION : options.mounted),
        subscribe() {
          return () => {}
        },
      },
      focusedTarget: (element) => targets.get(element),
    },
    sessions: {
      scope: () => ({ scopeId: 'scope-1' }),
      binding: () => ({ session: { projections: { faceOf: () => ({ getSnapshot: () => 'D:/proj' }) } } }),
    },
    conversation: {
      input: {
        for: () => ({
          insertQuote(text, summary) {
            inserted.push({ text, summary })
            return true
          },
          notify(level, text) {
            notifications.push({ level, text })
          },
        }),
      },
    },
  }
  const host = { window, storage, url }
  return {
    ctx,
    host,
    window,
    url,
    storage,
    configForms,
    timers,
    definitions,
    registrations,
    notifications,
    inserted,
    targets,
    /** Release every effect in reverse registration order, as Cordis does. */
    disposeAll() {
      while (disposers.length > 0) disposers.pop()()
    },
  }
}

const registrationsOf = (env, id) => env.registrations.filter((entry) => entry.options.id === id)
const bodyRegistrations = (env) => env.registrations.filter((entry) => entry.options.key === internals.HTML_BODY_ID)
const toggleRegistrations = (env) => registrationsOf(env, internals.HTML_TOGGLE_SLOT_ID)
const quoteRegistrations = (env) => registrationsOf(env, internals.HTML_QUOTE_SLOT_ID)

/**
 * Minimal hook runtime: enough of React to render one function component, run its
 * effects and re-render. Supported hooks are exactly the ones the bundle uses
 * (`useState` / `useRef` / `useEffect` / `createElement`).
 * @returns {{react: object, mount: Function, unmount: Function}} the runtime.
 */
function createHookReact() {
  const state = []
  const refs = []
  const deps = []
  const cleanups = []
  let cursor = 0
  let effects = []
  let dirty = false
  const react = {
    createElement(type, props, ...children) {
      return { type, props: props === null || props === undefined ? {} : props, children }
    },
    useState(initial) {
      const index = cursor
      cursor += 1
      if (index >= state.length) state[index] = typeof initial === 'function' ? initial() : initial
      const set = (value) => {
        state[index] = typeof value === 'function' ? value(state[index]) : value
        dirty = true
      }
      return [state[index], set]
    },
    useRef(initial) {
      const index = cursor
      cursor += 1
      if (index >= refs.length) refs[index] = { current: initial }
      return refs[index]
    },
    useEffect(callback, dependencies) {
      const index = cursor
      cursor += 1
      effects.push({ index, callback, dependencies })
    },
  }
  const sameDeps = (left, right) => left !== undefined && right !== undefined
    && left.length === right.length && left.every((value, index) => value === right[index])
  function applyRefs(element) {
    if (element === null || element === undefined || typeof element !== 'object') return
    const ref = element.props.ref
    if (ref !== null && ref !== undefined && typeof ref === 'object') ref.current = element
    for (const child of element.children ?? []) applyRefs(child)
  }
  function mount(component, props) {
    let element = null
    for (let pass = 0; pass < 5; pass += 1) {
      cursor = 0
      effects = []
      dirty = false
      element = component(props)
      applyRefs(element)
      for (const effect of effects) {
        if (sameDeps(deps[effect.index], effect.dependencies)) continue
        deps[effect.index] = effect.dependencies
        if (typeof cleanups[effect.index] === 'function') cleanups[effect.index]()
        const cleanup = effect.callback()
        cleanups[effect.index] = typeof cleanup === 'function' ? cleanup : null
      }
      if (!dirty) break
    }
    return element
  }
  function unmount() {
    for (let index = cleanups.length - 1; index >= 0; index -= 1) {
      const cleanup = cleanups[index]
      cleanups[index] = null
      if (typeof cleanup === 'function') cleanup()
    }
  }
  return { react, mount, unmount }
}

/* -------------------------------------------------------------------------- *
 * U-20 — the whitelist guard this Feature must not weaken
 * -------------------------------------------------------------------------- */

test('U-20 白名单不变（护栏）：html/htm 永不命中文本白名单', () => {
  assert.equal(internals.ALLOWED_SUFFIXES.includes('html'), false)
  assert.equal(internals.ALLOWED_SUFFIXES.includes('htm'), false)
  assert.deepEqual(internals.ALLOWED_FILENAMES, ['.env'])
  for (const path of ['x.html', 'x.htm', 'page.HTML', 'page.HTM', 'D:\\work\\index.html', 'notes/a.htm']) {
    assert.equal(internals.isAllowedPath(path), false, `${path} must never be quotable through the text whitelist`)
  }
  // …while the HTML predicate claims exactly those, and nothing else.
  for (const path of ['x.html', 'x.htm', 'page.HTML', 'page.HTM']) {
    assert.equal(internals.matchesHtmlPreviewPath(path), true)
  }
  for (const path of ['x.md', 'x.html.txt', 'xtml', 'htm', '', 'x.htmx']) {
    assert.equal(internals.matchesHtmlPreviewPath(path), false)
  }
})

/* -------------------------------------------------------------------------- *
 * U-26 — the gate state machine
 * -------------------------------------------------------------------------- */

test('U-26 闸门状态机：闸门假不注册，变真自动接管，变假回落且偏好保持为开', () => {
  const env = createFakeContext({ gateOpen: false })
  const plugin = internals.applyPlugin(env.ctx, env.host)

  // persistedOn=true + gateOpen=false: nothing of the takeover is registered.
  assert.equal(env.definitions.size, 0, 'no definition while the gate is closed')
  assert.equal(bodyRegistrations(env).length, 0, 'no body while the gate is closed')
  assert.equal(quoteRegistrations(env).length, 0, 'no quote button while the gate is closed')
  assert.equal(env.window.listenerCount(), 0, 'no message listener while the gate is closed')
  assert.equal(toggleRegistrations(env).length, 1, 'the toggle is the entry point and always exists')
  assert.equal(plugin.html.snapshot().effective, false)
  assert.deepEqual(plugin.html.snapshot(), {
    persistedOn: true, gateOpen: false, effective: false, disabled: true,
  })

  // The gate opens: exactly one of each item, and a repeat notification changes nothing.
  env.configForms.set(true)
  assert.equal(env.definitions.size, 1)
  assert.equal(bodyRegistrations(env).length, 1)
  assert.equal(quoteRegistrations(env).length, 1)
  assert.equal(env.window.listenerCount(), 1)
  assert.equal(plugin.registry.list().length, 2, 'the text adapter and the HTML adapter')
  env.configForms.set(true)
  env.configForms.notifyAll()
  assert.equal(env.definitions.size, 1, 'a repeated notification must not re-register')
  assert.equal(bodyRegistrations(env).length, 1)
  assert.equal(quoteRegistrations(env).length, 1)
  assert.equal(env.window.listenerCount(), 1)

  const definition = env.definitions.get(internals.HTML_BODY_ID)
  assert.deepEqual(definition.extensions, ['html', 'htm'])
  assert.equal(definition.priority, 'extension', 'an external implementation must outrank the builtin')
  assert.equal(definition.loading, 'bytes-complete')
  assert.equal(definition.wrap, false)
  assert.equal(typeof definition.title, 'function')

  // The gate closes: everything is released, and the user's choice is untouched.
  env.configForms.set(false)
  assert.equal(env.definitions.size, 0)
  assert.equal(bodyRegistrations(env).length, 0)
  assert.equal(quoteRegistrations(env).length, 0)
  assert.equal(env.window.listenerCount(), 0, 'the message listener is removed')
  assert.equal(plugin.registry.list().length, 1, 'the HTML adapter is unregistered')
  assert.equal(plugin.html.snapshot().persistedOn, true, 'the preference must never be turned off silently')
  assert.equal(env.storage.entries.get(KEY), 'on')
  assert.equal(toggleRegistrations(env).length, 1)

  // Reopening re-takes over automatically.
  env.configForms.set(true)
  assert.equal(env.definitions.size, 1)
  assert.equal(plugin.html.snapshot().effective, true)
})

/* -------------------------------------------------------------------------- *
 * U-27 — persistence is fail-closed
 * -------------------------------------------------------------------------- */

test('U-27 持久化 fail-closed：缺失、非法、读写抛错一律关闭且不外泄', () => {
  for (const value of [null, '', 'off', 'ON ', '1', 'on ']) {
    const storage = createFakeStorage(value === null ? {} : { [KEY]: value })
    const env = createFakeContext({ storage, gateOpen: true })
    const plugin = internals.applyPlugin(env.ctx, env.host)
    assert.equal(plugin.html.snapshot().persistedOn, false, `${JSON.stringify(value)} must read as off`)
    assert.equal(env.definitions.size, 0, 'a closed preference must not register anything')
    assert.equal(toggleRegistrations(env).length, 1)
  }

  // A denied read (private mode) is closed, and wiring does not throw.
  const denied = createFakeStorage({}, { getThrows: true })
  const deniedEnv = createFakeContext({ storage: denied, gateOpen: true })
  let deniedPlugin
  assert.doesNotThrow(() => {
    deniedPlugin = internals.applyPlugin(deniedEnv.ctx, deniedEnv.host)
  })
  assert.equal(deniedPlugin.html.snapshot().persistedOn, false)
  assert.equal(deniedEnv.definitions.size, 0)
  assert.doesNotThrow(() => deniedPlugin.html.toggle())

  // A refused write still moves the visual state; the next read stays closed.
  const readOnly = createFakeStorage({}, { setThrows: true })
  const readOnlyEnv = createFakeContext({ storage: readOnly, gateOpen: true })
  const readOnlyPlugin = internals.applyPlugin(readOnlyEnv.ctx, readOnlyEnv.host)
  assert.doesNotThrow(() => readOnlyPlugin.html.toggle())
  assert.equal(readOnlyPlugin.html.snapshot().persistedOn, true, 'the visual state follows the click')
  assert.equal(readOnlyEnv.definitions.size, 1, 'the takeover engages even when the write is refused')
  assert.equal(readOnly.entries.has(KEY), false, 'the refused write left no value behind')
  const reloaded = createFakeContext({ storage: readOnly, gateOpen: true })
  const reloadedPlugin = internals.applyPlugin(reloaded.ctx, reloaded.host)
  assert.equal(reloadedPlugin.html.snapshot().persistedOn, false, 'a reload reads the store again and stays closed')

  // No storage at all is closed, and still writable in memory.
  const noneEnv = createFakeContext({ storage: null, gateOpen: true })
  const nonePlugin = internals.applyPlugin(noneEnv.ctx, noneEnv.host)
  assert.equal(nonePlugin.html.snapshot().persistedOn, false)
  assert.doesNotThrow(() => nonePlugin.html.toggle())
  assert.equal(nonePlugin.html.snapshot().persistedOn, true)

  // A host with no browser seams at all still wires without throwing.
  const bare = createFakeContext({ gateOpen: true })
  assert.doesNotThrow(() => internals.applyPlugin(bare.ctx, {}))
})

/* -------------------------------------------------------------------------- *
 * U-28 — every count returns to zero
 * -------------------------------------------------------------------------- */

test('U-28 开启/关闭/卸载的计数：注册、监听、缓存、blob 全部归零', () => {
  const env = createFakeContext({ gateOpen: true })
  const plugin = internals.applyPlugin(env.ctx, env.host)
  assert.equal(plugin.html.snapshot().effective, true, 'the stored preference plus an open gate takes over')
  assert.equal(env.definitions.size, 1)
  assert.equal(bodyRegistrations(env).length, 1)
  assert.equal(quoteRegistrations(env).length, 1)
  assert.equal(toggleRegistrations(env).length, 1)
  assert.equal(env.window.listenerCount(), 1)
  assert.equal(plugin.registry.list().length, 2)

  // A mounted frame creates and releases a blob URL through the takeover surface.
  const source = plugin.html.createFrameSource(new TextEncoder().encode('<!doctype html><p>hi</p>'))
  assert.equal(source.failed, false)
  assert.equal(env.url.created.length, 1)
  assert.equal(typeof source.url, 'string')
  const detach = plugin.html.attachFrame(FRAME)
  assert.equal(env.timers.pendingCount(), 1, 'mounting a frame arms its deadline')
  plugin.html.releaseFrameSource(source)
  detach()
  assert.equal(env.url.revoked.length, 1, 'the blob URL is revoked')
  assert.equal(env.timers.pendingCount(), 0, 'unmounting cancels the deadline')

  // Turning the takeover off releases the effective set only.
  plugin.html.toggle()
  assert.equal(env.definitions.size, 0)
  assert.equal(bodyRegistrations(env).length, 0)
  assert.equal(quoteRegistrations(env).length, 0)
  assert.equal(toggleRegistrations(env).length, 1, 'the entry point stays')
  assert.equal(env.window.listenerCount(), 0)
  assert.equal(plugin.registry.list().length, 1)
  assert.equal(env.storage.entries.get(KEY), internals.HTML_TAKEOVER_OFF)

  // Unloading the plugin releases the rest.
  env.disposeAll()
  assert.equal(env.definitions.size, 0)
  assert.deepEqual(env.registrations, [], 'every slot registration is released')
  assert.equal(env.window.listenerCount(), 0)
  assert.equal(plugin.registry.list().length, 0)
  assert.equal(env.configForms.subscriberCount(), 0, 'the gate subscription is released')
  assert.equal(env.url.revoked.length, env.url.created.length, 'no blob URL survives')

  // 装 → 开 → 卸 without an explicit close: the same zero state and no notice.
  const direct = createFakeContext({ gateOpen: true })
  const directPlugin = internals.applyPlugin(direct.ctx, direct.host)
  assert.equal(directPlugin.html.snapshot().effective, true)
  directPlugin.html.attachFrame(FRAME)
  assert.equal(direct.timers.pendingCount(), 1)
  direct.disposeAll()
  assert.equal(direct.definitions.size, 0)
  assert.deepEqual(direct.registrations, [])
  assert.equal(direct.window.listenerCount(), 0)
  assert.equal(directPlugin.registry.list().length, 0)
  assert.equal(direct.timers.pendingCount(), 0, 'unloading clears the bridge cache and its deadlines')
  assert.deepEqual(direct.notifications, [], 'an implicit unload must not emit notices')
  assert.equal(directPlugin.html.attachFrame(OTHER_FRAME)(), undefined, 'a disposed takeover detaches inertly')
})

/* -------------------------------------------------------------------------- *
 * U-28 (W-2) — the unmount path itself releases the blob, unarmed by the test
 * -------------------------------------------------------------------------- */

test('U-28 附加：正文组件的卸载路径自己释放 blob，测试不手动调用 releaseFrameSource', () => {
  const env = createFakeContext({ gateOpen: true })
  const plugin = internals.applyPlugin(env.ctx, env.host)
  const hooks = createHookReact()
  const Body = internals.createHtmlBodyComponent(hooks.react, { html: plugin.html, t: (key) => key })
  const tree = hooks.mount(Body, { content: { kind: 'bytes', data: new TextEncoder().encode('<!doctype html><p>hi</p>') } })
  assert.equal(tree.type, 'div')
  assert.equal(env.url.created.length, 1, 'the body component created one source')
  assert.equal(env.url.revoked.length, 0, 'the test never releases the source itself')

  // The fake host owns no React renderer, so the tree's cleanup is registered as
  // an effect: `disposeAll()` then runs exactly what slot removal runs on unload.
  env.ctx.effect(() => () => {
    hooks.unmount()
  })
  env.disposeAll()
  assert.equal(env.url.created.length >= 1, true, 'at least one blob URL must have been created')
  assert.equal(env.url.revoked.length, env.url.created.length, 'the implementation path must revoke every created URL')
  assert.equal(env.url.revoked[0], env.url.created[0].url, 'the revoked URL is the one the component created')
})

/* -------------------------------------------------------------------------- *
 * U-29 — notice budget
 * -------------------------------------------------------------------------- */

test('U-29 通知预算：自检各分支恰一条，桥降级按页目标去重且不占点击预算', () => {
  // Success: exactly one info.
  const success = createFakeContext({ storage: createFakeStorage({}), gateOpen: true })
  const successPlugin = internals.applyPlugin(success.ctx, success.host)
  assert.deepEqual(success.notifications, [], 'wiring the plugin is not a user action')
  successPlugin.html.toggle()
  assert.equal(success.notifications.length, 1)
  assert.equal(success.notifications[0].level, 'info')
  assert.equal(success.notifications[0].text, 'info.htmlEnabled')

  // Gate closed: exactly one error naming the gate.
  const closed = createFakeContext({ storage: createFakeStorage({}), gateOpen: false })
  const closedPlugin = internals.applyPlugin(closed.ctx, closed.host)
  closedPlugin.html.toggle()
  assert.equal(closed.notifications.length, 1)
  assert.equal(closed.notifications[0].level, 'error')
  assert.equal(closed.notifications[0].text, 'error.htmlGateUnavailable')
  assert.equal(closed.definitions.size, 0)

  // Turning the takeover off is silent.
  const off = createFakeContext({ gateOpen: true })
  const offPlugin = internals.applyPlugin(off.ctx, off.host)
  assert.equal(offPlugin.html.snapshot().effective, true)
  offPlugin.html.toggle()
  assert.deepEqual(off.notifications, [], 'turning off must not add a notice')

  // A registration that fails while the gate is open is not the gate's fault:
  // exactly one error, and it names the takeover rather than Developer tools.
  const broken = createFakeContext({ storage: createFakeStorage({}), gateOpen: true })
  broken.ctx.documentPreviews.register = () => {
    throw new Error('documentPreviews: registration refused')
  }
  const brokenPlugin = internals.applyPlugin(broken.ctx, broken.host)
  assert.equal(brokenPlugin.html.snapshot().effective, false, 'a failed registration leaves the takeover off')
  brokenPlugin.html.toggle()
  assert.equal(broken.notifications.length, 1, 'a failed self-check stays at exactly one notice')
  assert.equal(broken.notifications[0].level, 'error')
  assert.equal(broken.notifications[0].text, 'error.htmlTakeoverFailed')
  assert.equal(broken.definitions.size, 0, 'the failed open must unwind its definition')
  assert.equal(broken.window.listenerCount(), 0, 'the failed open must unwind its bridge listener')

  // Bridge timeout: one info per page target, never repeated for the same page.
  const failing = createFakeContext({ gateOpen: true })
  const failingPlugin = internals.applyPlugin(failing.ctx, failing.host)
  failing.targets.set(FRAME, { sessionId: SESSION, occurrence: { id: 'occurrence-1' } })
  failingPlugin.html.attachFrame(FRAME)
  failing.timers.fireAll()
  assert.equal(failing.notifications.length, 1)
  assert.equal(failing.notifications[0].level, 'info')
  assert.equal(failing.notifications[0].text, 'info.htmlBridgeUnavailable')

  failing.targets.set(OTHER_FRAME, { sessionId: SESSION, occurrence: { id: 'occurrence-1' } })
  failingPlugin.html.attachFrame(OTHER_FRAME)
  failing.timers.fireAll()
  assert.equal(failing.notifications.length, 1, 'one status notice per page target')

  failing.targets.set(THIRD_FRAME, { sessionId: SESSION, occurrence: { id: 'occurrence-2' } })
  failingPlugin.html.attachFrame(THIRD_FRAME)
  failing.timers.fireAll()
  assert.equal(failing.notifications.length, 2, 'a different page target gets its own notice')

  // The status notice does not consume the click budget: one forced click still
  // produces exactly its own single error.
  failingPlugin.actions.attach(BUTTON, 'samples/page.html')
  failingPlugin.actions.click(BUTTON)
  assert.equal(failing.notifications.length, 3, 'the click adds exactly one notice')
  assert.equal(failing.notifications[2].level, 'error')
  assert.equal(failing.notifications[2].text, 'error.noSelection')
})

/* -------------------------------------------------------------------------- *
 * U-30 — additive-only structure
 * -------------------------------------------------------------------------- */

test('U-30 “只加不减”结构断言：新增恰好一个适配器、一个正文、一个引用按钮、一个开关', () => {
  const env = createFakeContext({ gateOpen: true })
  const plugin = internals.applyPlugin(env.ctx, env.host)

  const adapters = plugin.registry.list()
  assert.equal(adapters.length, 2, 'one text adapter plus one HTML adapter')
  assert.deepEqual(adapters.map((adapter) => adapter.id), [internals.TEXT_ADAPTER_ID, internals.HTML_ADAPTER_ID])
  assert.equal(new Set(adapters.map((adapter) => adapter.id)).size, 2, 'adapter ids stay unique')

  const bodies = env.registrations.filter((entry) => entry.options.key !== undefined)
  assert.equal(bodies.length, 1, 'exactly one body contribution')
  assert.equal(bodies[0].options.key, internals.HTML_BODY_ID)
  assert.equal(bodies[0].options.name, 'sidebar.right.tab.document')
  assert.equal(env.definitions.has(bodies[0].options.key), true, 'the body key must be the registered definition id')

  assert.equal(quoteRegistrations(env).length, 1, 'exactly one quote button contribution')
  assert.equal(toggleRegistrations(env).length, 1, 'exactly one toggle contribution')
  assert.equal(quoteRegistrations(env)[0].options.name, 'sidebar.right.tab.document.actions')
  assert.equal(toggleRegistrations(env)[0].options.name, 'sidebar.right.tab.document.actions')
  const slotIds = env.registrations.filter((entry) => entry.options.id !== undefined).map((entry) => entry.options.id)
  assert.equal(new Set(slotIds).size, slotIds.length, 'slot ids must stay unique')

  // The F01 text adapter keeps its identity, its whitelist answer and its shape.
  const text = adapters.find((adapter) => adapter.id === internals.TEXT_ADAPTER_ID)
  assert.equal(text.id, 'text-selection')
  assert.equal(text.match('notes/a.md'), true)
  assert.equal(text.match('samples/page.html'), false, 'the text adapter never claims HTML while taking over')
  assert.equal(text.readSelection({ path: 'notes/a.md', document: { getSelection: () => null }, anchor: null }), null)

  plugin.html.toggle()
  assert.equal(plugin.html.snapshot().effective, false)
  const after = plugin.registry.list().find((adapter) => adapter.id === internals.TEXT_ADAPTER_ID)
  assert.equal(after.match('notes/a.md'), true)
  assert.equal(after.match('samples/page.html'), false, 'the text adapter never claims HTML with the takeover off')
  assert.deepEqual(internals.ALLOWED_FILENAMES, ['.env'])
  assert.equal(internals.ALLOWED_SUFFIXES.includes('html'), false)
  assert.equal(internals.ALLOWED_SUFFIXES.includes('htm'), false)
})

/* -------------------------------------------------------------------------- *
 * U-31 — dictionary keys
 * -------------------------------------------------------------------------- */

test('U-31 中英字典：新增键集合完全一致，内容文案不在字典中', () => {
  const { LOCALES } = internals
  const zh = Object.keys(LOCALES.zh).sort()
  const en = Object.keys(LOCALES.en).sort()
  assert.deepEqual(zh, en, 'zh and en must declare the same keys')
  const added = zh.filter((key) => /^(?:html\.|info\.html|error\.html)/u.test(key))
  assert.deepEqual(added, [
    'error.htmlGateUnavailable',
    'error.htmlTakeoverFailed',
    'html.failed',
    'html.frame',
    'html.quoteButton',
    'html.quoteTooltip',
    'html.toggleGateReason',
    'html.toggleLabel',
    'html.toggleTooltip',
    'html.viewerTitle',
    'info.htmlBridgeUnavailable',
    'info.htmlEnabled',
  ], 'the I001-F02 key set must be complete in both dictionaries')

  // Content copy belongs to the quote text, never to the UI dictionary.
  const contentCopy = ['来源：', '已引用过', '原文未重复贴出', '摘录已截断', '行（已截断）']
  for (const [locale, dictionary] of Object.entries(LOCALES)) {
    for (const [key, value] of Object.entries(dictionary)) {
      assert.equal(typeof value, 'string', `${locale}.${key} must be a string`)
      for (const needle of contentCopy) {
        assert.equal(value.includes(needle), false, `${locale}.${key} must not carry content copy (${needle})`)
      }
    }
  }
})

/* -------------------------------------------------------------------------- *
 * Header controls (implementation.md §7) and the takeover body (§5.1)
 * -------------------------------------------------------------------------- */

test('头部开关位点：只在 HTML 路径渲染、aria-pressed 反映偏好、闸门假时禁用并说明原因', () => {
  // persistedOn=true + gateOpen=false → on, disabled, explains the gate.
  const locked = createFakeContext({ gateOpen: false })
  const lockedPlugin = internals.applyPlugin(locked.ctx, locked.host)
  const lockedHooks = createHookReact()
  const LockedToggle = internals.createHtmlToggleComponent(lockedHooks.react, {
    html: lockedPlugin.html,
    t: (key) => key,
  })
  const lockedTree = lockedHooks.mount(LockedToggle, { absolutePath: 'samples/page.html' })
  assert.equal(lockedTree.type, 'button')
  assert.equal(lockedTree.props['data-side-quote-html-toggle'], '')
  assert.equal(lockedTree.props['aria-pressed'], 'true', 'aria-pressed reflects the persisted choice')
  assert.equal(lockedTree.props.disabled, true, 'a closed gate makes the toggle unavailable')
  assert.equal(lockedTree.props.title, 'html.toggleGateReason', 'a disabled control must say why')

  // The reason must also reach assistive technology: a `disabled` control's
  // `title` tooltip is browser behaviour, `aria-describedby` is not.
  const descriptionId = lockedTree.props['aria-describedby']
  assert.equal(typeof descriptionId, 'string', 'a disabled toggle must describe itself')
  assert.notEqual(descriptionId, '')
  assert.equal(descriptionId.startsWith('side-quote-html-toggle-reason-'), true)
  const description = lockedTree.children.find(
    (child) => typeof child === 'object' && child !== null && child.props !== undefined && child.props.id === descriptionId,
  )
  assert.notEqual(description, undefined, 'the described element must be in the same render output')
  assert.equal(description.type, 'span')
  assert.equal(description.children[0], 'html.toggleGateReason', 'the description carries the same translated reason')
  assert.deepEqual(description.props.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
  }, 'the description is visually hidden inline, without a stylesheet')

  // A second mounted toggle must not reuse the first one's description id.
  const secondHooks = createHookReact()
  const SecondToggle = internals.createHtmlToggleComponent(secondHooks.react, { html: lockedPlugin.html, t: (key) => key })
  const secondTree = secondHooks.mount(SecondToggle, { absolutePath: 'samples/page.html' })
  assert.notEqual(secondTree.props['aria-describedby'], descriptionId, 'each toggle describes itself under its own id')

  assert.equal(lockedHooks.mount(LockedToggle, { absolutePath: 'notes/a.md' }), null, 'the toggle is HTML-only')
  assert.equal(lockedHooks.mount(LockedToggle, { absolutePath: 'report.pdf' }), null)

  // persistedOn=false → clickable even while the gate is closed, and the click only
  // writes the preference (plus the single self-check notice).
  const off = createFakeContext({ storage: createFakeStorage({}), gateOpen: false })
  const offPlugin = internals.applyPlugin(off.ctx, off.host)
  const offHooks = createHookReact()
  const OffToggle = internals.createHtmlToggleComponent(offHooks.react, { html: offPlugin.html, t: (key) => key })
  const offTree = offHooks.mount(OffToggle, { absolutePath: 'samples/page.htm' })
  assert.equal(offTree.props['aria-pressed'], 'false')
  assert.equal(offTree.props.disabled, false, 'turning the preference on must stay possible')
  assert.equal(offTree.props.title, 'html.toggleTooltip')
  assert.equal(offTree.props['aria-describedby'], undefined, 'an enabled toggle has no reason to describe')
  assert.equal(offTree.children.length, 1, 'an enabled toggle carries its label only')
  offTree.props.onClick()
  assert.equal(off.notifications.length, 1)
  assert.equal(off.notifications[0].text, 'error.htmlGateUnavailable')
  assert.equal(offPlugin.html.snapshot().persistedOn, true)
  assert.equal(off.storage.entries.get(KEY), internals.HTML_TAKEOVER_ON)
})

test('HTML 引用按钮变体：HTML-only、无选区即置灰、mousedown 不吞点击', () => {
  const env = createFakeContext({ gateOpen: true })
  const plugin = internals.applyPlugin(env.ctx, env.host)
  const hooks = createHookReact()
  const Quote = internals.createHtmlQuoteButtonComponent(hooks.react, { actions: plugin.actions, t: (key) => key })

  const tree = hooks.mount(Quote, { absolutePath: 'samples/page.html' })
  assert.equal(tree.type, 'button')
  assert.equal(tree.props['data-side-quote-html-quote'], '')
  assert.equal(tree.props.disabled, true, 'no selection means greyed')
  assert.equal(tree.props.title, 'html.quoteTooltip')
  assert.equal(tree.props['aria-label'], 'html.quoteButton')
  let prevented = false
  tree.props.onMouseDown({
    preventDefault() {
      prevented = true
    },
  })
  assert.equal(prevented, true, 'mousedown must be cancelled so the in-frame selection survives the click')

  assert.equal(hooks.mount(Quote, { absolutePath: 'notes/a.md' }), null, 'the text whitelist keeps its own button')
  assert.equal(hooks.mount(Quote, { absolutePath: 'report.pdf' }), null)

  // The same component structure the F01 button uses: a single text child.
  assert.equal(tree.children.length, 1)
})

test('正文接管组件：严格解码、blob 承载、只 allow-scripts、失败行不建桥', () => {
  const env = createFakeContext({ gateOpen: true })
  const plugin = internals.applyPlugin(env.ctx, env.host)
  const hooks = createHookReact()
  const Body = internals.createHtmlBodyComponent(hooks.react, { html: plugin.html, t: (key) => key })

  const page = '<!doctype html><p>hello</p>'
  const tree = hooks.mount(Body, { content: { kind: 'bytes', data: new TextEncoder().encode(page) } })
  assert.equal(tree.type, 'div')
  assert.equal(tree.props['data-side-quote-html'], '')
  const frame = tree.children[0]
  assert.equal(frame.type, 'iframe')
  assert.equal(frame.props['data-side-quote-html-frame'], '')
  assert.equal(frame.props.sandbox, 'allow-scripts', 'the sandbox must carry exactly allow-scripts')
  assert.equal(Object.hasOwn(frame.props, 'srcDoc'), false, 'srcDoc would resolve relative URLs against the DSH origin')
  assert.equal(String(frame.props.src).startsWith('blob:'), true, 'the page is carried by a blob URL')
  assert.equal(env.url.created.length, 1)
  assert.equal(env.url.created[0].blob.type, 'text/html')
  assert.equal(env.window.listenerCount(), 1, 'mounting the iframe joins the bridge')
  assert.equal(env.timers.pendingCount(), 1, 'mounting the iframe arms its deadline')

  hooks.unmount()
  assert.equal(env.url.revoked.length, 1, 'unmounting revokes the blob URL')
  assert.equal(env.timers.pendingCount(), 0, 'unmounting detaches the frame and its deadline')

  // Invalid UTF-8 renders the failure line: no bridge, no blob, no excerpt.
  const broken = createHookReact()
  const BrokenBody = internals.createHtmlBodyComponent(broken.react, { html: plugin.html, t: (key) => key })
  const failed = broken.mount(BrokenBody, { content: { kind: 'bytes', data: Uint8Array.from([0xff, 0xfe]) } })
  assert.equal(failed.type, 'p')
  assert.equal(failed.props.role, 'alert')
  assert.equal(failed.props['data-side-quote-html'], '')
  assert.equal(env.url.created.length, 1, 'a decode failure must not create a blob URL')
  assert.equal(env.timers.pendingCount(), 0, 'a decode failure must not arm a bridge deadline')
  broken.unmount()

  // Non-byte delivery renders nothing at all.
  assert.equal(broken.mount(BrokenBody, { content: { kind: 'text', text: 'x' } }), null)
  assert.equal(broken.mount(BrokenBody, { content: undefined }), null)
})

test('沙箱护栏：产品代码绝不把 allow-same-origin 交给页面', async () => {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  assert.equal(source.includes('allow-same-origin'), false, 'the opaque origin is the trust boundary (C-10)')
  assert.equal(source.includes('srcDoc'), false, 'srcDoc is the one carrier the contract forbids')
})

test('桥上报即是选区事件：父文档收不到 iframe 事件时按钮仍须重新定稿并可按路径插入', () => {
  const env = createFakeContext({ gateOpen: true })
  const plugin = internals.applyPlugin(env.ctx, env.host)
  plugin.actions.attach(BUTTON, 'samples/page.html')
  env.targets.set(FRAME, { sessionId: SESSION, occurrence: { id: 'occurrence-1' } })
  const detach = plugin.html.attachFrame(FRAME)

  let finalized = 0
  plugin.actions.subscribe(() => {
    finalized += 1
  })
  assert.equal(plugin.actions.stateOf(BUTTON).enabled, false, 'nothing reported yet')

  // The parent receives no pointer or key event here: only the bridge report exists.
  const message = (data) => env.window.dispatch('message', { source: FRAME.contentWindow, origin: 'null', data })
  message({ channel: internals.HTML_BRIDGE_CHANNEL, version: internals.HTML_BRIDGE_VERSION, kind: 'ready' })
  assert.deepEqual(
    env.timers.delays,
    [internals.HTML_BRIDGE_READY_TIMEOUT_MS, internals.DEBOUNCE_MS],
    'ready cancels the deadline and restarts the button-state window',
  )
  assert.equal(finalized, 0, 'the contract debounce runs before the state finalizes')
  env.timers.fireAll()
  assert.equal(finalized, 1, 'a ready frame finalizes the button state once')

  message({ channel: internals.HTML_BRIDGE_CHANNEL, version: internals.HTML_BRIDGE_VERSION, kind: 'selection', text: 'rendered text' })
  env.timers.fireAll()
  assert.equal(finalized, 2, 'a reported selection finalizes the button state again')
  assert.equal(plugin.actions.stateOf(BUTTON).enabled, true, 'a reported selection makes the button available')

  plugin.actions.click(BUTTON)
  assert.equal(env.inserted.length, 1, 'the click inserts through the HTML adapter')
  assert.equal(env.inserted[0].text, 'rendered text\n\n来源：samples/page.html')
  detach()
})
