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
       * Resolve the elements that must all share one tab occurrence: the button,
       * the selection's start side and the selection's end side. A selection that
       * spans two previews is refused rather than attributed to one of them.
       * Throws only from the platform's `focusedTarget`; callers turn that into
       * "greyed" or one error.
       */
      function resolveTargets(element, sessionId) {
        const own = deps.focusedTarget(element)
        if (own === undefined || own === null || own.sessionId !== sessionId) return null
        const startElement = deps.selectionAnchor()
        if (startElement === null || startElement === undefined) return null
        const endElement = deps.selectionEnd()
        if (endElement === null || endElement === undefined) return null
        const start = deps.focusedTarget(startElement)
        if (start === undefined || start === null || start.sessionId !== sessionId) return null
        const end = deps.focusedTarget(endElement)
        if (end === undefined || end === null || end.sessionId !== sessionId) return null
        if (own.occurrence === undefined || start.occurrence === undefined || end.occurrence === undefined) return null
        if (own.occurrence.id !== start.occurrence.id) return null
        if (own.occurrence.id !== end.occurrence.id) return null
        return { anchor: startElement }
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
          const targets = resolveTargets(element, sessionId)
          if (targets === null) return { enabled: false }
          const adapter = deps.registry.match(entry.path)
          if (adapter === undefined) return { enabled: false }
          const capture = adapter.readSelection({ path: entry.path, document: deps.document(), anchor: targets.anchor })
          if (capture === null || capture === undefined) return { enabled: false }
          if (typeof capture.text !== 'string' || capture.text.trim() === '') return { enabled: false }
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
          let targets = null
          try {
            targets = resolveTargets(element, sessionId)
          } catch (_error) {
            targets = null
          }
          if (targets === null) {
            say('error', 'error.ownership')
            return
          }
          const adapter = deps.registry.match(entry.path)
          if (adapter === undefined) {
            say('error', 'error.noSelection')
            return
          }
          let capture
          try {
            capture = adapter.readSelection({ path: entry.path, document: deps.document(), anchor: targets.anchor })
          } catch (_error) {
            say('error', 'error.readFailed')
            return
          }
          if (capture === null || capture === undefined || typeof capture.text !== 'string' || capture.text.trim() === '') {
            say('error', 'error.noSelection')
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
     * dictionaries, the slot contribution and the quoted-file record.
     * @param {object} ctx - the client context.
     * @param {{document?: Document}} host - the product document (injectable for tests).
     * @returns {{registry: object, history: object, actions: object}} the wired internals.
     */
    function applyPlugin(ctx, host) {
      const doc = host === undefined || host === null ? undefined : host.document
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

      const Button = createQuoteButtonComponent(React, { actions, t })
      ctx.effect(
        () => ctx.slots.inject('sidebar.right.tab.document.actions', () => ctx.slots.register({
          name: 'sidebar.right.tab.document.actions',
          id: 'side-quote',
          locale: NS,
        }, Button)),
        'side-quote: document actions',
      )

      return { registry, history, actions }
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
      LOCALES,
      fileNameOf,
      normalizePath,
      relativizePath,
      isAllowedPath,
      isSensitiveName,
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
      applyPlugin,
    }

    return {
      // Client services this bundle reads: the slot registry, the right sidebar
      // (on-screen session + element ownership), sessions (scope + workspace
      // root), the conversation input facade, the dictionaries, and the
      // disposable timer used by the button-state debounce.
      inject: ['slots', 'sidebarRight', 'sessions', 'conversation', 'locale', 'timer'],
      apply(ctx) {
        applyPlugin(ctx, { document: typeof document === 'undefined' ? undefined : document })
      },
      internals,
    }
  },
})
