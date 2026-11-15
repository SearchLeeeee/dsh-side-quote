/**
 * Unit layer, content half: U-01…U-11, U-17, U-18 from
 * `core/testing-and-acceptance.md` §2. Contract authority is
 * `core/quote-content-contract.md`.
 *
 * Written before the implementation on purpose (red → green). The whitelist,
 * truncation thresholds and sensitive patterns are read from the bundle's
 * single declaration points; no list is copied into this file.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadClientInternals } from './load-client.mjs'

const { internals } = await loadClientInternals()

const SOURCE_LABEL = internals.SOURCE_LABEL

/** Split a composed quote text into its excerpt part and its source line. */
function splitQuote(text) {
  const marker = `\n\n${SOURCE_LABEL}`
  const at = text.lastIndexOf(marker)
  assert.notEqual(at, -1, `quote text must carry a source line: ${JSON.stringify(text)}`)
  return { excerpt: text.slice(0, at), source: text.slice(at + marker.length) }
}

test('U-01 原文块模板：摘录 + 空行 + 来源行', () => {
  const quote = internals.composeOriginalQuote('hello', 'notes/a.md')
  assert.equal(quote.text, 'hello\n\n来源：notes/a.md')
  assert.equal(splitQuote(quote.text).source, 'notes/a.md')
})

test('U-02 保真：只归一化行尾，不 trim、不重排、不加围栏', () => {
  const input = '\r\nfirst line\r\n\r\n    indented four\r\n\tone tab\r\ntwo  spaces\r\n\r\nlast\r\n'
  const quote = internals.composeOriginalQuote(input, 'notes/a.md')
  const expected = [
    'first line',
    '',
    '    indented four',
    '\tone tab',
    'two  spaces',
    '',
    'last',
  ].join('\n')
  assert.equal(quote.text, `${expected}\n\n来源：notes/a.md`)
  assert.equal(quote.text.includes('\r'), false, 'line endings must normalize to \\n')
  assert.equal(quote.text.includes('```'), false, 'no code fence may be added')
  assert.equal(quote.text.includes('\tone tab'), true, 'tabs must not become spaces')
  assert.equal(quote.text.includes('    indented four'), true, 'indentation must survive')
})

test('U-03 截断（行）：201 行保留前 200 行并追加说明', () => {
  assert.equal(internals.TRUNCATION_NOTE, '…（摘录已截断，仅保留前 200 行 / 8000 字符）')
  const lines = Array.from({ length: 201 }, (_, index) => `line ${index + 1}`)
  const quote = internals.composeOriginalQuote(lines.join('\n'), 'notes/a.md')
  const expectedExcerpt = `${lines.slice(0, 200).join('\n')}\n${internals.TRUNCATION_NOTE}`
  assert.equal(quote.text, `${expectedExcerpt}\n\n来源：notes/a.md`)
})

test('U-04 截断（字符）：单行 9000 字符硬截到 8000 并追加说明', () => {
  const quote = internals.composeOriginalQuote('x'.repeat(9000), 'notes/a.md')
  const { excerpt } = splitQuote(quote.text)
  assert.equal(excerpt, `${'x'.repeat(8000)}\n${internals.TRUNCATION_NOTE}`)
})

test('U-05 截断（先到先截）：按字符回退到最后一个完整行边界', () => {
  const lines = Array.from({ length: 50 }, (_, index) => `${String(index).padStart(3, '0')}${'y'.repeat(397)}`)
  const quote = internals.composeOriginalQuote(lines.join('\n'), 'notes/a.md')
  const { excerpt } = splitQuote(quote.text)
  assert.equal(excerpt.endsWith(`\n${internals.TRUNCATION_NOTE}`), true, 'a truncation note is required')
  const kept = excerpt.slice(0, excerpt.length - internals.TRUNCATION_NOTE.length - 1)
  const keptLines = kept.split('\n')
  assert.ok(keptLines.length < lines.length, 'the character bound must cut lines')
  assert.deepEqual(keptLines, lines.slice(0, keptLines.length), 'only whole leading lines may survive')
  assert.ok(kept.length <= internals.MAX_QUOTE_CHARS, `kept excerpt must fit the character bound, got ${kept.length}`)
  const next = lines[keptLines.length]
  assert.ok(
    kept.length + 1 + next.length > internals.MAX_QUOTE_CHARS,
    'the retreat must stop at the last line that still fits',
  )
})

test('U-06 未截断不带说明', () => {
  const lines = Array.from({ length: 10 }, (_, index) => `short ${index + 1}`)
  const quote = internals.composeOriginalQuote(lines.join('\n'), 'notes/a.md')
  assert.equal(quote.text.includes(internals.TRUNCATION_NOTE), false)
  assert.equal(quote.text, `${lines.join('\n')}\n\n来源：notes/a.md`)
})

test('U-07 指针块模板：只给路径，不含摘录与来源行', () => {
  const quote = internals.composePointerQuote('notes/a.md')
  assert.equal(quote.text, '已引用过：notes/a.md\n原文未重复贴出；需要时请重新读取该文件。')
  assert.equal(quote.text.includes(SOURCE_LABEL), false)
  assert.equal(quote.text.includes('notes/a.md\n'), true)
})

test('U-08 已引用记录：会话隔离、容量淘汰、首插时间幂等', () => {
  const history = internals.createQuoteHistory()
  assert.equal(history.has('session-1', 'notes/a.md'), false, 'first query must miss')
  history.add('session-1', 'notes/a.md')
  assert.equal(history.has('session-1', 'notes/a.md'), true, 'a successful insert must be recorded')
  assert.equal(history.has('session-2', 'notes/a.md'), false, 'sessions must not share records')

  const first = history.get('session-1', 'notes/a.md')
  assert.equal(typeof first.firstQuotedAt, 'number')
  history.add('session-1', 'notes/a.md')
  assert.equal(
    history.get('session-1', 'notes/a.md').firstQuotedAt,
    first.firstQuotedAt,
    'a repeated pointer insert must not rewrite the first-quote time',
  )

  const capped = internals.createQuoteHistory()
  for (let index = 0; index < internals.QUOTE_HISTORY_LIMIT + 1; index += 1) {
    capped.add('session-1', `file-${index}.md`)
  }
  assert.equal(capped.size(), internals.QUOTE_HISTORY_LIMIT)
  assert.equal(capped.has('session-1', 'file-0.md'), false, 'the oldest record must be evicted')
  assert.equal(capped.has('session-1', `file-${internals.QUOTE_HISTORY_LIMIT}.md`), true)
})

test('U-09 路径相对化：工作区内相对、工作区外原样、反斜杠归一', () => {
  assert.equal(internals.relativizePath('D:\\proj\\notes\\a.md', 'D:\\proj'), 'notes/a.md')
  assert.equal(internals.relativizePath('D:\\Proj\\notes\\a.md', 'd:\\proj'), 'notes/a.md', 'Windows prefixes compare case-insensitively')
  assert.equal(internals.relativizePath('D:\\proj\\notes\\a.md', 'D:\\proj\\'), 'notes/a.md', 'a trailing separator on the root is tolerated')
  assert.equal(internals.relativizePath('D:\\other\\a.md', 'D:\\proj'), 'D:/other/a.md')
  assert.equal(internals.relativizePath('D:\\proj\\notes\\a.md', null), 'D:/proj/notes/a.md')
  assert.equal(internals.relativizePath('D:\\proj\\notes\\a.md', undefined), 'D:/proj/notes/a.md')
  assert.equal(internals.relativizePath('D:\\proj\\notes\\a.md', ''), 'D:/proj/notes/a.md')
  assert.equal(internals.relativizePath('/home/u/proj/a.md', '/home/u/proj'), 'a.md')
  assert.equal(internals.relativizePath('D:\\proj', 'D:\\proj'), 'D:/proj', 'the workspace root itself stays absolute')
  assert.equal(internals.relativizePath('notes\\a.md', 'D:\\proj'), 'notes/a.md')
})

test('U-10 格式白名单：命中与不命中，HTML 明确排除', () => {
  const { ALLOWED_SUFFIXES, ALLOWED_FILENAMES } = internals
  for (const name of ['a.md', 'b.MD', 'c.ts', 'd.json', 'e.yml', 'f.log', 'g.csv', '.env']) {
    assert.equal(internals.isAllowedPath(name), true, `${name} must be quotable`)
  }
  for (const name of ['x.pdf', 'x.png', 'x.xlsx', 'x.docx', 'x.html', 'x.htm', 'Makefile', '']) {
    assert.equal(internals.isAllowedPath(name), false, `${name} must not be quotable`)
  }
  assert.equal(internals.isAllowedPath('page.html'), false, 'HTML is I001-F02 territory and must not match')
  assert.equal(internals.isAllowedPath('page.HTM'), false, 'the HTML exclusion is case-insensitive')
  assert.equal(ALLOWED_SUFFIXES.includes('html'), false, 'html must never enter the whitelist constant')
  assert.equal(ALLOWED_SUFFIXES.includes('htm'), false, 'htm must never enter the whitelist constant')
  assert.deepEqual(ALLOWED_FILENAMES, ['.env'])
  assert.equal(internals.isAllowedPath('D:\\proj\\notes\\a.md'), true, 'the last path segment is matched')
  assert.equal(internals.isAllowedPath('notes/a.md'), true)
  assert.equal(internals.isAllowedPath('/home/u/proj/readme.markdown'), true)
})

test('U-11 敏感名单：命中只标记警示，不影响可引用', () => {
  const hits = [
    '.env', '.env.local', '.env.production', '.env.example',
    'server.pem', 'tls.key', 'store.pfx', 'store.p12', 'store.jks',
    'id_rsa', 'id_ed25519', 'aws_credentials.json', 'client_secret.txt', 'password.txt', 'passwd', 'keystore.db',
  ]
  for (const name of hits) {
    assert.equal(internals.isSensitiveName(name), true, `${name} must be flagged as sensitive`)
  }
  for (const name of ['notes.md', 'env.md', 'keyboard.ts']) {
    assert.equal(internals.isSensitiveName(name), false, `${name} must not be flagged as sensitive`)
  }
  assert.equal(internals.isSensitiveName('D:\\proj\\.env.local'), true, 'the last path segment is matched')
  assert.equal(internals.isAllowedPath('.env'), true, 'a sensitive file is still quotable')
  assert.equal(internals.isSensitiveName('.env'), true)
})

test('U-17 本地化：中英键集合一致，内容文案不在字典中', () => {
  const { LOCALES } = internals
  assert.deepEqual(Object.keys(LOCALES.zh).sort(), Object.keys(LOCALES.en).sort(), 'zh and en must declare the same keys')
  assert.ok(Object.keys(LOCALES.zh).length > 0)
  const contentCopy = ['来源：', '已引用过：', '原文未重复贴出', '摘录已截断']
  for (const [locale, dictionary] of Object.entries(LOCALES)) {
    for (const [key, value] of Object.entries(dictionary)) {
      assert.equal(typeof value, 'string', `${locale}.${key} must be a string`)
      for (const needle of contentCopy) {
        assert.equal(
          value.includes(needle),
          false,
          `${locale}.${key} must not carry content copy (${needle}); that belongs to the quote text, not the UI dictionary`,
        )
      }
    }
  }
})

test('U-18 summary 契约：只承载展示，不超出 text 的信息', () => {
  const quote = internals.composeOriginalQuote('line one\nline two', 'notes/a.md')
  assert.equal(quote.summary.label, 'a.md')
  assert.equal(quote.summary.title, 'notes/a.md')
  assert.equal(quote.summary.detail, '2 行')
  assert.equal(quote.summary.body, 'line one\nline two')

  const truncated = internals.composeOriginalQuote(
    Array.from({ length: 201 }, (_, index) => `l${index}`).join('\n'),
    'notes/a.md',
  )
  assert.equal(truncated.summary.detail, '200 行（已截断）')

  const pointer = internals.composePointerQuote('notes/a.md')
  assert.equal(pointer.summary.detail, '已引用过')
  assert.equal(pointer.summary.body, pointer.text)

  for (const composed of [quote, truncated, pointer]) {
    assert.equal(composed.text.includes(composed.summary.title), true, 'the title must appear in text')
    assert.equal(composed.text.includes(composed.summary.body), true, 'the body must appear in text')
    assert.equal(composed.summary.label, internals.basenameOf(composed.summary.title))
  }
})

test('空或仅空白的摘录不产生引用块', () => {
  for (const blank of ['', '   ', '\n\n', '\t\n  \n']) {
    assert.equal(internals.composeOriginalQuote(blank, 'notes/a.md'), null, JSON.stringify(blank))
  }
})
