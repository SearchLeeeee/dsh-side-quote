/**
 * E2E layer, format regression: E-04 from `core/testing-and-acceptance.md` §3.
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
 */
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import {
  SKIP_NO_DRIVER, connectCdp, describeRun, openFilePreview, openPage, readE2eConfig, readQuoteButton,
  resolveCdpWebSocketUrl, resolveSkipReason, waitForQuoteButton,
} from './cdp.mjs'

const config = readE2eConfig()
let skipReason = await resolveSkipReason(config)
let browser

if (skipReason === false) {
  try {
    browser = await connectCdp(await resolveCdpWebSocketUrl(config.cdp))
    console.log(describeRun(config))
  } catch (error) {
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

/** Formats the plugin must stay out of, with their fixture locations. */
const FORMATS = [
  { fileName: 'report.pdf', label: 'PDF', directories: ['samples'] },
  { fileName: 'image.png', label: 'PNG', directories: ['samples'] },
  { fileName: 'table.xlsx', label: 'XLSX', directories: ['samples'] },
  { fileName: 'doc.docx', label: 'DOCX', directories: ['samples'] },
  { fileName: 'page.html', label: 'HTML', directories: ['samples'] },
  { fileName: 'server.pem', label: 'PEM', directories: ['notes'] },
]

test('E-04 其他格式零影响：白名单格式先出现按钮，其余格式逐一无按钮', { skip: skipReason }, async () => {
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
      await page.screenshot(`E-04-${format.label.toLowerCase()}`, evidence)
    }
  } finally {
    await page.close()
  }
})
