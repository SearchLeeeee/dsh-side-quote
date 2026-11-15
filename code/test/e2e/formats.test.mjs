/**
 * E2E layer, format regression: E-04 from `core/testing-and-acceptance.md` §3.
 *
 * Plain `node:test`, zero dependencies. Same environment variables and skip
 * rules as `quote-flow.test.mjs`.
 *
 * Workspace fixture the operator must provide: `samples/` holding one sample of
 * each non-text preview format (`report.pdf`, `image.png`, `table.xlsx`,
 * `doc.docx`, `page.html`).
 *
 * The automated part of E-04 is "no quote button for a format outside the
 * whitelist". The second half — "the preview looks the same as without the
 * plugin" — is the manual regression layer (testing-and-acceptance §4.3); these
 * screenshots are the comparison material, not the verdict.
 */
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import {
  SKIP_NO_DRIVER, connectCdp, openFilePreview, openPage, readE2eConfig, readQuoteButton,
  resolveCdpWebSocketUrl, resolveSkipReason,
} from './cdp.mjs'

const config = readE2eConfig()
let skipReason = await resolveSkipReason(config)
let browser

if (skipReason === false) {
  try {
    browser = await connectCdp(await resolveCdpWebSocketUrl(config.cdp))
  } catch (error) {
    skipReason = `${SKIP_NO_DRIVER}（CDP 端点不可达：${error.message}）`
  }
}

after(async () => {
  browser?.close()
})

/** Formats the plugin must stay out of, with their fixture names. */
const FORMATS = [
  { fileName: 'report.pdf', label: 'PDF', directories: ['samples'] },
  { fileName: 'image.png', label: 'PNG', directories: ['samples'] },
  { fileName: 'table.xlsx', label: 'XLSX', directories: ['samples'] },
  { fileName: 'doc.docx', label: 'DOCX', directories: ['samples'] },
  { fileName: 'page.html', label: 'HTML', directories: ['samples'] },
  { fileName: 'server.pem', label: 'PEM', directories: ['notes'] },
]

for (const format of FORMATS) {
  test(`E-04 ${format.label}：预览可打开且不出现引用按钮`, { skip: skipReason }, async () => {
    const page = await openPage(browser, config.baseUrl)
    try {
      await openFilePreview(page, { directories: format.directories, fileName: format.fileName })
      // The preview opened (the tab is there); the plugin must contribute nothing.
      const state = await readQuoteButton(page)
      assert.equal(state.present, false, `${format.fileName} must not show a quote button`)
      await page.screenshot(`E-04-${format.label.toLowerCase()}`, config.evidenceDir)
    } finally {
      await page.close()
    }
  })
}

test('E-04 HTML：白名单明确排除，按钮不出现', { skip: skipReason }, async () => {
  const page = await openPage(browser, config.baseUrl)
  try {
    await openFilePreview(page, { directories: ['samples'], fileName: 'page.html' })
    // I001-F02 owns HTML; F01 must not add a control here.
    const state = await readQuoteButton(page)
    assert.equal(state.present, false, 'HTML previews must stay untouched in I001-F01')
  } finally {
    await page.close()
  }
})
