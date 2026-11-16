/**
 * I001 Initiative integration run driver (cross-Feature, one session, one page).
 *
 * Rows and pass conditions: `integration-acceptance-matrix.md` (frozen before this
 * run). This driver only executes the rows; the lifecycle decision is made in the
 * orchestrating session.
 *
 * It reuses the shipped e2e harness (`code/test/e2e/cdp.mjs`) unchanged and adds
 * no dependency: the harness provides the CDP client, the preview/tab helpers, the
 * composer-card reader, the notice reader, the child-frame driver and the marked
 * control readers.
 *
 * Environment (same contract as the shipped e2e layer):
 *   SIDE_QUOTE_E2E_BASE_URL       isolated instance URL, token included (never written)
 *   SIDE_QUOTE_E2E_CDP            CDP endpoint of the browser (ws:// or http://host:port)
 *   SIDE_QUOTE_E2E_EVIDENCE_DIR   this integration evidence directory
 *   SIDE_QUOTE_E2E_PROFILE        profile name recorded in every sidecar
 *
 * Run: node "wiki/feature-workspace/initiatives/initiative-i001-side-quote/integration-testing/scripts/integration-run.mjs"
 *
 * Selection drives, recorded per row and never conflated:
 *   - text previews: DOM `Range` built by script (same instrument as leaf E-01…E-07);
 *     the click itself is a real pointer gesture where `activate` reports `mouse`.
 *   - HTML takeover: real pointer drag (`Input.dispatchMouseEvent`) for I-01; the
 *     long-page truncation row in I-05 uses an in-frame synthesised `Range` and is
 *     recorded as `synthetic-range`.
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BUILTIN_HTML_FRAME_MARKER,
  HTML_MARKERS,
  HTML_TAKEOVER_STORAGE_KEY,
  POINTER_LABEL,
  QUOTE_LABEL,
  SENSITIVE_WARNING,
  SOURCE_LABEL,
  activate,
  attachChildFrame,
  connectCdp,
  describeRun,
  disablePlugin,
  dismissOverlays,
  gitRevision,
  markedControlExpression,
  measureSelectionTargetInFrame,
  mouseDrag,
  noticesAdded,
  openFilePreview,
  openPage,
  quoteButtonExpression,
  readBridgeMessages,
  readChildFrameIsolation,
  readChildFrameSelection,
  readComposerQuotes,
  readDeveloperTools,
  readE2eConfig,
  readHtmlBodyState,
  readHtmlQuoteButton,
  readHtmlToggle,
  readNotices,
  redactUrl,
  reloadPage,
  resolveCdpWebSocketUrl,
  resolveSkipReason,
  selectPhrase,
  setDeveloperTools,
  setHtmlTakeover,
  setPluginEnabled,
  startBridgeMessageRecorder,
  waitForComposerQuotes,
  waitForHtmlQuoteButton,
  waitForMarkedControl,
  waitForNotices,
  waitForAppShell,
} from '../../../../../../code/test/e2e/cdp.mjs'

const TRUNCATION_NOTE = '…（摘录已截断，仅保留前 200 行 / 8000 字符）'
const FRAME_SELECTOR = `[${HTML_MARKERS.frame}]`
const PLUGIN_ID = 'dsh-side-quote'

const config = readE2eConfig()
const skipReason = await resolveSkipReason(config)
if (skipReason !== false) {
  console.error(`[integration] cannot run: ${skipReason}`)
  process.exit(2)
}

const browser = await connectCdp(await resolveCdpWebSocketUrl(config.cdp))
console.log(describeRun(config))

const evidence = {
  evidenceDir: config.evidenceDir,
  baseUrl: config.baseUrl,
  port: config.port,
  profile: config.profile,
}
await mkdir(config.evidenceDir, { recursive: true })

const summary = {
  run: 'I001-initiative-integration',
  initiative: 'I001',
  features: ['I001-F01', 'I001-F02'],
  gitRevision: gitRevision(),
  baseUrl: redactUrl(config.baseUrl),
  port: config.port,
  profile: config.profile,
  viewport: '1440x900',
  startedAt: new Date().toISOString(),
  baseline: {},
  rows: [],
  controls: [],
  cards: [],
  bridge: null,
  security: {},
  selectionDrive: {},
  consoleErrors: [],
}

const failures = []
const notes = []
function log(message) {
  console.log(`[integration] ${message}`)
}

/**
 * Run one matrix row; a failure is recorded, never thrown past the row.
 * @param {string} id - matrix row id.
 * @param {() => Promise<object>} body - row body.
 */
async function runRow(id, body) {
  log(`--- ${id} ---`)
  try {
    const details = await body()
    summary.rows.push({ id, status: 'PASS', ...details })
    log(`${id}: PASS`)
    return true
  } catch (error) {
    summary.rows.push({ id, status: 'FAIL', error: error.message })
    failures.push(id)
    log(`${id}: FAIL — ${error.message}`)
    return false
  }
}

function assert(condition, message) {
  if (condition !== true) throw new Error(message)
}

/** Whitespace-collapse for comparing rendered text with a quoted body. */
function collapse(value) {
  return String(value === null || value === undefined ? '' : value).replace(/\s+/gu, ' ').trim()
}

/** Read the text-preview quote button only (the HTML variant carries its own marker). */
async function readTextButton(page) {
  return page.evaluate(`(() => {
    const wanted = ${JSON.stringify(QUOTE_LABEL)};
    const button = [...document.querySelectorAll('button, [role="button"]')]
      .filter((element) => wanted.includes((element.getAttribute('aria-label') || '').trim()))
      .filter((element) => !element.hasAttribute('${HTML_MARKERS.quote}'))
      .find((element) => element.getClientRects().length > 0) || null;
    if (button === null) return { present: false, disabled: null };
    return {
      present: true,
      disabled: button.disabled === true || button.getAttribute('aria-disabled') === 'true',
    };
  })()`)
}

async function waitForTextButton(page, enabled, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  let last = { present: false, disabled: null }
  for (;;) {
    last = await readTextButton(page)
    if (last.present === true && last.disabled === !enabled) return last
    if (Date.now() > deadline) {
      throw new Error(`text quote button did not become ${enabled ? 'enabled' : 'disabled'}: ${JSON.stringify(last)}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

/** Header control snapshot for one preview. */
async function headerControls(page, label) {
  const [text, toggle, htmlButton, body] = await Promise.all([
    readTextButton(page),
    readHtmlToggle(page),
    readHtmlQuoteButton(page),
    readHtmlBodyState(page),
  ])
  const snapshot = {
    label,
    textButton: text.present,
    textButtonDisabled: text.disabled,
    toggle: toggle.present,
    togglePressed: toggle.pressed,
    toggleDisabled: toggle.disabled,
    toggleHint: toggle.hint,
    htmlButton: htmlButton.present,
    htmlButtonDisabled: htmlButton.disabled,
    takeoverFrames: body.takeover.length,
    builtinFrames: body.builtin.length,
    takeoverBody: body.body,
    sandbox: body.takeover.length > 0 ? body.takeover[0].sandbox : null,
    builtinSandbox: body.builtin.length > 0 ? body.builtin[0].sandbox : null,
  }
  summary.controls.push(snapshot)
  return snapshot
}

async function clearParentSelection(page) {
  await page.evaluate('(() => { window.getSelection().removeAllRanges(); return true; })()')
}

/**
 * Select from the first long-file line to the last one, inside the preview body.
 *
 * Polls, because the preview body renders asynchronously after the tab appears;
 * a single evaluation races the render and reports an empty selection.
 * @param {object} page - the page.
 * @param {{timeoutMs?: number}} [options] - bound.
 * @returns {Promise<{length: number}>} the selected length.
 */
async function selectWholeLongText(page, options = {}) {
  const deadline = Date.now() + (options.timeoutMs ?? 20000)
  for (;;) {
    const selected = await page.evaluate(`(() => {
      const skip = 'input, textarea, select, [contenteditable="true"], [role="textbox"], script, style, noscript';
      const findNode = (needle) => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          const parent = node.parentElement;
          if ((node.nodeValue || '').includes(needle) && parent !== null && parent.closest(skip) === null) return node;
          node = walker.nextNode();
        }
        return null;
      };
      const first = findNode('line 001');
      const last = findNode('line 260');
      if (first === null || last === null) return { length: 0 };
      const range = document.createRange();
      range.setStart(first, 0);
      range.setEnd(last, (last.nodeValue || '').length);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return { length: range.toString().length };
    })()`)
    if (selected.length > 0) return selected
    if (Date.now() > deadline) {
      throw new Error('the long text preview never rendered the first and last fixture lines')
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}

/**
 * Synthesise a large range inside the takeover frame (recorded as synthetic-range).
 *
 * Polls the frame body: the bootstrap writes the page after the frame element
 * exists, so the paragraph list can still be empty on the first evaluation.
 * @param {object} page - the page.
 * @param {string} selector - CSS selector of the iframe element.
 * @param {{timeoutMs?: number}} [options] - bound.
 * @returns {Promise<{length: number, paragraphs: number, head: string}>} what was selected.
 */
async function syntheticWideRangeInFrame(page, selector, options = {}) {
  const deadline = Date.now() + (options.timeoutMs ?? 25000)
  const frame = await attachChildFrame(page, selector, { timeoutMs: 20000 })
  try {
    for (;;) {
      const measured = await frame.evaluate(`(() => {
        const paragraphs = [...document.querySelectorAll('p')].filter((element) => element.getClientRects().length > 0);
        if (paragraphs.length === 0) return { length: 0, paragraphs: 0, head: '' };
        const first = paragraphs[0];
        const last = paragraphs[paragraphs.length - 1];
        const range = document.createRange();
        range.setStartBefore(first);
        range.setEndAfter(last);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        window.dispatchEvent(new Event('selectionchange'));
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        return { length: range.toString().length, paragraphs: paragraphs.length, head: range.toString().slice(0, 60) };
      })()`)
      if (measured.length > 0) return measured
      if (Date.now() > deadline) {
        throw new Error('the takeover frame never rendered paragraphs to select')
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  } finally {
    await frame.detach()
  }
}

/** Drag-select one measured text block inside the takeover frame. */
async function dragInFrame(page, index) {
  const target = await measureSelectionTargetInFrame(page, FRAME_SELECTOR, { index, minLength: 24, maxChars: 60 })
  await mouseDrag(page, target.from, target.to, 16)
  await new Promise((resolve) => setTimeout(resolve, 600))
  const selected = await readChildFrameSelection(page, FRAME_SELECTOR)
  return { target, selected }
}

async function clickTextQuote(page) {
  return activate(page, quoteButtonExpression(), 'the text quote button')
}

async function clickHtmlQuote(page) {
  return activate(page, markedControlExpression(HTML_MARKERS.quote), 'the HTML quote button')
}

async function clickToggle(page) {
  return activate(page, markedControlExpression(HTML_MARKERS.toggle), 'the HTML takeover toggle')
}

async function countCards(page) {
  return (await readComposerQuotes(page)).length
}

/**
 * Wait for exactly one card appended after a click, then return it.
 * Counting relative to the current composer keeps the rows independent of how
 * many cards earlier rows produced.
 * @param {object} page - the page.
 * @param {number} before - card count observed before the click.
 * @returns {Promise<object>} the appended card.
 */
async function waitForAppendedCard(page, before) {
  const cards = await waitForComposerQuotes(page, before + 1)
  if (cards.length !== before + 1) {
    throw new Error(`exactly one card must be appended, saw ${before} -> ${cards.length}`)
  }
  summary.cards = cards.map((card) => ({ label: card.label, meta: card.meta, body: card.body, text: card.text }))
  return cards[before]
}

/* -------------------------------------------------------------------- *
 * Baseline (established once, before the connected sequence).
 *
 * Measured constraint: the client bundle is loaded when the page loads, so a
 * plugin enabled *after* a page was opened is not active in that page. Every
 * piece of state the rows depend on is therefore prepared on a throwaway control
 * page — the persisted takeover key (localStorage, same origin), the script gate
 * (Host preference) and the plugin inventory switch (profile-wide) — and only
 * then is the one long-lived page opened. No destructive reset happens inside
 * the rows afterwards.
 * -------------------------------------------------------------------- */
const control = await openPage(browser, config.baseUrl)
try {
  await dismissOverlays(control)
  await setHtmlTakeover(control, null)
  summary.baseline.gateObserved = await readDeveloperTools(control)
  summary.baseline.gateSet = await setDeveloperTools(control, true)
  summary.baseline.pluginEnabled = await setPluginEnabled(control, PLUGIN_ID, true)
} finally {
  await control.close()
  // Let the client-bundle rebuild that follows an inventory change settle.
  await new Promise((resolve) => setTimeout(resolve, 1500))
}

const page = await openPage(browser, config.baseUrl)
summary.pageTargetId = page.targetId

try {
  await dismissOverlays(page)
  await waitForAppShell(page)
  summary.baseline.takeoverKey = await page.evaluate(
    `(() => localStorage.getItem(${JSON.stringify(HTML_TAKEOVER_STORAGE_KEY)}))()`,
  )
  // Prove the baseline is real before any row runs: the plugin must be active in
  // this page, which the text preview's quote button shows.
  await openFilePreview(page, { directories: ['notes'], fileName: 'a.md' })
  const active = await waitForTextButton(page, false)
  assert(active.present === true, 'the baseline is invalid: the plugin is not active in this page')
  summary.baseline.pluginActive = true
  summary.baseline.establishedAt = new Date().toISOString()
  log(`baseline: gate=${JSON.stringify(summary.baseline.gateObserved)} takeoverKey=${JSON.stringify(summary.baseline.takeoverKey)} pluginActive=true`)

  // Arm the parent-side bridge recorder before any takeover frame mounts; it must
  // survive the whole connected sequence, so no page reload happens after this.
  await startBridgeMessageRecorder(page, FRAME_SELECTOR)

  /* ---------------------------------------------------------------- *
   * I-01 shared "already quoted" record continuity across both features.
   * ---------------------------------------------------------------- */
  await runRow('I-01', async () => {
    const steps = []
    await openFilePreview(page, { directories: ['notes'], fileName: 'a.md' })
    const mdOff = await headerControls(page, 'md/takeover-off')
    assert(mdOff.textButton === true, 'the text preview must show the quote button')
    assert(mdOff.toggle === false, 'the text preview must not show the takeover toggle')
    assert(mdOff.htmlButton === false, 'the text preview must not show the HTML quote button')

    const textExcerpt = await selectPhrase(page, 'quick brown fox')
    await waitForTextButton(page, true)
    await page.screenshot('I-01-a-text-original', evidence, { takeover: 'off' })
    const noticesBefore = await readNotices(page)
    const cardCount = await countCards(page)
    const path1 = await clickTextQuote(page)
    const first = await waitForAppendedCard(page, cardCount)
    assert(collapse(first.body).includes(collapse(textExcerpt)), `card 1 must quote the text excerpt: ${JSON.stringify(first)}`)
    assert(first.meta.includes('notes/a.md'), `card 1 must name notes/a.md: ${JSON.stringify(first.meta)}`)
    assert(first.body.includes(TRUNCATION_NOTE) === false, 'card 1 must not claim truncation')
    assert(first.absolutePath === false, 'card 1 must not carry an absolute path')
    assert(collapse(first.body).includes(POINTER_LABEL) === false, 'card 1 must be an original block')
    steps.push({ step: '1 text quote', drive: 'synthetic-range (DOM Range) + real click', activation: path1 })

    await openFilePreview(page, { directories: ['samples'], fileName: 'page.html' })
    const htmlOff = await headerControls(page, 'html/takeover-off')
    assert(htmlOff.toggle === true && htmlOff.togglePressed === false, 'the HTML preview must show the toggle, off')
    assert(htmlOff.textButton === false, 'the HTML preview must not show the text quote button')
    assert(htmlOff.htmlButton === false, 'the HTML quote button must not exist while the takeover is off')
    assert(htmlOff.takeoverFrames === 0 && htmlOff.builtinFrames >= 1, 'the built-in renderer must own the HTML body')
    steps.push({ step: '2 html preview, takeover off', builtinSandbox: htmlOff.builtinSandbox })

    const noticesBeforeToggle = await readNotices(page)
    const togglePath = await clickToggle(page)
    await waitForMarkedControl(page, HTML_MARKERS.toggle, { present: true, pressed: true }, 25000, 'the toggle on')
    const toggleNotices = await waitForNotices(
      page,
      (list) => noticesAdded(noticesBeforeToggle, list).length >= 1,
      { label: 'the takeover self-check notice' },
    )
    const toggleAdded = noticesAdded(noticesBeforeToggle, toggleNotices)
    assert(toggleAdded.length === 1, `the takeover self-check must be exactly one notice: ${JSON.stringify(toggleAdded)}`)
    await page.waitFor(`(() => document.querySelectorAll('[${HTML_MARKERS.body}]').length === 1)()`, {
      timeoutMs: 20000, label: 'the takeover body',
    })
    const htmlOn = await headerControls(page, 'html/takeover-on')
    assert(htmlOn.togglePressed === true, 'the toggle must read as on')
    assert(htmlOn.htmlButton === true, 'the HTML quote button must exist while the takeover is effective')
    assert(htmlOn.htmlButtonDisabled === true, 'the HTML quote button must be disabled before a selection')
    assert(htmlOn.textButton === false, 'the HTML preview must still not show the text quote button')
    assert(htmlOn.takeoverFrames === 1 && htmlOn.builtinFrames === 0, 'the takeover renderer must own the body')
    assert(htmlOn.sandbox === 'allow-scripts', `the takeover frame sandbox must be allow-scripts: ${JSON.stringify(htmlOn.sandbox)}`)
    summary.security.iframeSandbox = htmlOn.sandbox
    steps.push({ step: '3 takeover engaged', toggleActivation: togglePath, notices: toggleAdded })

    const drag = await dragInFrame(page, 0)
    await waitForHtmlQuoteButton(page, { disabled: false })
    await page.screenshot('I-01-b-html-takeover', evidence, {
      takeover: 'on', selectionDrive: 'mouse', iframeSandbox: htmlOn.sandbox,
    })
    const path2 = await clickHtmlQuote(page)
    const second = await waitForAppendedCard(page, cardCount + 1)
    const dragged = collapse(drag.selected)
    assert(dragged !== '', 'the real drag must leave a non-empty selection in the frame')
    assert(collapse(second.body).includes(dragged.slice(0, 40)), `card 2 must quote the dragged text: ${JSON.stringify(second)}`)
    assert(second.meta.includes('samples/page.html'), `card 2 must name samples/page.html: ${JSON.stringify(second.meta)}`)
    assert(second.body.includes(SOURCE_LABEL) === false, 'the card body must not repeat the 来源 line')
    assert(second.absolutePath === false, 'card 2 must not carry an absolute path')
    assert(collapse(second.body).includes(POINTER_LABEL) === false, 'a different file must be an original block')
    steps.push({ step: '4 html original quote', drive: 'mouse', activation: path2, dragged: dragged.slice(0, 60) })

    const drag2 = await dragInFrame(page, 1)
    await waitForHtmlQuoteButton(page, { disabled: false })
    const beforeThird = await readNotices(page)
    await clickHtmlQuote(page)
    const third = await waitForAppendedCard(page, cardCount + 2)
    assert(collapse(third.body).includes(POINTER_LABEL), `card 3 must be a pointer block: ${JSON.stringify(third)}`)
    assert(third.meta.includes('samples/page.html'), `card 3 must name samples/page.html: ${JSON.stringify(third.meta)}`)
    assert(third.body.includes(SOURCE_LABEL) === false, 'the pointer block must not contain 来源：')
    assert(collapse(third.body).includes(collapse(drag2.selected).slice(0, 40)) === false, 'the pointer must not repeat the excerpt')
    const thirdNotices = noticesAdded(beforeThird, await readNotices(page))
    assert(
      thirdNotices.filter((notice) => notice.role === 'alert').length === 0,
      `a pointer insertion must raise no error: ${JSON.stringify(thirdNotices)}`,
    )
    await page.screenshot('I-01-c-html-pointer', evidence, {
      takeover: 'on', selectionDrive: 'mouse', iframeSandbox: htmlOn.sandbox,
    })
    steps.push({ step: '5 html second quote (pointer)', pointerMeta: third.meta })

    const back = await page.evaluate(`(() => {
      const tab = [...document.querySelectorAll('[role="tab"]')]
        .find((element) => (element.textContent || '').includes('a.md'));
      if (!tab) return false;
      tab.click();
      return true;
    })()`)
    assert(back === true, 'the a.md tab must still be reachable to continue the shared sequence')
    await new Promise((resolve) => setTimeout(resolve, 1200))
    const textExcerpt2 = await selectPhrase(page, 'second bullet item')
    await waitForTextButton(page, true)
    const beforeFourth = await readNotices(page)
    await clickTextQuote(page)
    const fourth = await waitForAppendedCard(page, cardCount + 3)
    assert(collapse(fourth.body).includes(POINTER_LABEL), `card 4 must be a pointer block: ${JSON.stringify(fourth)}`)
    assert(fourth.meta.includes('notes/a.md'), `card 4 must name notes/a.md: ${JSON.stringify(fourth.meta)}`)
    assert(collapse(fourth.body).includes(collapse(textExcerpt2).slice(0, 40)) === false, 'the pointer must not repeat the excerpt')
    const fourthNotices = noticesAdded(beforeFourth, await readNotices(page))
    assert(
      fourthNotices.filter((notice) => notice.role === 'alert').length === 0,
      `the shared-record pointer must raise no error: ${JSON.stringify(fourthNotices)}`,
    )
    await page.screenshot('I-01-d-text-pointer', evidence, { takeover: 'on' })
    steps.push({ step: '6 text second quote (pointer, same record space)', pointerMeta: fourth.meta })

    const mdOn = await headerControls(page, 'md/takeover-on')
    assert(mdOn.textButton === true, 'the .md preview must keep the text quote button with the takeover on')
    assert(mdOn.toggle === false, 'the .md preview must never show the takeover toggle')
    assert(mdOn.htmlButton === false, 'the .md preview must never show the HTML quote button')

    return { steps, noticesAtEnd: noticesBefore.length, sameCardStream: cardCount + 4 }
  })

  /* ---------------------------------------------------------------- *
   * I-02 header control isolation (all four combinations observed).
   * ---------------------------------------------------------------- */
  await runRow('I-02', async () => {
    const mdOn = summary.controls.filter((entry) => entry.label === 'md/takeover-on').at(-1)
    const mdOff = summary.controls.filter((entry) => entry.label === 'md/takeover-off').at(-1)
    const htmlOff = summary.controls.filter((entry) => entry.label === 'html/takeover-off').at(-1)
    const htmlOn = summary.controls.filter((entry) => entry.label === 'html/takeover-on').at(-1)
    for (const [name, entry] of Object.entries({ mdOn, mdOff, htmlOff, htmlOn })) {
      assert(entry !== undefined, `the ${name} header snapshot must exist`)
    }
    assert(mdOff.textButton === true && mdOff.toggle === false && mdOff.htmlButton === false, 'md/takeover-off controls are wrong')
    assert(mdOn.textButton === true && mdOn.toggle === false && mdOn.htmlButton === false, 'md/takeover-on controls are wrong')
    assert(htmlOff.toggle === true && htmlOff.textButton === false && htmlOff.htmlButton === false, 'html/takeover-off controls are wrong')
    assert(htmlOn.toggle === true && htmlOn.textButton === false && htmlOn.htmlButton === true, 'html/takeover-on controls are wrong')
    await page.screenshot('I-02-a-md-controls', evidence, { takeover: 'on' })
    return { combinations: { mdOn: mdOn.textButton, mdOff: mdOff.textButton, htmlOff: htmlOff.toggle, htmlOn: htmlOn.htmlButton } }
  })

  /* ---------------------------------------------------------------- *
   * I-03 takeover switch has zero effect on non-HTML formats.
   * ---------------------------------------------------------------- */
  await runRow('I-03', async () => {
    const observed = []
    page.resetConsoleErrors()
    const key = await page.evaluate(`(() => localStorage.getItem(${JSON.stringify(HTML_TAKEOVER_STORAGE_KEY)}))()`)
    assert(key === 'on', `the persisted takeover key must still read 'on': ${JSON.stringify(key)}`)

    await openFilePreview(page, { directories: ['notes'], fileName: 'b.md' })
    const md = await headerControls(page, 'b.md/takeover-on')
    assert(md.textButton === true && md.toggle === false && md.htmlButton === false, 'b.md controls are wrong under takeover on')
    const excerpt = await selectPhrase(page, 'beta token')
    await waitForTextButton(page, true)
    const mdCount = await countCards(page)
    await clickTextQuote(page)
    const card = await waitForAppendedCard(page, mdCount)
    assert(collapse(card.body).includes(collapse(excerpt)), `b.md must quote normally: ${JSON.stringify(card)}`)
    assert(card.meta.includes('notes/b.md'), `b.md quote must name its own path: ${JSON.stringify(card.meta)}`)
    observed.push({ file: 'notes/b.md', textButton: md.textButton, quoted: true })

    for (const [label, fileName] of [['report.pdf', 'report.pdf'], ['image.png', 'image.png']]) {
      await openFilePreview(page, { directories: ['samples'], fileName })
      const snapshot = await headerControls(page, `${label}/takeover-on`)
      assert(snapshot.textButton === false, `${fileName} must not show the text quote button`)
      assert(snapshot.toggle === false, `${fileName} must not show the takeover toggle`)
      assert(snapshot.htmlButton === false, `${fileName} must not show the HTML quote button`)
      observed.push({ file: fileName, textButton: snapshot.textButton, toggle: snapshot.toggle, htmlButton: snapshot.htmlButton })
    }
    await page.screenshot('I-03-a-png-no-controls', evidence, { takeover: 'on' })
    assert(page.consoleErrors.length === 0, `no console error is allowed: ${JSON.stringify(page.consoleErrors)}`)
    return { observed }
  })

  /* ---------------------------------------------------------------- *
   * I-04 script gate false leaves the .md path untouched.
   * ---------------------------------------------------------------- */
  await runRow('I-04', async () => {
    const drove = await setDeveloperTools(page, false)
    assert(drove.enabled === false, `the script gate must be false: ${JSON.stringify(drove)}`)
    page.resetConsoleErrors()

    await openFilePreview(page, { directories: ['notes'], fileName: 'secret.md' })
    const md = await headerControls(page, 'md/gate-false')
    assert(md.textButton === true, 'the .md quote button must still render with the gate closed')
    const excerpt = await selectPhrase(page, 'DEMO_SECRET=placeholder')
    await waitForTextButton(page, true)
    const noticesBefore = await readNotices(page)
    const gateCount = await countCards(page)
    await clickTextQuote(page)
    const card = await waitForAppendedCard(page, gateCount)
    assert(collapse(card.body).includes(collapse(excerpt)), `the .md quote must still work with the gate closed: ${JSON.stringify(card)}`)
    assert(card.meta.includes('notes/secret.md'), `the closed-gate quote must name its path: ${JSON.stringify(card.meta)}`)
    const added = noticesAdded(noticesBefore, await readNotices(page))
    const sensitive = added.filter((notice) => SENSITIVE_WARNING.some((warning) => notice.text.includes(warning)))
    assert(sensitive.length === 1 && sensitive[0].role === 'status', `exactly one info warning is allowed: ${JSON.stringify(added)}`)
    assert(added.filter((notice) => notice.role === 'alert').length === 0, `no error may be raised: ${JSON.stringify(added)}`)
    await page.screenshot('I-04-a-md-with-gate-closed', evidence, { takeover: 'on', developerTools: false })

    await openFilePreview(page, { directories: ['samples'], fileName: 'page.html' })
    const html = await headerControls(page, 'html/gate-false')
    assert(html.toggle === true, 'the HTML preview must still show the toggle')
    assert(html.togglePressed === true, 'the persisted preference stays on while the gate is closed')
    assert(html.toggleDisabled === true, 'the toggle must be disabled while the gate is closed')
    assert(html.toggleHint.length > 0, 'the disabled toggle must explain why')
    assert(html.htmlButton === false, 'no HTML quote button may exist while the gate is closed')
    assert(html.takeoverFrames === 0 && html.builtinFrames >= 1, 'the built-in renderer must own the body while the gate is closed')
    await page.screenshot('I-04-b-html-gate-closed', evidence, { takeover: 'off', developerTools: false })

    const restored = await setDeveloperTools(page, true)
    assert(restored.enabled === true, 'the gate must be true again')
    await waitForMarkedControl(page, HTML_MARKERS.toggle, { pressed: true, disabled: false }, 30000, 'the toggle after the gate reopened')
    await page.waitFor(`(() => document.querySelectorAll('[${HTML_MARKERS.body}]').length === 1)()`, {
      timeoutMs: 30000, label: 'the takeover body after the gate reopened',
    })
    const back = await headerControls(page, 'html/gate-restored')
    assert(back.htmlButton === true, 'the HTML quote button must come back without a reload')
    assert(back.takeoverFrames === 1 && back.builtinFrames === 0, 'the takeover must re-own the body without a reload')
    await page.screenshot('I-04-c-html-gate-restored', evidence, { takeover: 'on', developerTools: true })
    assert(page.consoleErrors.length === 0, `no console error is allowed: ${JSON.stringify(page.consoleErrors)}`)
    return { gateClosedMdQuote: true, gateClosedHtml: html.toggleDisabled, gateRestored: back.takeoverFrames }
  })

  /* ---------------------------------------------------------------- *
   * I-05 shared content contract in one session: relative path, truncation,
   * summary shape and the notice budget.
   * ---------------------------------------------------------------- */
  await runRow('I-05', async () => {
    const budget = {}

    await openFilePreview(page, { directories: ['notes'], fileName: 'long.txt' })
    const selected = await selectWholeLongText(page)
    assert(selected.length > 8000, `the long text selection must exceed the character bound: ${JSON.stringify(selected)}`)
    await waitForTextButton(page, true)
    const beforeText = await readNotices(page)
    const textCount = await countCards(page)
    await clickTextQuote(page)
    const textCard = await waitForAppendedCard(page, textCount)
    assert(collapse(textCard.body).includes(collapse(TRUNCATION_NOTE)), `the text quote must be truncated: ${JSON.stringify(textCard)}`)
    assert(textCard.meta.includes('已截断'), `the text summary must mark truncation: ${JSON.stringify(textCard.meta)}`)
    assert(textCard.meta.includes('notes/long.txt'), `the text quote must name its path: ${JSON.stringify(textCard.meta)}`)
    assert(textCard.absolutePath === false, 'the truncated text quote must stay workspace-relative')
    const textAdded = noticesAdded(beforeText, await readNotices(page))
    budget.textTruncatedQuote = textAdded
    await page.screenshot('I-05-a-text-truncated', evidence, { takeover: 'on' })

    await openFilePreview(page, { directories: ['samples'], fileName: 'long.html' })
    const wide = await syntheticWideRangeInFrame(page, FRAME_SELECTOR)
    assert(wide.length > 8000, `the wide frame range must exceed the character bound: ${JSON.stringify(wide)}`)
    await waitForHtmlQuoteButton(page, { disabled: false }, 25000)
    const beforeHtml = await readNotices(page)
    const htmlCount = await countCards(page)
    await clickHtmlQuote(page)
    const htmlCard = await waitForAppendedCard(page, htmlCount)
    assert(collapse(htmlCard.body).includes(collapse(TRUNCATION_NOTE)), `the HTML quote must be truncated: ${JSON.stringify(htmlCard)}`)
    assert(htmlCard.meta.includes('已截断'), `the HTML summary must mark truncation: ${JSON.stringify(htmlCard.meta)}`)
    assert(htmlCard.meta.includes('samples/long.html'), `the HTML quote must name its path: ${JSON.stringify(htmlCard.meta)}`)
    assert(htmlCard.absolutePath === false, 'the truncated HTML quote must stay workspace-relative')
    const htmlAdded = noticesAdded(beforeHtml, await readNotices(page))
    budget.htmlTruncatedQuote = htmlAdded
    await page.screenshot('I-05-b-html-truncated', evidence, {
      takeover: 'on', selectionDrive: 'synthetic-range', iframeSandbox: summary.security.iframeSandbox,
    })

    // Summary shape parity: both formats report `<path> <n> 行（已截断）`.
    const metaShape = /samples\/long\.html \d+ 行（已截断）/u
    assert(metaShape.test(htmlCard.meta), `the HTML summary shape is wrong: ${JSON.stringify(htmlCard.meta)}`)
    assert(/notes\/long\.txt \d+ 行（已截断）/u.test(textCard.meta), `the text summary shape is wrong: ${JSON.stringify(textCard.meta)}`)

    // Ordinary HTML quote in the same session: no notice may be charged to it.
    await openFilePreview(page, { directories: ['samples'], fileName: 'page-csp.html' })
    const drag = await dragInFrame(page, 0)
    assert(collapse(drag.selected) !== '', 'the CSP page drag must produce a selection')
    await waitForHtmlQuoteButton(page, { disabled: false })
    const beforeCsp = await readNotices(page)
    const cspCount = await countCards(page)
    await clickHtmlQuote(page)
    const cspCard = await waitForAppendedCard(page, cspCount)
    assert(collapse(cspCard.body).includes(collapse(drag.selected).slice(0, 40)), `the CSP page quote must carry the rendered text: ${JSON.stringify(cspCard)}`)
    assert(cspCard.meta.includes('samples/page-csp.html'), `the CSP quote must name its path: ${JSON.stringify(cspCard.meta)}`)
    assert(collapse(cspCard.body).includes(POINTER_LABEL) === false, 'a first quote of the CSP page must be an original block')
    const cspAdded = noticesAdded(beforeCsp, await readNotices(page))
    budget.cspQuote = cspAdded

    for (const [name, added] of Object.entries(budget)) {
      assert(added.filter((notice) => notice.role === 'alert').length === 0, `${name} must raise no error: ${JSON.stringify(added)}`)
      if (name !== 'sensitiveQuote') {
        assert(added.length === 0, `${name} must raise no notice: ${JSON.stringify(added)}`)
      }
    }
    return { budget, truncation: { text: textCard.meta, html: htmlCard.meta } }
  })

  /* ---------------------------------------------------------------- *
   * I-06 negative paths: no selection, stale cross-tab selection.
   * ---------------------------------------------------------------- */
  await runRow('I-06', async () => {
    await openFilePreview(page, { directories: ['notes'], fileName: 'a.md' })
    await clearParentSelection(page)
    await new Promise((resolve) => setTimeout(resolve, 800))
    const mdNoSelection = await readTextButton(page)
    assert(mdNoSelection.present === true && mdNoSelection.disabled === true, 'no selection must leave the text button disabled')

    await openFilePreview(page, { directories: ['samples'], fileName: 'page.html' })
    const htmlNoSelection = await headerControls(page, 'html/no-selection')
    assert(htmlNoSelection.htmlButton === true && htmlNoSelection.htmlButtonDisabled === true, 'no selection must leave the HTML button disabled')

    await openFilePreview(page, { directories: ['notes'], fileName: 'a.md' })
    const excerpt = await selectPhrase(page, 'quick brown fox')
    await waitForTextButton(page, true)
    await openFilePreview(page, { directories: ['samples'], fileName: 'page.html' })
    const returned = await page.evaluate(`(() => {
      const tab = [...document.querySelectorAll('[role="tab"]')]
        .find((element) => (element.textContent || '').includes('a.md'));
      if (!tab) return false;
      tab.click();
      return true;
    })()`)
    assert(returned === true, 'the a.md tab must be reachable again')
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const beforeCards = (await readComposerQuotes(page)).length
    const stale = await readTextButton(page)
    if (stale.present === true && stale.disabled === false) {
      await clickTextQuote(page)
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }
    const afterCards = (await readComposerQuotes(page)).length
    assert(afterCards === beforeCards, `a stale cross-tab selection must never insert: ${beforeCards} -> ${afterCards}`)
    await page.screenshot('I-06-a-cross-tab-stale', evidence, { takeover: 'on' })
    return {
      mdNoSelection,
      htmlNoSelection: htmlNoSelection.htmlButtonDisabled,
      staleSelection: { excerptLength: excerpt.length, buttonDisabled: stale.disabled, cardsBefore: beforeCards, cardsAfter: afterCards },
    }
  })

  /* ---------------------------------------------------------------- *
   * I-07 safety boundary of the takeover frame and the bridge.
   * ---------------------------------------------------------------- */
  await runRow('I-07', async () => {
    await openFilePreview(page, { directories: ['samples'], fileName: 'page.html' })
    await waitForHtmlQuoteButton(page, {})
    const body = await readHtmlBodyState(page)
    assert(body.takeover.length === 1, `exactly one takeover frame is expected: ${JSON.stringify(body)}`)
    const sandbox = body.takeover[0].sandbox
    assert(sandbox === 'allow-scripts', `the sandbox attribute must be exactly allow-scripts: ${JSON.stringify(sandbox)}`)
    assert(String(sandbox).includes('allow-same-origin') === false, 'allow-same-origin must never appear')

    const isolation = await readChildFrameIsolation(page, FRAME_SELECTOR)
    assert(isolation.parentReachable === false, `the frame must not reach the host document: ${JSON.stringify(isolation)}`)
    assert(Array.isArray(isolation.hostGlobals) && isolation.hostGlobals.length === 0, `no host object may leak into the frame: ${JSON.stringify(isolation)}`)

    const messages = await readBridgeMessages(page)
    const bridge = messages.filter((message) => message.channel !== null)
    assert(bridge.length > 0, 'the parent must have received bridge messages')
    const badOrigin = bridge.filter((message) => message.origin !== 'null')
    const badSource = bridge.filter((message) => message.fromFrame !== true)
    const badVersion = bridge.filter((message) => message.version !== 1)
    const ready = bridge.filter((message) => message.kind === 'ready')
    const selections = bridge.filter((message) => message.kind === 'selection')
    assert(badOrigin.length === 0, `every bridge message must carry the opaque origin: ${JSON.stringify(badOrigin)}`)
    assert(badSource.length === 0, `every bridge message must come from this frame: ${JSON.stringify(badSource)}`)
    assert(badVersion.length === 0, `every bridge message must carry version 1: ${JSON.stringify(badVersion)}`)
    assert(ready.length >= 1, 'at least one ready message must have been observed')
    summary.bridge = { total: bridge.length, ready: ready.length, selections: selections.length }
    summary.security.isolation = isolation
    summary.security.sandbox = sandbox
    await page.screenshot('I-07-a-frame-isolation', evidence, {
      takeover: 'on', iframeSandbox: sandbox,
    })
    return { sandbox, isolation, bridge: summary.bridge }
  })

  /* ---------------------------------------------------------------- *
   * I-08 teardown across both features (executed last).
   * ---------------------------------------------------------------- */
  await runRow('I-08', async () => {
    await openFilePreview(page, { directories: ['samples'], fileName: 'page.html' })
    await waitForHtmlQuoteButton(page, {})
    const before = await headerControls(page, 'html/before-disable')
    assert(before.toggle === true && before.htmlButton === true, 'both HTML controls must exist before disabling the plugin')
    page.resetConsoleErrors()

    const disablePath = await disablePlugin(page, PLUGIN_ID)
    const deadline = Date.now() + 25000
    for (;;) {
      const body = await readHtmlBodyState(page)
      const toggle = await readHtmlToggle(page)
      const html = await readHtmlQuoteButton(page)
      const text = await readTextButton(page)
      if (toggle.present === false && html.present === false && text.present === false && body.body === 0) break
      if (Date.now() > deadline) {
        throw new Error(`plugin controls survived the disable: ${JSON.stringify({ toggle, html, text, body })}`)
      }
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    const boundary = await readHtmlBodyState(page)
    summary.teardown = {
      disableActivation: disablePath,
      bodyAfterDisable: boundary,
      builtinFrameAfterDisable: boundary.builtin.length,
      consoleErrors: page.consoleErrors.slice(),
    }
    assert(page.consoleErrors.length === 0, `no console error is allowed after teardown: ${JSON.stringify(page.consoleErrors)}`)
    await page.screenshot('I-08-a-disabled', evidence, { takeover: 'off' })

    await openFilePreview(page, { directories: ['notes'], fileName: 'a.md' })
    const beforeCards = (await readComposerQuotes(page)).length
    await selectPhrase(page, 'quick brown fox').catch(() => '')
    await new Promise((resolve) => setTimeout(resolve, 1200))
    const afterCards = (await readComposerQuotes(page)).length
    assert(afterCards === beforeCards, `a disabled plugin must never insert: ${beforeCards} -> ${afterCards}`)
    assert((await readTextButton(page)).present === false, 'the text quote button must be gone after the disable')

    await setPluginEnabled(page, PLUGIN_ID, true)
    await reloadPage(page)
    await openFilePreview(page, { directories: ['samples'], fileName: 'page.html' })
    const restored = await headerControls(page, 'html/after-reenable')
    assert(restored.toggle === true && restored.togglePressed === true, 'the persisted preference must survive the disable and re-enable')
    await page.waitFor(`(() => document.querySelectorAll('[${HTML_MARKERS.body}]').length === 1)()`, {
      timeoutMs: 25000, label: 'the takeover body after the re-enable',
    })
    const reenabled = await headerControls(page, 'html/reenabled')
    assert(reenabled.takeoverFrames === 1, 'the takeover must be back after the re-enable')
    await openFilePreview(page, { directories: ['notes'], fileName: 'a.md' })
    const textBack = await readTextButton(page)
    assert(textBack.present === true, 'the text quote button must be back after the re-enable')
    await page.screenshot('I-08-b-reenabled', evidence, { takeover: 'on' })
    return { boundary: summary.teardown.bodyAfterDisable, restored: { takeover: reenabled.takeoverFrames, textButton: textBack.present } }
  })
} finally {
  summary.endedAt = new Date().toISOString()
  summary.failures = failures
  summary.notes = notes
  summary.pageUrl = redactUrl(config.baseUrl)
  const path = join(dirname(fileURLToPath(import.meta.url)), '..', 'evidence', 'integration-summary.json')
  await writeFile(path, `${JSON.stringify(summary, null, 2)}\n`)
  console.log(`[integration] summary written to ${path}`)
  console.log(`[integration] rows: ${summary.rows.map((row) => `${row.id}=${row.status}`).join(' ')}`)
  console.log(`[integration] failures: ${failures.length === 0 ? 'none' : failures.join(', ')}`)
  await page.close()
  browser.close()
  process.exitCode = failures.length === 0 ? 0 : 1
}
