/**
 * Browser half of dsh-side-quote.
 *
 * Zero build: this file IS the built module. The DSH client loader serves it as a
 * same-origin classic `<script>`, so there is no ESM `import`/`export`, no local
 * module resolution, and React arrives through the `require` handed to
 * `factory(require)`.
 *
 * The whole plugin is inlined here. Pure and stateful internals are exposed on
 * the factory result as `internals` so `node:test` can reach them without a
 * bundler; that surface is test-only and not a public API.
 */
window.__ModuleLoader__.load({
  id: 'dsh-side-quote',
  factory(require) {
    /** React comes from the platform module table; there is no bundler here. */
    const React = require('react')

    /* ------------------------------------------------------------------ *
     * Content contract — single declaration points
     * (core/quote-content-contract.md §3, §4, §6.1)
     * ------------------------------------------------------------------ */

    /** Quotable suffixes. `html`/`htm` are deliberately absent (I001-F02 owns HTML). */
    const ALLOWED_SUFFIXES = [
      'md', 'markdown', 'mdx',
      'txt', 'text', 'log', 'csv', 'tsv',
      'json', 'jsonc', 'json5', 'yaml', 'yml', 'toml', 'ini', 'conf', 'properties',
      'xml', 'svg',
      'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'mts', 'cts',
      'py', 'rb', 'go', 'rs', 'java', 'kt', 'kts', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs',
      'swift', 'php', 'pl', 'lua', 'r', 'scala', 'sql', 'sh', 'bash', 'zsh', 'ps1', 'bat',
      'css', 'scss', 'sass', 'less', 'vue', 'svelte',
      'gradle', 'cmake', 'mk', 'dockerfile', 'gitignore', 'editorconfig', 'diff', 'patch',
    ]
    /** Exact file names that carry no quotable suffix but must stay quotable. */
    const ALLOWED_FILENAMES = ['.env']

    /** Excerpt bounds: 200 lines / 8000 characters, first hit wins. */
    const MAX_QUOTE_LINES = 200
    const MAX_QUOTE_CHARS = 8000
    /** Fixed content copy: never localized, because it enters the model-visible message. */
    const TRUNCATION_NOTE = '…（摘录已截断，仅保留前 200 行 / 8000 字符）'
    const SOURCE_LABEL = '来源：'
    const POINTER_DETAIL = '已引用过'
    const POINTER_LABEL = `${POINTER_DETAIL}：`
    const POINTER_REMINDER = '原文未重复贴出；需要时请重新读取该文件。'

    /**
     * Sensitive file names, three segments over the file name, case-insensitive:
     * exact names, suffix family, contained fragment. The `.env.` fragment is how
     * the `.env.local` / `.env.production` prefix family is covered without a
     * fourth segment. Flagging never blocks quoting.
     */
    const SENSITIVE_EXACT_NAMES = ['.env']
    const SENSITIVE_SUFFIXES = ['pem', 'key', 'pfx', 'p12', 'jks']
    const SENSITIVE_SUBSTRINGS = [
      '.env.', 'id_rsa', 'id_ed25519', 'credential', 'secret', 'password', 'passwd', 'keystore',
    ]

    /* ------------------------------------------------------------------ *
     * HTML takeover constants (I001-F02 core/implementation.md §3–§7)
     * ------------------------------------------------------------------ */

    /** Persistent user choice. Only `'on'` means enabled; anything else is closed. */
    const HTML_TAKEOVER_STORAGE_KEY = 'dsh-side-quote:html-takeover'
    const HTML_TAKEOVER_ON = 'on'
    const HTML_TAKEOVER_OFF = 'off'
    /** Definition identity; the same value keys the `sidebar.right.tab.document` slot. */
    const HTML_BODY_ID = 'dsh-side-quote/html'
    /** Suffixes the takeover claims. The text whitelist above must never contain them. */
    const HTML_EXTENSIONS = ['html', 'htm']
    /** Identity of the one adapter this Feature adds. */
    const HTML_ADAPTER_ID = 'html'
    /** Fixed bridge protocol; the parent accepts nothing outside it. */
    const HTML_BRIDGE_CHANNEL = 'dsh-side-quote/html-bridge'
    const HTML_BRIDGE_VERSION = 1
    /** Transport guard only: the content contract keeps at most 8000 characters. */
    const HTML_BRIDGE_MAX_TEXT = 65536
    /** A frame silent for this long counts as unusable; a later `ready` recovers it. */
    const HTML_BRIDGE_READY_TIMEOUT_MS = 4000
    /** Header contribution ids; both must stay unique inside the actions slot. */
    const HTML_TOGGLE_SLOT_ID = 'side-quote-html-toggle'
    const HTML_QUOTE_SLOT_ID = 'side-quote-html-quote'

    /**
     * Decide whether a preview path is an HTML document.
     *
     * The takeover definition, its header toggle, its quote button and its
     * adapter all read this one predicate, so the format is decided exactly once
     * (implementation.md §7, §10: a second equivalent decision would be a defect).
     * @param {unknown} path - any path form; only the last segment is matched.
     * @returns {boolean} whether the path ends in `.html` or `.htm`, case-insensitively.
     */
    function matchesHtmlPreviewPath(path) {
      const name = fileNameOf(path).toLowerCase()
      return HTML_EXTENSIONS.some((extension) => name.endsWith(`.${extension}`))
    }

    /* ------------------------------------------------------------------ *
     * Path helpers (quote-content-contract.md §5)
     * ------------------------------------------------------------------ */

    /**
     * Read the last path segment of either separator style.
     * @param {unknown} path - a file path or address.
     * @returns {string} the file name, or an empty string when there is none.
     */
    function fileNameOf(path) {
      if (typeof path !== 'string' || path === '') return ''
      const parts = path.split(/[\\/]/u)
      return parts[parts.length - 1]
    }

    /**
     * Normalize separators to `/` and drop a trailing separator, keeping a drive root intact.
     * @param {unknown} value - a path or address.
     * @returns {string} the normalized path.
     */
    function normalizePath(value) {
      if (typeof value !== 'string' || value === '') return ''
      let path = value.replace(/\\/gu, '/')
      while (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
      return /^[A-Za-z]:$/u.test(path) ? `${path}/` : path
    }

    /**
     * Make a preview path workspace-relative; a path outside the workspace, or an
     * unknown workspace root, is kept as-is (normalized). Relativization failure is
     * not an error (implementation.md §8).
     * @param {string} absolutePath - the path the preview owner supplied.
     * @param {string|null|undefined} workspaceRoot - the session working directory.
     * @returns {string} the source path written into the quote.
     */
    function relativizePath(absolutePath, workspaceRoot) {
      const absolute = normalizePath(absolutePath)
      const root = normalizePath(workspaceRoot === null || workspaceRoot === undefined ? '' : workspaceRoot)
      if (absolute === '' || root === '') return absolute
      const prefix = root.endsWith('/') ? root : `${root}/`
      if (absolute.length > prefix.length && absolute.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase()) {
        return absolute.slice(prefix.length)
      }
      return absolute
    }

    /* ------------------------------------------------------------------ *
     * Format whitelist and sensitive names (§3, §6.1)
     * ------------------------------------------------------------------ */

    /**
     * Decide whether this plugin quotes a file at all.
     * @param {string} path - any path form; the last segment is matched.
     * @returns {boolean} whether the path is inside the format whitelist.
     */
    function isAllowedPath(path) {
      const name = fileNameOf(path).toLowerCase()
      if (name === '') return false
      if (ALLOWED_FILENAMES.includes(name)) return true
      return ALLOWED_SUFFIXES.some((suffix) => name.endsWith(`.${suffix}`))
    }

    /**
     * Decide whether a quote of this file deserves one `info` warning.
     * @param {string} path - any path form; the last segment is matched.
     * @returns {boolean} whether the file name looks sensitive.
     */
    function isSensitiveName(path) {
      const name = fileNameOf(path).toLowerCase()
      if (name === '') return false
      if (SENSITIVE_EXACT_NAMES.includes(name)) return true
      if (SENSITIVE_SUFFIXES.some((suffix) => name.endsWith(`.${suffix}`))) return true
      return SENSITIVE_SUBSTRINGS.some((fragment) => name.includes(fragment))
    }

    /* ------------------------------------------------------------------ *
     * Excerpt truncation and quote composition (§1, §2, §4, §7)
     * ------------------------------------------------------------------ */

    /**
     * Normalize line endings, drop one blank line at each end, then apply the
     * 200-line / 8000-character bound, first hit wins.
     * @param {unknown} text - the raw selection text.
     * @returns {{body: string, lineCount: number, truncated: boolean}} the excerpt.
     */
    function truncateExcerpt(text) {
      const normalized = String(text === null || text === undefined ? '' : text).replace(/\r\n?/gu, '\n')
      const lines = normalized.split('\n')
      if (lines.length > 0 && lines[0] === '') lines.shift()
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
      if (lines.join('\n').trim() === '') return { body: '', lineCount: 0, truncated: false }

      let kept = lines
      let truncated = false
      if (kept.length > MAX_QUOTE_LINES) {
        kept = kept.slice(0, MAX_QUOTE_LINES)
        truncated = true
      }
      let body = kept.join('\n')
      if (body.length > MAX_QUOTE_CHARS) {
        truncated = true
        const retreated = kept.slice()
        while (retreated.length > 1 && retreated.join('\n').length > MAX_QUOTE_CHARS) retreated.pop()
        kept = retreated
        body = retreated.join('\n')
        // A single line longer than the bound is the one place the cut is not on a line boundary.
        if (body.length > MAX_QUOTE_CHARS) body = body.slice(0, MAX_QUOTE_CHARS)
      }
      return { body, lineCount: kept.length, truncated }
    }

    /**
     * Compose the original-text quote block.
     * @param {unknown} excerptText - the raw selection text.
     * @param {string} sourcePath - the source path written into the quote.
     * @returns {{text: string, summary: object}|null} the block, or null for a blank excerpt.
     */
    function composeOriginalQuote(excerptText, sourcePath) {
      const excerpt = truncateExcerpt(excerptText)
      if (excerpt.body === '') return null
      const body = excerpt.truncated ? `${excerpt.body}\n${TRUNCATION_NOTE}` : excerpt.body
      return {
        text: `${body}\n\n${SOURCE_LABEL}${sourcePath}`,
        summary: {
          label: fileNameOf(sourcePath),
          title: sourcePath,
          detail: excerpt.truncated ? `${excerpt.lineCount} 行（已截断）` : `${excerpt.lineCount} 行`,
          body,
        },
      }
    }

    /**
     * Compose the pointer block used from the second quote of one file in one session.
     * @param {string} sourcePath - the source path written into the pointer.
     * @returns {{text: string, summary: object}} the block.
     */
    function composePointerQuote(sourcePath) {
      const text = `${POINTER_LABEL}${sourcePath}\n${POINTER_REMINDER}`
      return {
        text,
        summary: { label: fileNameOf(sourcePath), title: sourcePath, detail: POINTER_DETAIL, body: text },
      }
    }

    /* ------------------------------------------------------------------ *
     * Quoted-file history (implementation.md §7, quote-content-contract.md §8)
     * ------------------------------------------------------------------ */

    /** One record per `sessionId\0sourcePath`; memory only, cleared with the plugin. */
    const QUOTE_HISTORY_LIMIT = 500
    const QUOTE_HISTORY_SEPARATOR = '\u0000'

    /**
     * Create the in-memory "already quoted in this session" store.
     * @param {{limit?: number, now?: () => number}} [options] - capacity and clock overrides for tests.
     * @returns {object} the store.
     */
    function createQuoteHistory(options = {}) {
      const limit = options.limit === undefined ? QUOTE_HISTORY_LIMIT : options.limit
      const now = options.now === undefined ? () => Date.now() : options.now
      const entries = new Map()
      const keyOf = (sessionId, sourcePath) => `${sessionId}${QUOTE_HISTORY_SEPARATOR}${sourcePath}`
      return {
        has(sessionId, sourcePath) {
          return entries.has(keyOf(sessionId, sourcePath))
        },
        get(sessionId, sourcePath) {
          return entries.get(keyOf(sessionId, sourcePath))
        },
        /** Record a successful insert; a repeat keeps the original first-quote time. */
        add(sessionId, sourcePath) {
          const key = keyOf(sessionId, sourcePath)
          if (entries.has(key)) return
          entries.set(key, { firstQuotedAt: now() })
          while (entries.size > limit) {
            const oldest = entries.keys().next()
            if (oldest.done === true) return
            entries.delete(oldest.value)
          }
        },
        size() {
          return entries.size
        },
        clear() {
          entries.clear()
        },
      }
    }

    /* ------------------------------------------------------------------ *
     * Format adapter seam (implementation.md §5)
     * ------------------------------------------------------------------ */

    /** Identity of the only adapter this Feature ships. */
    const TEXT_ADAPTER_ID = 'text-selection'

    /**
     * Create the adapter registry the core talks to. The core knows only
     * `id` / `match` / `readSelection`; it never branches on a format itself.
     * @returns {object} the registry.
     */
    function createAdapterRegistry() {
      const adapters = []
      return {
        /**
         * Add one adapter.
         * @param {object} adapter - `{ id, match(path), readSelection(target) }`.
         * @returns {() => void} an idempotent unregister.
         */
        register(adapter) {
          if (adapter === null || typeof adapter !== 'object') {
            throw new Error('side-quote: an adapter must be an object')
          }
          const { id, match, readSelection } = adapter
          if (typeof id !== 'string' || id === '') {
            throw new Error('side-quote: an adapter id must be a non-empty string')
          }
          if (typeof match !== 'function') throw new Error(`side-quote: adapter "${id}" must provide match(path)`)
          if (typeof readSelection !== 'function') {
            throw new Error(`side-quote: adapter "${id}" must provide readSelection(target)`)
          }
          if (adapters.some((existing) => existing.id === id)) {
            throw new Error(`side-quote: adapter "${id}" is already registered`)
          }
          adapters.push(adapter)
          let active = true
          return () => {
            if (!active) return
            active = false
            const index = adapters.indexOf(adapter)
            if (index >= 0) adapters.splice(index, 1)
          }
        },
        /** @returns {object[]} the registered adapters, in registration order. */
        list() {
          return adapters.slice()
        },
        /**
         * Resolve the first adapter that claims this path.
         * @param {string} path - the preview's absolute path.
         * @returns {object|undefined} the claiming adapter.
         */
        match(path) {
          return adapters.find((adapter) => adapter.match(path) === true)
        },
      }
    }

    /**
     * Read the selected text of one Selection.
     *
     * The range is the primary source on purpose: the shipped document preview
     * was observed holding a real range while `Selection.toString()` answered
     * empty, so reading only `toString()` would silently lose the excerpt.
     * @param {Selection|null|undefined} selection - a live DOM selection.
     * @returns {string} the selected text, or an empty string.
     */
    function selectionTextOf(selection) {
      if (selection === null || selection === undefined) return ''
      try {
        if (typeof selection.getRangeAt === 'function' && selection.rangeCount > 0) {
          const text = selection.getRangeAt(0).toString()
          if (typeof text === 'string' && text.trim() !== '') return text
        }
      } catch (_error) {
        // A detached or cross-boundary range falls through to toString().
      }
      return typeof selection.toString === 'function' ? String(selection.toString()) : ''
    }

    /**
     * The built-in adapter: text formats rendered in the parent document, whose
     * selection is readable through `document.getSelection()`.
     * @returns {object} the adapter.
     */
    function createTextSelectionAdapter() {
      return {
        id: TEXT_ADAPTER_ID,
        match: (path) => isAllowedPath(path),
        readSelection(target) {
          const source = target.document === null || target.document === undefined ? null : target.document
          if (source === null || typeof source.getSelection !== 'function') return null
          const selection = source.getSelection()
          if (selection === null || selection === undefined) return null
          const text = selectionTextOf(selection)
          if (text.trim() === '') return null
          return { text, path: target.path }
        },
      }
    }

    /**
     * Resolve the element a selection boundary node belongs to.
     * @param {Node|null|undefined} node - a text or element node.
     * @returns {Element|null} the owning element, or null.
     */
    function elementOfSelectionNode(node) {
      if (node === null || node === undefined) return null
      if (node.nodeType === 1) return node
      return node.parentElement === undefined ? null : node.parentElement
    }

    /**
     * Resolve the DOM element the current parent-document selection starts in.
     * This is the first of the three elements the ownership comparison needs.
     * @param {Document|undefined} document - the product document.
     * @returns {Element|null} the start element, or null when there is no selection.
     */
    function readSelectionAnchor(document) {
      if (document === null || document === undefined || typeof document.getSelection !== 'function') return null
      const selection = document.getSelection()
      if (selection === null || selection === undefined) return null
      return elementOfSelectionNode(selection.anchorNode)
    }

    /**
     * Resolve the DOM element the current selection ends in.
     *
     * A selection dragged from one preview into another is one valid DOM
     * selection; without this side the button of the first preview would quote
     * text owned by the second one (implementation.md §8, C-04).
     * @param {Document|undefined} document - the product document.
     * @returns {Element|null} the end element, or null when there is none.
     */
    function readSelectionEndAnchor(document) {
      if (document === null || document === undefined || typeof document.getSelection !== 'function') return null
      const selection = document.getSelection()
      if (selection === null || selection === undefined) return null
      const focused = elementOfSelectionNode(selection.focusNode)
      if (focused !== null) return focused
      // A selection always has a focus node; the range end is the same side when
      // the platform reports none.
      if (typeof selection.getRangeAt !== 'function' || selection.rangeCount === 0) return null
      return elementOfSelectionNode(selection.getRangeAt(0).endContainer)
    }

    /* ------------------------------------------------------------------ *
     * Button-state debounce and selection events (implementation.md §4, §6)
     * ------------------------------------------------------------------ */

    /** The contract's debounce window for finalizing button availability. */
    const DEBOUNCE_MS = 350

    /**
     * Debounce button-state finalization. The timer primitive is injected so the
     * coalescing logic itself is testable and the timer stays disposable.
     * @param {{ms: number, finalize: () => void, setTimer: (callback: () => void, ms: number) => (() => void)}} options
     *   window length, the finalizer, and a cancellable one-shot timer.
     * @returns {object} the debouncer.
     */
    function createButtonStateDebouncer(options) {
      const { ms, finalize, setTimer } = options
      let cancel = null
      let disposed = false
      return {
        /** Restart the window; a burst collapses onto one pending finalization. */
        schedule() {
          if (disposed) return
          if (cancel !== null) {
            cancel()
            cancel = null
          }
          cancel = setTimer(() => {
            cancel = null
            if (!disposed) finalize()
          }, ms)
        },
        /** Cancel pending work permanently; later calls are inert. */
        dispose() {
          disposed = true
          if (cancel !== null) {
            cancel()
            cancel = null
          }
        },
      }
    }

    /**
     * Watch the three selection-affecting events on the product document.
     * @param {{document: Document|undefined, onChange: () => void}} options - the document and the change sink.
     * @returns {object} the monitor.
     */
    function createSelectionMonitor(options) {
      const { document, onChange } = options
      const offs = []
      const listen = (type, capture) => {
        if (document === null || document === undefined || typeof document.addEventListener !== 'function') return
        document.addEventListener(type, onChange, capture)
        offs.push(() => document.removeEventListener(type, onChange, capture))
      }
      listen('selectionchange', false)
      // Capture phase: a preview body that stops propagation must not hide the gesture.
      listen('pointerup', true)
      listen('keyup', true)
      return {
        /** Remove every listener this monitor installed. */
        dispose() {
          while (offs.length > 0) offs.pop()()
        },
      }
    }

    /* ------------------------------------------------------------------ *
     * Quote actions: the headless click path (implementation.md §4, §8)
     * ------------------------------------------------------------------ */

    /**
     * Build the button registry, the state broadcaster and the click path.
     * All platform access arrives as injected dependencies, so U-12…U-16 can run
     * without React, DOM or a DSH instance.
     * @param {object} deps - platform seams, see `applyPlugin` for the real ones.
     * @returns {object} the actions face.
     */
    function createQuoteActions(deps) {
      const buttons = new Map()
      const listeners = new Set()
      let inFlight = false
      let disposed = false

      const debouncer = createButtonStateDebouncer({
        ms: deps.debounceMs,
        finalize: () => {
          emit()
        },
        setTimer: deps.setTimer,
      })

      function emit() {
        if (disposed) return
        for (const listener of [...listeners]) {
          try {
            listener()
          } catch (_error) {
            // One broken subscriber cannot stop the others.
          }
        }
      }

      function say(level, key, params) {
        deps.notify(level, deps.t(key, params))
      }

      /**
       * Resolve the tab page the button itself sits in.
       *
       * Ownership always starts here. The selection side is resolved per branch
       * below, because a bridge capture has no parent-document selection at all
       * (implementation.md §6.2).
       * @param {Element} element - the rendered button.
       * @param {string} sessionId - the on-screen session.
       * @returns {object|null} the button's page target, or null.
       */
      function resolveOwn(element, sessionId) {
        const own = deps.focusedTarget(element)
        if (own === undefined || own === null || own.sessionId !== sessionId) return null
        return own
      }

      /**
       * Describe the button's own tab page for `readSelection`, so an adapter can
       * decide without touching platform state (implementation.md §6.1).
       * @param {object} own - the button's page target.
       * @returns {{sessionId: string, occurrenceId: string|undefined}} the tab shape.
       */
      function tabOf(own) {
        return {
          sessionId: own.sessionId,
          occurrenceId: own.occurrence === undefined || own.occurrence === null ? undefined : own.occurrence.id,
        }
      }

      /**
       * Resolve the parent-document selection anchor, tolerating a document whose
       * selection cannot be read at all.
       * @returns {Element|null} the anchor element, or null.
       */
      function readAnchor() {
        try {
          const element = deps.selectionAnchor()
          return element === undefined ? null : element
        } catch (_error) {
          return null
        }
      }

      /**
       * Witness-less ownership branch: the F01 three-element check, unchanged.
       *
       * A selection that spans two tab occurrences is one valid DOM selection, so
       * both its start and its end must belong to the button's own tab.
       * @param {object} own - the button's page target.
       * @param {string} sessionId - the on-screen session.
       * @param {Element|null} anchorElement - the selection's start element.
       * @returns {boolean} whether the parent selection belongs to this button.
       */
      function parentSelectionOwned(own, sessionId, anchorElement) {
        if (anchorElement === null || anchorElement === undefined) return false
        const endElement = deps.selectionEnd()
        if (endElement === null || endElement === undefined) return false
        const start = deps.focusedTarget(anchorElement)
        if (start === undefined || start === null || start.sessionId !== sessionId) return false
        const end = deps.focusedTarget(endElement)
        if (end === undefined || end === null || end.sessionId !== sessionId) return false
        if (own.occurrence === undefined || start.occurrence === undefined || end.occurrence === undefined) return false
        if (own.occurrence.id !== start.occurrence.id) return false
        if (own.occurrence.id !== end.occurrence.id) return false
        return true
      }

      /**
       * Witness ownership branch: the capture names the element it was read from, so
       * only that element's tab occurrence has to equal the button's own.
       * @param {Element} witness - the element the adapter read from.
       * @param {object} own - the button's page target.
       * @param {string} sessionId - the on-screen session.
       * @returns {boolean} whether the witness belongs to this button.
       */
      function witnessOwned(witness, own, sessionId) {
        const seen = deps.focusedTarget(witness)
        if (seen === undefined || seen === null || seen.sessionId !== sessionId) return false
        if (own.occurrence === undefined || own.occurrence === null) return false
        if (seen.occurrence === undefined || seen.occurrence === null) return false
        return own.occurrence.id === seen.occurrence.id
      }

      /**
       * Decide ownership from the capture itself.
       *
       * The two branches are the seam's only difference: a capture that reports a
       * witness is compared by occurrence, one that does not keeps the F01 check.
       * The core never inspects the path or the format (implementation.md §6.2).
       * @param {object} capture - the adapter's answer.
       * @param {object} own - the button's page target.
       * @param {string} sessionId - the on-screen session.
       * @param {Element|null} anchorElement - the parent selection's start element.
       * @returns {boolean} whether this capture may be attributed to this button.
       */
      function captureOwned(capture, own, sessionId, anchorElement) {
        if (capture.witness !== undefined && capture.witness !== null) {
          return witnessOwned(capture.witness, own, sessionId)
        }
        return parentSelectionOwned(own, sessionId, anchorElement)
      }

      function stateOf(element) {
        if (disposed || element === null || element === undefined) return { enabled: false }
        const entry = buttons.get(element)
        if (entry === undefined) return { enabled: false }
        try {
          const sessionId = deps.mountedSessionId()
          if (sessionId === undefined || sessionId === null) return { enabled: false }
          // Without a retained session scope there is no insertion target and no
          // session-bound notice channel, so the state is not actionable at all.
          const scope = deps.sessionScope(sessionId)
          if (scope === undefined || scope === null) return { enabled: false }
          const own = resolveOwn(element, sessionId)
          if (own === null) return { enabled: false }
          const adapter = deps.registry.match(entry.path)
          if (adapter === undefined) return { enabled: false }
          const anchorElement = readAnchor()
          const capture = adapter.readSelection({
            path: entry.path,
            document: deps.document(),
            anchor: anchorElement,
            tab: tabOf(own),
          })
          if (capture === null || capture === undefined) return { enabled: false }
          if (typeof capture.text !== 'string' || capture.text.trim() === '') return { enabled: false }
          if (!captureOwned(capture, own, sessionId, anchorElement)) return { enabled: false }
          return { enabled: true }
        } catch (_error) {
          // An unsynced tab or a throwing adapter greys the button; nothing escapes into render.
          return { enabled: false }
        }
      }

      function click(element) {
        if (disposed || inFlight) return
        const entry = element === null || element === undefined ? undefined : buttons.get(element)
        if (entry === undefined) return
        inFlight = true
        try {
          const sessionId = deps.mountedSessionId()
          if (sessionId === undefined || sessionId === null) {
            say('error', 'error.noSession')
            return
          }
          let own = null
          try {
            own = resolveOwn(element, sessionId)
          } catch (_error) {
            own = null
          }
          if (own === null) {
            say('error', 'error.ownership')
            return
          }
          const adapter = deps.registry.match(entry.path)
          if (adapter === undefined) {
            say('error', 'error.noSelection')
            return
          }
          const anchorElement = readAnchor()
          let capture
          try {
            capture = adapter.readSelection({
              path: entry.path,
              document: deps.document(),
              anchor: anchorElement,
              tab: tabOf(own),
            })
          } catch (_error) {
            say('error', 'error.readFailed')
            return
          }
          if (capture === null || capture === undefined || typeof capture.text !== 'string' || capture.text.trim() === '') {
            say('error', 'error.noSelection')
            return
          }
          let owned = false
          try {
            owned = captureOwned(capture, own, sessionId, anchorElement)
          } catch (_error) {
            owned = false
          }
          if (!owned) {
            say('error', 'error.ownership')
            return
          }
          const scope = deps.sessionScope(sessionId)
          if (scope === undefined || scope === null) {
            say('error', 'error.noScope')
            return
          }
          let input
          try {
            input = deps.inputFor(scope)
          } catch (_error) {
            input = undefined
          }
          if (input === undefined || input === null) {
            say('error', 'error.noScope')
            return
          }
          const sourcePath = relativizePath(entry.path, deps.workspaceRoot(sessionId))
          const built = deps.history.has(sessionId, sourcePath)
            ? composePointerQuote(sourcePath)
            : composeOriginalQuote(capture.text, sourcePath)
          if (built === null) {
            say('error', 'error.noSelection')
            return
          }
          let inserted = false
          try {
            inserted = input.insertQuote(built.text, built.summary) === true
          } catch (_error) {
            inserted = false
          }
          if (!inserted) {
            // Busy composer, disposed facade, or a refused insertion: never retry, never setDraft.
            say('error', 'error.insertRejected')
            return
          }
          deps.history.add(sessionId, sourcePath)
          if (isSensitiveName(sourcePath)) say('info', 'info.sensitive', { path: sourcePath })
        } finally {
          inFlight = false
          emit()
        }
      }

      return {
        /**
         * Register one rendered button element and the path it quotes.
         * @param {Element} element - the button element; also the ownership witness.
         * @param {string} path - the preview's absolute path.
         * @returns {() => void} detach.
         */
        attach(element, path) {
          if (disposed || element === null || element === undefined) return () => {}
          buttons.set(element, { path })
          return () => {
            if (buttons.get(element) === undefined) return
            buttons.delete(element)
            emit()
          }
        },
        stateOf,
        /** @param {() => void} listener - notified after each debounced finalization. @returns {() => void} unsubscribe. */
        subscribe(listener) {
          if (disposed) return () => {}
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
        /** Recompute and broadcast after the contract debounce window. */
        scheduleRefresh() {
          debouncer.schedule()
        },
        click,
        /** @returns {boolean} whether a click is being processed. */
        isBusy() {
          return inFlight
        },
        /** Release the debouncer, every button and every subscriber. */
        dispose() {
          if (disposed) return
          disposed = true
          debouncer.dispose()
          buttons.clear()
          listeners.clear()
        },
      }
    }

    /* ------------------------------------------------------------------ *
     * HTML takeover bridge: bootstrap, frame state, parent-side validation
     * (I001-F02 core/implementation.md §5)
     * ------------------------------------------------------------------ */

    /**
     * Decode complete HTML bytes strictly. Invalid UTF-8 is a render failure, never
     * an empty page (implementation.md §5.1).
     * @param {unknown} bytes - complete page bytes.
     * @returns {string} the decoded page.
     */
    function decodeHtmlBytes(bytes) {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    }

    /**
     * Encode the page as a JSON string literal for the bootstrap script.
     *
     * JSON keeps the page inert; every `</` becomes the equivalent `<\/` so the
     * payload can never close the outer script, and no string concatenation ever
     * places page text into the script (implementation.md §5.2).
     * @param {unknown} pageHtml - the decoded page.
     * @returns {string} a script-safe JSON literal.
     */
    function encodeHtmlPayload(pageHtml) {
      const text = String(pageHtml === null || pageHtml === undefined ? '' : pageHtml)
      return JSON.stringify(text).replace(/<\//gu, '<\\/')
    }

    /**
     * Build the outer iframe document: a fixed bootstrap that installs the bridge
     * before the page and then writes the page into the same document.
     *
     * The page's own CSP `script-src` therefore cannot disable the bridge, because
     * no script is injected into the page (implementation.md §5.2, C-09).
     * @param {unknown} pageHtml - the decoded page.
     * @returns {string} the bootstrap document.
     */
    function createHtmlBootstrap(pageHtml) {
      const payload = encodeHtmlPayload(pageHtml)
      return `<!doctype html><meta charset="utf-8"><script>(()=>{
const channel="${HTML_BRIDGE_CHANNEL}",version=${HTML_BRIDGE_VERSION}
const send=(data)=>{try{window.parent.postMessage(data,"*")}catch(_error){}}
const snapshot=Document.prototype.getSelection
let broken=false
const fail=()=>{if(broken)return;broken=true;send({channel:channel,version:version,kind:"error"})}
const report=()=>{
if(broken)return
try{
const selection=snapshot.call(document)
const text=selection===null||selection===undefined?"":String(selection.toString())
if(text.trim()!=="")send({channel:channel,version:version,kind:"selection",text:text})
}catch(_error){fail()}
}
try{
window.addEventListener("selectionchange",report,true)
window.addEventListener("mouseup",report,true)
window.addEventListener("keyup",report,true)
send({channel:channel,version:version,kind:"ready"})
const page=${payload}
document.open()
document.write(page)
document.close()
}catch(_error){fail()}
})()</script>`
    }

    /**
     * Create the parent half of the bridge: one entry per mounted iframe, strict
     * message validation, and the ready deadline.
     *
     * State is keyed by the iframe element, never by path: one file may be open in
     * two panes at once (implementation.md §5.4).
     * @param {{window: object, setTimer: (callback: () => void, ms: number) => (() => void), readyTimeoutMs?: number, onFailure?: (reason: string, frame: object) => void, onActivity?: () => void}} deps
     *   the message target, the disposable timer, the deadline, the failure sink and
     *   the accepted-message sink the button state hangs off.
     * @returns {object} the bridge.
     */
    function createHtmlBridge(deps) {
      const entries = new Map()
      const timeoutMs = deps.readyTimeoutMs === undefined ? HTML_BRIDGE_READY_TIMEOUT_MS : deps.readyTimeoutMs
      const onFailure = typeof deps.onFailure === 'function' ? deps.onFailure : () => {}
      const onActivity = typeof deps.onActivity === 'function' ? deps.onActivity : () => {}
      let disposed = false

      /** @returns {object|null} the frame's browsing context, or null. */
      function sourceOf(frame) {
        try {
          const source = frame.contentWindow
          return source === undefined ? null : source
        } catch (_error) {
          return null
        }
      }

      /**
       * Validate one message against one frame. All four rules are required; a
       * rejected message is noise, never an error and never a cleared selection.
       * @param {object} event - the message event.
       * @param {object} frame - the iframe it claims to come from.
       * @returns {boolean} whether the message may be applied.
       */
      function accepts(event, frame) {
        if (event === null || event === undefined) return false
        if (event.origin !== 'null') return false
        const source = sourceOf(frame)
        if (source === null || event.source !== source) return false
        const data = event.data
        if (data === null || typeof data !== 'object' || Array.isArray(data) === true) return false
        if (data.channel !== HTML_BRIDGE_CHANNEL || data.version !== HTML_BRIDGE_VERSION) return false
        if (data.kind === 'selection') {
          if (typeof data.text !== 'string') return false
          return data.text.length <= HTML_BRIDGE_MAX_TEXT
        }
        return data.kind === 'ready' || data.kind === 'error'
      }

      /**
       * Apply one accepted message to its frame's entry, then let the owner
       * re-finalize anything that depends on the cached state.
       * @param {object} entry - the frame entry.
       * @param {object} frame - the iframe element.
       * @param {object} data - the validated payload.
       */
      function apply(entry, frame, data) {
        if (data.kind === 'ready') {
          entry.state.ready = true
          entry.state.failed = false
          entry.stop()
        } else if (data.kind === 'error') {
          entry.state.failed = true
          onFailure('error', frame)
        } else {
          entry.state.text = data.text
        }
        // The parent document never sees the iframe's selection events, so this is
        // the only signal that the button state changed (implementation.md §4, §5.4).
        try {
          onActivity()
        } catch (_error) {
          // Re-finalizing is best effort; the cached state is already correct.
        }
      }

      /** @param {object} event - one window `message` event. */
      function receive(event) {
        if (disposed) return
        // Snapshot the entries: a subscriber may mount or unmount a frame.
        for (const [frame, entry] of [...entries]) {
          if (!accepts(event, frame)) continue
          apply(entry, frame, event.data)
        }
      }

      /**
       * Track one mounted iframe and arm its ready deadline.
       * @param {object} frame - the iframe element.
       * @returns {() => void} an idempotent detach that deletes the entry.
       */
      function attach(frame) {
        if (disposed || frame === null || frame === undefined) return () => {}
        if (entries.has(frame)) return () => {}
        const entry = {
          state: { ready: false, text: '', failed: false, unmounted: false },
          timer: null,
          /** Cancel the deadline; a settled frame needs none. */
          stop() {
            if (entry.timer === null) return
            const cancel = entry.timer
            entry.timer = null
            cancel()
          },
        }
        entries.set(frame, entry)
        try {
          entry.timer = deps.setTimer(() => {
            entry.timer = null
            if (disposed || entry.state.unmounted || entry.state.ready) return
            onFailure('timeout', frame)
          }, timeoutMs)
        } catch (_error) {
          // Without a timer the frame simply never reaches the deadline.
          entry.timer = null
        }
        return () => {
          if (entry.state.unmounted) return
          entry.state.unmounted = true
          entry.stop()
          entries.delete(frame)
        }
      }

      /**
       * @param {object} frame - an iframe element.
       * @returns {{ready: boolean, text: string, failed: boolean, unmounted: boolean}|undefined} the frame state.
       */
      function stateOf(frame) {
        const entry = entries.get(frame)
        if (entry === undefined) return undefined
        const { ready, text, failed, unmounted } = entry.state
        return { ready, text, failed, unmounted }
      }

      /**
       * @param {object} frame - an iframe element.
       * @returns {boolean} whether the frame reported ready and is not failed.
       */
      function isUsable(frame) {
        const entry = entries.get(frame)
        if (entry === undefined) return false
        const { ready, failed, unmounted } = entry.state
        return ready && !failed && !unmounted
      }

      /**
       * @param {object} frame - an iframe element.
       * @returns {string} the latest reported selection, or an empty string.
       */
      function textOf(frame) {
        if (!isUsable(frame)) return ''
        const entry = entries.get(frame)
        return typeof entry.state.text === 'string' ? entry.state.text : ''
      }

      /** @returns {object[]} the mounted iframes, in mount order. */
      function listFrames() {
        return [...entries.keys()]
      }

      /** Drop every entry and every pending deadline; the listener stays. */
      function clear() {
        for (const entry of entries.values()) entry.stop()
        entries.clear()
      }

      /** Remove the message listener and every entry. */
      function dispose() {
        if (disposed) return
        disposed = true
        clear()
        try {
          if (deps.window !== null && deps.window !== undefined && typeof deps.window.removeEventListener === 'function') {
            deps.window.removeEventListener('message', receive)
          }
        } catch (_error) {
          // A window that refuses the removal has no listener left to misuse.
        }
      }

      try {
        if (deps.window !== null && deps.window !== undefined && typeof deps.window.addEventListener === 'function') {
          deps.window.addEventListener('message', receive)
        }
      } catch (_error) {
        // Without a message channel the bridge simply never becomes ready.
      }

      return { attach, stateOf, isUsable, textOf, frames: listFrames, dispose }
    }

    /* ------------------------------------------------------------------ *
     * HTML adapter: which frame answered, never which format it is
     * (I001-F02 core/implementation.md §6.2)
     * ------------------------------------------------------------------ */

    /**
     * The HTML adapter reads the cached bridge selection of the frame that belongs
     * to the button's own tab page.
     *
     * It only narrows candidates; the core's witness branch still decides
     * ownership, so an ambiguous answer is `null` rather than a guess
     * (implementation.md §6.2, plan §2.2 item 9).
     * @param {{bridge: object|null, focusedTarget: (element: object) => object}} deps - the bridge and the ownership reader.
     * @returns {object} the adapter.
     */
    function createHtmlQuoteAdapter(deps) {
      const bridge = deps.bridge
      const focusedTarget = deps.focusedTarget

      /** @returns {{text: string, path: string, witness: object}} one capture. */
      function captureOf(frame, path) {
        return { text: bridge.textOf(frame), path, witness: frame }
      }

      /** @returns {object[]} the usable frames that hold a non-blank selection. */
      function candidates() {
        if (bridge === null || bridge === undefined) return []
        const usable = []
        for (const frame of bridge.frames()) {
          if (bridge.isUsable(frame) !== true) continue
          const text = bridge.textOf(frame)
          if (typeof text !== 'string' || text.trim() === '') continue
          usable.push(frame)
        }
        return usable
      }

      return {
        id: HTML_ADAPTER_ID,
        match: (path) => matchesHtmlPreviewPath(path),
        readSelection(target) {
          if (target === null || target === undefined) return null
          const tab = target.tab
          if (tab === null || tab === undefined) return null
          const wanted = tab.occurrenceId
          // Without the button's own occurrence there is nothing to compare a frame with.
          if (typeof wanted !== 'string' || wanted === '') return null
          const usable = candidates()
          if (usable.length === 0) return null
          const matched = []
          for (const frame of usable) {
            let seen
            try {
              seen = focusedTarget(frame)
            } catch (_error) {
              seen = undefined
            }
            if (seen === undefined || seen === null) continue
            const occurrence = seen.occurrence
            if (occurrence === undefined || occurrence === null) continue
            if (occurrence.id === wanted) matched.push(frame)
          }
          if (matched.length === 1) return captureOf(matched[0], target.path)
          // Two frames of the same page are indistinguishable here; refuse to guess.
          if (matched.length > 1) return null
          if (usable.length === 1) return captureOf(usable[0], target.path)
          return null
        },
      }
    }

    /* ------------------------------------------------------------------ *
     * HTML takeover: persistence, gate, registration group, header controls
     * (I001-F02 core/implementation.md §3, §4, §7, §8)
     * ------------------------------------------------------------------ */

    /**
     * Read the browser storage object without letting a denied access reach the
     * caller. A missing store keeps the takeover closed (C-02).
     * @returns {object|undefined} the storage object, or undefined.
     */
    function readLocalStorage() {
      try {
        return typeof localStorage === 'undefined' ? undefined : localStorage
      } catch (_error) {
        return undefined
      }
    }

    /**
     * Read the persistent user choice. Missing, foreign or unreadable values are all
     * "off" (implementation.md §4).
     * @param {object|undefined|null} storage - a `localStorage`-shaped store.
     * @returns {boolean} whether the takeover is switched on.
     */
    function readHtmlTakeoverPreference(storage) {
      try {
        if (storage === null || storage === undefined) return false
        if (typeof storage.getItem !== 'function') return false
        return storage.getItem(HTML_TAKEOVER_STORAGE_KEY) === HTML_TAKEOVER_ON
      } catch (_error) {
        return false
      }
    }

    /**
     * Persist the user choice. A refused write must never reach the render layer,
     * and the next read stays fail-closed (implementation.md §4, U-27).
     * @param {object|undefined|null} storage - a `localStorage`-shaped store.
     * @param {boolean} on - the choice to persist.
     */
    function writeHtmlTakeoverPreference(storage, on) {
      try {
        if (storage === null || storage === undefined) return
        if (typeof storage.setItem !== 'function') return
        storage.setItem(HTML_TAKEOVER_STORAGE_KEY, on === true ? HTML_TAKEOVER_ON : HTML_TAKEOVER_OFF)
      } catch (_error) {
        // The toggle's visual state is the user's answer; the store is best effort.
      }
    }

    /**
     * Build the takeover state machine.
     *
     * Every platform registration arrives as an injected factory, so the whole
     * state machine (including its teardown order) runs head-lessly and nothing
     * here touches a DSH service directly (implementation.md §4, §8).
     * @param {object} deps - platform seams and registration factories.
     * @returns {object} the takeover surface plus its control seams.
     */
    function createHtmlTakeover(deps) {
      const t = deps.t
      const listeners = new Set()
      const noticedTargets = new Set()
      let persistedOn = readHtmlTakeoverPreference(deps.storage)
      let applied = false
      let opened = []
      let bridge = null
      let unsubscribeGate = null
      let disposeToggle = null
      let disposed = false

      /** @returns {boolean} whether the script gate is open right now. */
      function gateOpen() {
        try {
          return deps.gateOpen() === true
        } catch (_error) {
          // A value that never arrived is closed, never open (fail-closed).
          return false
        }
      }

      function emit() {
        if (disposed) return
        for (const listener of [...listeners]) {
          try {
            listener()
          } catch (_error) {
            // One broken subscriber cannot stop the others.
          }
        }
      }

      /** @returns {{persistedOn: boolean, gateOpen: boolean, effective: boolean, disabled: boolean}} the header state. */
      function snapshot() {
        const open = gateOpen()
        return {
          persistedOn,
          gateOpen: open,
          effective: persistedOn && open,
          // The preference stays on; only the gate makes the takeover unreachable.
          disabled: persistedOn && !open,
        }
      }

      /**
       * Deliver one notice through the session-bound channel. A missing channel is
       * not an error of its own (F01 §8.1).
       * @param {'info'|'error'} level - notice tier.
       * @param {string} key - dictionary key.
       */
      function say(level, key) {
        try {
          deps.notify(level, t(key))
        } catch (_error) {
          // Nothing to write to; the click path already covers its own failures.
        }
      }

      /**
       * Page identity for notice de-duplication; the frame itself when the platform
       * cannot resolve it.
       * @param {object} frame - the iframe element.
       * @returns {object|string} the de-duplication key.
       */
      function pageTargetOf(frame) {
        try {
          const target = deps.focusedTarget(frame)
          if (target === null || target === undefined) return frame
          if (target.occurrence === null || target.occurrence === undefined) return frame
          return typeof target.occurrence.id === 'string' ? target.occurrence.id : frame
        } catch (_error) {
          return frame
        }
      }

      /**
       * Report one bridge failure as a status notice. The notice is charged to the
       * page target, not to a click, and at most once per target (C-15, C-16).
       * @param {string} _reason - `timeout` or `error`; both read the same to the user.
       * @param {object} frame - the iframe element.
       */
      function reportFailure(_reason, frame) {
        const target = pageTargetOf(frame)
        if (noticedTargets.has(target)) return
        noticedTargets.add(target)
        say('info', 'info.htmlBridgeUnavailable')
      }

      /**
       * Release a registration list in reverse order, so a failed open leaves no
       * half-registered state and one throwing disposer cannot strand the rest.
       * @param {Array<() => void>} list - the disposers in registration order.
       */
      function unwind(list) {
        while (list.length > 0) {
          const dispose = list.pop()
          try {
            dispose()
          } catch (_error) {
            // Keep releasing; the caller only needs the end state.
          }
        }
      }

      /**
       * Prepare the `blob:` payload for one document. A strict UTF-8 failure is a
       * render failure: no URL, no bridge, no excerpt (implementation.md §5.1).
       * @param {unknown} bytes - complete page bytes.
       * @returns {{failed: boolean, url: string|undefined}} the frame source.
       */
      function createFrameSource(bytes) {
        let page
        try {
          page = decodeHtmlBytes(bytes)
        } catch (_error) {
          return { failed: true, url: undefined }
        }
        try {
          const blob = new Blob([createHtmlBootstrap(page)], { type: 'text/html' })
          const url = deps.url.createObjectURL(blob)
          if (typeof url !== 'string' || url === '') return { failed: true, url: undefined }
          return { failed: false, url }
        } catch (_error) {
          return { failed: true, url: undefined }
        }
      }

      /**
       * Release one frame source.
       * @param {{failed: boolean, url: string|undefined}|undefined} source - a source from `createFrameSource`.
       */
      function releaseFrameSource(source) {
        if (source === null || source === undefined) return
        if (source.failed === true) return
        if (typeof source.url !== 'string' || source.url === '') return
        try {
          deps.url.revokeObjectURL(source.url)
        } catch (_error) {
          // An already released URL needs no second attempt.
        }
      }

      /**
       * Track a mounted iframe in the bridge.
       * @param {object} frame - the iframe element.
       * @returns {() => void} detach.
       */
      function attachFrame(frame) {
        if (disposed || bridge === null) return () => {}
        return bridge.attach(frame)
      }

      const surface = {
        snapshot,
        subscribe(listener) {
          if (disposed) return () => {}
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
        toggle,
        createFrameSource,
        releaseFrameSource,
        attachFrame,
      }

      /**
       * Register the effective set in the C-20 order: bridge listener, definition,
       * adapter, body, quote button. Any failure unwinds what already happened and
       * leaves the takeover switched off rather than half-registered.
       */
      function open() {
        const started = []
        try {
          const created = createHtmlBridge({
            window: deps.window,
            setTimer: deps.setTimer,
            readyTimeoutMs: HTML_BRIDGE_READY_TIMEOUT_MS,
            onFailure: reportFailure,
            // The bridge report is the only selection signal the parent ever gets.
            onActivity: () => {
              if (typeof deps.onActivity !== 'function') return
              try {
                deps.onActivity()
              } catch (_error) {
                // Re-finalizing is best effort; the cached state is already correct.
              }
            },
          })
          bridge = created
          started.push(() => {
            created.dispose()
          })
          started.push(deps.registerDefinition())
          started.push(deps.registerAdapter(created))
          started.push(deps.registerBody(surface))
          started.push(deps.registerQuoteButton(surface))
          opened = started
          applied = true
        } catch (_error) {
          unwind(started)
          bridge = null
          opened = []
          applied = false
        }
      }

      /** Release the effective set in reverse order and clear the bridge cache. */
      function close() {
        const pending = opened
        opened = []
        applied = false
        unwind(pending)
        bridge = null
      }

      /** Reconcile the registration set with the current gate value. */
      function sync() {
        if (disposed) return
        const want = persistedOn && gateOpen()
        if (want !== applied) {
          if (want) open()
          else close()
        }
        emit()
      }

      /**
       * Flip the persistent choice and run the enable self-check.
       *
       * The check emits exactly one notice: `info` when the takeover engaged, `error`
       * naming the gate when it could not (C-15, U-29). Turning off is silent.
       */
      function toggle() {
        if (disposed) return
        persistedOn = !persistedOn
        writeHtmlTakeoverPreference(deps.storage, persistedOn)
        sync()
        if (!persistedOn) return
        if (applied) say('info', 'info.htmlEnabled')
        else say('error', 'error.htmlGateUnavailable')
      }

      /** Release everything this takeover registered; safe to call twice. */
      function dispose() {
        if (disposed) return
        close()
        if (unsubscribeGate !== null) {
          const off = unsubscribeGate
          unsubscribeGate = null
          try {
            off()
          } catch (_error) {
            // The gate subscription is gone from the provider's side either way.
          }
        }
        if (disposeToggle !== null) {
          const off = disposeToggle
          disposeToggle = null
          try {
            off()
          } catch (_error) {
            // A refused slot removal must not keep the plugin alive.
          }
        }
        listeners.clear()
        noticedTargets.clear()
        disposed = true
      }

      // The toggle is the only entry point, so it exists even while the takeover is
      // off; it is torn down last, with the rest of the plugin.
      try {
        disposeToggle = deps.registerToggle(surface)
      } catch (_error) {
        disposeToggle = null
      }
      try {
        unsubscribeGate = deps.subscribeGate(() => {
          sync()
        })
      } catch (_error) {
        unsubscribeGate = null
      }
      sync()

      return Object.assign(surface, { dispose })
    }

    /**
     * Build the header takeover toggle.
     *
     * It renders for HTML paths only and stays clickable while the takeover is off,
     * because switching it on is how the user expresses the preference. While the
     * gate is closed and the preference is on it is disabled and explains why
     * (implementation.md §7, U-26).
     * @param {object} React - the platform React module.
     * @param {{html: object, t: (key: string) => string}} deps - the takeover surface and the fallback translate.
     * @returns {Function} the component.
     */
    function createHtmlToggleComponent(React, deps) {
      const html = deps.html
      return function SideQuoteHtmlToggle(props) {
        const applies = matchesHtmlPreviewPath(props.absolutePath)
        const translate = typeof props.t === 'function' ? props.t : deps.t
        const [current, setCurrent] = React.useState(html.snapshot())
        React.useEffect(() => {
          if (!applies) return undefined
          const sync = () => {
            setCurrent(html.snapshot())
          }
          const unsubscribe = html.subscribe(sync)
          sync()
          return unsubscribe
        }, [applies])
        // Outside the HTML formats this plugin renders nothing at all.
        if (!applies) return null
        const label = translate('html.toggleLabel')
        return React.createElement('button', {
          type: 'button',
          'data-side-quote-html-toggle': '',
          'aria-pressed': current.persistedOn ? 'true' : 'false',
          'aria-label': label,
          disabled: current.disabled,
          title: current.disabled ? translate('html.toggleGateReason') : translate('html.toggleTooltip'),
          onClick: () => {
            html.toggle()
          },
        }, label)
      }
    }

    /**
     * Build the HTML quote button variant.
     *
     * It is registered only while the takeover is effective and shares the F01
     * actions: one history, one insert path, one notice budget. Availability is
     * decided by the bridge cache plus the core's witness branch (implementation.md
     * §7, §9).
     * @param {object} React - the platform React module.
     * @param {{actions: object, t: (key: string) => string}} deps - the quote actions and the fallback translate.
     * @returns {Function} the component.
     */
    function createHtmlQuoteButtonComponent(React, deps) {
      const actions = deps.actions
      return function SideQuoteHtmlButton(props) {
        const absolutePath = props.absolutePath
        const applies = matchesHtmlPreviewPath(absolutePath)
        const translate = typeof props.t === 'function' ? props.t : deps.t
        const buttonRef = React.useRef(null)
        const [enabled, setEnabled] = React.useState(false)
        React.useEffect(() => {
          if (!applies) return undefined
          const element = buttonRef.current
          if (element === null || element === undefined) return undefined
          const detach = actions.attach(element, absolutePath)
          const sync = () => {
            setEnabled(actions.stateOf(element).enabled)
          }
          const unsubscribe = actions.subscribe(sync)
          sync()
          return () => {
            unsubscribe()
            detach()
          }
        }, [applies, absolutePath])
        if (!applies) return null
        const label = translate('html.quoteButton')
        return React.createElement('button', {
          type: 'button',
          ref: buttonRef,
          disabled: !enabled,
          'data-side-quote-html-quote': '',
          'aria-label': label,
          title: translate('html.quoteTooltip'),
          // Keep the in-frame selection alive until `click` reads the bridge cache.
          onMouseDown: (event) => {
            event.preventDefault()
          },
          onClick: () => {
            actions.click(buttonRef.current)
          },
        }, label)
      }
    }

    /**
     * Build the takeover body.
     *
     * The page is carried by a `blob:` iframe with `sandbox="allow-scripts"` and an
     * opaque origin, so the page can neither read this document nor be read from it
     * except through the bridge (implementation.md §5.1).
     * @param {object} React - the platform React module.
     * @param {{html: object, t: (key: string) => string}} deps - the takeover surface and the fallback translate.
     * @returns {Function} the component.
     */
    function createHtmlBodyComponent(React, deps) {
      const html = deps.html
      return function SideQuoteHtmlBody(props) {
        const translate = typeof props.t === 'function' ? props.t : deps.t
        const content = props.content
        const usable = content !== null && content !== undefined && content.kind === 'bytes'
        const frameRef = React.useRef(null)
        const [source, setSource] = React.useState(undefined)
        React.useEffect(() => {
          if (content === null || content === undefined || content.kind !== 'bytes') {
            setSource(undefined)
            return undefined
          }
          const created = html.createFrameSource(content.data)
          setSource(created)
          return () => {
            html.releaseFrameSource(created)
          }
        }, [content])
        React.useEffect(() => {
          if (source === undefined || source.failed === true) return undefined
          const frame = frameRef.current
          if (frame === null || frame === undefined) return undefined
          return html.attachFrame(frame)
        }, [source])
        if (!usable) return null
        if (source === undefined) return null
        if (source.failed === true) {
          // The failure line is the whole feedback; there is no bridge and no excerpt.
          return React.createElement('p', { role: 'alert', 'data-side-quote-html': '' }, translate('html.failed'))
        }
        return React.createElement('div', {
          'data-side-quote-html': '',
          style: { position: 'relative', width: '100%', height: '100%' },
        }, React.createElement('iframe', {
          ref: frameRef,
          key: source.url,
          src: source.url,
          sandbox: 'allow-scripts',
          title: translate('html.frame'),
          'data-side-quote-html-frame': '',
          style: { position: 'absolute', inset: '0', width: '100%', height: '100%', border: '0' },
        }))
      }
    }

    /* ------------------------------------------------------------------ *
     * Locale dictionaries (§ C-27): UI copy only, never content copy.
     * ------------------------------------------------------------------ */

    const NS = 'side-quote'
    const LOCALES = {
      zh: {
        'quote.button': '引用',
        'quote.tooltip': '把选中的文字引用到当前会话',
        'error.noSession': '没有可用的会话，无法插入引用。',
        'error.noSelection': '没有可用的选区，无法插入引用。',
        'error.ownership': '选区与引用按钮不在同一个预览体中。',
        'error.noScope': '当前会话不可用，无法插入引用。',
        'error.readFailed': '读取选区失败，无法插入引用。',
        'error.insertRejected': '输入框当前不接受引用，请稍后再试。',
        'info.sensitive': '已引用可能含敏感内容的文件：{path}。内容已原样插入，请确认是否要发送。',
        // I001-F02: HTML takeover UI copy only, never quote content.
        'html.viewerTitle': 'HTML（可引用）',
        'html.toggleLabel': '接管 HTML 预览',
        'html.toggleTooltip': '开启后由本插件渲染此页面，可在预览内划词引用；外部 CSS/JS/图片不会加载。',
        'html.toggleGateReason': '需要先开启「开发者工具」（页面脚本）才能接管预览。',
        'html.frame': 'HTML 文档预览',
        'html.failed': '无法预览这份 HTML 文档',
        'html.quoteButton': '引用',
        'html.quoteTooltip': '把预览中选中的文字引用到当前会话',
        'info.htmlEnabled': '已接管 HTML 预览：可在预览内划词引用；外部 CSS/JS/图片不会加载。',
        'info.htmlBridgeUnavailable': '当前 HTML 页面无法建立引用桥，划词引用暂不可用。',
        'error.htmlGateUnavailable': '未能接管 HTML 预览：需要先开启「开发者工具」（页面脚本）。',
      },
      en: {
        'quote.button': 'Quote',
        'quote.tooltip': 'Quote the selected text into this session',
        'error.noSession': 'No session is on screen, so the quote cannot be inserted.',
        'error.noSelection': 'There is no usable selection to quote.',
        'error.ownership': 'The selection and the quote button are not in the same preview.',
        'error.noScope': 'The current session is unavailable, so the quote cannot be inserted.',
        'error.readFailed': 'The selection could not be read, so the quote was not inserted.',
        'error.insertRejected': 'The composer does not accept a quote right now; try again later.',
        'info.sensitive': 'Quoted a file that may contain sensitive content: {path}. Its content was inserted as-is; confirm before sending.',
        // I001-F02: HTML takeover UI copy only, never quote content.
        'html.viewerTitle': 'HTML (quotable)',
        'html.toggleLabel': 'Take over the HTML preview',
        'html.toggleTooltip': 'Render this page with this plugin so text can be quoted; external CSS, scripts and images will not load.',
        'html.toggleGateReason': 'Turn on Developer tools (page scripts) before this takeover can render the page.',
        'html.frame': 'HTML document preview',
        'html.failed': 'This HTML document could not be previewed.',
        'html.quoteButton': 'Quote',
        'html.quoteTooltip': 'Quote the selected text into this session',
        'info.htmlEnabled': 'HTML preview taken over: text can now be quoted; external CSS, scripts and images will not load.',
        'info.htmlBridgeUnavailable': 'This page could not establish the quote bridge, so quoting is unavailable for now.',
        'error.htmlGateUnavailable': 'The HTML preview could not be taken over: Developer tools (page scripts) must be on.',
      },
    }

    /* ------------------------------------------------------------------ *
     * Platform wiring (implementation.md §3, §3.1, §6)
     * ------------------------------------------------------------------ */

    /**
     * Read the session's workspace root without trusting any single hop.
     * @param {object} ctx - the client context.
     * @param {string} sessionId - the on-screen session.
     * @returns {string|null} the working directory, or null when it is unknown.
     */
    function readWorkspaceRoot(ctx, sessionId) {
      try {
        const binding = ctx.sessions.binding(sessionId)
        if (binding === null || binding === undefined) return null
        const face = binding.session.projections.faceOf('workingDirectory')
        if (face === null || face === undefined) return null
        const root = face.getSnapshot()
        return typeof root === 'string' && root !== '' ? root : null
      } catch (_error) {
        return null
      }
    }

    /**
     * Deliver one notice through the on-screen session's input facade. The notice
     * channel is session-bound, so without a session on screen there is nothing
     * to write to; a notice failure must never break the click path.
     * @param {object} ctx - the client context.
     * @param {'info'|'error'} level - notice tier.
     * @param {string} text - notice body.
     */
    function notifyOnScreenSession(ctx, level, text) {
      try {
        const sessionId = ctx.sidebarRight.mounted.getSnapshot()
        if (sessionId === undefined || sessionId === null) return
        const scope = ctx.sessions.scope(sessionId)
        if (scope === undefined || scope === null) return
        ctx.conversation.input.for(scope).notify(level, text)
      } catch (_error) {
        // No channel is not an error of its own.
      }
    }

    /**
     * Build the header button component.
     *
     * The plugin never moves focus, scrolls, or clears the selection. The only
     * gesture intervention is cancelling `mousedown`, which keeps the preview
     * selection alive until `click` reads it; cancelling `pointerdown` instead
     * would suppress the compatibility mouse events and could swallow `click`.
     * @param {object} React - the platform React module.
     * @param {{actions: object, t: (key: string, params?: object) => string}} deps - actions and the fallback translate.
     * @returns {Function} the component.
     */
    function createQuoteButtonComponent(React, deps) {
      const actions = deps.actions
      return function SideQuoteButton(props) {
        const absolutePath = props.absolutePath
        const allowed = typeof absolutePath === 'string' && isAllowedPath(absolutePath)
        const translate = typeof props.t === 'function' ? props.t : deps.t
        const buttonRef = React.useRef(null)
        const [enabled, setEnabled] = React.useState(false)
        React.useEffect(() => {
          if (!allowed) return undefined
          const element = buttonRef.current
          if (element === null || element === undefined) return undefined
          const detach = actions.attach(element, absolutePath)
          const sync = () => {
            setEnabled(actions.stateOf(element).enabled)
          }
          const unsubscribe = actions.subscribe(sync)
          sync()
          return () => {
            unsubscribe()
            detach()
          }
        }, [allowed, absolutePath])
        // Outside the format whitelist this plugin renders nothing at all.
        if (!allowed) return null
        const label = translate('quote.button')
        return React.createElement('button', {
          type: 'button',
          ref: buttonRef,
          disabled: !enabled,
          'aria-label': label,
          title: translate('quote.tooltip'),
          onMouseDown: (event) => {
            event.preventDefault()
          },
          onClick: () => {
            actions.click(buttonRef.current)
          },
        }, label)
      }
    }

    /**
     * Wire the plugin onto a client context. Every resource is registered through
     * `ctx.effect`, so unloading the plugin releases listeners, timers, adapters,
     * dictionaries, the slot contributions, the quoted-file record and the whole
     * HTML takeover group.
     * @param {object} ctx - the client context.
     * @param {{document?: Document, window?: object, storage?: object, url?: object}} host
     *   browser globals; every member is injectable for tests and falls back to the
     *   real global (`globalThis` / `localStorage` / `URL`).
     * @returns {{registry: object, history: object, actions: object, html: object|null}} the wired internals.
     */
    function applyPlugin(ctx, host) {
      const source = host === undefined || host === null ? {} : host
      const doc = source.document
      const win = source.window === undefined ? globalThis : source.window
      const storage = source.storage === undefined ? readLocalStorage() : source.storage
      const url = source.url === undefined ? globalThis.URL : source.url
      const registry = createAdapterRegistry()
      const history = createQuoteHistory()
      const t = ctx.locale.bind(NS)
      const actions = createQuoteActions({
        t,
        debounceMs: DEBOUNCE_MS,
        setTimer: (callback, ms) => ctx.timer.timeout(callback, ms),
        registry,
        history,
        document: () => doc,
        mountedSessionId: () => ctx.sidebarRight.mounted.getSnapshot(),
        focusedTarget: (element) => ctx.sidebarRight.focusedTarget(element),
        selectionAnchor: () => readSelectionAnchor(doc),
        selectionEnd: () => readSelectionEndAnchor(doc),
        sessionScope: (sessionId) => ctx.sessions.scope(sessionId),
        inputFor: (scope) => ctx.conversation.input.for(scope),
        workspaceRoot: (sessionId) => readWorkspaceRoot(ctx, sessionId),
        notify: (level, text) => {
          notifyOnScreenSession(ctx, level, text)
        },
      })

      ctx.effect(() => ctx.locale.register(NS, { zh: LOCALES.zh, en: LOCALES.en }), 'side-quote: dictionaries')
      ctx.effect(() => registry.register(createTextSelectionAdapter()), 'side-quote: text adapter')
      ctx.effect(
        () => ctx.sidebarRight.mounted.subscribe(() => {
          actions.scheduleRefresh()
        }),
        'side-quote: on-screen session',
      )
      ctx.effect(() => {
        const monitor = createSelectionMonitor({
          document: doc,
          onChange: () => {
            actions.scheduleRefresh()
          },
        })
        return () => {
          monitor.dispose()
        }
      }, 'side-quote: selection events')
      ctx.effect(() => () => {
        actions.dispose()
      }, 'side-quote: buttons')
      ctx.effect(() => () => {
        history.clear()
      }, 'side-quote: quoted files')

      // The whole HTML takeover lives in one managed group, inserted between the
      // F01 teardown effects and the F01 button contribution: the toggle it always
      // contributes, its gate subscription and, while effective, the definition,
      // the body, the adapter, the quote button and the bridge listener. Its own
      // teardown releases them in reverse order (implementation.md §8, C-20).
      let html = null
      ctx.effect(() => {
        const takeover = createHtmlTakeover({
          t,
          storage,
          window: win,
          url,
          setTimer: (callback, ms) => ctx.timer.timeout(callback, ms),
          gateOpen: () => {
            try {
              return ctx.configForms.developerTools.enabled.getSnapshot() === true
            } catch (_error) {
              return false
            }
          },
          subscribeGate: (listener) => {
            try {
              return ctx.configForms.developerTools.enabled.subscribe(listener)
            } catch (_error) {
              return () => {}
            }
          },
          notify: (level, text) => {
            notifyOnScreenSession(ctx, level, text)
          },
          // A bridge report must re-finalize the header buttons: the iframe's own
          // selection events never reach the parent document.
          onActivity: () => {
            actions.scheduleRefresh()
          },
          focusedTarget: (element) => ctx.sidebarRight.focusedTarget(element),
          registerDefinition: () => ctx.documentPreviews.register({
            id: HTML_BODY_ID,
            extensions: HTML_EXTENSIONS,
            priority: 'extension',
            title: () => t('html.viewerTitle'),
            loading: 'bytes-complete',
            wrap: false,
          }),
          registerAdapter: (created) => registry.register(createHtmlQuoteAdapter({
            bridge: created,
            focusedTarget: (element) => ctx.sidebarRight.focusedTarget(element),
          })),
          registerBody: (surface) => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register(
            { name: 'sidebar.right.tab.document', key: HTML_BODY_ID, locale: NS },
            createHtmlBodyComponent(React, { html: surface, t }),
          )),
          registerQuoteButton: () => ctx.slots.inject(
            'sidebar.right.tab.document.actions',
            () => ctx.slots.register(
              { name: 'sidebar.right.tab.document.actions', id: HTML_QUOTE_SLOT_ID, locale: NS },
              createHtmlQuoteButtonComponent(React, { actions, t }),
            ),
          ),
          registerToggle: (surface) => ctx.slots.inject(
            'sidebar.right.tab.document.actions',
            () => ctx.slots.register(
              { name: 'sidebar.right.tab.document.actions', id: HTML_TOGGLE_SLOT_ID, locale: NS },
              createHtmlToggleComponent(React, { html: surface, t }),
            ),
          ),
        })
        html = takeover
        return () => {
          html = null
          takeover.dispose()
        }
      }, 'side-quote: html takeover')

      const Button = createQuoteButtonComponent(React, { actions, t })
      ctx.effect(
        () => ctx.slots.inject('sidebar.right.tab.document.actions', () => ctx.slots.register({
          name: 'sidebar.right.tab.document.actions',
          id: 'side-quote',
          locale: NS,
        }, Button)),
        'side-quote: document actions',
      )

      return { registry, history, actions, html }
    }

    /* ------------------------------------------------------------------ *
     * Test-only surface
     * ------------------------------------------------------------------ */

    const internals = {
      NS,
      ALLOWED_SUFFIXES,
      ALLOWED_FILENAMES,
      MAX_QUOTE_LINES,
      MAX_QUOTE_CHARS,
      TRUNCATION_NOTE,
      SOURCE_LABEL,
      POINTER_DETAIL,
      POINTER_LABEL,
      POINTER_REMINDER,
      SENSITIVE_EXACT_NAMES,
      SENSITIVE_SUFFIXES,
      SENSITIVE_SUBSTRINGS,
      QUOTE_HISTORY_LIMIT,
      QUOTE_HISTORY_SEPARATOR,
      DEBOUNCE_MS,
      TEXT_ADAPTER_ID,
      HTML_TAKEOVER_STORAGE_KEY,
      HTML_TAKEOVER_ON,
      HTML_TAKEOVER_OFF,
      HTML_BODY_ID,
      HTML_EXTENSIONS,
      HTML_ADAPTER_ID,
      HTML_BRIDGE_CHANNEL,
      HTML_BRIDGE_VERSION,
      HTML_BRIDGE_MAX_TEXT,
      HTML_BRIDGE_READY_TIMEOUT_MS,
      HTML_TOGGLE_SLOT_ID,
      HTML_QUOTE_SLOT_ID,
      LOCALES,
      fileNameOf,
      normalizePath,
      relativizePath,
      isAllowedPath,
      isSensitiveName,
      matchesHtmlPreviewPath,
      truncateExcerpt,
      composeOriginalQuote,
      composePointerQuote,
      createQuoteHistory,
      createAdapterRegistry,
      createTextSelectionAdapter,
      selectionTextOf,
      readSelectionAnchor,
      readSelectionEndAnchor,
      createButtonStateDebouncer,
      createSelectionMonitor,
      createQuoteActions,
      createQuoteButtonComponent,
      createHtmlBridge,
      createHtmlTakeover,
      createHtmlQuoteAdapter,
      createHtmlBootstrap,
      createHtmlBodyComponent,
      createHtmlToggleComponent,
      createHtmlQuoteButtonComponent,
      decodeHtmlBytes,
      applyPlugin,
    }

    return {
      // Client services this bundle reads: the slot registry, the right sidebar
      // (on-screen session + element ownership), sessions (scope + workspace
      // root), the conversation input facade, the dictionaries, the disposable
      // timer used by the button-state debounce, the document-preview registry
      // the HTML takeover registers into, and the script gate it follows.
      // Cordis has no optional injection, so the two I001-F02 services are hard
      // requirements of this bundle.
      inject: [
        'slots', 'sidebarRight', 'sessions', 'conversation', 'locale', 'timer',
        'documentPreviews', 'configForms',
      ],
      apply(ctx) {
        applyPlugin(ctx, {
          document: typeof document === 'undefined' ? undefined : document,
          window: typeof window === 'undefined' ? undefined : window,
          storage: readLocalStorage(),
          url: typeof URL === 'undefined' ? undefined : URL,
        })
      },
      internals,
    }
  },
})
