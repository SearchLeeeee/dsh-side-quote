// Independent verification probe #2.
//  A. Does the *built-in* HTML frame report the same "origin" through the same
//     DevTools measurement path? (isolates a measurement artefact)
//  B. What does the right sidebar actually render after the plugin is disabled,
//     before and after a page reload?
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  HTML_MARKERS, activate, attachChildFrame, closeSettings, connectCdp, dismissOverlays, disablePlugin,
  markedControlExpression, openFilePreview, openPage, readChildFrameIsolation, readE2eConfig,
  readHtmlBodyState, readHtmlToggle, reloadPage, resolveCdpWebSocketUrl, setDeveloperTools, setHtmlTakeover,
  setPluginEnabled, waitForAppShell, waitForFrameContent,
} from 'file:///C:/Users/search/AppData/Local/Temp/side-quote-f02/e2e-copy/cdp.mjs'

const config = readE2eConfig()
const OUT = join(config.evidenceDir, '..', 'manual')
const note = async (name, value) => {
  await writeFile(join(OUT, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  console.log(`\n### ${name}\n${JSON.stringify(value, null, 2)}`)
}
const evidence = { evidenceDir: config.evidenceDir, baseUrl: config.baseUrl, port: config.port, profile: config.profile }
const BUILTIN = '[data-html-preview]'
const TAKEOVER = `[${HTML_MARKERS.frame}]`

const sidebar = `(() => {
  const tabs = [...document.querySelectorAll('[role="tab"]')].map((element) => ({
    text: (element.textContent || '').trim(),
    selected: element.getAttribute('aria-selected'),
  }));
  const panes = [...document.querySelectorAll('[role="tabpanel"]')].map((pane) => ({
    text: (pane.innerText || '').replace(/\\s+/gu, ' ').slice(0, 500),
    iframes: [...pane.querySelectorAll('iframe')].map((frame) => ({
      marker: frame.getAttribute('data-html-preview') !== null ? 'builtin'
        : (frame.getAttribute('data-side-quote-html-frame') !== null ? 'takeover' : 'other'),
      sandbox: frame.getAttribute('sandbox'),
      src: String(frame.getAttribute('src') || '').slice(0, 30),
    })),
  }));
  return { tabs, panes };
})()`

const browser = await connectCdp(await resolveCdpWebSocketUrl(config.cdp))
const page = await openPage(browser, config.baseUrl)
try {
  await waitForAppShell(page)
  await dismissOverlays(page)
  await setPluginEnabled(page, 'dsh-side-quote', true)
  await waitForAppShell(page)
  await setDeveloperTools(page, true)

  // A. built-in frame measurement (takeover off).
  await setHtmlTakeover(page, null)
  await openFilePreview(page, { directories: ['samples'], fileName: 'page.html' })
  await waitForFrameContent(page, BUILTIN)
  const builtinState = await readHtmlBodyState(page)
  const builtinIsolation = await readChildFrameIsolation(page, BUILTIN)
  await note('probe-10-builtin-isolation', { builtinState, builtinIsolation })
  await page.screenshot('manual-04-builtin-preview', evidence, {
    takeover: 'off', iframeSandbox: (builtinState.builtin[0] || {}).sandbox ?? null, developerTools: true,
  })

  // B. takeover on, then disable the plugin and look at the sidebar.
  await setHtmlTakeover(page, 'on')
  await openFilePreview(page, { directories: ['samples'], fileName: 'page.html' })
  await waitForFrameContent(page, TAKEOVER)
  const onState = await readHtmlBodyState(page)
  await note('probe-11-before-disable', { onState, toggle: await readHtmlToggle(page) })

  await disablePlugin(page, 'dsh-side-quote')
  await closeSettings(page).catch(() => {})
  await new Promise((resolve) => setTimeout(resolve, 1500))
  await waitForAppShell(page).catch(() => {})
  await activate(page, `(() => [...document.querySelectorAll('[role="tab"]')].find((element) => (element.textContent || '').trim() === 'page.html') || null)()`, 'the page.html tab').catch((error) => note('probe-12-tab-activation-error', { error: error.message }))
  await new Promise((resolve) => setTimeout(resolve, 3000))
  const afterDisableNoReload = { sidebar: await page.evaluate(sidebar), body: await readHtmlBodyState(page) }
  await note('probe-12-after-disable-no-reload', afterDisableNoReload)
  await page.screenshot('manual-05-after-disable-sidebar', evidence, { takeover: 'off', iframeSandbox: null, developerTools: true })

  // After a reload the client bundle is re-created from what is installed now.
  await reloadPage(page)
  await activate(page, `(() => [...document.querySelectorAll('[role="tab"]')].find((element) => (element.textContent || '').trim() === 'page.html') || null)()`, 'the page.html tab').catch((error) => note('probe-13-tab-error', { error: error.message }))
  await new Promise((resolve) => setTimeout(resolve, 3000))
  const afterReload = { sidebar: await page.evaluate(sidebar), body: await readHtmlBodyState(page) }
  await note('probe-13-after-reload', afterReload)
  await page.screenshot('manual-06-after-reload-sidebar', evidence, { takeover: 'off', iframeSandbox: (afterReload.body.builtin[0] || {}).sandbox ?? null, developerTools: true })

  // Re-open the file from the Files tree after the reload (tab reuse vs fresh open).
  try {
    await openFilePreview(page, { directories: ['samples'], fileName: 'page.html' })
    await waitForFrameContent(page, BUILTIN, { timeoutMs: 15000 })
    await note('probe-14-reopened-after-reload', { body: await readHtmlBodyState(page) })
    await page.screenshot('manual-07-reopened-builtin', evidence, { takeover: 'off', iframeSandbox: null, developerTools: true })
  } catch (error) {
    await note('probe-14-reopened-after-reload', { error: error.message, body: await readHtmlBodyState(page), sidebar: await page.evaluate(sidebar) })
  }
  await setPluginEnabled(page, 'dsh-side-quote', true).catch(() => {})
  await note('probe-15-console-errors', { consoleErrors: page.consoleErrors })
} finally {
  await page.close()
  browser.close()
}
