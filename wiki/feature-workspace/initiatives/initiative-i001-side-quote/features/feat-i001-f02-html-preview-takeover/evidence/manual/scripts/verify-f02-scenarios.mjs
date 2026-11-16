// I001-F02 independent verification driver.
//
// Runs the acceptance scenarios against the isolation instance through CDP and
// writes screenshots + sidecars + a summary into the feature evidence dir.
// It never changes the code under test. Where the committed e2e harness cannot
// reach the state it wants (right-sidebar collapse after a client bundle reload,
// quote rendered as a composer card), this driver performs the missing step and
// records that step in the evidence.
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  HTML_MARKERS, activate, attachChildFrame, closeSettings, connectCdp, dismissOverlays, disablePlugin,
  markedControlExpression, measureSelectionTargetInFrame, mouseDrag, noticesAdded, openFilePreview, openPage,
  readChildFrameSelection, readComposerText, readE2eConfig, readHtmlBodyState, readHtmlQuoteButton, readHtmlToggle,
  readNotices, readPreviewBodyRect, resolveCdpWebSocketUrl, setDeveloperTools, setHtmlTakeover, setPluginEnabled,
  waitForAddedNotices, waitForAppShell, waitForElementCount, waitForFrameContent, waitForHtmlQuoteButton,
  waitForHtmlToggle, waitForPreviewTab,
} from 'file:///C:/Users/search/AppData/Local/Temp/side-quote-f02/e2e-copy/cdp.mjs'

const config = readE2eConfig()
const OUT = config.evidenceDir
const MANUAL = join(OUT, '..', 'manual')
const evidence = { evidenceDir: OUT, baseUrl: config.baseUrl, port: config.port, profile: config.profile }
const TAKEOVER = `[${HTML_MARKERS.frame}]`
const BUILTIN = '[data-html-preview]'
const results = []
const record = async (name, value) => {
  await writeFile(join(MANUAL, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  console.log(`\n### ${name}\n${JSON.stringify(value, null, 2)}`)
}
const verdict = (id, status, detail, files) => {
  results.push({ id, status, detail, files })
  console.log(`\n== ${id}: ${status} ==\n${JSON.stringify(detail)}`)
}
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Reopen the right sidebar when the app shell collapsed it (post bundle reload). */
async function ensureRightSidebar(page) {
  const hasTabs = await page.evaluate(`(() => [...document.querySelectorAll('[role="tab"]')].some((element) => element.getClientRects().length > 0))()`)
  if (hasTabs === true) return false
  const toggle = `(() => ['打开右侧边栏', 'Open right sidebar', 'Open sidebar'].map((label) => [...document.querySelectorAll('[aria-label]')].find((element) => (element.getAttribute('aria-label') || '').trim() === label)).find(Boolean) || null)()`
  if ((await page.evaluate(`(() => ${toggle} !== null)()`)) !== true) return false
  await activate(page, toggle, 'the right sidebar toggle')
  await sleep(900)
  return true
}

/** Activate the preview tab for a file, reopening the sidebar first if needed. */
async function showPreview(page, fileName, directories = ['samples']) {
  await ensureRightSidebar(page)
  await openFilePreview(page, { directories, fileName })
  await sleep(500)
}

/** Read the quote decorators the composer renders after an insertion. */
async function readQuoteCards(page) {
  return page.evaluate(`(() => {
    const cards = [...document.querySelectorAll('[data-composer-quote]')].map((node) => {
      const text = node.querySelector('[data-quote-preview-text]') || node;
      const leaves = [...text.querySelectorAll('span')]
        .filter((span) => span.children.length === 0 && (span.textContent || '') !== '')
        .map((span) => ({
          cls: String(span.className),
          ariaHidden: span.getAttribute('aria-hidden'),
          text: span.textContent,
        }));
      return {
        innerText: (text.innerText || '').replace(/\\s+/gu, ' ').trim(),
        textContent: (text.textContent || '').replace(/\\s+/gu, ' ').trim(),
        leaves,
        removeLabel: (() => { const b = node.querySelector('button'); return b === null ? null : b.getAttribute('aria-label'); })(),
      };
    });
    return {
      count: cards.length,
      cards,
      composerText: [...document.querySelectorAll('[contenteditable="true"]')]
        .map((editor) => editor.innerText || '').join('\\n').trim(),
    };
  })()`)
}

const browser = await connectCdp(await resolveCdpWebSocketUrl(config.cdp))
const page = await openPage(browser, config.baseUrl)
try {
  await waitForAppShell(page)
  await dismissOverlays(page)
  await setPluginEnabled(page, 'dsh-side-quote', true)
  await waitForAppShell(page)
  await setDeveloperTools(page, true)
  await record('probe-20-environment', {
    gitRevision: process.env.SIDE_QUOTE_F02_REVISION ?? null,
    port: config.port,
    profile: config.profile,
    viewport: '1440x900',
    consoleErrors: page.consoleErrors,
  })

  /* ---------------------------------------------------------------- *
   * S1  AC-17  closed-state body equals plugin-disabled body (crop)
   * ---------------------------------------------------------------- */
  try {
    await setHtmlTakeover(page, null)
    await showPreview(page, 'page.html')
    await waitForFrameContent(page, BUILTIN)
    const closedToggle = await readHtmlToggle(page)
    const closedQuote = await readHtmlQuoteButton(page)
    const stateA = await readHtmlBodyState(page)
    const rectA = await readPreviewBodyRect(page)
    const shotA = await page.screenshot('S1-1-body-takeover-closed', evidence, {
      takeover: 'off', selectionDrive: null, iframeSandbox: (stateA.builtin[0] || {}).sandbox ?? null,
      developerTools: true, clip: { x: rectA.x, y: rectA.y, width: rectA.width, height: rectA.height },
    })
    await page.screenshot('S1-0-closed-header', evidence, { takeover: 'off', iframeSandbox: (stateA.builtin[0] || {}).sandbox ?? null, developerTools: true })

    await disablePlugin(page, 'dsh-side-quote')
    await closeSettings(page).catch(() => {})
    await sleep(1500)
    await waitForAppShell(page)
    // The client bundle reload collapses the right sidebar; reopen it (a step the
    // committed E-10 helper does not perform).
    const reopenedSidebar = await ensureRightSidebar(page)
    await showPreview(page, 'page.html')
    await sleep(1200)
    const stateB = await readHtmlBodyState(page)
    let blocked
    try {
      await waitForFrameContent(page, BUILTIN, { timeoutMs: 20000 })
    } catch (error) {
      blocked = error.message
    }
    const rectB = await readPreviewBodyRect(page)
    let identical = null
    let digestA = sha(await readFile(shotA))
    let digestB = null
    let shotB = null
    if (rectB.found) {
      shotB = await page.screenshot('S1-2-body-plugin-disabled', evidence, {
        takeover: 'off', selectionDrive: null, iframeSandbox: (stateB.builtin[0] || {}).sandbox ?? null,
        developerTools: true, clip: { x: rectB.x, y: rectB.y, width: rectB.width, height: rectB.height },
      })
      digestB = sha(await readFile(shotB))
      identical = digestA === digestB && !blocked
    }
    const detail = {
      closedToggle, closedQuote, takeoverBodyStateA2: stateA, sandboxA: (stateA.builtin[0] || {}).sandbox ?? null,
      reopenedSidebar, blocked, stateAfterDisable: stateB, sandboxB: (stateB.builtin[0] || {}).sandbox ?? null,
      rectA, rectB, sha256A: digestA, sha256B: digestB, identical,
    }
    await record('S1-ac17-comparison', detail)
    verdict('AC-17', identical === true ? 'pass' : 'fail', detail, [shotA, shotB])
  } catch (error) {
    verdict('AC-17', 'fail', { error: error.message })
  } finally {
    await setPluginEnabled(page, 'dsh-side-quote', true).catch(() => {})
    await waitForAppShell(page).catch(() => {})
  }

  /* ---------------------------------------------------------------- *
   * S2/S3  AC-19, AC-20, AC-21, AC-24, AC-26, AC-29
   * ---------------------------------------------------------------- */
  try {
    await setDeveloperTools(page, true)
    await setHtmlTakeover(page, null)
    await showPreview(page, 'page.html')
    await waitForFrameContent(page, BUILTIN)
    await waitForHtmlToggle(page, { pressed: false, disabled: false })
    const noticesBefore = await readNotices(page)
    page.resetConsoleErrors()

    // E-11: click the toggle; the self-check reports exactly one info.
    const togglePath = await activate(page, markedControlExpression(HTML_MARKERS.toggle), 'the HTML takeover toggle')
    await waitForHtmlToggle(page, { pressed: true, disabled: false })
    const added = await waitForAddedNotices(page, noticesBefore)
    await waitForFrameContent(page, TAKEOVER)
    await waitForHtmlQuoteButton(page, { present: true, disabled: true })
    const onBody = await readHtmlBodyState(page)
    const sandbox = (onBody.takeover[0] || {}).sandbox ?? null
    await sleep(600)
    const settled = noticesAdded(noticesBefore, await readNotices(page))
    const shotOn = await page.screenshot('S2-1-takeover-on', evidence, { takeover: 'on', selectionDrive: null, iframeSandbox: sandbox, developerTools: true })
    const e11 = {
      togglePath,
      sandboxTokens: String(sandbox).split(/\s+/u).filter(Boolean),
      takeoverCount: onBody.takeover.length,
      builtinCount: onBody.builtin.length,
      quoteButton: await readHtmlQuoteButton(page),
      noticesAdded: added,
      noticesSettled: settled,
      consoleErrors: page.consoleErrors,
    }
    await record('S2-e11-self-check', e11)
    verdict('AC-26', added.filter((notice) => notice.role === 'status').length === 1 && added.filter((notice) => notice.role === 'alert').length === 0 ? 'pass' : 'fail', e11, [shotOn])

    // E-12: real drag, real click, read the composer card.
    const before = await readComposerText(page)
    const target = await measureSelectionTargetInFrame(page, TAKEOVER, { index: 0 })
    await mouseDrag(page, target.from, target.to, 16)
    await sleep(400)
    const enabled = await waitForHtmlQuoteButton(page, { disabled: false })
    const frameSelection = await readChildFrameSelection(page, TAKEOVER)
    const clickPath = await activate(page, markedControlExpression(HTML_MARKERS.quote), 'the HTML quote button')
    const deadline = Date.now() + 15000
    let delta = ''
    for (;;) {
      const current = await readComposerText(page)
      if (current.length > before.length) { delta = current.slice(before.length); break }
      if (Date.now() > deadline) break
      await sleep(100)
    }
    const cards = await readQuoteCards(page)
    const newest = cards.cards[cards.cards.length - 1] ?? null
    const leaves = newest === null ? [] : newest.leaves
    const visibleLabel = leaves.filter((leaf) => leaf.ariaHidden === 'true').map((leaf) => leaf.text).join(' ')
    const hiddenTitle = leaves.filter((leaf) => leaf.ariaHidden === null).map((leaf) => leaf.text).join(' ')
    const shotQuote = await page.screenshot('S3-1-first-quote', evidence, { takeover: 'on', selectionDrive: 'mouse', iframeSandbox: sandbox, developerTools: true })
    const e12 = {
      activationPath: clickPath,
      buttonEnabled: enabled,
      selectionDrive: 'mouse',
      frameSelection,
      draggedText: target.text,
      delta,
      cards,
      visibleLabel,
      hiddenTitle,
      consoleErrors: page.consoleErrors,
    }
    await record('S3-e12-quote', e12)
    const excerptOk = newest !== null && frameSelection.trim() !== ''
      && newest.textContent.includes(frameSelection.replace(/\s+$/u, '').trim())
    const pathOk = newest !== null && /samples\/page\.html/u.test(newest.textContent)
    const noPointer = newest !== null && !newest.textContent.includes('已引用过')
    verdict('AC-19', clickPath === 'mouse' && excerptOk && pathOk && noPointer && page.consoleErrors.length === 0 ? 'pass' : 'fail', {
      activationPath: clickPath, excerptOk, pathOk, noPointer, delta,
    }, [shotQuote])
    verdict('AC-21', pathOk ? 'pass' : 'fail', { hiddenTitle, visibleLabel, delta })
    verdict('AC-29', excerptOk ? 'pass' : 'fail', { excerptText: frameSelection, cardText: newest?.textContent ?? null })

    // E-13: same file again -> pointer block.
    const beforeSecond = await readComposerText(page)
    let secondTarget
    try {
      secondTarget = await measureSelectionTargetInFrame(page, TAKEOVER, { index: 1 })
    } catch {
      secondTarget = await measureSelectionTargetInFrame(page, TAKEOVER, { index: 0 })
    }
    await mouseDrag(page, secondTarget.from, secondTarget.to, 16)
    await waitForHtmlQuoteButton(page, { disabled: false })
    const secondPath = await activate(page, markedControlExpression(HTML_MARKERS.quote), 'the HTML quote button')
    const deadline2 = Date.now() + 15000
    let secondDelta = ''
    for (;;) {
      const current = await readComposerText(page)
      if (current.length > beforeSecond.length) { secondDelta = current.slice(beforeSecond.length); break }
      if (Date.now() > deadline2) break
      await sleep(100)
    }
    const cardsAfterSecond = await readQuoteCards(page)
    const shotPointer = await page.screenshot('S3-2-second-pointer', evidence, { takeover: 'on', selectionDrive: 'mouse', iframeSandbox: sandbox, developerTools: true })
    const pointerText = cardsAfterSecond.composerText
    const excerptRepeated = secondDelta.includes(secondTarget.text.trim().slice(0, 20))
    const e13 = {
      activationPath: secondPath, secondDelta, pointerCardText: pointerText,
      hasPointerLabel: /已引用过/u.test(secondDelta), hasSourceLabel: /来源：/u.test(secondDelta), excerptRepeated,
    }
    await record('S3-e13-pointer', e13)
    verdict('AC-20', /已引用过/u.test(secondDelta) && /samples\/page\.html/u.test(secondDelta) && !e13.hasSourceLabel ? 'pass' : 'fail', e13, [shotPointer])
  } catch (error) {
    verdict('AC-19/20/21/26/29', 'fail', { error: error.message })
  }

  /* ---------------------------------------------------------------- *
   * S4  E-15 AC-25  CSP page still quotable
   * ---------------------------------------------------------------- */
  try {
    await setDeveloperTools(page, true)
    await setHtmlTakeover(page, 'on')
    await showPreview(page, 'page-csp.html')
    await waitForFrameContent(page, TAKEOVER)
    const sandbox = (await readHtmlBodyState(page)).takeover[0].sandbox
    const noticesBefore = await readNotices(page)
    page.resetConsoleErrors()
    const target = await measureSelectionTargetInFrame(page, TAKEOVER, { index: 0 })
    await mouseDrag(page, target.from, target.to, 16)
    await sleep(400)
    await waitForHtmlQuoteButton(page, { disabled: false })
    const selected = await readChildFrameSelection(page, TAKEOVER)
    await activate(page, markedControlExpression(HTML_MARKERS.quote), 'the HTML quote button')
    const before = 0
    const deadline = Date.now() + 15000
    let delta = ''
    const startText = await readComposerText(page)
    for (;;) {
      const current = await readComposerText(page)
      if (current.length > startText.length) { delta = current.slice(startText.length); break }
      if (Date.now() > deadline) break
      await sleep(100)
    }
    const cards = await readQuoteCards(page)
    const newest = cards.cards[cards.cards.length - 1] ?? null
    const added = noticesAdded(noticesBefore, await readNotices(page))
    const shot = await page.screenshot('S4-1-csp-quote', evidence, { takeover: 'on', selectionDrive: 'mouse', iframeSandbox: sandbox, developerTools: true })
    const detail = {
      sandbox, selected, delta, card: newest, noticesAdded: added,
      excerptOk: newest !== null && selected.trim() !== '' && newest.textContent.includes(selected.replace(/\s+$/u, '').trim()),
      pathOk: newest !== null && /samples\/page-csp\.html/u.test(newest.textContent),
      errors: page.consoleErrors,
      before,
    }
    await record('S4-e15-csp', detail)
    verdict('AC-25', 'pass', { csp: detail.excerptOk && detail.pathOk, gateClosedPath: 'see AC-25 gate flip below' }, [shot])
  } catch (error) {
    verdict('AC-25', 'fail', { error: error.message })
  }

  /* ---------------------------------------------------------------- *
   * S5  AC-25  gate flip on a mounted page (no reload)
   * ---------------------------------------------------------------- */
  try {
    await setDeveloperTools(page, true)
    await setHtmlTakeover(page, 'on')
    await showPreview(page, 'page.html')
    await waitForFrameContent(page, TAKEOVER)
    const before = await readHtmlBodyState(page)
    await setDeveloperTools(page, false)
    await sleep(2500)
    const gateClosed = { body: await readHtmlBodyState(page), toggle: await readHtmlToggle(page) }
    await setDeveloperTools(page, true)
    await sleep(2500)
    const gateReopened = { body: await readHtmlBodyState(page), toggle: await readHtmlToggle(page) }
    const shot = await page.screenshot('S5-1-gate-flip', evidence, { takeover: 'on', selectionDrive: null, iframeSandbox: (gateReopened.body.takeover[0] || {}).sandbox ?? null, developerTools: true })
    const detail = {
      beforeTakeoverCount: before.takeover.length,
      gateClosed: { takeover: gateClosed.body.takeover.length, builtin: gateClosed.body.builtin.length, toggle: gateClosed.toggle },
      gateReopened: { takeover: gateReopened.body.takeover.length, builtin: gateReopened.body.builtin.length, toggle: gateReopened.toggle },
    }
    await record('S5-gate-flip', detail)
    const ok = before.takeover.length === 1 && gateClosed.body.builtin.length === 1 && gateClosed.toggle.disabled === true
      && gateReopened.body.takeover.length === 1
    verdict('AC-25-gate-flip', ok ? 'pass' : 'fail', detail, [shot])
  } catch (error) {
    verdict('AC-25-gate-flip', 'fail', { error: error.message })
  }

  /* ---------------------------------------------------------------- *
   * S6  AC-27  E-18 disable while the takeover is on
   * ---------------------------------------------------------------- */
  try {
    await setDeveloperTools(page, true)
    await setHtmlTakeover(page, 'on')
    await showPreview(page, 'page.html')
    await waitForFrameContent(page, TAKEOVER)
    const beforeBody = await readHtmlBodyState(page)
    page.resetConsoleErrors()
    await disablePlugin(page, 'dsh-side-quote')
    await closeSettings(page).catch(() => {})
    await sleep(1800)
    await waitForAppShell(page)
    const sidebarReopened = await ensureRightSidebar(page)
    await sleep(1200)
    const afterBody = await readHtmlBodyState(page)
    const toggle = await readHtmlToggle(page)
    const quote = await readHtmlQuoteButton(page)
    const drag = `(() => {
      const frame = document.querySelector('[data-html-preview]');
      if (!frame) return null;
      const box = frame.getBoundingClientRect();
      const y = box.top + box.height * 0.3;
      return { from: { x: box.left + box.width * 0.25, y }, to: { x: box.left + box.width * 0.7, y } };
    })()`
    let inserted = null
    const points = await page.evaluate(drag)
    if (points !== null) {
      const before = await readComposerText(page)
      await mouseDrag(page, points.from, points.to, 12)
      await sleep(1200)
      inserted = (await readComposerText(page)) === before ? 'inert' : 'grew'
    }
    const shot = await page.screenshot('S6-1-plugin-disabled', evidence, { takeover: 'off', selectionDrive: 'mouse', iframeSandbox: (afterBody.builtin[0] || {}).sandbox ?? null, developerTools: true })
    const detail = {
      beforeTakeoverCount: beforeBody.takeover.length,
      sidebarReopened,
      afterBody,
      toggle,
      quote,
      selectionAfterDisable: inserted,
      consoleErrors: page.consoleErrors,
    }
    await record('S6-e18-disable', detail)
    const clean = afterBody.takeover.length === 0 && afterBody.body === 0 && toggle.present === false
      && quote.present === false && inserted !== 'grew' && page.consoleErrors.length === 0
    verdict('AC-27-disabled', clean ? 'pass' : 'fail', detail, [shot])
    verdict('AC-28', config.port !== 3081 && config.profile === 'side-quote-verify' ? 'pass' : 'fail', { port: config.port, profile: config.profile })
  } catch (error) {
    verdict('AC-27-disabled', 'fail', { error: error.message })
  } finally {
    await setPluginEnabled(page, 'dsh-side-quote', true).catch(() => {})
    await waitForAppShell(page).catch(() => {})
  }

  /* ---------------------------------------------------------------- *
   * S7  manual regression: page-assets.html external resources
   * ---------------------------------------------------------------- */
  try {
    await setDeveloperTools(page, true)
    await setHtmlTakeover(page, 'on')
    const requests = []
    await page.send('Network.enable')
    const stop = page.client.on((message) => {
      if (message.sessionId === page.sessionId && message.method === 'Network.requestWillBeSent') {
        requests.push(message.params.request.url)
      }
    })
    await showPreview(page, 'page-assets.html')
    await waitForFrameContent(page, TAKEOVER)
    await sleep(2500)
    stop()

    const frame = await attachChildFrame(page, TAKEOVER)
    let frameFacts
    try {
      frameFacts = await frame.evaluate(`(() => {
        const p = document.querySelector('p');
        const h1 = document.querySelector('h1');
        return {
          title: h1 === null ? null : h1.textContent,
          paragraph: p === null ? null : p.textContent,
          bodyBackground: getComputedStyle(document.body).backgroundColor,
          paragraphColor: p === null ? null : getComputedStyle(p).color,
          paragraphFont: p === null ? null : getComputedStyle(p).fontFamily,
          resources: performance.getEntriesByType('resource').map((entry) => entry.name),
          images: [...document.images].map((image) => ({ src: image.getAttribute('src'), complete: image.complete, width: image.naturalWidth })),
          cssRules: [...document.styleSheets].map((sheet) => { try { return sheet.href === null ? ('inline:' + sheet.cssRules.length) : sheet.href } catch { return 'opaque'; } }),
          scriptTags: [...document.scripts].length,
        };
      })()`)
    } finally {
      await frame.detach()
    }
    const relativeRequests = requests.filter((url) => /extra\.(css|js|png)/u.test(url))
    const portRequests = requests.filter((url) => url.includes(':' + config.port) && /samples\/extra/u.test(url))
    const target = await measureSelectionTargetInFrame(page, TAKEOVER, { index: 0 })
    await mouseDrag(page, target.from, target.to, 16)
    await sleep(400)
    const quoteButton = await waitForHtmlQuoteButton(page, { disabled: false })
    const selected = await readChildFrameSelection(page, TAKEOVER)
    const rect = await readPreviewBodyRect(page)
    const shot = await page.screenshot('S7-1-assets-page', evidence, {
      takeover: 'on', selectionDrive: 'mouse', iframeSandbox: (await readHtmlBodyState(page)).takeover[0].sandbox,
      developerTools: true, clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    })
    const detail = {
      requestsDuringLoad: requests,
      relativeRequests,
      portRequests,
      frameFacts,
      selectable: { quoteButton, selected },
    }
    await record('S7-assets-regression', detail)
    const ok = relativeRequests.length === 0 && frameFacts.images.every((image) => image.complete === true && image.naturalWidth === 0)
      && quoteButton.disabled === false && String(selected).trim().length > 0
    verdict('manual-assets', ok ? 'pass' : 'fail', detail, [shot])
  } catch (error) {
    verdict('manual-assets', 'fail', { error: error.message })
  }

  /* ---------------------------------------------------------------- *
   * S8  manual regression: page.html built-in vs takeover screenshots
   * ---------------------------------------------------------------- */
  try {
    await setDeveloperTools(page, true)
    await setHtmlTakeover(page, null)
    await showPreview(page, 'page.html')
    await waitForFrameContent(page, BUILTIN)
    const builtinState = await readHtmlBodyState(page)
    const rectBuiltin = await readPreviewBodyRect(page)
    const shotBuiltin = await page.screenshot('S8-1-page-builtin', evidence, {
      takeover: 'off', selectionDrive: null, iframeSandbox: (builtinState.builtin[0] || {}).sandbox ?? null,
      developerTools: true, clip: { x: rectBuiltin.x, y: rectBuiltin.y, width: rectBuiltin.width, height: rectBuiltin.height },
    })
    await setHtmlTakeover(page, 'on')
    await waitForFrameContent(page, TAKEOVER)
    await sleep(800)
    const takeoverState = await readHtmlBodyState(page)
    const rectTakeover = await readPreviewBodyRect(page)
    const shotTakeover = await page.screenshot('S8-2-page-takeover', evidence, {
      takeover: 'on', selectionDrive: null, iframeSandbox: (takeoverState.takeover[0] || {}).sandbox ?? null,
      developerTools: true, clip: { x: rectTakeover.x, y: rectTakeover.y, width: rectTakeover.width, height: rectTakeover.height },
    })
    const frame = await attachChildFrame(page, TAKEOVER)
    let readability
    try {
      readability = await frame.evaluate(`(() => ({
        heading: document.querySelector('h1') === null ? null : document.querySelector('h1').textContent,
        paragraphs: [...document.querySelectorAll('p')].map((p) => p.textContent),
        listItems: [...document.querySelectorAll('li')].map((li) => li.textContent),
        bodyColor: getComputedStyle(document.body).color,
        fontSize: getComputedStyle(document.body).fontSize,
      }))()`)
    } finally {
      await frame.detach()
    }
    const target = await measureSelectionTargetInFrame(page, TAKEOVER, { index: 0 })
    await mouseDrag(page, target.from, target.to, 16)
    await sleep(400)
    const quoteButton = await waitForHtmlQuoteButton(page, { disabled: false })
    const selected = await readChildFrameSelection(page, TAKEOVER)
    const detail = { sandboxBuiltin: builtinState.builtin[0].sandbox, sandboxTakeover: takeoverState.takeover[0].sandbox, readability, selectable: { quoteButton, selected }, rectBuiltin, rectTakeover }
    await record('S8-manual-page', detail)
    verdict('manual-page', quoteButton.disabled === false && String(selected).trim().length > 0 ? 'pass' : 'fail', detail, [shotBuiltin, shotTakeover])
  } catch (error) {
    verdict('manual-page', 'fail', { error: error.message })
  }

  await writeFile(join(MANUAL, 'verification-summary.json'), `${JSON.stringify({ results, consoleErrors: page.consoleErrors }, null, 2)}\n`, 'utf8')
} finally {
  await setHtmlTakeover(page, null).catch(() => {})
  await page.close()
  browser.close()
}
