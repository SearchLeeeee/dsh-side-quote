/**
 * Package-shape test: proves the package is loadable without a bundler and keeps
 * the zero-build / zero-dependency contract (AC-11).
 *
 * Uses only Node built-ins (node:test / node:assert); no runtime dependency is
 * added. The client half is evaluated the way the DSH loader serves it: a
 * classic script that calls `window.__ModuleLoader__.load`, with React resolved
 * from the platform module table.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { loadClientModule, reactStub } from './load-client.mjs'

const root = new URL('../', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))

/** Client packages whose slots this bundle contributes to. */
const CLIENT_PACKAGE_DEPENDENCIES = [
  '@deepseek-ai/dsh-client-ui-sidebar-documentpreview',
  '@deepseek-ai/dsh-client-ui-conversation',
]

/** Cordis services the bundle's `inject` must declare. */
const CLIENT_SERVICES = ['slots', 'sidebarRight', 'sessions', 'conversation', 'locale', 'timer']

test('manifest declares a dsh bundle patch and a web client half', () => {
  assert.equal(manifest.name, 'dsh-side-quote')
  assert.equal(manifest.type, 'module')
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.deepEqual(manifest.dsh.client.inject, CLIENT_PACKAGE_DEPENDENCIES)
})

test('manifest stays zero-dependency and ships no tests', () => {
  assert.deepEqual(Object.keys(manifest.dependencies ?? {}), [], 'the runtime must not gain a dependency')
  assert.equal(Object.hasOwn(manifest, 'devDependencies'), false)
  assert.equal(manifest.files.includes('test'), false, 'test files must not ship in the artifact')
  assert.equal(manifest.files.some((entry) => entry.startsWith('test')), false)
  assert.deepEqual(manifest.files, ['index.js', 'client.js', 'cordis.patch.yml'])
})

test('host half exports apply()', async () => {
  const host = await import(new URL('index.js', root))
  assert.equal(typeof host.apply, 'function')
})

test('client half registers module dsh-side-quote and requires only react', async () => {
  const required = []
  const modules = new Proxy({ react: reactStub }, {
    get(target, key) {
      if (typeof key === 'string') required.push(key)
      return target[key]
    },
  })
  const { spec, module } = await loadClientModule({ modules })

  assert.equal(spec.id, 'dsh-side-quote')
  assert.deepEqual(required, ['react'], 'the platform module table is the only resolution channel')
  assert.deepEqual(module.inject, CLIENT_SERVICES)
  assert.equal(typeof module.apply, 'function')
  assert.equal(typeof module.internals, 'object')
})

test('client half stays a classic script: no ESM syntax, no local imports', async () => {
  const source = await readFile(new URL('client.js', root), 'utf8')
  assert.equal(/^\s*(?:import|export)\b/mu.test(source), false, 'a classic <script> cannot use ESM syntax')
  assert.equal(/\bfrom\s+['"]\.\.?\//u.test(source), false, 'no relative module resolution exists at runtime')
})
