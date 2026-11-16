// Independent verification probe (read-only against the isolation instance).
// Reproduces E-12, measures the frame origin question, and inspects what the
// composer and the right sidebar actually render. Evidence: nothing is written
// here except screenshots through the harness into the feature evidence dir.
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  HTML_MARKERS, activate, attachChildFrame, connectCdp, markedControlExpression, measureSelectionTargetInFrame,
  mouseDrag, openFilePreview, openPage, readChildFrameIsolation, readComposerText, readE2eConfig,
  readHtmlBodyState, readHtmlQuoteButton, readHtmlToggle, readPreviewBodyRect, readNotices,
  resolveCdpWebSocketUrl, setDeveloperTools, setHtmlTakeover, setPluginEnabled, disablePlugin, closeSettings,
  waitForAppShell, waitForElementCount, waitForFrameContent, waitForHtmlQuoteButton, waitForHtmlToggle,
  dismissOverlays,
} from 'file:///C:/Users/search/AppData/Local/Temp/side-quote-f02/e2e-copy/cdp.mjs'

const config = readE2eConfig()
const OUT = join(config.evidenceDir, '..', 'manual')
const note = async (name, value) => {
  await writeFile(join(OUT, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  console.log(`\n### ${name}\n${JSON.stringify(value, null, 2)}`)
}
const evidence = { evidenceDir: config.evidenceDir, baseUrl: config.baseUrl, port: config.port, profile: config.profile }

const browser = await connectCdp(await resolveCdpWebSocketUrl(config.cdp))
const page = await openPage(browser, config.baseUrl)
const TAKEOVER = `[${HTML_MARKERS.frame}]`
const BUILTIN = '[data-html-preview]'
try {
  await waitForAppShell(page)
  await dismissOverlays(page)

  // -- 0. plugin must be enabled; the gate must be readable ---------------
  await setPluginEnabled(page, 'dsh-side-quote', true)
  await waitForAppShell(page)
  const gate = await setDeveloperTools(page, true)
  await note('probe-00-gate', { gate })

  await setHtmlTakeover(page, 'on')
  await openFilePreview(page, { directories: ['samples'], fileName: 'page.html' })
  await waitForFrameContent(page, TAKEOVER)
  const toggle = await readHtmlToggle(page)
  const bodyOn = await readHtmlBodyState(page)
  await note('probe-01-takeover-on', { toggle, body: bodyOn })

  // -- 1. the same measurement on the built-in frame ---------------------
  // Both frames are platform-dominated by a sandbox attribute; if the built-in
  // frame reports the same "origin", the reading is an artefact of the DevTools
  // isolated world rather than something the plugin changed.
  const takeoverIsolation = await readChildFrameIsolation(page, TAKEOVER)
  await note('probe-02-takeover-isolation', takeoverIsolation)

  // -- 2. E-12 reproduction: real drag, real click, composer DOM ---------
  const target = await measureSelectionTargetInFrame(page, TAKEOVER, { index: 0 })
  const before = await readComposerText(page)
  await mouseDrag(page, target.from, target.to, 16)
  await new Promise((resolve) => setTimeout(resolve, 400))
  const button = await waitForHtmlQuoteButton(page, { disabled: false })
  const frameSelection = await page.evaluate(`(() => {
    const frame = document.querySelector('${TAKEOVER}');
    return frame === null ? null : { sandbox: frame.getAttribute('sandbox'), src: String(frame.getAttribute('src')).slice(0, 24) };
  })()`)
  await note('probe-03-selection', { target: { text: target.text, lines: target.lines }, button, frameSelection })

  const path = await activate(page, markedControlExpression(HTML_MARKERS.quote), 'the HTML quote button')
  const deadline = Date.now() + 15000
  let delta = ''
  for (;;) {
    const current = await readComposerText(page)
    if (current.length > before.length) { delta = current.slice(before.length); break }
    if (Date.now() > deadline) break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  const composerDom = await page.evaluate(`(() => {
    const editors = [...document.querySelectorAll('[contenteditable="true"]')];
    return editors.map((editor) => ({
      text: (editor.innerText || '').slice(-600),
      nodes: [...editor.childNodes].map((node) => ({
        kind: node.nodeType,
        name: node.nodeName,
        text: (node.textContent || '').slice(0, 200),
        role: node.nodeType === 1 ? (node.getAttribute('role') || node.tagName) : null,
      })),
      html: editor.innerHTML.slice(-1500),
    }));
  })()`)
  await note('probe-04-composer', { activationPath: path, delta, composerDom, selectionText: target.text })
  const clip = (await readPreviewBodyRect(page))
  await page.screenshot('manual-01-takeover-quote-e12', evidence, {
    takeover: 'on', selectionDrive: 'mouse', iframeSandbox: frameSelection?.sandbox ?? null,
    developerTools: true, clip: clip.found ? { x: clip.x, y: clip.y, width: clip.width, height: clip.height } : null,
  })

  // -- 3. what the right sidebar shows after the plugin is disabled ------
  const noticesBefore = await readNotices(page)
  let failure
  try {
    await disablePlugin(page, 'dsh-side-quote')
  } catch (error) {
    failure = error.message
  }
  await closeSettings(page).catch(() => {})
  await new Promise((resolve) => setTimeout(resolve, 2500))
  const afterDisable = await page.evaluate(`(() => {
    const previews = [...document.querySelectorAll('[data-html-preview], [data-side-quote-html],[data-side-quote-html-frame]')]
      .map((element) => ({ tag: element.tagName, marker: element.getAttribute('data-html-preview') !== null ? 'builtin' : 'takeover' }));
    const right = document.querySelector('[class*="right"], aside');
    const tabs = [...document.querySelectorAll('[role="tab"]')].map((element) => (element.textContent || '').trim());
    return {
      previews,
      tabs,
      rightText: right === null ? null : (right.innerText || '').replace(/\\s+/gu, ' ').slice(0, 600),
      bodyText: document.body.innerText.replace(/\\s+/gu, ' ').slice(0, 1200),
      dialogs: [...document.querySelectorAll('[role="dialog"]')].map((d) => (d.textContent || '').replace(/\\s+/gu, ' ').slice(0, 200)),
      rendererUnavailable: document.body.innerText.includes('无法渲染') || document.body.innerText.includes('Unavailable'),
    };
  })()`)
  await note('probe-05-after-disable', { failure, afterDisable, notices: noticesBefore, consoleErrors: page.consoleErrors })
  await page.screenshot('manual-02-after-plugin-disable', evidence, { takeover: 'off', selectionDrive: null, iframeSandbox: null, developerTools: true })

  // -- 4. reopen the file after the disable: does the builtin come back? --
  await waitForAppShell(page).catch(() => {})
  try {
    await openFilePreview(page, { directories: ['samples'], fileName: 'page.html' })
    await waitForFrameContent(page, BUILTIN, { timeoutMs: 15000 })
    const reopened = await readHtmlBodyState(page)
    await note('probe-06-reopen-after-disable', { reopened })
    await page.screenshot('manual-03-reopened-builtin', evidence, { takeover: 'off', selectionDrive: null, iframeSandbox: (reopened.builtin[0] || {}).sandbox ?? null, developerTools: true })
  } catch (error) {
    await note('probe-06-reopen-after-disable', { error: error.message, state: await readHtmlBodyState(page) })
  }
  await setPluginEnabled(page, 'dsh-side-quote', true).catch(() => {})
  await note('probe-07-console-errors', { consoleErrors: page.consoleErrors })
} finally {
  await page.close()
  browser.close()
}
