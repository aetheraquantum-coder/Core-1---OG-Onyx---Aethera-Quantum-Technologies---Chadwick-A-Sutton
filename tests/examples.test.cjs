'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const skill = path.join(__dirname, '..', 'skills', 'review-onyx-reports');
const expectedHash = '9289fa38751445dce26858585d276ee3c4c61ef809caef1ee85262ac115e24c7';
function run(root) {
  return spawnSync(process.execPath, [path.join(root, 'examples', 'compare.cjs')], {
    encoding: 'utf8', cwd: os.tmpdir(), timeout: 5000,
    env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' },
  });
}
function copy(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'onyx-example-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(skill, root, { recursive: true });
  return root;
}

test('executable example exposes the hash-checked runner receipt', () => {
  const result = run(skill);
  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.ok(output.evidence, 'Expected a bounded-runner evidence receipt');
  assert.equal(output.evidence.coreSha256, expectedHash);
  assert.equal(output.evidence.coreBytes, 3089);
  assert.equal(output.evidence.label, 'user-supplied; not independently verified');
});

test('executable example rejects same-length engine tampering', t => {
  const root = copy(t);
  const engine = path.join(root, 'scripts', 'onyx-core.js');
  const before = fs.readFileSync(engine, 'utf8');
  const changed = before.replace('Math.max', 'Math.min');
  assert.notEqual(changed, before);
  assert.equal(Buffer.byteLength(changed), Buffer.byteLength(before));
  fs.writeFileSync(engine, changed);
  const result = run(root);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^\{"error":/);
  assert.equal(JSON.parse(result.stderr).error.code, 'EXAMPLE_FAILED');
});

test('executable example never echoes malformed report content or paths', t => {
  const root = copy(t);
  const input = path.join(root, 'examples', 'before.json');
  fs.writeFileSync(input, '{ synthetic_private_marker ');
  const result = run(root);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^\{"error":/);
  assert.equal(JSON.parse(result.stderr).error.code, 'EXAMPLE_FAILED');
  assert.ok(!result.stderr.includes('synthetic_private_marker'));
  assert.ok(!result.stderr.includes(root));
});
