/**
 * Test-only loader for the zero-build client bundle.
 *
 * The shipped bundle is a same-origin classic `<script>` that calls
 * `window.__ModuleLoader__.load({ id, factory(require) })`. Node cannot import
 * that shape as ESM, so tests evaluate the file body as a classic script with a
 * synthetic `window` and hand `factory` a fake module table. No runtime
 * dependency is added and nothing here ships in the package (`files` excludes
 * `test`).
 */
import { readFile } from 'node:fs/promises'

const CLIENT_URL = new URL('../client.js', import.meta.url)

/**
 * Stand-in for the platform `react` module. The bundle resolves React through
 * `require`, exactly like the shipped client packages do; the stub only has to
 * exist so the factory can run head-lessly.
 */
export const reactStub = {
  createElement: () => null,
  useState: (initial) => [initial, () => {}],
  useEffect: () => {},
  useRef: (initial) => ({ current: initial }),
}

/**
 * Evaluate client.js and build its module.
 * @param {{ modules?: Record<string, unknown> }} [options] - fake platform module table for `require`.
 * @returns {Promise<{ spec: object, module: object }>} the loader spec and the factory result.
 */
export async function loadClientModule(options = {}) {
  const modules = { react: reactStub, ...(options.modules ?? {}) }
  const source = await readFile(CLIENT_URL, 'utf8')
  const specs = []
  const window = {
    __ModuleLoader__: {
      load(spec) {
        specs.push(spec)
      },
    },
  }
  // Classic-script evaluation: the same shape the DSH client loader receives.
  // eslint-disable-next-line no-new-func
  new Function('window', source)(window)
  if (specs.length !== 1) {
    throw new Error(`client.js must load exactly one module, got ${specs.length}`)
  }
  const spec = specs[0]
  const require = (id) => {
    if (Object.prototype.hasOwnProperty.call(modules, id)) return modules[id]
    throw new Error(`client.js required "${id}", which the test module table does not provide`)
  }
  return { spec, module: spec.factory(require) }
}

/**
 * Load the module and assert the test-only `internals` surface exists.
 * @param {{ modules?: Record<string, unknown> }} [options] - fake platform module table for `require`.
 * @returns {Promise<object>} the factory result, including `internals`.
 */
export async function loadClientInternals(options = {}) {
  const { module } = await loadClientModule(options)
  if (module.internals === undefined || module.internals === null) {
    throw new Error('client.js factory result must expose internals for node:test')
  }
  return module
}
