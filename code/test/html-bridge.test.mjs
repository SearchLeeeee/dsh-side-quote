/**
 * Unit layer, HTML bridge half: U-23, U-24 and U-25 from
 * `core/testing-and-acceptance.md` §2, plus the bootstrap (§5.2), the strict
 * UTF-8 decode (§5.1) and the adapter's frame selection (§6.2) from
 * `core/implementation.md`.
 *
 * Written before the implementation on purpose (red → green). Everything here is
 * headless: a fake window, fake iframes and a manual clock. No browser, no DSH
 * instance, no React.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadClientInternals } from './load-client.mjs'

const { internals } = await loadClientInternals()

const CHANNEL = internals.HTML_BRIDGE_CHANNEL
const VERSION = internals.HTML_BRIDGE_VERSION
const MAX_TEXT = internals.HTML_BRIDGE_MAX_TEXT
const SESSION = 'session-1'

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

const readyMessage = () => ({ channel: CHANNEL, version: VERSION, kind: 'ready' })
const selectionMessage = (text) => ({ channel: CHANNEL, version: VERSION, kind: 'selection', text })
const errorMessage = () => ({ channel: CHANNEL, version: VERSION, kind: 'error' })

/**
 * Build a bridge over a fake window with two fake frames.
 * @param {object} [options] - `readyTimeoutMs` override.
 * @returns {object} the harness.
 */
function createBridgeHarness(options = {}) {
  const window = createFakeWindow()
  const timers = createManualTimers()
  const failures = []
  const bridge = internals.createHtmlBridge({
    window,
    setTimer: timers.setTimer,
    readyTimeoutMs: options.readyTimeoutMs,
    onFailure: (reason, frame) => {
      failures.push({ reason, frame })
    },
  })
  const frame = { tag: 'frame-a', contentWindow: { tag: 'window-a' } }
  const other = { tag: 'frame-b', contentWindow: { tag: 'window-b' } }
  /**
   * Dispatch one message event as the browser would deliver it.
   * @param {object} target - the frame the message pretends to come from.
   * @param {unknown} data - the message payload.
   * @param {object} [overrides] - source/origin overrides.
   */
  function post(target, data, overrides = {}) {
    window.dispatch('message', {
      source: overrides.source === undefined ? target.contentWindow : overrides.source,
      origin: overrides.origin === undefined ? 'null' : overrides.origin,
      data,
    })
  }
  return { window, timers, failures, bridge, frame, other, post }
}

test('U-23 报文校验：合法报文被接受，其余一律静默丢弃且不清空已有文本', () => {
  const env = createBridgeHarness()
  const detach = env.bridge.attach(env.frame)
  assert.equal(env.window.listenerCount(), 1, 'the bridge owns exactly one message listener')

  // kind: ready
  env.post(env.frame, readyMessage())
  assert.deepEqual(
    env.bridge.stateOf(env.frame),
    { ready: true, text: '', failed: false, unmounted: false },
    'a ready frame carries no text yet',
  )
  assert.equal(env.bridge.isUsable(env.frame), true)
  assert.equal(env.bridge.textOf(env.frame), '')

  // kind: selection, and the newest one wins
  env.post(env.frame, selectionMessage('first excerpt'))
  assert.equal(env.bridge.textOf(env.frame), 'first excerpt')
  env.post(env.frame, selectionMessage('second excerpt'))
  assert.equal(env.bridge.textOf(env.frame), 'second excerpt', 'each selection overwrites the previous value')

  // exactly at the transport guard
  env.post(env.frame, selectionMessage('y'.repeat(MAX_TEXT)))
  assert.equal(env.bridge.textOf(env.frame).length, MAX_TEXT, 'the guard admits exactly its limit')

  // kind: error marks the frame, does not notify by itself and keeps the text
  env.post(env.frame, errorMessage())
  assert.equal(env.failures.length, 1)
  assert.equal(env.failures[0].reason, 'error')
  assert.equal(env.failures[0].frame, env.frame)
  assert.equal(env.bridge.stateOf(env.frame).failed, true)
  assert.equal(env.bridge.isUsable(env.frame), false, 'a failed bridge cannot be quoted')

  // a later ready restores usability (U-25 recovery, same frame, no remount)
  env.post(env.frame, readyMessage())
  assert.equal(env.bridge.isUsable(env.frame), true, 'a later ready recovers the frame')
  assert.equal(env.bridge.stateOf(env.frame).failed, false)

  const rejected = [
    { label: '通道不符', data: { channel: 'other/channel', version: VERSION, kind: 'selection', text: 'x' } },
    { label: '版本不符', data: { channel: CHANNEL, version: VERSION + 1, kind: 'selection', text: 'x' } },
    { label: 'kind 非法', data: { channel: CHANNEL, version: VERSION, kind: 'paste', text: 'x' } },
    { label: 'text 非字符串', data: { channel: CHANNEL, version: VERSION, kind: 'selection', text: 42 } },
    {
      label: 'text 超长',
      data: { channel: CHANNEL, version: VERSION, kind: 'selection', text: 'x'.repeat(MAX_TEXT + 1) },
    },
    { label: 'data 为 null', data: null },
    { label: 'data 为数字', data: 7 },
    { label: 'data 为数组', data: [] },
    { label: 'origin 不是 null', data: selectionMessage('x'), overrides: { origin: 'https://example.test' } },
    { label: 'source 不是该 iframe', data: selectionMessage('x'), overrides: { source: { tag: 'foreign-window' } } },
  ]
  for (const entry of rejected) {
    assert.doesNotThrow(() => env.post(env.frame, entry.data, entry.overrides ?? {}), `U-23 ${entry.label} 不得抛错`)
  }
  assert.equal(env.bridge.textOf(env.frame).length, MAX_TEXT, 'rejected messages must never clear usable text')
  assert.equal(env.failures.length, 1, 'rejected messages must never be reported as failures')

  detach()
  assert.equal(env.bridge.stateOf(env.frame), undefined, 'unmounting removes the frame entry')
  env.post(env.frame, selectionMessage('after unmount'))
  assert.equal(env.bridge.textOf(env.frame), '', 'an unmounted frame keeps no text')
})

test('U-24 桥状态按 iframe 隔离：互不串文本，卸载即删除条目', () => {
  const env = createBridgeHarness()
  const detachA = env.bridge.attach(env.frame)
  const detachB = env.bridge.attach(env.other)
  assert.deepEqual(env.bridge.frames(), [env.frame, env.other], 'state is keyed by the iframe element')
  assert.equal(env.timers.pendingCount(), 2, 'every frame arms one ready deadline')

  env.post(env.frame, readyMessage())
  env.post(env.other, readyMessage())
  assert.equal(env.timers.pendingCount(), 0, 'ready ends the deadline')

  env.post(env.frame, selectionMessage('from A'))
  env.post(env.other, selectionMessage('from B'))
  assert.equal(env.bridge.textOf(env.frame), 'from A')
  assert.equal(env.bridge.textOf(env.other), 'from B', 'two frames of one file stay independent')

  // A message from B must never land in A, even when it is otherwise valid.
  env.post(env.frame, selectionMessage('for A only'))
  assert.equal(env.bridge.textOf(env.other), 'from B')

  detachA()
  assert.equal(env.bridge.stateOf(env.frame), undefined)
  assert.equal(env.bridge.textOf(env.other), 'from B', 'releasing one frame keeps the other')

  // Unmounting a frame that never reported ready cancels its deadline.
  const third = { tag: 'frame-c', contentWindow: { tag: 'window-c' } }
  const detachC = env.bridge.attach(third)
  assert.equal(env.timers.pendingCount(), 1)
  detachC()
  assert.equal(env.timers.pendingCount(), 0, 'unmounting cancels the pending deadline')

  detachB()
  assert.deepEqual(env.bridge.frames(), [])
  assert.equal(env.window.listenerCount(), 1, 'the message listener outlives single frames')

  env.bridge.dispose()
  assert.equal(env.window.listenerCount(), 0, 'dispose removes the message listener')
  assert.deepEqual(env.bridge.frames(), [], 'dispose clears every entry')
})

test('U-25 就绪超时 4000ms 与恢复', () => {
  assert.equal(internals.HTML_BRIDGE_READY_TIMEOUT_MS, 4000, 'the contract fixes a 4000ms deadline')

  const env = createBridgeHarness()
  env.bridge.attach(env.frame)
  assert.deepEqual(env.timers.delays, [4000], 'the deadline is the contract value')
  assert.equal(env.bridge.isUsable(env.frame), false, 'a frame is unusable until it reports ready')

  env.timers.fireAll()
  assert.equal(env.failures.length, 1, 'a silent frame reports exactly one failure')
  assert.equal(env.failures[0].reason, 'timeout')
  assert.equal(env.failures[0].frame, env.frame)
  assert.equal(env.bridge.isUsable(env.frame), false)

  // A ready after the deadline recovers the frame without remounting it.
  env.post(env.frame, readyMessage())
  assert.equal(env.bridge.isUsable(env.frame), true, 'a late ready restores usability')
  assert.equal(env.bridge.stateOf(env.frame).unmounted, false)

  // A frame that reports in time never reaches the deadline.
  const timely = createBridgeHarness()
  timely.bridge.attach(timely.frame)
  timely.post(timely.frame, readyMessage())
  timely.timers.fireAll()
  assert.deepEqual(timely.failures, [], 'an on-time ready must not report a failure')

  // error then ready also recovers.
  const recovered = createBridgeHarness()
  recovered.bridge.attach(recovered.frame)
  recovered.post(recovered.frame, readyMessage())
  recovered.post(recovered.frame, errorMessage())
  assert.equal(recovered.bridge.isUsable(recovered.frame), false)
  recovered.post(recovered.frame, readyMessage())
  assert.equal(recovered.bridge.isUsable(recovered.frame), true)

  // Disposing cancels the pending deadline: no late notice for a dead bridge.
  const disposed = createBridgeHarness()
  disposed.bridge.attach(disposed.frame)
  disposed.bridge.dispose()
  assert.equal(disposed.timers.pendingCount(), 0)
  disposed.timers.fireAll()
  assert.deepEqual(disposed.failures, [], 'a disposed bridge must not report a timeout')
})

test('桥引导脚本：预写注入、页面 JSON 嵌入并对 </script> 转义、不引用任何宿主能力', () => {
  const page = '<!doctype html><html><body><h1>标题</h1><p onclick="x()">段落</p></body></html>'
  const bootstrap = internals.createHtmlBootstrap(page)
  assert.equal(
    bootstrap.startsWith('<!doctype html><meta charset="utf-8"><script>'),
    true,
    'the outer document is the contract shape',
  )
  assert.equal(bootstrap.includes('</script>'), true, 'the outer script must be closed')

  const embedded = /const page=("(?:[^"\\]|\\.)*")\n/u.exec(bootstrap)
  assert.notEqual(embedded, null, 'the page must be embedded as one JSON literal')
  assert.equal(JSON.parse(embedded[1]), page, 'the payload must round-trip losslessly')
  assert.equal(/<\/script/iu.test(embedded[1]), false, 'no `</script` may survive inside the payload')

  const escaping = internals.createHtmlBootstrap('</script><script>alert(1)</script>')
  const escaped = /const page=("(?:[^"\\]|\\.)*")\n/u.exec(escaping)
  assert.notEqual(escaped, null)
  assert.equal(JSON.parse(escaped[1]), '</script><script>alert(1)</script>', 'the escape must stay lossless')
  assert.equal(/<\/script/iu.test(escaped[1]), false)

  // Capture-phase window listeners, installed before the page is written.
  assert.equal(bootstrap.includes('window.addEventListener("selectionchange",report,true)'), true)
  assert.equal(bootstrap.includes('window.addEventListener("mouseup",report,true)'), true)
  assert.equal(bootstrap.includes('window.addEventListener("keyup",report,true)'), true)
  assert.equal(bootstrap.includes('Document.prototype.getSelection'), true, 'the selection reader is snapshotted')
  assert.equal(bootstrap.includes('window.parent.postMessage'), true, 'the bridge reports to the parent only')
  assert.equal(bootstrap.indexOf('kind:"ready"') < bootstrap.indexOf('document.open()'), true, 'ready precedes the page write')
  assert.equal(bootstrap.includes('document.open()'), true)
  assert.equal(bootstrap.includes('document.write(page)'), true)
  assert.equal(bootstrap.includes('document.close()'), true)
  assert.equal(bootstrap.includes('kind:"error"'), true, 'script failures are reported, never thrown out')

  // The bridge may not reach any host capability.
  const forbidden = ['insertQuote', 'sidebarRight', 'configForms', 'documentPreviews', 'require(', '__ModuleLoader__', 'localStorage']
  for (const needle of forbidden) {
    assert.equal(bootstrap.includes(needle), false, `the bootstrap must not reference ${needle}`)
  }
  assert.equal(/<script\s+src/iu.test(bootstrap), false, 'no external script may be referenced')
  assert.equal(/<script>[\s\S]*<script>/u.test(bootstrap), false, 'the outer document carries exactly one script')
})

test('页面字节按 UTF-8 严格解码：非法字节按渲染失败处理', () => {
  assert.throws(() => internals.decodeHtmlBytes(Uint8Array.from([0xff, 0xfe, 0x00])), 'invalid UTF-8 must throw')
  assert.equal(
    internals.decodeHtmlBytes(new TextEncoder().encode('<!doctype html>你好')),
    '<!doctype html>你好',
    'valid UTF-8 decodes unchanged',
  )
})

/* -------------------------------------------------------------------------- *
 * The adapter half of U-24: which frame a capture comes from
 * -------------------------------------------------------------------------- */

/**
 * Build the adapter over a real bridge and a controllable page-target resolver.
 * @returns {object} the harness.
 */
function createAdapterHarness() {
  const env = createBridgeHarness()
  const targets = new Map()
  const adapter = internals.createHtmlQuoteAdapter({
    bridge: env.bridge,
    focusedTarget: (element) => {
      const target = targets.get(element)
      if (target === 'throw') throw new Error('sidebarRight: tab occurrence is not synced')
      return target
    },
  })
  /**
   * Mount a frame, make it ready and give it a selection.
   * @param {object} frame - the fake iframe.
   * @param {string|undefined} occurrenceId - the page target it belongs to.
   * @param {string} [text] - the reported selection.
   */
  function attach(frame, occurrenceId, text) {
    env.bridge.attach(frame)
    env.post(frame, readyMessage())
    if (text !== undefined) env.post(frame, selectionMessage(text))
    targets.set(frame, occurrenceId === undefined
      ? undefined
      : { sessionId: SESSION, occurrence: { id: occurrenceId } })
  }
  return { ...env, adapter, targets, attach }
}

test('HTML 适配器：只认 .html/.htm，按页目标消歧，无法消歧时不猜', () => {
  const env = createAdapterHarness()
  assert.equal(env.adapter.id, 'html')

  for (const path of ['samples/page.html', 'samples/page.htm', 'D:\\work\\PAGE.HTML', 'notes/a.HTM']) {
    assert.equal(env.adapter.match(path), true, `${path} must be claimed by the HTML adapter`)
  }
  for (const path of ['notes/a.md', 'samples/page.html.bak', 'report.pdf', '', 'page.html.txt', 'page.htmx']) {
    assert.equal(env.adapter.match(path), false, `${path} must not be claimed`)
  }

  const target = {
    path: 'samples/page.html',
    document: undefined,
    anchor: null,
    tab: { sessionId: SESSION, occurrenceId: 'occurrence-1' },
  }
  assert.equal(env.adapter.readSelection(target), null, 'without a frame there is no capture')

  const frameA = { tag: 'frame-a', contentWindow: { tag: 'window-a' } }
  const frameB = { tag: 'frame-b', contentWindow: { tag: 'window-b' } }
  env.attach(frameA, 'occurrence-1', 'text A')
  const single = env.adapter.readSelection(target)
  assert.equal(single.text, 'text A')
  assert.equal(single.path, 'samples/page.html')
  assert.equal(single.witness, frameA, 'the capture must name the frame it came from')

  env.attach(frameB, 'occurrence-2', 'text B')
  assert.equal(env.adapter.readSelection(target).witness, frameA, 'the own occurrence decides between candidates')
  assert.equal(
    env.adapter.readSelection({ ...target, tab: { sessionId: SESSION, occurrenceId: 'occurrence-2' } }).witness,
    frameB,
  )
  assert.equal(
    env.adapter.readSelection({ ...target, tab: { sessionId: SESSION, occurrenceId: 'occurrence-3' } }),
    null,
    'no candidate with the requested occurrence is ambiguous, never a guess',
  )
  assert.equal(
    env.adapter.readSelection({ ...target, tab: { sessionId: SESSION, occurrenceId: undefined } }),
    null,
    'without the button occurrence nothing may be resolved',
  )
  assert.equal(env.adapter.readSelection({ ...target, tab: undefined }), null)
  assert.equal(env.adapter.readSelection(null), null, 'a missing target is a refusal')

  // A throwing focusedTarget is a refusal, never an escaping exception.
  const throwing = createAdapterHarness()
  const frameC = { tag: 'frame-c', contentWindow: { tag: 'window-c' } }
  const frameD = { tag: 'frame-d', contentWindow: { tag: 'window-d' } }
  throwing.attach(frameC, 'occurrence-1', 'text C')
  throwing.attach(frameD, 'occurrence-2', 'text D')
  throwing.targets.set(frameC, 'throw')
  throwing.targets.set(frameD, 'throw')
  assert.doesNotThrow(() => throwing.adapter.readSelection(target))
  assert.equal(throwing.adapter.readSelection(target), null, 'when no candidate resolves, the adapter refuses')

  // Readiness, blank text and failure states are all "no candidate".
  const fresh = createAdapterHarness()
  const frameE = { tag: 'frame-e', contentWindow: { tag: 'window-e' } }
  fresh.bridge.attach(frameE)
  fresh.targets.set(frameE, { sessionId: SESSION, occurrence: { id: 'occurrence-1' } })
  assert.equal(fresh.adapter.readSelection(target), null, 'a frame that never reported ready is not a candidate')
  fresh.post(frameE, readyMessage())
  assert.equal(fresh.adapter.readSelection(target), null, 'a ready frame without text is not a candidate')
  fresh.post(frameE, selectionMessage('   \n\t '))
  assert.equal(fresh.adapter.readSelection(target), null, 'a blank selection is not a candidate')
  fresh.post(frameE, selectionMessage('real text'))
  assert.equal(fresh.adapter.readSelection(target).text, 'real text')
  fresh.post(frameE, errorMessage())
  assert.equal(fresh.adapter.readSelection(target), null, 'a failed bridge is not a candidate')
})
