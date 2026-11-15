/**
 * Install-skeleton smoke test: proves the package is loadable without a bundler.
 * Uses only Node built-ins (node:test / node:assert); no runtime dependency is added.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));

test('manifest declares a dsh bundle patch and a web client half', () => {
  assert.equal(manifest.name, 'dsh-side-quote');
  assert.equal(manifest.type, 'module');
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
  assert.equal(manifest.dsh.client.platform, 'web');
  assert.ok(Array.isArray(manifest.dsh.client.inject));
});

test('host half exports apply()', async () => {
  const host = await import(new URL('index.js', root));
  assert.equal(typeof host.apply, 'function');
});

test('client half registers module dsh-side-quote', async () => {
  let spec;
  globalThis.window = { __ModuleLoader__: { load(value) { spec = value; } } };
  await import(new URL('client.js', root));

  assert.equal(spec.id, 'dsh-side-quote');
  const mod = spec.factory(() => {
    throw new Error('client module must not require anything yet');
  });
  assert.ok(Array.isArray(mod.inject));
  assert.equal(typeof mod.apply, 'function');
});
