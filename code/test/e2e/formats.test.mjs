/**
 * E2E layer, format regression: E-04 from `core/testing-and-acceptance.md` §3,
 * with the I001-F02 contract change for `.html` (C-13).
 *
 * Plain `node:test`, zero dependencies. Same environment variables, evidence
 * requirement and skip rules as `quote-flow.test.mjs`.
 *
 * Workspace fixture the operator must provide: `notes/a.md` (a whitelisted
 * format, used as the positive control), `notes/server.pem` (sensitive name
 * outside the whitelist) and one sample of each non-text preview format under
 * `samples/`: `report.pdf`, `image.png`, `table.xlsx`, `doc.docx`, `page.html`.
 *
 * The automated half of E-04 is "no quote button for a format outside the
 * whitelist". The positive control runs first **in the same page**, so a preview
 * that simply renders slowly can never fake a pass: the button is proven to
 * appear for `.md` before each absence is asserted. The second half — "the
 * preview looks the same as without the plugin" — is the manual regression layer
 * (testing-and-acceptance §4.3); these screenshots are comparison material, not
 * the verdict.
 *
 * `.html` is the one format whose expectation changed under I001-F02: while the
 * takeover is off it still shows no quote button, but the preview header carries
 * the takeover switch (`core/testing-and-acceptance.md` §6). The persisted switch
 * is cleared first, because the end-to-end suites share one browser profile and
 * the closed state is the state this case is about.
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import {
  SKIP_NO_DRIVER, connectCdp, describeRun, dismissOverlays, openFilePreview, openPage, readE2eConfig,
  readHtmlToggle, readQuoteButton, resolveCdpWebSocketUrl, resolveSkipReason, setHtmlTakeover,
  setPluginEnabled, waitForAppShell, waitForHtmlToggle, waitForQuoteButton,
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

const PLUGIN_ID = 'dsh-side-quote'

/**
 * Enable the plugin before the case runs.
 *
 * Every preview assertion below needs the plugin active, while the full serial
 * run ends with `quote-flow.test.mjs` E-08 disabling it on purpose (that case
 * asserts the teardown). Making the precondition explicit here keeps the
 * documented command repeatable instead of depending on the previous run's last
 * case — it asserts nothing, so it cannot mask a failure.
 */
before(async () => {
  if (skipReason !== false) return
  const page = await openPage(browser, config.baseUrl)
  try {
    await waitForAppShell(page)
    await dismissOverlays(page)
    await setPluginEnabled(page, PLUGIN_ID, true)
  } finally {
    await page.close()
  }
})

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

/** Formats the plugin must stay completely out of, with their fixture locations. */
const FORMATS = [
  { fileName: 'report.pdf', label: 'PDF', directories: ['samples'] },
  { fileName: 'image.png', label: 'PNG', directories: ['samples'] },
  { fileName: 'table.xlsx', label: 'XLSX', directories: ['samples'] },
  { fileName: 'doc.docx', label: 'DOCX', directories: ['samples'] },
  { fileName: 'server.pem', label: 'PEM', directories: ['notes'] },
]

/** The HTML preview is asserted separately: it gains the takeover switch. */
const HTML_FORMAT = { fileName: 'page.html', label: 'HTML', directories: ['samples'] }

test('E-04 其他格式零影响：白名单格式先出现按钮，其余格式逐一无按钮，HTML 只有接管开关', { skip: skipReason }, async () => {
  const page = await openPage(browser, config.baseUrl)
  try {
    // Positive control: the same page must first show the button for a whitelisted file.
    await openFilePreview(page, { directories: ['notes'], fileName: 'a.md' })
    const control = await waitForQuoteButton(page, false)
    assert.equal(control.present, true, 'the positive control must show the quote button for a.md')
    await page.screenshot('E-04-0-positive-control', evidence)

    for (const format of FORMATS) {
      await openFilePreview(page, { directories: format.directories, fileName: format.fileName })
      const state = await readQuoteButton(page)
      assert.equal(state.present, false, `${format.fileName} must not show a quote button`)
      assert.equal(
        (await readHtmlToggle(page)).present,
        false,
        `${format.fileName} is not an HTML preview, so it must not show the takeover switch (C-01)`,
      )
      await page.screenshot(`E-04-${format.label.toLowerCase()}`, evidence)
    }

    // `.html`, takeover closed (C-13): no quote button, but the switch is the
    // entry point and it reads as off.
    await setHtmlTakeover(page, null)
    await openFilePreview(page, { directories: HTML_FORMAT.directories, fileName: HTML_FORMAT.fileName })
    await waitForHtmlToggle(page, { present: true })
    assert.equal(
      (await readQuoteButton(page)).present,
      false,
      'page.html must not show a quote button while the takeover is off',
    )
    const toggle = await readHtmlToggle(page)
    assert.equal(toggle.present, true, 'page.html must show the takeover switch in its preview header')
    assert.equal(toggle.pressed, false, 'the takeover switch reads as off by default (C-02)')
    await page.screenshot('E-04-html', evidence, { takeover: 'off' })
  } finally {
    await page.close()
  }
})
