'use strict';

// Synthetic inputs only. Tests exercise the CLI as a separate local Node process.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const scripts = path.join(__dirname, '..', 'skills', 'review-onyx-reports', 'scripts');
const runner = path.join(scripts, 'run.cjs');
const engine = path.join(scripts, 'onyx-core.js');
const expectedHash = '9289fa38751445dce26858585d276ee3c4c61ef809caef1ee85262ac115e24c7';
const label = 'user-supplied; not independently verified';
const plain = value => JSON.parse(JSON.stringify(value));
const hash = value => createHash('sha256').update(value).digest('hex');

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'onyx-cli-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function write(root, name, value) {
  const file = path.join(root, name);
  fs.writeFileSync(file, JSON.stringify(value));
  return file;
}
function invoke(args, options = {}) {
  return spawnSync(process.execPath, [options.runner || runner, ...args], {
    cwd: options.cwd || os.tmpdir(), encoding: 'utf8', timeout: 5000,
    env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' },
  });
}
function success(result, command) {
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const out = JSON.parse(result.stdout);
  assert.equal(out.command, command);
  assert.equal(out.evidence.label, label);
  assert.equal(out.evidence.coreSha256, expectedHash);
  assert.equal(out.evidence.coreBytes, 3089);
  assert.deepEqual(out.evidence.runtime, { name: 'node', version: process.version });
  assert.ok(Number.isFinite(Date.parse(out.evidence.startedAt)));
  assert.ok(Date.parse(out.evidence.completedAt) >= Date.parse(out.evidence.startedAt));
  return out;
}
function core() {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(engine, 'utf8'), context);
  return context.OnyxCore;
}
const fixtures = [
  ['health', { schema: 'aethera-health-export/v1', pages: [
    { at: 0, issues: [{ active: true }, { active: false }, null] },
    { at: 8640000000000000, issues: [{ active: true }] },
  ] }, { pages: 2, activeIssues: 2, stalePages: 1 }],
  ['handoff', { schema: 'aethera-game-design-handoff/v1', learning: { stats: {
    demo: { helpYes: 2, helpNo: 1, funYes: 3, funNo: 4 },
  } } }, { helpfulRatings: 2, funRatings: 3, learningContexts: 1 }],
  ['learning', { schema: 'aethera-game-learning/v1', stats: {
    demo: { helpYes: 2, helpNo: 1, funYes: 3, funNo: 4 },
  } }, { helpfulRatings: 2, funRatings: 3, learningContexts: 1 }],
  ['iterations', { schema: 'aethera-iterations/v1', results: [
    { blocked: false, max: 0.1 }, { blocked: true, max: 0.7 },
  ] }, { completedSets: 2, blockedSets: 1, maxRisk: 0.7 }],
  ['saves', { schema: 'aethera-save-export/v1', records: [
    { schema: 'aethera-save/v1', id: 'synthetic-save' },
  ] }, { saveRecords: 1 }],
];

for (const [name, report, metrics] of fixtures) {
  test(`summarize ${name} returns the original metrics and evidence`, t => {
    const input = write(workspace(t), 'report.json', report);
    const out = success(invoke(['summarize', input]), 'summarize');
    assert.deepEqual(out.summary, { schema: report.schema, metrics, evidence: label });
  });
  test(`compare ${name} summarizes both originals before comparing`, t => {
    const input = write(workspace(t), 'report.json', report);
    const out = success(invoke(['compare', input, input]), 'compare');
    const api = core();
    const summary = api.summarize(report);
    assert.deepEqual(out.before, plain(summary));
    assert.deepEqual(out.after, plain(summary));
    assert.deepEqual(out.differences, plain(api.compare(summary, summary)));
  });
}

test('compare preserves original after-minus-before differences', t => {
  const root = workspace(t);
  const before = write(root, 'before.json', fixtures[3][1]);
  const after = write(root, 'after.json', {
    schema: 'aethera-iterations/v1', results: [{ blocked: false, max: 0.2 }],
  });
  const out = success(invoke(['compare', before, after]), 'compare');
  assert.deepEqual(out.differences, [
    { metric: 'completedSets', before: 2, after: 1, difference: -1 },
    { metric: 'blockedSets', before: 1, after: 0, difference: -1 },
    { metric: 'maxRisk', before: 0.7, after: 0.2, difference: 0.2 - 0.7 },
  ]);
});

const suggestionInputs = [
  ['active issues', fixtures[0][1]],
  ['blocked sets', fixtures[3][1]],
  ['no fun ratings', { schema: 'aethera-game-learning/v1', stats: {} }],
  ['fun ratings', fixtures[2][1]],
  ['save records', fixtures[4][1]],
  ['default', { schema: 'aethera-health-export/v1', pages: [] }],
];
for (const [name, report] of suggestionInputs) {
  test(`suggest preserves exact original advisory wording for ${name}`, t => {
    const input = write(workspace(t), 'report.json', report);
    const out = success(invoke(['suggest', input]), 'suggest');
    const api = core();
    const summary = api.summarize(report);
    assert.deepEqual(out.summary, plain(summary));
    assert.equal(out.suggestion, api.suggest(summary));
    assert.equal(out.advisoryOnly, true);
  });
}

test('bundled engine is the byte-identical original', () => {
  assert.ok(fs.existsSync(engine), 'the unchanged engine is bundled');
  const bytes = fs.readFileSync(engine);
  assert.equal(bytes.length, 3089);
  assert.equal(hash(bytes), expectedHash);
});

test('fresh install location and unrelated cwd are supported', t => {
  const root = workspace(t);
  const fresh = path.join(root, 'a fresh location');
  assert.ok(fs.existsSync(runner), 'the CLI runner is present');
  fs.cpSync(scripts, fresh, { recursive: true });
  const input = write(root, 'input.json', fixtures[4][1]);
  const out = success(invoke(['summarize', path.basename(input)], {
    runner: path.join(fresh, 'run.cjs'), cwd: root,
  }), 'summarize');
  assert.deepEqual(out.summary.metrics, { saveRecords: 1 });
});

function failure(result, code, forbidden = []) {
  assert.equal(result.error, undefined, 'CLI must exit promptly');
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '', 'errors must not emit report data');
  const out = JSON.parse(result.stderr);
  assert.equal(out.error.code, code);
  assert.equal(typeof out.error.message, 'string');
  assert.deepEqual(Object.keys(out), ['error']);
  assert.deepEqual(Object.keys(out.error).sort(), ['code', 'message']);
  for (const text of forbidden) assert.ok(!result.stderr.includes(text), 'error is sanitized');
  return out;
}

test('unsupported commands and incorrect arity produce sanitized usage errors', () => {
  for (const args of [[], ['arbitrary-code'], ['summarize'], ['suggest'], ['compare'],
    ['compare', 'one'], ['summarize', 'one', 'two'], ['suggest', 'one', 'two'],
    ['compare', 'one', 'two', 'three']]) failure(invoke(args), 'USAGE', ['arbitrary-code']);
});

test('arguments are filenames, never executable source or inline JSON', () => {
  const contents = '{"schema":"aethera-save-export/v1","records":[]}';
  failure(invoke(['summarize', contents]), 'INPUT_READ', [contents]);
});

const invalidReports = [null, [], 7, 'private report text', true, {},
  { schema: 'unsupported-private-schema' },
  { schema: 'aethera-health-export/v1', pages: [{ issues: {} }] },
  { schema: 'aethera-health-export/v1', pages: [null] },
  { schema: 'aethera-game-learning/v1', stats: [] },
  { schema: 'aethera-game-learning/v1', stats: { a: { helpYes: -1, helpNo: 0, funYes: 0, funNo: 0 } } },
  { schema: 'aethera-game-learning/v1', stats: { a: { helpYes: 100001, helpNo: 0, funYes: 0, funNo: 0 } } },
  { schema: 'aethera-game-learning/v1', stats: { a: { helpYes: 0.5, helpNo: 0, funYes: 0, funNo: 0 } } },
  { schema: 'aethera-game-design-handoff/v1', learning: {} },
  { schema: 'aethera-iterations/v1', results: [{ blocked: 'yes', max: 0.1 }] },
  { schema: 'aethera-iterations/v1', results: [{ blocked: false, max: -0.1 }] },
  { schema: 'aethera-iterations/v1', results: [{ blocked: false, max: 1.1 }] },
  { schema: 'aethera-save-export/v1', records: [{ schema: 'other', id: 'secret-id' }] },
  { schema: 'aethera-save-export/v1', records: [{ schema: 'aethera-save/v1', id: 3 }] },
];
for (let index = 0; index < invalidReports.length; index++) {
  test(`invalid report ${index + 1} is rejected without exposing source or path`, t => {
    const root = workspace(t);
    const input = write(root, 'private-input.json', invalidReports[index]);
    for (const command of ['summarize', 'suggest']) {
      failure(invoke([command, input]), 'REPORT_INVALID',
        [input, root, 'private-input', 'private report', 'unsupported-private-schema', 'secret-id']);
    }
  });
}

test('compare rejects different schemas', t => {
  const root = workspace(t);
  const before = write(root, 'before.json', fixtures[0][1]);
  const after = write(root, 'after.json', fixtures[4][1]);
  failure(invoke(['compare', before, after]), 'SCHEMA_MISMATCH', [root]);
});

test('compare rejects precomputed summaries instead of trusting their metrics', t => {
  const root = workspace(t);
  const original = write(root, 'original.json', fixtures[3][1]);
  const summary = write(root, 'summary.json', {
    schema: 'aethera-iterations/v1', metrics: { blockedSets: 0, maxRisk: 0 },
  });
  failure(invoke(['compare', original, summary]), 'REPORT_INVALID', [root]);
  failure(invoke(['suggest', summary]), 'REPORT_INVALID', [root]);
});

test('malformed JSON never appears in error output', t => {
  const root = workspace(t);
  const input = path.join(root, 'private-json.json');
  for (const raw of ['{"secret-user-text":', '{"secret-user-text":1,}',
    '/* secret-user-text */ {}', '{} {}', '', '\uFEFF{}']) {
    fs.writeFileSync(input, raw);
    failure(invoke(['summarize', input]), 'JSON_INVALID', [root, input, 'secret-user-text']);
  }
});

test('malformed UTF-8 is rejected instead of replaced', t => {
  const root = workspace(t);
  const input = path.join(root, 'invalid-utf8.json');
  for (const bytes of [[0xc0, 0xaf], [0xff], [0xe2, 0x82], [0xed, 0xa0, 0x80]]) {
    fs.writeFileSync(input, Buffer.concat([
      Buffer.from('{"schema":"aethera-save-export/v1","records":[],"note":"'),
      Buffer.from(bytes), Buffer.from('"}'),
    ]));
    failure(invoke(['summarize', input]), 'UTF8_INVALID', [root]);
  }
});

test('nonfinite numbers are rejected even in engine-ignored fields', t => {
  const root = workspace(t);
  const input = path.join(root, 'numbers.json');
  for (const number of ['1e400', '-1e400']) {
    fs.writeFileSync(input, `{"schema":"aethera-save-export/v1","records":[],"extra":${number}}`);
    failure(invoke(['summarize', input]), 'NUMBER_INVALID', [root]);
  }
});

test('unsafe keys are rejected at every level after decoding JSON escapes', t => {
  const root = workspace(t);
  const input = path.join(root, 'keys.json');
  for (const key of ['__proto__', 'prototype', 'constructor', '\\u005f_proto__']) {
    fs.writeFileSync(input, `{"schema":"aethera-save-export/v1","records":[],"extra":{"${key}":1}}`);
    failure(invoke(['summarize', input]), 'KEY_UNSAFE', [root]);
  }
});

test('two MiB is an inclusive per-input bound', t => {
  const root = workspace(t);
  const input = path.join(root, 'bytes.json');
  const valid = JSON.stringify({ schema: 'aethera-save-export/v1', records: [] });
  fs.writeFileSync(input, valid + ' '.repeat(2 * 1024 * 1024 - Buffer.byteLength(valid)));
  success(invoke(['summarize', input]), 'summarize');
  fs.appendFileSync(input, ' ');
  failure(invoke(['summarize', input]), 'INPUT_TOO_LARGE', [root]);
});

test('collection bound prevents original Math.max spread overflow', t => {
  const root = workspace(t);
  const input = write(root, 'results.json', {
    schema: 'aethera-iterations/v1', results: Array.from({ length: 10000 }, () => ({ blocked: false, max: 1 })),
  });
  const out = success(invoke(['summarize', input]), 'summarize');
  assert.deepEqual(out.summary.metrics, { completedSets: 10000, blockedSets: 0, maxRisk: 1 });
  const report = JSON.parse(fs.readFileSync(input));
  report.results.push({ blocked: false, max: 1 });
  fs.writeFileSync(input, JSON.stringify(report));
  failure(invoke(['summarize', input]), 'COLLECTION_LIMIT', [root]);
});

test('object property count has the same inclusive collection bound', t => {
  const root = workspace(t);
  const data = Object.fromEntries(Array.from({ length: 10000 }, (_, i) => ['k' + i, null]));
  const report = { schema: 'aethera-save-export/v1', records: [], data };
  const input = write(root, 'object.json', report);
  success(invoke(['summarize', input]), 'summarize');
  data.extra = null;
  fs.writeFileSync(input, JSON.stringify(report));
  failure(invoke(['summarize', input]), 'COLLECTION_LIMIT', [root]);
});

test('depth bound includes primitive leaves and permits depth 32', t => {
  const root = workspace(t);
  const nested = count => {
    let value = null;
    for (let i = 0; i < count; i++) value = [value];
    return value;
  };
  const report = { schema: 'aethera-save-export/v1', records: [], data: nested(31) };
  const input = write(root, 'depth.json', report);
  success(invoke(['summarize', input]), 'summarize');
  report.data = nested(32);
  fs.writeFileSync(input, JSON.stringify(report));
  failure(invoke(['summarize', input]), 'DEPTH_LIMIT', [root]);
});

test('node bound counts all JSON values including containers', t => {
  const root = workspace(t);
  // Root + schema + records + data = 4, then 5 arrays + 49,991 nulls = 50,000.
  const data = Array.from({ length: 5 }, () => Array(9998).fill(null));
  data[0].push(null);
  const report = { schema: 'aethera-save-export/v1', records: [], data };
  const input = write(root, 'nodes.json', report);
  success(invoke(['summarize', input]), 'summarize');
  data[1].push(null);
  fs.writeFileSync(input, JSON.stringify(report));
  failure(invoke(['summarize', input]), 'NODE_LIMIT', [root]);
});

test('string bound is inclusive and counts decoded UTF-16 code units', t => {
  const root = workspace(t);
  const report = { schema: 'aethera-save-export/v1', records: [], text: '😀'.repeat(32768) };
  const input = write(root, 'strings.json', report);
  success(invoke(['summarize', input]), 'summarize');
  report.text += 'a';
  fs.writeFileSync(input, JSON.stringify(report));
  failure(invoke(['summarize', input]), 'STRING_LIMIT', [root]);
});

test('object keys share the decoded string length bound', t => {
  const root = workspace(t);
  const report = { schema: 'aethera-save-export/v1', records: [], data: { ['k'.repeat(65536)]: null } };
  const input = write(root, 'long-key.json', report);
  success(invoke(['summarize', input]), 'summarize');
  report.data = { ['k'.repeat(65537)]: null };
  fs.writeFileSync(input, JSON.stringify(report));
  failure(invoke(['summarize', input]), 'STRING_LIMIT', [root]);
});

test('missing, directory, symbolic-link and unreadable inputs fail without private paths', t => {
  const root = workspace(t);
  const missing = path.join(root, 'private-missing.json');
  failure(invoke(['summarize', missing]), 'INPUT_READ', [root, 'private-missing']);
  failure(invoke(['summarize', root]), 'INPUT_READ', [root]);
  const input = write(root, 'private-valid.json', fixtures[4][1]);
  const link = path.join(root, 'private-symlink.json');
  fs.symlinkSync(input, link);
  failure(invoke(['summarize', link]), 'INPUT_READ', [root, 'private-symlink']);
  if (typeof process.getuid === 'function' && process.getuid() !== 0) {
    fs.chmodSync(input, 0);
    try { failure(invoke(['summarize', input]), 'INPUT_READ', [root]); }
    finally { fs.chmodSync(input, 0o600); }
  }
});

test('named pipes are rejected promptly without reading or blocking', { skip: process.platform === 'win32' }, t => {
  const root = workspace(t);
  const fifo = path.join(root, 'private-fifo');
  const created = spawnSync('mkfifo', [fifo], { encoding: 'utf8' });
  assert.equal(created.status, 0, created.stderr);
  failure(invoke(['summarize', fifo]), 'INPUT_READ', [root]);
});

test('report strings remain inert and never become evaluated code', t => {
  const root = workspace(t);
  const sentinel = path.join(root, 'MUST_NOT_EXIST');
  const script = `require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'executed')`;
  const input = write(root, 'inert.json', { ...fixtures[4][1], script });
  success(invoke(['summarize', input]), 'summarize');
  assert.equal(fs.existsSync(sentinel), false);
});

test('summarize, compare and suggest leave input and engine bytes unchanged and create no files', t => {
  const root = workspace(t);
  const input = write(root, 'report.json', fixtures[3][1]);
  const beforeInput = fs.readFileSync(input);
  const beforeEngine = fs.readFileSync(engine);
  const beforeTree = fs.readdirSync(root);
  for (const args of [['summarize', input], ['compare', input, input], ['suggest', input]]) {
    success(invoke(args, { cwd: root }), args[0]);
  }
  assert.deepEqual(fs.readFileSync(input), beforeInput);
  assert.deepEqual(fs.readFileSync(engine), beforeEngine);
  assert.deepEqual(fs.readdirSync(root), beforeTree);
});

test('tampered engine is rejected before any of its source can execute', t => {
  const root = workspace(t);
  const fresh = path.join(root, 'changed-package');
  assert.ok(fs.existsSync(runner), 'the runner exists');
  fs.cpSync(scripts, fresh, { recursive: true });
  const sentinel = path.join(root, 'MUST_NOT_EXIST');
  fs.writeFileSync(path.join(fresh, 'onyx-core.js'),
    `require('node:fs').writeFileSync(${JSON.stringify(sentinel)}, 'executed');`);
  const input = write(root, 'input.json', fixtures[4][1]);
  failure(invoke(['summarize', input], { runner: path.join(fresh, 'run.cjs') }), 'CORE_INTEGRITY', [root]);
  assert.equal(fs.existsSync(sentinel), false);
});

test('missing bundled engine gets a sanitized failure', t => {
  const root = workspace(t);
  const fresh = path.join(root, 'run.cjs');
  assert.ok(fs.existsSync(runner), 'the runner exists');
  fs.copyFileSync(runner, fresh);
  const input = write(root, 'input.json', fixtures[4][1]);
  failure(invoke(['summarize', input], { runner: fresh }), 'CORE_UNAVAILABLE', [root]);
});

test('duplicate-key JSON.parse last-value behavior is explicit and not claimed strict', t => {
  const root = workspace(t);
  const input = path.join(root, 'duplicates.json');
  fs.writeFileSync(input, '{"schema":"unsupported","schema":"aethera-save-export/v1","records":[]}');
  success(invoke(['summarize', input]), 'summarize');
});

test('--help exposes the commands and exact bounded JSON limits', () => {
  const result = invoke(['--help']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const out = JSON.parse(result.stdout);
  assert.equal(out.command, 'help');
  assert.equal(out.runnerVersion, '0.1.0');
  assert.deepEqual(out.commands, ['summarize FILE', 'compare BEFORE AFTER', 'suggest FILE']);
  assert.deepEqual(out.limits, {
    maxBytes: 2097152, maxDepth: 32, maxNodes: 50000,
    maxCollectionEntries: 10000, maxStringCodeUnits: 65536,
  });
  assert.match(out.jsonParser, /duplicate keys.*last value/i);
});

test('--version verifies the actual bundled core hash separately from packaging version', () => {
  const out = success(invoke(['--version']), 'version');
  assert.equal(out.runnerVersion, '0.1.0');
  assert.equal(out.engineVersion, null);
});

test('equal-length source tampering fails the SHA-256 check independently of byte length', t => {
  const root = workspace(t);
  const fresh = path.join(root, 'equal-length-changed-package');
  fs.cpSync(scripts, fresh, { recursive: true });
  const target = path.join(fresh, 'onyx-core.js');
  const original = fs.readFileSync(target);
  const changed = Buffer.from(original.toString('utf8').replace('>120000', '>120001'));
  assert.equal(original.length, 3089);
  assert.equal(changed.length, original.length);
  assert.notDeepEqual(changed, original);
  assert.notEqual(hash(changed), expectedHash);
  fs.writeFileSync(target, changed);
  const input = write(root, 'input.json', fixtures[4][1]);
  failure(invoke(['summarize', input], { runner: path.join(fresh, 'run.cjs') }),
    'CORE_INTEGRITY', [root]);
});

test('read-error wording accurately scopes rejection to final path-component symbolic links', t => {
  const root = workspace(t);
  const out = failure(invoke(['summarize', root]), 'INPUT_READ', [root]);
  assert.equal(out.error.message,
    'Cannot read input as a stable, accessible regular file. Final path-component symbolic links are not accepted.');
});
