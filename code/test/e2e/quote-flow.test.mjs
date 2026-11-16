/**
 * E2E layer, quote flow: E-01, E-02, E-03, E-05, E-06, E-07, E-08 from
 * `core/testing-and-acceptance.md` §3.
 *
 * Plain `node:test`, zero dependencies, Node 24 globals only. The suite connects
 * to an already-running isolated DSH instance and an external Chromium over CDP:
 *
 *   SIDE_QUOTE_E2E_BASE_URL       the instance URL, token included (default http://127.0.0.1:3181)
 *   SIDE_QUOTE_E2E_CDP            `ws://…` or `http://host:port` of the browser
 *   SIDE_QUOTE_E2E_EVIDENCE_DIR   required: screenshots and their sidecars land here
 *   SIDE_QUOTE_E2E_PROFILE        optional: profile name recorded in the sidecars
 *
 * A missing driver, instance or evidence directory makes every test `skip`,
 * never pass. Port 3081 (the operator's live instance) is refused unless
 * `SIDE_QUOTE_E2E_ALLOW_LIVE=1` is set.
 *
 * Workspace fixture the operator must provide inside the instance's workspace:
 *   notes/a.md   containing `quick brown fox` and `second bullet item`
 *   notes/b.md   containing `different document body`
 *   notes/secret.md   containing `DEMO_SECRET=placeholder` (sensitive name, quotable format)
 *   .env         containing `DEMO_TOKEN=placeholder` (hidden in the Files page, so not driven here)
 *
 * What the browser can prove: the composer renders a quote's summary (label,
 * title, detail, body). The raw `text` handed to `insertQuote` is proven by the
 * unit layer (U-01/U-02/U-07); proving it reaches the model would require sending
 * a message, which this harness deliberately does not do.
 */
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import {
  ERROR_COPY, POINTER_LABEL, QUOTE_LABEL, SENSITIVE_WARNING, SKIP_NO_DRIVER, SOURCE_LABEL, activate,
  connectCdp, describeRun, disablePlugin, openFilePreview, openPage, quoteButtonExpression,
  readComposerText, readE2eConfig, readQuoteButton, resolveCdpWebSocketUrl, resolveSkipReason,
  selectPhrase, waitForNotices, waitForQuoteButton,
} from './cdp.mjs'

const config = readE2eConfig()
let skipReason = await resolveSkipReason(config)
let browser

if (skipReason === false) {
  try {
    browser = await connectCdp(await resolveCdpWebSocketUrl(config.cdp))
    console.log(describeRun(config))
  } catch (error) {
    // An unreachable endpoint is still "no driver", and never a pass.
    skipReason = `${SKIP_NO_DRIVER}（CDP 端点不可达：${error.message}）`
  }
}

after(async () => {
  browser?.close()
})

/** Run identity every screenshot sidecar records. */
const evidence = {
  evidenceDir: config.evidenceDir,
  baseUrl: config.baseUrl,
  port: config.port,
  profile: config.profile,
}

/**
 * Run one test against a fresh page, closing it afterwards.
 * @param {string} name - test name.
 * @param {(page: object, shot: (label: string) => Promise<string>) => Promise<void>} body - test body.
 */
function scenario(name, body) {
  test(name, { skip: skipReason }, async () => {
    const page = await openPage(browser, config.baseUrl)
    try {
      await body(page, (label) => page.screenshot(label, evidence))
    } finally {
      await page.close()
    }
  })
}

/** Wait until the composer grew, then return the appended delta. */
async function waitForComposerDelta(page, before, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const current = await readComposerText(page)
    if (current.length > before.length) return current.slice(before.length)
    if (Date.now() > deadline) {
      throw new Error(`the composer never grew; it still holds ${JSON.stringify(current)}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

/** Assert a path is workspace-relative: no drive letter and no leading slash. */
function assertRelative(composer, relativePath) {
  assert.ok(composer.includes(relativePath), `the composer must name ${relativePath}: ${JSON.stringify(composer)}`)
  assert.equal(/[A-Za-z]:[\\/]/u.test(composer), false, 'no absolute Windows path may reach the composer')
  assert.equal(composer.includes(`${SOURCE_LABEL}C`), false)
}

scenario('E-01 首次引用闭环：划词 → 按钮可用 → 真实鼠标点击 → 引用块入框', async (page, shot) => {
  await openFilePreview(page, { directories: ['notes'], fileName: 'a.md' })
  const excerpt = await selectPhrase(page, 'quick brown fox')
  await waitForQuoteButton(page, true)
  await shot('E-01-1-button-enabled')

  const before = await readComposerText(page)
  // A genuine pointer gesture: the helper only uses the mouse when
  // `elementFromPoint` at the button centre resolves to the button itself.
  const path = await activate(page, quoteButtonExpression(), 'the quote button')
  assert.equal(path, 'mouse', 'the quote button must be reachable by a real pointer gesture')

  const delta = await waitForComposerDelta(page, before)
  assert.ok(delta.includes(excerpt), `the quoted excerpt must reach the composer: ${JSON.stringify(delta)}`)
  assertRelative(delta, 'notes/a.md')
  await shot('E-01-2-inserted')
})

scenario('E-02 同文件再引：第二次插入指针块，不含原文', async (page, shot) => {
  await openFilePreview(page, { directories: ['notes'], fileName: 'a.md' })
  await selectPhrase(page, 'quick brown fox')
  await waitForQuoteButton(page, true)
  const beforeFirst = await readComposerText(page)
  await activate(page, quoteButtonExpression(), 'the quote button')
  await waitForComposerDelta(page, beforeFirst)

  const second = await selectPhrase(page, 'second bullet item')
  await waitForQuoteButton(page, true)
  const beforeSecond = await readComposerText(page)
  await activate(page, quoteButtonExpression(), 'the quote button')
  const delta = await waitForComposerDelta(page, beforeSecond)

  assert.ok(delta.includes(POINTER_LABEL), `the second quote must be a pointer block: ${JSON.stringify(delta)}`)
  assert.ok(delta.includes('notes/a.md'), 'the pointer must name the source path')
  assert.equal(delta.includes(second), false, 'the pointer block must not repeat the excerpt')
  await shot('E-02-1-pointer')
})

scenario('E-03 跨文件独立：另一个文件仍是原文块', async (page, shot) => {
  await openFilePreview(page, { directories: ['notes'], fileName: 'b.md' })
  const excerpt = await selectPhrase(page, 'different document body')
  await waitForQuoteButton(page, true)
  const before = await readComposerText(page)
  await activate(page, quoteButtonExpression(), 'the quote button')
  const delta = await waitForComposerDelta(page, before)
  assert.ok(delta.includes(excerpt), 'the other file must be quoted as an original block')
  assertRelative(delta, 'notes/b.md')
  assert.equal(delta.includes(POINTER_LABEL), false, 'a different file must not degrade to a pointer')
  await shot('E-03-1-other-file')
})

scenario('E-05 敏感文件：原样插入且恰好一条 info 警示、没有 error 通知', async (page, shot) => {
  // `.env` is a hidden entry in the Files tree, so the browser case uses
  // `notes/secret.md`: a whitelisted format whose name hits the sensitive
  // `*secret*` fragment. It exercises the same "insert as-is + one info" path.
  await openFilePreview(page, { directories: ['notes'], fileName: 'secret.md' })
  const excerpt = await selectPhrase(page, 'DEMO_SECRET=placeholder')
  await waitForQuoteButton(page, true)
  const before = await readComposerText(page)
  await activate(page, quoteButtonExpression(), 'the quote button')
  const delta = await waitForComposerDelta(page, before)
  assert.ok(delta.includes(excerpt), 'the sensitive file is inserted as-is')
  assertRelative(delta, 'notes/secret.md')

  const notices = await waitForNotices(
    page,
    (list) => list.some((notice) => SENSITIVE_WARNING.some((warning) => notice.text.includes(warning))),
    { label: 'the sensitive-content warning' },
  )
  const sensitive = notices.filter((notice) => SENSITIVE_WARNING.some((warning) => notice.text.includes(warning)))
  assert.equal(sensitive.length, 1, `exactly one sensitive notice is allowed, saw ${JSON.stringify(notices)}`)
  const raised = notices.filter((notice) => ERROR_COPY.some((copy) => notice.text.includes(copy)))
  assert.deepEqual(raised, [], `a successful sensitive quote must not raise an error notice: ${JSON.stringify(raised)}`)
  await shot('E-05-1-sensitive')
})

scenario('E-06 无选区：按钮存在但置灰', async (page, shot) => {
  await openFilePreview(page, { directories: ['notes'], fileName: 'a.md' })
  await page.evaluate('(() => { window.getSelection().removeAllRanges(); return true; })()')
  await new Promise((resolve) => setTimeout(resolve, 800))
  const state = await waitForQuoteButton(page, false)
  assert.equal(QUOTE_LABEL.includes(state.label), true, `the label must be a shipped dictionary entry, got ${state.label}`)
  await shot('E-06-1-no-selection')
})

scenario('E-07 切 tab 后旧选区不再可用', async (page, shot) => {
  await openFilePreview(page, { directories: ['notes'], fileName: 'a.md' })
  await selectPhrase(page, 'quick brown fox')
  await waitForQuoteButton(page, true)
  // Open a second preview, then come back to the first by its visible tab title.
  await openFilePreview(page, { directories: ['notes'], fileName: 'b.md' })
  const switched = await page.evaluate(`(() => {
    const tab = [...document.querySelectorAll('[role="tab"]')]
      .find((element) => (element.textContent || '').includes('a.md'));
    if (!tab) return false;
    tab.click();
    return true;
  })()`)
  assert.equal(switched, true, 'the a.md tab chip must still be there to switch back to')
  await new Promise((resolve) => setTimeout(resolve, 1200))
  const state = await readQuoteButton(page)
  assert.equal(state.present, true, 'the button must still exist for a whitelisted file')
  if (state.disabled === false) {
    // A surviving selection is acceptable only if the click still refuses to insert.
    const before = await readComposerText(page)
    await activate(page, quoteButtonExpression(), 'the quote button')
    await new Promise((resolve) => setTimeout(resolve, 1200))
    assert.equal(await readComposerText(page), before, 'a stale selection must never insert a quote')
  } else {
    assert.equal(state.disabled, true, 'the old selection must not keep the button usable')
  }
  await shot('E-07-1-after-tab-switch')
})

scenario('E-08 停用清理：按钮消失、无控制台报错', async (page, shot) => {
  await openFilePreview(page, { directories: ['notes'], fileName: 'a.md' })
  await waitForQuoteButton(page, false)
  const path = await disablePlugin(page, 'dsh-side-quote')
  assert.equal(path === 'mouse' || path === 'dom', true)
  const deadline = Date.now() + 20000
  for (;;) {
    const state = await readQuoteButton(page)
    if (state.present === false) break
    if (Date.now() > deadline) throw new Error('the quote button survived the plugin being disabled')
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  await selectPhrase(page, 'quick brown fox').catch(() => '')
  await new Promise((resolve) => setTimeout(resolve, 900))
  assert.equal((await readQuoteButton(page)).present, false)
  assert.deepEqual(page.consoleErrors, [], `console errors after teardown: ${JSON.stringify(page.consoleErrors)}`)
  await shot('E-08-1-disabled')
})
