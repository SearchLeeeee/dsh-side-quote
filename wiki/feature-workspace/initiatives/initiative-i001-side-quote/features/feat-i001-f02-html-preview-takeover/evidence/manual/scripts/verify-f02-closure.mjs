// I001-F02 independent verification, closure run:
//   A. AC-17 two-phase body comparison (the plugin-disabled phase is observed
//      after a page reload, because the open tab keeps an empty body otherwise).
//   B. AC-24 opaque-origin proof from the parent side (the bridge only accepts
//      event.origin === 'null').
//   C. page-assets external-resource facts with a corrected assertion.
//   D. page-csp: the page's own CSP is present in the rendered document and the
//      bridge still works.
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  HTML_MARKERS, activate, attachChildFrame, closeSettings, connectCdp, dismissOverlays, disablePlugin,
  markedControlExpression, measureSelectionTargetInFrame, mouseDrag, openFilePreview, openPage,
  readChildFrameSelection, readE2eConfig, readHtmlBodyState, readHtmlQuoteButton, readHtmlToggle, readPreviewBodyRect,
  reloadPage, resolveCdpWebSocketUrl, setDeveloperTools, setHtmlTakeover, setPluginEnabled, waitForAppShell,
  waitForFrameContent, waitForHtmlQuoteButton,
} from 'file:///C:/Users/search/AppData/Local/Temp/side-quote-f02/e2e-copy/cdp.mjs'

const config = readE2eConfig()
const OUT = config.evidenceDir
const MANUAL = join(OUT, '..', 'manual')
const evidence = { evidenceDir: OUT, baseUrl: config.baseUrl, port: config.port, profile: config.profile }
const TAKEOVER = `[${HTML_MARKERS.frame}]`
const BUILTIN = '[data-html-preview]'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const results = []
const record = async (name, value) => {
  await writeFile(join(MANUAL, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  console.log(`\n### ${name}\n${JSON.stringify(value, null, 2)}`)
}
const verdict = (id, status, detail, files = []) => {
  results.push({ id, status, detail, files })
  console.log(`\n== ${id}: ${status} ==`)
}

async function ensureRightSidebar(page) {
  const hasTabs = await page.evaluate(`(() => [...document.querySelectorAll('[role="tab"]')].some((element) => element.getClientRects().length > 0))()`)
  if (hasTabs === true) return false
  const toggle = `(() => ['打开右侧边栏', 'Open right sidebar', 'Open sidebar'].map((label) => [...document.querySelectorAll('[aria-label]')].find((element) => (element.getAttribute('aria-label') || '').trim() === label)).find(Boolean) || null)()`
  if ((await page.evaluate(`(() => ${toggle} !== null)()`)) !== true) return false
  await activate(page, toggle, 'the right sidebar toggle')
  await sleep(900)
  return true
}

const browser = await connectCdp(await resolveCdpWebSocketUrl(config.cdp))
const page = await openPage(browser, config.baseUrl)
try {
  await waitForAppShell(page)
  await dismissOverlays(page)
  await setPluginEnabled(page, 'dsh-side-quote', true)
  await waitForAppShell(page)
  await setDeveloperTools(page, true)

  /* A. AC-17 ------------------------------------------------------------ */
  try {
    await setHtmlTakeover(page, null)
    await openFilePreview(page, { directories: ['samples'], fileName: 'page.html' })
    await waitForFrameContent(page, BUILTIN)
    const toggleA = await readHtmlToggle(page)
    const quoteA = await readHtmlQuoteButton(page)
    const stateA = await readHtmlBodyState(page)
    const rectA = await readPreviewBodyRect(page)
    const clip = { x: rectA.x, y: rectA.y, width: rectA.width, height: rectA.height }
    const shotA = await page.screenshot('R1-1-body-takeover-closed', evidence, {
      takeover: 'off', selectionDrive: null, iframeSandbox: (stateA.builtin[0] || {}).sandbox ?? null,
      developerTools: true, clip,
    })

    // Plugin-disabled phase. The open tab keeps an empty body after the client
    // bundle is torn down, so this phase is observed after a reload — recorded
    // as a deviation from E-10's step order, not as a silent substitution.
    await disablePlugin(page, 'dsh-side-quote')
    await closeSettings(page).catch(() => {})
    await sleep(1200)
    await reloadPage(page)
    await ensureRightSidebar(page)
    await openFilePreview(page, { directories: ['samples'], fileName: 'page.html' })
    await waitForFrameContent(page, BUILTIN, { timeoutMs: 25000 })
    await sleep(1200)
    const toggleB = await readHtmlToggle(page)
    const quoteB = await readHtmlQuoteButton(page)
    const stateB = await readHtmlBodyState(page)
    const rectB = await readPreviewBodyRect(page)
    const clipB = { x: rectB.x, y: rectB.y, width: rectB.width, height: rectB.height }
    const shotB = await page.screenshot('R1-2-body-plugin-disabled', evidence, {
      takeover: 'off', selectionDrive: null, iframeSandbox: (stateB.builtin[0] || {}).sandbox ?? null,
      developerTools: true, clip: clipB,
    })
    const bytesA = await readFile(shotA)
    const bytesB = await readFile(shotB)
    const detail = {
      phaseA: { toggle: toggleA, quoteButton: quoteA, body: stateA, rect: rectA, sandbox: (stateA.builtin[0] || {}).sandbox ?? null },
      phaseB: { toggle: toggleB, quoteButton: quoteB, body: stateB, rect: rectB, sandbox: (stateB.builtin[0] || {}).sandbox ?? null },
      sameClip: JSON.stringify(clip) === JSON.stringify(clipB),
      sha256A: sha(bytesA), sha256B: sha(bytesB), bytesA: bytesA.length, bytesB: bytesB.length,
      identical: bytesA.equals(bytesB),
    }
    await record('R1-ac17-two-phase', detail)
    verdict('AC-17', detail.identical && detail.sameClip && detail.phaseB.toggle.present === false && detail.phaseB.quoteButton.present === false ? 'pass' : 'fail', detail, [shotA, shotB])
  } catch (error) {
    verdict('AC-17', 'fail', { error: error.message })
  } finally {
    await setPluginEnabled(page, 'dsh-side-quote', true).catch(() => {})
    await waitForAppShell(page).catch(() => {})
    await reloadPage(page).catch(() => {})
  }

  /* B. AC-24 opaque origin ---------------------------------------------- */
  try {
    await setDeveloperTools(page, true)
    await setHtmlTakeover(page, 'on')
    await ensureRightSidebar(page)
    await openFilePreview(page, { directories: ['samples'], fileName: 'page.html' })
    await waitForFrameContent(page, TAKEOVER)
    await page.evaluate(`(() => {
      window.__f02Messages = [];
      window.addEventListener('message', (event) => {
        const frame = document.querySelector('${TAKEOVER}');
        window.__f02Messages.push({
          origin: String(event.origin),
          fromFrame: frame !== null && event.source === frame.contentWindow,
          channel: event.data && event.data.channel ? String(event.data.channel) : null,
          kind: event.data && event.data.kind ? String(event.data.kind) : null,
        });
      }, true);
      return true;
    })()`)
    const target = await measureSelectionTargetInFrame(page, TAKEOVER, { index: 0 })
    await mouseDrag(page, target.from, target.to, 16)
    await sleep(600)
    const captured = await page.evaluate('(() => window.__f02Messages || [])()')
    const quoteButton = await waitForHtmlQuoteButton(page, { disabled: false })
    const detail = { captured, quoteButton, acceptedByBridge: quoteButton.disabled === false }
    await record('R2-ac24-origin', detail)
    const allNullOrigin = captured.length > 0 && captured.every((message) => message.origin === 'null' && message.fromFrame === true)
    verdict('AC-24', allNullOrigin && quoteButton.disabled === false ? 'pass' : 'fail', detail)
  } catch (error) {
    verdict('AC-24', 'fail', { error: error.message })
  }

  /* C. page-assets ------------------------------------------------------- */
  try {
    await setDeveloperTools(page, true)
    await setHtmlTakeover(page, 'on')
    const requests = []
    await page.send('Network.enable')
    const stop = page.client.on((message) => {
      if (message.sessionId === page.sessionId && message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url)
    })
    await ensureRightSidebar(page)
    await openFilePreview(page, { directories: ['samples'], fileName: 'page-assets.html' })
    await waitForFrameContent(page, TAKEOVER)
    await sleep(2500)
    stop()
    const frame = await attachChildFrame(page, TAKEOVER)
    let facts
    try {
      facts = await frame.evaluate(`(() => {
        const p = document.querySelector('p');
        return {
          extraLoadedFlag: document.body.dataset.extraLoaded === undefined ? null : document.body.dataset.extraLoaded,
          bodyBackground: getComputedStyle(document.body).backgroundColor,
          paragraphColor: p === null ? null : getComputedStyle(p).color,
          images: [...document.images].map((image) => ({ src: image.getAttribute('src'), complete: image.complete, naturalWidth: image.naturalWidth })),
          resources: performance.getEntriesByType('resource').map((entry) => entry.name),
          paragraphText: p === null ? null : p.textContent,
          heading: document.querySelector('h1') === null ? null : document.querySelector('h1').textContent,
        };
      })()`)
    } finally {
      await frame.detach()
    }
    const relativeRequests = requests.filter((url) => /extra\.(css|js|png)/u.test(url))
    const target = await measureSelectionTargetInFrame(page, TAKEOVER, { index: 0 })
    await mouseDrag(page, target.from, target.to, 16)
    await sleep(500)
    const quoteButton = await waitForHtmlQuoteButton(page, { disabled: false })
    const selected = await readChildFrameSelection(page, TAKEOVER)
    const rect = await readPreviewBodyRect(page)
    const shot = await page.screenshot('R3-1-assets-page', evidence, {
      takeover: 'on', selectionDrive: 'mouse', iframeSandbox: (await readHtmlBodyState(page)).takeover[0].sandbox,
      developerTools: true, clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    })
    const detail = {
      requestsDuringLoad: requests, relativeRequests,
      cssInjected: facts.extraLoadedFlag !== null || facts.bodyBackground === 'rgb(17, 34, 51)',
      scriptRan: facts.extraLoadedFlag !== null,
      imageLoaded: facts.images.some((image) => image.naturalWidth > 0),
      facts, selectable: { quoteButton, selected },
    }
    await record('R3-assets', detail)
    const ok = relativeRequests.length === 0 && detail.cssInjected === false && detail.scriptRan === false
      && detail.imageLoaded === false && quoteButton.disabled === false && String(selected).trim().length > 0
    verdict('manual-assets', ok ? 'pass' : 'fail', detail, [shot])
  } catch (error) {
    verdict('manual-assets', 'fail', { error: error.message })
  }

  /* D. page-csp ---------------------------------------------------------- */
  try {
    await setDeveloperTools(page, true)
    await setHtmlTakeover(page, 'on')
    await ensureRightSidebar(page)
    await openFilePreview(page, { directories: ['samples'], fileName: 'page-csp.html' })
    await waitForFrameContent(page, TAKEOVER)
    const frame = await attachChildFrame(page, TAKEOVER)
    let csp
    try {
      csp = await frame.evaluate(`(() => {
        const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
        return {
          metaPresent: meta !== null,
          metaContent: meta === null ? null : meta.getAttribute('content'),
          heading: document.querySelector('h1') === null ? null : document.querySelector('h1').textContent,
          paragraphs: [...document.querySelectorAll('p')].map((p) => p.textContent),
          scriptCount: document.scripts.length,
        };
      })()`)
    } finally {
      await frame.detach()
    }
    const target = await measureSelectionTargetInFrame(page, TAKEOVER, { index: 0 })
    await mouseDrag(page, target.from, target.to, 16)
    await sleep(500)
    const quoteButton = await waitForHtmlQuoteButton(page, { disabled: false })
    const selected = await readChildFrameSelection(page, TAKEOVER)
    const rect = await readPreviewBodyRect(page)
    const shot = await page.screenshot('R4-1-csp-page', evidence, {
      takeover: 'on', selectionDrive: 'mouse', iframeSandbox: (await readHtmlBodyState(page)).takeover[0].sandbox,
      developerTools: true, clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    })
    const detail = { csp, selectable: { quoteButton, selected } }
    await record('R4-csp', detail)
    verdict('manual-csp', csp.metaPresent && csp.metaContent === "script-src 'none'" && quoteButton.disabled === false ? 'pass' : 'fail', detail, [shot])
  } catch (error) {
    verdict('manual-csp', 'fail', { error: error.message })
  }

  await writeFile(join(MANUAL, 'closure-summary.json'), `${JSON.stringify({ results, consoleErrors: page.consoleErrors }, null, 2)}\n`, 'utf8')
} finally {
  await setHtmlTakeover(page, null).catch(() => {})
  await page.close()
  browser.close()
}
