'use strict';

// All input reports are synthetic. The adapter is tested against the unchanged
// engine, and the CLI is exercised in separate Node processes without a shell.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const skill = path.join(__dirname, '..', 'skills', 'review-onyx-reports');
const scripts = path.join(skill, 'scripts');
const visualizer = path.join(scripts, 'visualize.cjs');
const engine = path.join(scripts, 'onyx-core.js');
const runner = path.join(scripts, 'run.cjs');
const expectedHash = '9289fa38751445dce26858585d276ee3c4c61ef809caef1ee85262ac115e24c7';
const runnerHash = 'e10d8c81d7064073034ad861d789bae7b760840e658773cf7769c02f71677c84';
const evidence = 'user-supplied; not independently verified';
const digest = value => createHash('sha256').update(value).digest('hex');
const plain = value => JSON.parse(JSON.stringify(value));
const fixtures = [
  ['health', 'Website health', { schema: 'aethera-health-export/v1', pages: [
    { at: 0, issues: [{ active: true }, { active: false }, null] },
    { at: 8640000000000000, issues: [{ active: true }] },
  ] }, { pages: 2, activeIssues: 2, stalePages: 1 }],
  ['handoff', 'Game design handoff', { schema: 'aethera-game-design-handoff/v1', learning: { stats: {
    demo: { helpYes: 2, helpNo: 1, funYes: 0, funNo: 4 },
  } } }, { helpfulRatings: 2, funRatings: 0, learningContexts: 1 }],
  ['learning', 'Game learning', { schema: 'aethera-game-learning/v1', stats: {
    demo: { helpYes: 2, helpNo: 1, funYes: 3, funNo: 4 },
  } }, { helpfulRatings: 2, funRatings: 3, learningContexts: 1 }],
  ['iterations', 'Iteration risk', { schema: 'aethera-iterations/v1', results: [
    { blocked: false, max: 0.1 }, { blocked: true, max: 0.7 },
  ] }, { completedSets: 2, blockedSets: 1, maxRisk: 0.7 }],
  ['saves', 'Save export', { schema: 'aethera-save-export/v1', records: [
    { schema: 'aethera-save/v1', id: 'synthetic-save' },
  ] }, { saveRecords: 1 }],
];
const labels = {
  pages: 'Page count', activeIssues: 'Active issues', stalePages: 'Stale pages',
  helpfulRatings: 'Helpful ratings', funRatings: 'Fun ratings', learningContexts: 'Learning contexts',
  completedSets: 'Completed sets', blockedSets: 'Blocked sets', maxRisk: 'Maximum reported risk',
  saveRecords: 'Save records',
};
function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'onyx-visual-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function write(root, name, value) {
  const filename = path.join(root, name);
  fs.writeFileSync(filename, JSON.stringify(value));
  return filename;
}
function load(filename = visualizer) {
  assert.ok(fs.existsSync(filename), 'the visualizer adapter is present');
  return require(filename);
}
function copy(t) {
  const root = workspace(t);
  const fresh = path.join(root, 'fresh package');
  fs.cpSync(skill, fresh, { recursive: true });
  return { root, fresh, cli: path.join(fresh, 'scripts', 'visualize.cjs') };
}
function invoke(args, options = {}) {
  return spawnSync(process.execPath, [options.cli || visualizer, ...args], {
    cwd: options.cwd || os.tmpdir(), encoding: 'utf8', timeout: 15000,
    env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' },
  });
}
function core() {
  const bytes = fs.readFileSync(engine);
  assert.equal(bytes.length, 3089);
  assert.equal(digest(bytes), expectedHash);
  const context = vm.createContext({});
  new vm.Script(bytes.toString('utf8')).runInContext(context);
  return context.OnyxCore;
}
function checkModel(model, mode, count = 1) {
  assert.equal(model.mode, mode);
  assert.equal(model.title, 'Core 1 - OG Onyx');
  assert.deepEqual(model.source, { sha256: expectedHash, bytes: 3089, version: null });
  assert.deepEqual(model.runtime, { name: 'node', version: process.version });
  assert.equal(model.evidence, evidence);
  assert.equal(model.synthetic, mode === 'showcase');
  assert.ok(Number.isFinite(Date.parse(model.generatedAt)));
  assert.equal(model.reports.length, count);
  for (const report of model.reports) {
    assert.match(report.id, /^[a-z0-9-]+$/);
    assert.ok(Number.isFinite(Date.parse(report.execution.startedAt)));
    assert.ok(Date.parse(report.execution.completedAt) >= Date.parse(report.execution.startedAt));
    for (const metric of report.metrics) {
      assert.equal(metric.label, labels[metric.key]);
      assert.equal(metric.unit, metric.key === 'maxRisk' ? 'score' : 'count');
    }
  }
}
function success(result, command, output, count = 1) {
  assert.equal(result.error, undefined, 'CLI must finish promptly');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.command, command);
  assert.equal(receipt.reportCount, count);
  assert.equal(receipt.synthetic, command === 'showcase');
  assert.deepEqual(receipt.source, { sha256: expectedHash, bytes: 3089, version: null });
  assert.deepEqual(receipt.runtime, { name: 'node', version: process.version });
  assert.equal(receipt.evidence, evidence);
  assert.ok(Number.isFinite(Date.parse(receipt.generatedAt)));
  const html = fs.readFileSync(output, 'utf8');
  assert.match(html, /^<!doctype html>/i);
  assert.equal(receipt.output.format, 'html');
  assert.equal(receipt.output.bytes, Buffer.byteLength(html));
  assert.equal(receipt.output.sha256, digest(Buffer.from(html)));
  assert.ok(result.stdout.length < 1500, 'stdout is a small receipt, not report content');
  assert.ok(!result.stdout.includes(output), 'receipt does not expose output paths');
  assert.match(html, /Core 1 - OG Onyx/);
  const embedded = html.match(/<script type="application\/json" id="core1-report-model">([\s\S]*?)<\/script>/);
  assert.ok(embedded, 'HTML includes an inspectable, inert execution model');
  const model = JSON.parse(embedded[1]);
  checkModel(model, command === 'summarize' ? 'summary' : command === 'compare' ? 'comparison' : 'showcase', count);
  assert.equal(model.generatedAt, receipt.generatedAt);
  assert.deepEqual(model.source, receipt.source);
  assert.deepEqual(model.runtime, receipt.runtime);
  const api = core();
  for (const report of model.reports) {
    assert.equal(report.suggestion, api.suggest(report.after));
    for (const metric of report.metrics) {
      assert.equal(metric.after, report.after.metrics[metric.key]);
      assert.equal(metric.before, report.before === null ? null : report.before.metrics[metric.key]);
      assert.equal(metric.difference, report.before === null ? null : metric.after - metric.before);
    }
  }
  return { receipt, html, model };
}
function failure(result, code, forbidden = []) {
  assert.equal(result.error, undefined, 'CLI must finish promptly');
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^\{"error":/, 'failures must use the visualizer fixed JSON protocol');
  const parsed = JSON.parse(result.stderr);
  assert.equal(parsed.error.code, code);
  assert.deepEqual(Object.keys(parsed), ['error']);
  assert.deepEqual(Object.keys(parsed.error).sort(), ['code', 'message']);
  assert.equal(typeof parsed.error.message, 'string');
  for (const value of forbidden) assert.ok(!result.stderr.includes(value), 'fixed error must not expose inputs or paths');
  return parsed;
}

test('visualizer help describes the explicit-output CLI and unchanged input limits', () => {
  const result = invoke(['--help']);
  assert.equal(result.status, 0, 'the visualizer --help command must succeed');
  const help = JSON.parse(result.stdout);
  assert.equal(help.command, 'help');
  assert.deepEqual(help.commands, [
    'summarize FILE --output REPORT.html', 'compare BEFORE AFTER --output REPORT.html',
    'showcase --output REPORT.html',
  ]);
  assert.deepEqual(help.limits, { maxBytes: 2097152, maxDepth: 32, maxNodes: 50000,
    maxCollectionEntries: 10000, maxStringCodeUnits: 65536 });
  assert.match(help.notes.join(' '), /exclusive|overwrite/i);
  assert.match(help.notes.join(' '), /synthetic/i);
});

for (const [name, family, report, metrics] of fixtures) {
  test(`visual model summarizes ${name} using original metrics and original advice`, t => {
    const root = workspace(t);
    const input = write(root, 'private-input.json', { ...report, privateMarker: 'DO_NOT_INCLUDE_RAW_TEXT' });
    const model = load().buildModel('summarize', [input]);
    checkModel(model, 'summary');
    const expected = { schema: report.schema, metrics, evidence };
    const actual = model.reports[0];
    assert.equal(actual.family, family);
    assert.equal(actual.schema, report.schema);
    assert.equal(actual.before, null);
    assert.deepEqual(actual.after, expected);
    assert.deepEqual(actual.metrics, Object.entries(metrics).map(([key, value]) => ({
      key, label: labels[key], unit: key === 'maxRisk' ? 'score' : 'count',
      before: null, after: value, difference: null,
    })));
    assert.equal(actual.suggestion, core().suggest(expected));
    assert.ok(!JSON.stringify(model).includes('DO_NOT_INCLUDE_RAW_TEXT'));
    assert.ok(!JSON.stringify(model).includes(root));
  });
  test(`visual CLI writes a self-contained ${name} summary and verifiable receipt`, t => {
    const root = workspace(t);
    const input = write(root, 'report.json', report);
    const output = path.join(root, 'report.html');
    const { html } = success(invoke(['summarize', input, '--output', output]), 'summarize', output);
    assert.ok(!/<script[^>]+src\s*=|<link[^>]+href\s*=|<iframe\b/i.test(html));
    assert.ok(!html.includes(root));
  });
  test(`visual comparison keeps ${name} before/after summary snapshots`, t => {
    const input = write(workspace(t), 'report.json', report);
    const model = load().buildModel('compare', [input, input]);
    checkModel(model, 'comparison');
    assert.deepEqual(model.reports[0].before, { schema: report.schema, metrics, evidence });
    assert.deepEqual(model.reports[0].after, model.reports[0].before);
    assert.ok(model.reports[0].metrics.every(metric => metric.difference === 0));
  });
}

test('visual comparison preserves exact after-minus-before numeric risk and count differences', t => {
  const root = workspace(t);
  const before = write(root, 'before.json', fixtures[3][2]);
  const afterReport = { schema: 'aethera-iterations/v1', results: [{ blocked: false, max: 0.2 }] };
  const after = write(root, 'after.json', afterReport);
  const model = load().buildModel('compare', [before, after]);
  assert.deepEqual(model.reports[0].metrics.map(({key,before,after,difference}) => ({key,before,after,difference})), [
    { key: 'completedSets', before: 2, after: 1, difference: -1 },
    { key: 'blockedSets', before: 1, after: 0, difference: -1 },
    { key: 'maxRisk', before: 0.7, after: 0.2, difference: 0.2 - 0.7 },
  ]);
  assert.equal(model.reports[0].suggestion, core().suggest(core().summarize(afterReport)));
  success(invoke(['compare', before, after, '--output', path.join(root, 'compare.html')]),
    'compare', path.join(root, 'compare.html'));
});

test('visualizer derives advice from one accepted summary snapshot with one runner invocation', t => {
  const { root, fresh, cli } = copy(t);
  const input = write(root, 'input.json', fixtures[0][2]);
  const count = path.join(root, 'calls.txt');
  const copiedRunner = path.join(fresh, 'scripts', 'run.cjs');
  fs.renameSync(copiedRunner, path.join(fresh, 'scripts', 'original-run.cjs'));
  fs.writeFileSync(copiedRunner, `require('node:fs').appendFileSync(${JSON.stringify(count)}, 'run\\n');\n` +
    `require('./original-run.cjs');\n` +
    `require('node:fs').writeFileSync(${JSON.stringify(input)}, ${JSON.stringify(JSON.stringify({schema:'aethera-health-export/v1',pages:[]}))});\n`);
  const model = load(cli).buildModel('summarize', [input]);
  assert.equal(fs.readFileSync(count, 'utf8'), 'run\n');
  assert.equal(model.reports[0].after.metrics.activeIssues, 2);
  assert.equal(model.reports[0].suggestion, core().suggest(core().summarize(fixtures[0][2])));
});

test('visualizer compare invokes the runner only once for the two originals', t => {
  const { root, fresh, cli } = copy(t);
  const input = write(root, 'input.json', fixtures[4][2]);
  const count = path.join(root, 'calls.txt');
  const copiedRunner = path.join(fresh, 'scripts', 'run.cjs');
  fs.renameSync(copiedRunner, path.join(fresh, 'scripts', 'original-run.cjs'));
  fs.writeFileSync(copiedRunner, `require('node:fs').appendFileSync(${JSON.stringify(count)}, JSON.stringify(process.argv.slice(2))+'\\n'); require('./original-run.cjs');`);
  load(cli).buildModel('compare', [input, input]);
  const calls = fs.readFileSync(count, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(calls, [['compare', input, input]]);
});

test('visualizer forwards paths as process arguments, never executable shell text', t => {
  const root = workspace(t);
  const sentinel = path.join(root, 'MUST_NOT_EXIST');
  const input = write(root, "report; touch MUST_NOT_EXIST; ' \" $(id).json", fixtures[4][2]);
  const output = path.join(root, 'report.html');
  success(invoke(['summarize', input, '--output', output], { cwd: root }), 'summarize', output);
  assert.equal(fs.existsSync(sentinel), false);
});

test('showcase executes all five synthetic schema pairs, including both learning schemas', t => {
  const { root, fresh, cli } = copy(t);
  const count = path.join(root, 'calls.txt');
  const copiedRunner = path.join(fresh, 'scripts', 'run.cjs');
  fs.renameSync(copiedRunner, path.join(fresh, 'scripts', 'original-run.cjs'));
  fs.writeFileSync(copiedRunner, `require('node:fs').appendFileSync(${JSON.stringify(count)}, JSON.stringify(process.argv.slice(2))+'\\n'); require('./original-run.cjs');`);
  const model = load(cli).buildModel('showcase', []);
  checkModel(model, 'showcase', 5);
  assert.deepEqual(model.reports.map(report => report.schema), fixtures.map(item => item[2].schema));
  const calls = fs.readFileSync(count, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(calls.length, 5);
  const api = core();
  for (let i = 0; i < calls.length; i++) {
    assert.equal(calls[i][0], 'compare');
    assert.equal(calls[i].length, 3);
    for (const filename of calls[i].slice(1)) {
      assert.equal(path.dirname(filename), path.join(fresh, 'examples', 'visual'));
      assert.equal(JSON.parse(fs.readFileSync(filename, 'utf8')).synthetic, true);
    }
    const before = plain(api.summarize(JSON.parse(fs.readFileSync(calls[i][1], 'utf8'))));
    const after = plain(api.summarize(JSON.parse(fs.readFileSync(calls[i][2], 'utf8'))));
    assert.deepEqual(model.reports[i].before, before);
    assert.deepEqual(model.reports[i].after, after);
    assert.equal(model.reports[i].suggestion, api.suggest(after));
  }
  const output = path.join(root, 'showcase.html');
  const result = success(invoke(['showcase', '--output', output]), 'showcase', output, 5);
  assert.match(result.html, /synthetic/i);
});

test('fresh copied package works from unrelated cwd without runtime installation', t => {
  const { root, cli } = copy(t);
  const input = write(root, 'input.json', fixtures[4][2]);
  const output = path.join(root, 'summary.html');
  success(invoke(['summarize', path.basename(input), '--output', path.basename(output)], { cli, cwd: root }), 'summarize', output);
  success(invoke(['showcase', '--output', path.join(root, 'showcase.html')], { cli, cwd: os.tmpdir() }), 'showcase', path.join(root, 'showcase.html'), 5);
});

const invalidCases = [
  ['missing', null, 'INPUT_READ'],
  ['bad JSON', '{"PRIVATE_MARKER":', 'JSON_INVALID'],
  ['bad UTF-8', Buffer.from([0xff]), 'UTF8_INVALID'],
  ['too large', ' '.repeat(2097153), 'INPUT_TOO_LARGE'],
  ['not original report', JSON.stringify({ schema: 'aethera-save-export/v1', metrics: { saveRecords: 99 } }), 'REPORT_INVALID'],
  ['unsafe key', '{"schema":"aethera-save-export/v1","records":[],"constructor":1}', 'KEY_UNSAFE'],
  ['nonfinite', '{"schema":"aethera-save-export/v1","records":[],"ignored":1e400}', 'NUMBER_INVALID'],
  ['long string', JSON.stringify({ schema: 'aethera-save-export/v1', records: [], note: 'a'.repeat(65537) }), 'STRING_LIMIT'],
  ['large collection', JSON.stringify({ schema: 'aethera-save-export/v1', records: [], extra: Array(10001).fill(null) }), 'COLLECTION_LIMIT'],
];
for (const [name, raw, code] of invalidCases) {
  test(`visualizer inherits ${name} refusal without output or private leakage`, t => {
    const root = workspace(t);
    const input = path.join(root, 'private-input.json');
    if (raw !== null) fs.writeFileSync(input, raw);
    const output = path.join(root, 'report.html');
    failure(invoke(['summarize', input, '--output', output]), code, [root, 'PRIVATE_MARKER']);
    assert.equal(fs.existsSync(output), false);
  });
}

test('visualizer inherits node and depth limits unchanged', t => {
  const root = workspace(t);
  let nested = null;
  for (let i = 0; i < 32; i++) nested = [nested];
  for (const [extra, code] of [[nested, 'DEPTH_LIMIT'], [Array.from({length:5}, () => Array(10000).fill(null)), 'NODE_LIMIT']]) {
    const input = write(root, 'report.json', { schema: 'aethera-save-export/v1', records: [], extra });
    const output = path.join(root, 'report.html');
    failure(invoke(['summarize', input, '--output', output]), code, [root]);
    assert.equal(fs.existsSync(output), false);
  }
});

test('visualizer inherits same-schema comparison requirement', t => {
  const root = workspace(t);
  const before = write(root, 'before.json', fixtures[0][2]);
  const after = write(root, 'after.json', fixtures[4][2]);
  const output = path.join(root, 'report.html');
  failure(invoke(['compare', before, after, '--output', output]), 'SCHEMA_MISMATCH', [root]);
  assert.equal(fs.existsSync(output), false);
});

test('visualizer inherits regular-input and final symlink rejection', t => {
  const root = workspace(t);
  const input = write(root, 'report.json', fixtures[4][2]);
  const link = path.join(root, 'symlink.json');
  fs.symlinkSync(input, link);
  for (const filename of [root, link]) {
    const output = path.join(root, 'report.html');
    failure(invoke(['summarize', filename, '--output', output]), 'INPUT_READ', [root]);
    assert.equal(fs.existsSync(output), false);
  }
});

test('only supported CLI forms with explicit output are accepted', t => {
  const root = workspace(t);
  const input = write(root, 'report.json', fixtures[4][2]);
  for (const args of [[], ['--version'], ['suggest', input], ['summarize', input],
    ['showcase'], ['--help', 'extra'], ['summarize', input, '--out', 'x.html'],
    ['compare', input, '--output', 'x.html'], ['showcase', '--output', 'x.html', 'extra']]) {
    failure(invoke(args), 'USAGE');
  }
  assert.deepEqual(fs.readdirSync(root), ['report.json']);
});

test('output must be a new explicit .html file in an existing directory', t => {
  const root = workspace(t);
  const input = write(root, 'report.json', fixtures[4][2]);
  for (const output of ['', path.join(root, 'output.json'), path.join(root, 'output.html/'), path.join(root, 'missing', 'report.html')]) {
    failure(invoke(['summarize', input, '--output', output]), 'OUTPUT_PATH', [root]);
  }
  assert.deepEqual(fs.readdirSync(root), ['report.json']);
});

test('existing output files and output symlinks are never overwritten', t => {
  const root = workspace(t);
  const input = write(root, 'report.json', fixtures[4][2]);
  const existing = path.join(root, 'existing.html');
  fs.writeFileSync(existing, 'KEEP_EXISTING');
  const link = path.join(root, 'link.html');
  const dangling = path.join(root, 'dangling.html');
  fs.symlinkSync(existing, link);
  fs.symlinkSync(path.join(root, 'absent.html'), dangling);
  for (const output of [existing, link, dangling]) {
    failure(invoke(['summarize', input, '--output', output]), 'OUTPUT_EXISTS', [root]);
  }
  assert.equal(fs.readFileSync(existing, 'utf8'), 'KEEP_EXISTING');
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true);
  assert.equal(fs.existsSync(path.join(root, 'absent.html')), false);
});

test('output cannot overwrite a selected original report even with .html extension', t => {
  const root = workspace(t);
  const input = write(root, 'original.html', fixtures[4][2]);
  const before = fs.readFileSync(input);
  failure(invoke(['summarize', input, '--output', input]), 'OUTPUT_EXISTS', [root]);
  assert.deepEqual(fs.readFileSync(input), before);
});

test('report code and raw strings never execute or appear in the visual output', t => {
  const root = workspace(t);
  const sentinel = path.join(root, 'MUST_NOT_EXIST');
  const marker = `RAW_PRIVATE_MARKER<script>require('node:fs').writeFileSync(${JSON.stringify(sentinel)},'bad')</script>`;
  const report = { ...fixtures[4][2], note: marker, title: marker, family: marker, label: marker,
    records: [{schema:'aethera-save/v1', id:marker}] };
  const input = write(root, 'private-file.json', report);
  const output = path.join(root, 'report.html');
  const { html } = success(invoke(['summarize', input, '--output', output]), 'summarize', output);
  for (const text of ['RAW_PRIVATE_MARKER', root, 'private-file.json']) assert.ok(!html.includes(text));
  assert.equal(fs.existsSync(sentinel), false);
});

test('source and selected inputs remain byte-identical; only requested HTML is added', t => {
  const root = workspace(t);
  const input = write(root, 'input.json', fixtures[3][2]);
  const before = fs.readFileSync(input);
  const output = path.join(root, 'report.html');
  const source = fs.readFileSync(engine);
  const adapter = fs.readFileSync(runner);
  success(invoke(['compare', input, input, '--output', output], { cwd: root }), 'compare', output);
  assert.deepEqual(fs.readFileSync(input), before);
  assert.deepEqual(fs.readFileSync(engine), source);
  assert.deepEqual(fs.readFileSync(runner), adapter);
  assert.equal(digest(source), expectedHash);
  assert.equal(digest(adapter), runnerHash);
  assert.deepEqual(fs.readdirSync(root).sort(), ['input.json', 'report.html']);
  if (process.platform !== 'win32') assert.equal(fs.statSync(output).mode & 0o777, 0o600);
});

test('tampered engine is rejected before execution or file creation', t => {
  const { root, fresh, cli } = copy(t);
  const source = path.join(fresh, 'scripts', 'onyx-core.js');
  const original = fs.readFileSync(source, 'utf8');
  fs.writeFileSync(source, original.replace('>120000', '>120001'));
  assert.equal(fs.statSync(source).size, 3089);
  const output = path.join(root, 'report.html');
  const input = write(root, 'input.json', fixtures[4][2]);
  failure(invoke(['summarize', input, '--output', output], { cli }), 'CORE_INTEGRITY', [root]);
  assert.equal(fs.existsSync(output), false);
});

test('missing engine and symlink engine are rejected without output', t => {
  const { root, fresh, cli } = copy(t);
  const source = path.join(fresh, 'scripts', 'onyx-core.js');
  fs.unlinkSync(source);
  const input = write(root, 'input.json', fixtures[4][2]);
  const output = path.join(root, 'report.html');
  failure(invoke(['summarize', input, '--output', output], { cli }), 'CORE_UNAVAILABLE', [root]);
  fs.symlinkSync(engine, source);
  failure(invoke(['summarize', input, '--output', output], { cli }), 'CORE_UNAVAILABLE', [root]);
  assert.equal(fs.existsSync(output), false);
});

test('renderer failure is sanitized and leaves no output file', t => {
  const { root, fresh, cli } = copy(t);
  fs.writeFileSync(path.join(fresh, 'scripts', 'report-view.cjs'), `exports.renderReport=()=>{throw new Error('PRIVATE_RENDER_FAILURE')};`);
  const input = write(root, 'input.json', fixtures[4][2]);
  const output = path.join(root, 'report.html');
  failure(invoke(['summarize', input, '--output', output], { cli }), 'RENDER_FAILED', [root, 'PRIVATE_RENDER_FAILURE']);
  assert.equal(fs.existsSync(output), false);
});

test('non-HTML renderer results are refused before output creation', t => {
  const { root, fresh, cli } = copy(t);
  fs.writeFileSync(path.join(fresh, 'scripts', 'report-view.cjs'), `exports.renderReport=()=>({private:'PRIVATE_RENDER_FAILURE'});`);
  const input = write(root, 'input.json', fixtures[4][2]);
  const output = path.join(root, 'report.html');
  failure(invoke(['summarize', input, '--output', output], { cli }), 'RENDER_FAILED', [root, 'PRIVATE_RENDER_FAILURE']);
  assert.equal(fs.existsSync(output), false);
});

test('invalid runner receipts cannot become fabricated visual reports', t => {
  const { root, fresh, cli } = copy(t);
  fs.writeFileSync(path.join(fresh, 'scripts', 'run.cjs'), `process.stdout.write(JSON.stringify({command:'summarize',summary:{schema:'aethera-save-export/v1',metrics:{saveRecords:123},evidence:'wrong'}}));`);
  const input = write(root, 'input.json', fixtures[4][2]);
  const output = path.join(root, 'report.html');
  failure(invoke(['summarize', input, '--output', output], { cli }), 'RUNNER_FAILED', [root]);
  assert.equal(fs.existsSync(output), false);
});


test('runner schema values must be exact strings rather than coercible arrays', t => {
  const { root, fresh, cli } = copy(t);
  const copiedRunner = path.join(fresh, 'scripts', 'run.cjs');
  const input = write(root, 'input.json', fixtures[4][2]);
  const now = new Date().toISOString();
  const result = {command:'summarize',summary:{schema:['aethera-save-export/v1'],metrics:{saveRecords:1},evidence},
    evidence:{label:evidence,coreSha256:expectedHash,coreBytes:3089,runtime:{name:'node',version:process.version},startedAt:now,completedAt:now}};
  fs.writeFileSync(copiedRunner, `process.stdout.write(${JSON.stringify(JSON.stringify(result))});`);
  const output = path.join(root, 'report.html');
  failure(invoke(['summarize', input, '--output', output], { cli }), 'RUNNER_FAILED', [root]);
  assert.equal(fs.existsSync(output), false);
});
