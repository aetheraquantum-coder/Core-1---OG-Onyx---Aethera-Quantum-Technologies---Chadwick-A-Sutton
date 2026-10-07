'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const code = fs.readFileSync(path.join(__dirname, '..', 'skills', 'review-mantis-plans', 'resources', 'praying-mantis', 'web', 'autosave.js'), 'utf8');

function fixture() {
  const values = new Map(), requests = [], messages = [], downloads = [];
  let throwWrite = false;
  const context = vm.createContext({
    location: { protocol: 'http:', hostname: '127.0.0.1' },
    localStorage: {
      getItem: key => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => { if (throwWrite) throw Error('storage full'); values.set(key, value); },
    },
    fetch: (...args) => { requests.push(args); return Promise.resolve({ ok: false }); },
    addEventListener() {},
    dispatchEvent: event => messages.push(event.detail),
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    setInterval: () => 1,
    clearInterval() {},
    setTimeout: fn => { fn(); },
    Blob,
    URL: { createObjectURL: blob => { downloads.push(blob); return 'blob:synthetic'; }, revokeObjectURL() {} },
    document: { addEventListener() {}, createElement: () => ({ click() {} }) },
  });
  vm.runInContext(code, context, { timeout: 1000 });
  return { save: context.AetheraSave, values, requests, messages, downloads, failWrites: () => { throwWrite = true; } };
}
const saved = data => JSON.stringify({ schema: 'aethera-save/v1', id: 'test-plan', saved_at: '2026-01-01T00:00:00Z', data });

test('standalone loopback saves and recovery make zero network requests', async () => {
  const f = fixture();
  f.save.register('test-plan', () => ({ risk: '0.1' }), () => {});
  assert.equal(f.requests.length, 0, 'register must not request unsupported disk recovery');
  assert.equal(await f.save.flush(), true);
  assert.equal(f.requests.length, 0, 'flush must not POST to an absent save API');
  assert.deepEqual(JSON.parse(f.values.get('aq-save:test-plan')).data, { risk: '0.1' });
});

test('browser snapshots retain the previous save as a local backup', async () => {
  const f = fixture();
  let risk = '0.1';
  f.save.register('test-plan', () => ({ risk }), () => {});
  assert.equal(await f.save.flush(), true);
  const first = f.values.get('aq-save:test-plan');
  risk = '0.2';
  assert.equal(await f.save.flush(), true);
  assert.equal(f.values.get('aq-save-backup:test-plan'), first);
  assert.equal(JSON.parse(f.values.get('aq-save:test-plan')).data.risk, '0.2');
});

test('register restores local snapshots and falls back to a valid local backup', () => {
  for (const useBackup of [false, true]) {
    const f = fixture();
    f.values.set('aq-save:test-plan', useBackup ? 'malformed' : saved({ risk: '0.2' }));
    if (useBackup) f.values.set('aq-save-backup:test-plan', saved({ risk: '0.3' }));
    let restored;
    f.save.register('test-plan', () => ({}), data => { restored = data; });
    assert.equal(restored.risk, useBackup ? '0.3' : '0.2');
    assert.equal(f.requests.length, 0);
  }
});

test('failed local storage remains an explicit unsuccessful save', async () => {
  const f = fixture();
  f.save.register('test-plan', () => ({ risk: '0.1' }), () => {});
  f.failWrites();
  assert.equal(await f.save.flush(), false);
  assert.match(f.messages.at(-1).message, /Save failed/);
  assert.equal(f.requests.length, 0);
});

test('manual save export contains the local records', async () => {
  const f = fixture();
  f.save.register('test-plan', () => ({ risk: '0.1' }), () => {});
  await f.save.flush();
  f.save.exportSaves();
  const exported = JSON.parse(await f.downloads[0].text());
  assert.equal(exported.schema, 'aethera-save-export/v1');
  assert.equal(exported.records.length, 1);
  assert.equal(exported.records[0].data.risk, '0.1');
  assert.equal(f.requests.length, 0);
});
