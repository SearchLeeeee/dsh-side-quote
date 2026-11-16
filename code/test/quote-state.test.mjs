/**
 * Unit layer, state half: U-12…U-16 from `core/testing-and-acceptance.md` §2,
 * plus the click-level half of U-08. Contract authority is
 * `core/implementation.md` §4–§8.
 *
 * Written before the implementation on purpose (red → green). Everything here is
 * headless: no DOM, no React, no DSH instance. Timers and event targets are
 * fakes, so the plugin's own wiring is what gets measured.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadClientInternals } from './load-client.mjs'

const { internals } = await loadClientInternals()

const BUTTON = { tag: 'button' }
const ANCHOR = { tag: 'anchor' }
const END_ANCHOR = { tag: 'end-anchor' }
/** The iframe element a bridge capture reports as its source (I001-F02, C-11). */
const WITNESS = { tag: 'witness-frame' }
const PATH = 'notes/a.md'
const SESSION = 'session-1'

/** Manual clock: the debouncer's own coalescing logic is under test, not setTimeout. */
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

/** Minimal DOM stand-in for the selection monitor's listener bookkeeping. */
function createFakeDocument() {
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
    listenerCount() {
      let total = 0
      for (const set of listeners.values()) total += set.size
      return total
    },
    listenerTypes() {
      return [...listeners.entries()].filter(([, set]) => set.size > 0).map(([type]) => type).sort()
    },
  }
}

/**
 * Build `createQuoteActions` dependencies over a controllable fake platform.
 * @param {object} [overrides] - state overrides applied after the defaults;
 *   `adapter` also replaces the registered adapter, which I001-F02 uses to drive
 *   both ownership branches through the real core.
 * @returns {object} the harness.
 */
function createActionHarness(overrides = {}) {
  const { adapter, ...stateOverrides } = overrides
  const timers = createManualTimers()
  const history = internals.createQuoteHistory()
  const registry = internals.createAdapterRegistry()
  registry.register(adapter ?? internals.createTextSelectionAdapter())
  const notifications = []
  const inserted = []
  const state = {
    mounted: SESSION,
    own: { sessionId: SESSION, occurrence: { id: 'occurrence-1' } },
    selection: { sessionId: SESSION, occurrence: { id: 'occurrence-1' } },
    anchor: ANCHOR,
    endAnchor: ANCHOR,
    endSelection: { sessionId: SESSION, occurrence: { id: 'occurrence-1' } },
    endThrows: false,
    selectionText: 'hello',
    workspaceRoot: 'D:/proj',
    scope: { scopeId: 'scope-1' },
    insertResult: true,
    focusedThrows: false,
    insertThrows: false,
    onInsert: undefined,
    witnessTarget: undefined,
    ...stateOverrides,
  }
  const document = {
    getSelection() {
      return { toString: () => state.selectionText, anchorNode: null }
    },
  }
  const deps = {
    t: (key, params) => (params !== undefined && params.path !== undefined ? `${key}|${params.path}` : key),
    debounceMs: internals.DEBOUNCE_MS,
    setTimer: timers.setTimer,
    registry,
    history,
    document: () => document,
    mountedSessionId: () => state.mounted,
    focusedTarget: (element) => {
      if (state.focusedThrows) throw new Error('sidebarRight: tab occurrence is not synced')
      if (element === BUTTON) return state.own
      if (element === ANCHOR) return state.selection
      if (element === END_ANCHOR) {
        if (state.endThrows) throw new Error('sidebarRight: end occurrence is not synced')
        return state.endSelection
      }
      if (element === WITNESS) {
        if (state.witnessTarget === 'throw') throw new Error('sidebarRight: witness tab is not synced')
        return state.witnessTarget
      }
      return undefined
    },
    selectionAnchor: () => state.anchor,
    selectionEnd: () => state.endAnchor,
    sessionScope: () => state.scope,
    inputFor: () => ({
      insertQuote(text, summary) {
        inserted.push({ text, summary })
        if (state.insertThrows) throw new Error('composer disposed')
        return typeof state.onInsert === 'function' ? state.onInsert(text) : state.insertResult
      },
      notify() {},
    }),
    workspaceRoot: () => state.workspaceRoot,
    notify: (level, text) => {
      notifications.push({ level, text })
    },
  }
  const actions = internals.createQuoteActions(deps)
  const detach = actions.attach(BUTTON, PATH)
  return { actions, deps, state, timers, history, registry, notifications, inserted, detach }
}

test('U-12 防抖：连续选区变化只定稿一次，dispose 后不再定稿', () => {
  const timers = createManualTimers()
  let finalized = 0
  const debouncer = internals.createButtonStateDebouncer({
    ms: internals.DEBOUNCE_MS,
    finalize: () => {
      finalized += 1
    },
    setTimer: timers.setTimer,
  })
  assert.equal(internals.DEBOUNCE_MS, 350, 'the contract fixes a 350ms window')

  for (let index = 0; index < 5; index += 1) debouncer.schedule()
  assert.equal(finalized, 0, 'nothing may finalize inside the window')
  assert.equal(timers.pendingCount(), 1, 'a burst must collapse onto one pending timer')
  assert.deepEqual(timers.delays, [350, 350, 350, 350, 350], 'each change restarts the 350ms window')
  timers.fireAll()
  assert.equal(finalized, 1, 'the burst finalizes exactly once')

  debouncer.schedule()
  timers.fireAll()
  assert.equal(finalized, 2, 'a change after the window finalizes on its own')

  debouncer.schedule()
  debouncer.dispose()
  assert.equal(timers.pendingCount(), 0, 'dispose must cancel the pending finalization')
  timers.fireAll()
  assert.equal(finalized, 2, 'a disposed debouncer never finalizes again')
  debouncer.schedule()
  assert.equal(timers.pendingCount(), 0, 'a disposed debouncer must not arm a timer')
})

test('U-13 点击去重：处理中的重复点击只插入一次，结束后可再点', () => {
  let harness
  harness = createActionHarness({
    onInsert() {
      harness.actions.click(BUTTON) // re-entrant click while the first insert is still running
      return true
    },
  })
  const { actions, inserted } = harness

  actions.click(BUTTON)
  assert.equal(inserted.length, 1, 'a click during an in-flight insert must not insert again')
  assert.equal(actions.isBusy(), false, 'the in-flight guard must clear in finally')

  harness.state.onInsert = undefined
  actions.click(BUTTON)
  assert.equal(inserted.length, 2, 'a click after the guard clears must insert again')
  assert.equal(inserted[1].text.startsWith(internals.POINTER_LABEL), true, 'the second quote of one file is a pointer')
})

test('点击闭环：首次原文块、第二次指针块，成功静默', () => {
  const harness = createActionHarness()
  const { actions, inserted, history, notifications } = harness

  actions.click(BUTTON)
  assert.equal(inserted.length, 1)
  assert.equal(inserted[0].text, 'hello\n\n来源：notes/a.md')
  assert.deepEqual(inserted[0].summary, { label: 'a.md', title: 'notes/a.md', detail: '1 行', body: 'hello' })
  assert.equal(history.has(SESSION, 'notes/a.md'), true)
  assert.equal(notifications.length, 0, 'a successful plain quote stays silent')

  actions.click(BUTTON)
  assert.equal(inserted.length, 2)
  assert.equal(inserted[1].text, '已引用过：notes/a.md\n原文未重复贴出；需要时请重新读取该文件。')
  assert.equal(notifications.length, 0)
})

test('敏感文件名命中且插入成功：原样插入并只发一条 info', () => {
  const harness = createActionHarness({ workspaceRoot: 'D:/proj' })
  harness.actions.attach(BUTTON, 'D:\\proj\\.env')
  harness.state.selectionText = 'DEMO_TOKEN=placeholder'
  harness.actions.click(BUTTON)
  assert.equal(harness.inserted.length, 1)
  assert.equal(harness.inserted[0].text, 'DEMO_TOKEN=placeholder\n\n来源：.env')
  assert.equal(harness.notifications.length, 1)
  assert.equal(harness.notifications[0].level, 'info')
  assert.equal(harness.notifications[0].text, 'info.sensitive|.env')
})

test('U-14 失败分支：无屏幕会话、无作用域、空白选区、插入被拒、归属失效、同步抛错', () => {
  // 1. No session on screen: greyed, and a forced click emits one error and inserts nothing.
  const noSession = createActionHarness({ mounted: undefined })
  assert.equal(noSession.actions.stateOf(BUTTON).enabled, false)
  noSession.actions.click(BUTTON)
  assert.equal(noSession.inserted.length, 0)
  assert.equal(noSession.notifications.length, 1)
  assert.equal(noSession.notifications[0].level, 'error')
  assert.equal(noSession.notifications[0].text, 'error.noSession')

  // 2. sessions.scope() answers undefined: the button must already be greyed,
  //    because a state without a session scope cannot be inserted at all.
  const noScope = createActionHarness({ scope: undefined })
  assert.equal(noScope.actions.stateOf(BUTTON).enabled, false, 'no session scope must grey the button')
  noScope.actions.click(BUTTON)
  assert.equal(noScope.inserted.length, 0)
  assert.equal(noScope.notifications.length, 1)
  assert.equal(noScope.notifications[0].level, 'error')
  assert.equal(noScope.notifications[0].text, 'error.noScope')

  // 3. Whitespace-only selection: greyed, forced click emits one error.
  const blank = createActionHarness({ selectionText: '   \n\t ' })
  assert.equal(blank.actions.stateOf(BUTTON).enabled, false)
  blank.actions.click(BUTTON)
  assert.equal(blank.inserted.length, 0)
  assert.equal(blank.notifications.length, 1)
  assert.equal(blank.notifications[0].text, 'error.noSelection')

  // 4. insertQuote answers false (busy composer): one error, no record, button usable again.
  const rejected = createActionHarness({ insertResult: false })
  assert.equal(rejected.actions.stateOf(BUTTON).enabled, true, 'the button is available before the click')
  rejected.actions.click(BUTTON)
  assert.equal(rejected.inserted.length, 1, 'the insert was attempted exactly once')
  assert.equal(rejected.history.size(), 0, 'a rejected insert must not write the record')
  assert.equal(rejected.notifications.length, 1)
  assert.equal(rejected.notifications[0].text, 'error.insertRejected')
  assert.equal(rejected.actions.isBusy(), false)
  assert.equal(rejected.actions.stateOf(BUTTON).enabled, true, 'the button must not stay disabled')

  // 5. The preview closed before the click: ownership fails, one error.
  const stale = createActionHarness({ own: undefined })
  stale.actions.click(BUTTON)
  assert.equal(stale.inserted.length, 0)
  assert.equal(stale.notifications.length, 1)
  assert.equal(stale.notifications[0].text, 'error.ownership')

  // 6. focusedTarget throwing (tab occurrence not yet synced) greys the button instead of throwing.
  const unsynced = createActionHarness({ focusedThrows: true })
  assert.doesNotThrow(() => unsynced.actions.stateOf(BUTTON))
  assert.equal(unsynced.actions.stateOf(BUTTON).enabled, false)
  assert.doesNotThrow(() => unsynced.actions.click(BUTTON))
  assert.equal(unsynced.notifications.length, 1, 'an unsynced target becomes one error, never an escaping exception')
})

test('U-14 附加：readSelection 抛错只发一条 error 且不外泄', () => {
  const harness = createActionHarness()
  const registry = internals.createAdapterRegistry()
  registry.register({
    id: 'throwing',
    match: () => true,
    readSelection() {
      throw new Error('adapter exploded')
    },
  })
  const notifications = []
  const actions = internals.createQuoteActions({
    ...harness.deps,
    registry,
    notify: (level, text) => notifications.push({ level, text }),
  })
  actions.attach(BUTTON, PATH)
  assert.doesNotThrow(() => actions.click(BUTTON))
  assert.equal(notifications.length, 1)
  assert.equal(notifications[0].level, 'error')
  assert.equal(notifications[0].text, 'error.readFailed')
  assert.equal(actions.isBusy(), false)
})

test('U-16 适配器接缝：重复 id 抛错、注销后不再调用、假适配器免改核心可用', () => {
  const registry = internals.createAdapterRegistry()
  const calls = { match: 0, readSelection: 0 }
  const spy = {
    id: 'spy',
    match() {
      calls.match += 1
      return true
    },
    readSelection() {
      calls.readSelection += 1
      return { text: 'spy text', path: 'notes/a.spy' }
    },
  }
  const unregister = registry.register(spy)
  assert.equal(registry.list().length, 1)
  assert.equal(registry.match('notes/a.spy').id, 'spy')
  assert.equal(calls.match, 1)
  assert.throws(() => registry.register({ ...spy }), /spy/u, 'a duplicate id must throw, not overwrite')
  unregister()
  unregister() // idempotent
  assert.equal(registry.list().length, 0)
  assert.equal(registry.match('notes/a.spy'), undefined)
  assert.equal(calls.match, 1, 'an unregistered adapter must not be consulted again')
  assert.equal(calls.readSelection, 0)

  // A fake adapter alone must produce a correct original block: F02 needs no core change.
  const timers = createManualTimers()
  const fakeRegistry = internals.createAdapterRegistry()
  fakeRegistry.register({
    id: 'fake-format',
    match: (path) => path.endsWith('.fake'),
    readSelection: (target) => ({ text: 'fixed excerpt', path: target.path }),
  })
  const inserted = []
  const actions = internals.createQuoteActions({
    t: (key) => key,
    debounceMs: internals.DEBOUNCE_MS,
    setTimer: timers.setTimer,
    registry: fakeRegistry,
    history: internals.createQuoteHistory(),
    document: () => ({ getSelection: () => null }),
    mountedSessionId: () => SESSION,
    focusedTarget: (element) => ((element === BUTTON || element === ANCHOR)
      ? { sessionId: SESSION, occurrence: { id: 'occurrence-1' } }
      : undefined),
    selectionAnchor: () => ANCHOR,
    selectionEnd: () => ANCHOR,
    sessionScope: () => ({}),
    inputFor: () => ({ insertQuote: (text) => { inserted.push(text); return true }, notify() {} }),
    workspaceRoot: () => 'D:/proj',
    notify: () => {},
  })
  actions.attach(BUTTON, 'notes/a.fake')
  actions.click(BUTTON)
  assert.equal(inserted.length, 1)
  assert.equal(inserted[0], 'fixed excerpt\n\n来源：notes/a.fake')
})

/** Fake Cordis context recording what the plugin registers and releases. */
function createFakeContext() {
  const disposers = []
  const registrations = []
  const mountedSubscribers = new Set()
  const timers = new Map()
  let localeRegistrations = 0
  let nextTimer = 1
  const target = (element) => ((element === BUTTON || element === ANCHOR)
    ? { sessionId: SESSION, occurrence: { id: 'occurrence-1' } }
    : undefined)
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
      register(options, component) {
        const entry = { options, component }
        registrations.push(entry)
        return () => {
          const index = registrations.indexOf(entry)
          if (index >= 0) registrations.splice(index, 1)
        }
      },
    },
    locale: {
      register() {
        localeRegistrations += 1
        return () => {
          localeRegistrations -= 1
        }
      },
      bind() {
        return (key) => key
      },
    },
    timer: {
      timeout(callback) {
        const id = nextTimer
        nextTimer += 1
        timers.set(id, callback)
        return () => {
          timers.delete(id)
        }
      },
    },
    sidebarRight: {
      mounted: {
        getSnapshot: () => SESSION,
        subscribe(listener) {
          mountedSubscribers.add(listener)
          return () => {
            mountedSubscribers.delete(listener)
          }
        },
      },
      focusedTarget: target,
    },
    sessions: {
      scope: () => ({}),
      binding: () => ({
        session: { projections: { faceOf: () => ({ getSnapshot: () => 'D:/proj' }) } },
      }),
    },
    conversation: {
      input: {
        for: () => ({ insertQuote: () => true, notify: () => {} }),
      },
    },
  }
  return {
    ctx,
    registrations,
    mountedSubscribers,
    pendingTimers: () => timers.size,
    localeRegistrations: () => localeRegistrations,
    fireTimers() {
      const callbacks = [...timers.values()]
      timers.clear()
      for (const callback of callbacks) callback()
    },
    disposeAll() {
      while (disposers.length > 0) disposers.pop()()
    },
  }
}

test('U-15 清理：装 → 卸一次后监听、定时器、适配器、字典、位点全部归零', () => {
  const fake = createFakeContext()
  const document = createFakeDocument()
  const plugin = internals.applyPlugin(fake.ctx, { document })

  assert.deepEqual(
    document.listenerTypes(),
    ['keyup', 'pointerup', 'selectionchange'],
    'the plugin listens to exactly the three contract events',
  )
  assert.equal(document.listenerCount(), 3)
  assert.equal(plugin.registry.list().length, 1, 'the built-in text adapter is registered')
  // Two actions-slot contributions: the I001-F02 HTML takeover toggle and the F01
  // text button. The toggle is the takeover's only entry point, so it exists even
  // while the takeover itself is off (implementation.md §7).
  assert.deepEqual(
    fake.registrations.map((entry) => entry.options.id).sort(),
    ['side-quote', internals.HTML_TOGGLE_SLOT_ID].sort(),
    'the document actions slot carries one contribution per control',
  )
  assert.deepEqual(
    [...new Set(fake.registrations.map((entry) => entry.options.name))],
    ['sidebar.right.tab.document.actions'],
    'every contribution targets the document actions slot',
  )
  assert.equal(fake.localeRegistrations(), 1, 'the dictionaries are registered once')
  assert.equal(fake.mountedSubscribers.size, 1, 'the on-screen session is observed')

  let finalized = 0
  plugin.actions.subscribe(() => {
    finalized += 1
  })
  plugin.actions.scheduleRefresh()
  assert.equal(fake.pendingTimers(), 1, 'a pending debounce timer exists before teardown')

  fake.disposeAll()

  assert.equal(document.listenerCount(), 0, 'every listener is removed')
  assert.equal(fake.pendingTimers(), 0, 'no timer survives the teardown')
  assert.equal(plugin.registry.list().length, 0, 'the adapter registration is released')
  assert.equal(fake.registrations.length, 0, 'every slot registration is released')
  assert.equal(fake.localeRegistrations(), 0, 'the dictionaries are released')
  assert.equal(fake.mountedSubscribers.size, 0, 'the session subscription is released')
  assert.equal(plugin.history.size(), 0, 'the quoted-file record is cleared with the plugin')

  fake.fireTimers()
  assert.equal(finalized, 0, 'a torn-down plugin never finalizes button state again')
})

test('readSelectionAnchor / readSelectionEndAnchor：两侧都按节点解析', () => {
  const element = { nodeType: 1 }
  const textNode = { nodeType: 3, parentElement: element }
  assert.equal(internals.readSelectionAnchor({ getSelection: () => ({ anchorNode: textNode }) }), element)
  assert.equal(internals.readSelectionAnchor({ getSelection: () => ({ anchorNode: element }) }), element)
  assert.equal(internals.readSelectionAnchor({ getSelection: () => null }), null)
  assert.equal(internals.readSelectionAnchor({ getSelection: () => ({ anchorNode: null }) }), null)
  assert.equal(internals.readSelectionAnchor(undefined), null)

  // The end side prefers the selection's focus node.
  assert.equal(internals.readSelectionEndAnchor({ getSelection: () => ({ focusNode: textNode }) }), element)
  assert.equal(internals.readSelectionEndAnchor({ getSelection: () => ({ focusNode: element }) }), element)
  // Without a focus node it falls back to the range end.
  assert.equal(
    internals.readSelectionEndAnchor({
      getSelection: () => ({ focusNode: null, rangeCount: 1, getRangeAt: () => ({ endContainer: textNode }) }),
    }),
    element,
  )
  // Nothing to resolve is null, never a silent anchor-only answer.
  assert.equal(internals.readSelectionEndAnchor({ getSelection: () => ({ focusNode: null, rangeCount: 0 }) }), null)
  assert.equal(internals.readSelectionEndAnchor(undefined), null)
})

test('选区文本优先经 Range 读取：Selection.toString 为空时仍须读到文字', () => {
  // Observed on the shipped preview: the selection holds a real range while
  // Selection.toString() answers ''. The range is therefore the primary source.
  const adapter = internals.createTextSelectionAdapter()
  const viaRange = {
    rangeCount: 1,
    getRangeAt: () => ({ toString: () => 'range text' }),
    toString: () => '',
  }
  assert.deepEqual(
    adapter.readSelection({ path: 'notes/a.md', document: { getSelection: () => viaRange }, anchor: null }),
    { text: 'range text', path: 'notes/a.md' },
  )

  // A selection with no usable range still falls back to toString().
  const viaString = { rangeCount: 0, toString: () => 'string text' }
  assert.deepEqual(
    adapter.readSelection({ path: 'notes/a.md', document: { getSelection: () => viaString }, anchor: null }),
    { text: 'string text', path: 'notes/a.md' },
  )

  // An empty range falls through to toString(), which may still hold the text.
  const emptyRange = { rangeCount: 1, getRangeAt: () => ({ toString: () => '' }), toString: () => 'fallback text' }
  assert.deepEqual(
    adapter.readSelection({ path: 'notes/a.md', document: { getSelection: () => emptyRange }, anchor: null }),
    { text: 'fallback text', path: 'notes/a.md' },
  )

  // Whitespace only is still "no selection".
  const blank = { rangeCount: 1, getRangeAt: () => ({ toString: () => '  \n ' }), toString: () => '' }
  assert.equal(adapter.readSelection({ path: 'notes/a.md', document: { getSelection: () => blank }, anchor: null }), null)

  // A throwing range read must not escape.
  const throwing = {
    rangeCount: 1,
    getRangeAt: () => {
      throw new Error('range detached')
    },
    toString: () => 'survives',
  }
  assert.deepEqual(
    adapter.readSelection({ path: 'notes/a.md', document: { getSelection: () => throwing }, anchor: null }),
    { text: 'survives', path: 'notes/a.md' },
  )
})

test('U-12 附加：按钮状态由同一预览体内的非空白选区决定', () => {
  const harness = createActionHarness()
  assert.equal(harness.actions.stateOf(BUTTON).enabled, true, 'a non-blank selection in the same preview enables the button')

  harness.state.selection = { sessionId: SESSION, occurrence: { id: 'occurrence-2' } }
  assert.equal(harness.actions.stateOf(BUTTON).enabled, false, 'a selection in another tab instance must grey the button')

  harness.state.selection = { sessionId: SESSION, occurrence: { id: 'occurrence-1' } }
  harness.state.selectionText = ''
  assert.equal(harness.actions.stateOf(BUTTON).enabled, false, 'no selection greys the button')

  harness.state.selectionText = 'hello'
  harness.state.anchor = null
  assert.equal(harness.actions.stateOf(BUTTON).enabled, false, 'a missing selection anchor greys the button')

  harness.state.anchor = ANCHOR
  assert.equal(harness.actions.stateOf(BUTTON).enabled, true, 'the button recovers when the selection returns')

  harness.detach()
  assert.equal(harness.actions.stateOf(BUTTON).enabled, false, 'a detached button is never enabled')
})

test('H-1 归属校验覆盖选区结束侧：跨预览体的选区必须置灰且不插入', () => {
  // Both sides of a single-preview selection stay enabled (no over-greying).
  const same = createActionHarness()
  assert.equal(same.actions.stateOf(BUTTON).enabled, true, 'a selection inside one preview stays enabled')
  same.actions.click(BUTTON)
  assert.equal(same.inserted.length, 1)

  // A selection dragged from this preview into another tab instance: one valid
  // DOM selection, two different occurrences. The button must be greyed and a
  // raced click must refuse, because the excerpt would span two files.
  const cross = createActionHarness({
    endAnchor: END_ANCHOR,
    endSelection: { sessionId: SESSION, occurrence: { id: 'occurrence-2' } },
  })
  assert.equal(cross.actions.stateOf(BUTTON).enabled, false, 'a cross-preview selection must grey the button')
  cross.actions.click(BUTTON)
  assert.equal(cross.inserted.length, 0, 'a cross-preview selection must never insert')
  assert.equal(cross.notifications.length, 1, 'exactly one error notice')
  assert.equal(cross.notifications[0].level, 'error')

  // An end side that resolves to no element greys the button; there is no
  // anchor-only fallback.
  const noEnd = createActionHarness({ endAnchor: null })
  assert.equal(noEnd.actions.stateOf(BUTTON).enabled, false, 'an unresolvable end side must grey the button')
  noEnd.actions.click(BUTTON)
  assert.equal(noEnd.inserted.length, 0)

  // An end side whose occurrence is not synced throws inside the platform; the
  // button is greyed and nothing escapes.
  const throwing = createActionHarness({ endAnchor: END_ANCHOR, endThrows: true })
  assert.doesNotThrow(() => throwing.actions.stateOf(BUTTON))
  assert.equal(throwing.actions.stateOf(BUTTON).enabled, false)
  assert.doesNotThrow(() => throwing.actions.click(BUTTON))
  assert.equal(throwing.inserted.length, 0)
  assert.equal(throwing.notifications.length, 1)
})

test('格式白名单外的路径永远不可用', () => {
  const harness = createActionHarness()
  const pdfButton = { tag: 'pdf-button' }
  harness.actions.attach(pdfButton, 'report.pdf')
  assert.equal(harness.actions.stateOf(pdfButton).enabled, false)
  harness.actions.click(pdfButton)
  assert.equal(harness.inserted.length, 0)
})

/* -------------------------------------------------------------------------- *
 * I001-F02 seam extension: U-21 (two ownership branches) and U-22 (target shape)
 * -------------------------------------------------------------------------- */

/** An adapter that answers from a bridge, i.e. it reports the iframe it read. */
function createWitnessAdapter(witness) {
  return {
    id: 'html-bridge-probe',
    match: (path) => path.endsWith('.html'),
    readSelection: (target) => ({ text: 'rendered text', path: target.path, witness }),
  }
}

test('U-21 接缝两条归属分支：有 witness 只比 occurrence，无 witness 仍走三元素校验', () => {
  // (1) The bridge branch needs no parent-document selection at all: both boundary
  //     elements are absent and the button is still usable. This is the whole point
  //     of the seam extension (implementation.md §6.1–§6.2).
  const bridged = createActionHarness({
    adapter: createWitnessAdapter(WITNESS),
    anchor: null,
    endAnchor: null,
    witnessTarget: { sessionId: SESSION, occurrence: { id: 'occurrence-1' } },
  })
  bridged.actions.attach(BUTTON, 'samples/page.html')
  assert.equal(bridged.actions.stateOf(BUTTON).enabled, true, 'a witnessed capture must not require a parent selection')
  bridged.actions.click(BUTTON)
  assert.equal(bridged.inserted.length, 1)
  assert.equal(bridged.inserted[0].text, 'rendered text\n\n来源：samples/page.html')

  // (2) The branches are independent: a foreign parent-document selection does not
  //     veto a capture whose witness is in the button's own tab occurrence.
  const asymmetric = createActionHarness({
    adapter: createWitnessAdapter(WITNESS),
    selection: { sessionId: SESSION, occurrence: { id: 'occurrence-2' } },
    endSelection: { sessionId: SESSION, occurrence: { id: 'occurrence-2' } },
    witnessTarget: { sessionId: SESSION, occurrence: { id: 'occurrence-1' } },
  })
  asymmetric.actions.attach(BUTTON, 'samples/page.html')
  assert.equal(asymmetric.actions.stateOf(BUTTON).enabled, true, 'the witness branch must not read the parent selection')

  // (3) A witness in another tab occurrence greys the button and refuses the insert.
  const foreign = createActionHarness({
    adapter: createWitnessAdapter(WITNESS),
    anchor: null,
    endAnchor: null,
    witnessTarget: { sessionId: SESSION, occurrence: { id: 'occurrence-2' } },
  })
  foreign.actions.attach(BUTTON, 'samples/page.html')
  assert.equal(foreign.actions.stateOf(BUTTON).enabled, false, 'a foreign witness must grey the button')
  foreign.actions.click(BUTTON)
  assert.equal(foreign.inserted.length, 0)
  assert.equal(foreign.history.size(), 0, 'a refused quote must not write the record')
  assert.equal(foreign.notifications.length, 1, 'exactly one error notice')
  assert.equal(foreign.notifications[0].level, 'error')

  // (4) focusedTarget(witness) throwing is a refusal, never an escaping exception.
  const throwing = createActionHarness({
    adapter: createWitnessAdapter(WITNESS),
    anchor: null,
    endAnchor: null,
    witnessTarget: 'throw',
  })
  throwing.actions.attach(BUTTON, 'samples/page.html')
  assert.doesNotThrow(() => throwing.actions.stateOf(BUTTON))
  assert.equal(throwing.actions.stateOf(BUTTON).enabled, false)
  assert.doesNotThrow(() => throwing.actions.click(BUTTON))
  assert.equal(throwing.inserted.length, 0)
  assert.equal(throwing.notifications.length, 1)

  // (5) A witness that resolves to no page target is a refusal too.
  const unresolved = createActionHarness({
    adapter: createWitnessAdapter(WITNESS),
    anchor: null,
    endAnchor: null,
    witnessTarget: undefined,
  })
  unresolved.actions.attach(BUTTON, 'samples/page.html')
  assert.equal(unresolved.actions.stateOf(BUTTON).enabled, false, 'an unresolvable witness must grey the button')
  unresolved.actions.click(BUTTON)
  assert.equal(unresolved.inserted.length, 0)
  assert.equal(unresolved.notifications.length, 1)
})

test('U-22 target 形状：path/document/anchor/tab，occurrenceId 允许 undefined', () => {
  const seen = []
  const probe = {
    id: 'shape-probe',
    match: () => true,
    readSelection: (target) => {
      seen.push(target)
      return { text: 'probe text', path: target.path }
    },
  }
  const harness = createActionHarness({ adapter: probe, anchor: null, endAnchor: null })
  // This capture carries no witness, so the state is greyed; the shape is still observed.
  assert.equal(harness.actions.stateOf(BUTTON).enabled, false)
  assert.equal(seen.length, 1)
  const target = seen[0]
  assert.equal(target.path, PATH)
  assert.equal(target.anchor, null, 'the parent selection anchor may be absent for a bridge capture')
  assert.equal(typeof target.document, 'object')
  assert.deepEqual(target.tab, { sessionId: SESSION, occurrenceId: 'occurrence-1' })

  harness.actions.click(BUTTON)
  assert.equal(seen.length, 2, 'the click path reads the selection again')
  assert.deepEqual(seen[1].tab, { sessionId: SESSION, occurrenceId: 'occurrence-1' })

  // No own occurrence: the shape still carries the tab, with `occurrenceId` undefined.
  const unsynced = createActionHarness({ adapter: probe, own: { sessionId: SESSION } })
  unsynced.actions.stateOf(BUTTON)
  assert.deepEqual(
    seen[seen.length - 1].tab,
    { sessionId: SESSION, occurrenceId: undefined },
    'an unsynced tab occurrence must be reported as undefined, never invented',
  )
})
