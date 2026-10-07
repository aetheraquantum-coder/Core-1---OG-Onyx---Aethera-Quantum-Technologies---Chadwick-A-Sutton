'use strict';

// Fixed synthetic renderer models only; these are not engine-execution evidence.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const rendererPath = path.join(__dirname, '..', 'skills', 'review-onyx-reports', 'scripts', 'report-view.cjs');
const exported = fs.existsSync(rendererPath) ? require(rendererPath) : {};
const stamp = '2026-10-07T00:00:00.000Z';
const schema = 'aethera-iterations/v1';
const evidence = 'user-supplied; not independently verified';
const hash = '9289fa38751445dce26858585d276ee3c4c61ef809caef1ee85262ac115e24c7';
const advice = 'Review the blocked risk axes and original inputs. Fix the underlying issue, then rerun the same scenario. Do not lower scores merely to clear the gate.';
function fixture(overrides = {}) {
  return {
    mode: 'comparison', title: 'Core 1 - OG Onyx', generatedAt: stamp,
    source: { sha256: hash, bytes: 3089, version: null },
    runtime: { name: 'node', version: process.version }, synthetic: true, evidence,
    reports: [{
      id: 'iterations', schema, family: 'Iteration risk',
      before: { schema, metrics: { completedSets: 2, blockedSets: 1, maxRisk: 0.7 }, evidence },
      after: { schema, metrics: { completedSets: 1, blockedSets: 0, maxRisk: 0.2 }, evidence },
      metrics: [
        { key: 'completedSets', label: 'Completed sets', unit: 'count', before: 2, after: 1, difference: -1 },
        { key: 'blockedSets', label: 'Blocked sets', unit: 'count', before: 1, after: 0, difference: -1 },
        { key: 'maxRisk', label: 'Maximum reported risk', unit: 'score', before: 0.7, after: 0.2, difference: 0.2 - 0.7 },
      ], suggestion: advice, execution: { startedAt: stamp, completedAt: stamp },
    }], ...overrides,
  };
}
function render(model = fixture()) {
  assert.equal(typeof exported.renderReport, 'function', 'renderer exports renderReport(model)');
  return exported.renderReport(model);
}

test('renders a complete self-contained offline Onyx document', () => {
  const html = render();
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<title>Core 1 - OG Onyx<\/title>/);
  assert.match(html, /<h1[^>]*>Core 1 - OG Onyx<\/h1>/);
  assert.match(html, /Original engine\./);
  assert.match(html, /Clearer view\./);
  assert.match(html, /Chadwick A\. Sutton/);
  assert.match(html, /Aethera Quantum Technologies/);
  assert.doesNotMatch(html, /(?:src|href)=["'](?:https?:|\/\/)/i);
  assert.doesNotMatch(html, /@import|fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|document\.write|innerHTML/);
  assert.match(html, /Content-Security-Policy/);
});

test('keeps evidence and synthetic status visibly explicit', () => {
  const html = render();
  assert.match(html, /Synthetic example/);
  assert.match(html, /user-supplied; not independently verified/);
  assert.match(html, /Changes are descriptive, not proof of improvement\./);
  assert.match(html, /normalized 0[–-]1 score/);
  const actual = render(fixture({ synthetic: false }));
  assert.match(actual, /User-supplied reports/);
  assert.doesNotMatch(actual, /Verified reports|Real-world verified/);
});

test('preserves original exact values in an accessible table', () => {
  const html = render();
  assert.match(html, /<caption[^>]*>Exact metric values/);
  assert.match(html, /<th scope="col">Before<\/th>/);
  assert.match(html, /<th scope="col">After<\/th>/);
  assert.match(html, /<th scope="row">Maximum reported risk<\/th>/);
  assert.match(html, /<td[^>]*>0\.7<\/td>/);
  assert.match(html, /<td[^>]*>0\.2<\/td>/);
  assert.match(html, /<td[^>]*>-0\.49999999999999994<\/td>/);
  assert.match(html, /Rounded/);
  assert.match(html, /≈/);
});

test('uses independent count scales and a fixed 0–1 risk scale', () => {
  const html = render();
  assert.match(html, /data-metric="completedSets" data-unit="count" data-scale-max="2"/);
  assert.match(html, /data-metric="blockedSets" data-unit="count" data-scale-max="1"/);
  assert.match(html, /data-metric="maxRisk" data-unit="score" data-scale-max="1"/);
  assert.match(html, /width:70%/);
  assert.match(html, /width:20%/);
  assert.doesNotMatch(html, />20%<|>70%<|probability of/);
});

test('renders an exact original next-test suggestion and execution receipt', () => {
  const html = render();
  assert.ok(html.includes(advice));
  assert.ok(html.includes(hash));
  assert.ok(html.includes(stamp));
  assert.ok(html.includes(process.version));
  assert.match(html, /3,089 bytes|3089 bytes/);
  assert.match(html, /Version not declared/);
  assert.match(html, /Observed execution/);
});

test('summary mode does not invent before values or differences', () => {
  const model = fixture({ mode: 'summary' });
  model.reports[0].before = null;
  for (const metric of model.reports[0].metrics) { metric.before = null; metric.difference = null; }
  const html = render(model);
  assert.match(html, /Single report/);
  assert.match(html, /Not supplied/);
  assert.doesNotMatch(html, /class="bar-fill before"/);
  assert.doesNotMatch(html, /class="delta[^>]*>.*[+−]/);
});

test('showcase has keyboard-accessible tabs and all five schema panels', () => {
  const model = fixture({ mode: 'showcase' });
  const schemas = [
    ['aethera-health-export/v1', 'Website health', [['pages', 'Page count'], ['activeIssues', 'Active issues'], ['stalePages', 'Stale pages']]],
    ['aethera-game-design-handoff/v1', 'Game design handoff', [['helpfulRatings', 'Helpful ratings'], ['funRatings', 'Fun ratings'], ['learningContexts', 'Learning contexts']]],
    ['aethera-game-learning/v1', 'Game learning', [['helpfulRatings', 'Helpful ratings'], ['funRatings', 'Fun ratings'], ['learningContexts', 'Learning contexts']]],
    ['aethera-iterations/v1', 'Iteration risk', [['completedSets', 'Completed sets'], ['blockedSets', 'Blocked sets'], ['maxRisk', 'Maximum reported risk']]],
    ['aethera-save-export/v1', 'Save export', [['saveRecords', 'Save records']]],
  ];
  model.reports = schemas.map(([schema, family, metricSpecs], i) => {
    const metrics = metricSpecs.map(([key, label]) => ({ key, label, unit: key === 'maxRisk' ? 'score' : 'count',
      before: key === 'maxRisk' ? 0.5 : 1, after: key === 'maxRisk' ? 1 : 2, difference: key === 'maxRisk' ? 0.5 : 1 }));
    return { ...fixture().reports[0], id: `test-${i}`, schema, family, metrics,
      before: { schema, metrics: Object.fromEntries(metrics.map(metric => [metric.key, metric.before])), evidence },
      after: { schema, metrics: Object.fromEntries(metrics.map(metric => [metric.key, metric.after])), evidence },
    };
  });
  const html = render(model);
  assert.equal((html.match(/<button[^>]*role="tab"/g) || []).length, 5);
  assert.equal((html.match(/<section[^>]*role="tabpanel"/g) || []).length, 5);
  assert.match(html, /aria-controls="report-0"/);
  assert.match(html, /aria-labelledby="tab-0"/);
  assert.match(html, /ArrowRight/);
  assert.match(html, /ArrowLeft/);
  assert.match(html, /Home/);
  assert.match(html, /End/);
  assert.match(html, /prefers-reduced-motion: reduce/);
  assert.match(html, /@media print/);
  assert.match(html, /<noscript>/);
});

test('escapes advice and never exposes original report free text or paths', () => {
  const model = fixture();
  const payload = '</p><img src=x onerror="alert(1)"><script>alert(2)</script>&';
  model.reports[0].suggestion = payload;
  model.reports[0].before.secret = 'PRIVATE_SOURCE_MARKER';
  model.reports[0].after.filename = '/home/private/report.json';
  const html = render(model);
  assert.ok(html.includes('&lt;/p&gt;&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
  assert.doesNotMatch(html, /<img src=x|<script>alert|PRIVATE_SOURCE_MARKER|\/home\/private\/report\.json|onclick="alert/);
  assert.equal((html.match(/<script>/g) || []).length, 1);
});

test('rejects nonfinite numeric or unrecognized metric values without reflecting their input', () => {
  for (const value of [NaN, Infinity, -Infinity, '0; color:red', null]) {
    const model = fixture(); model.reports[0].metrics[0].after = value;
    assert.throws(() => render(model), /Invalid report model/);
  }
  const model = fixture(); model.reports[0].metrics[0].key = 'private_unknown_metric';
  assert.throws(() => render(model), { message: 'Invalid report model.' });
});

test('does not mutate its model and produces deterministic output', () => {
  const model = fixture();
  const before = JSON.stringify(model);
  const first = render(model);
  assert.equal(render(model), first);
  assert.equal(JSON.stringify(model), before);
});

// Mutating this serialization to ordinary JSON.stringify would permit script breakout.
test('embeds exact metrics as escaped JSON without serializing unexpected summary properties', () => {
  const model = fixture();
  model.reports[0].suggestion = '</script><script>alert(1)</script>&\u2028\u2029';
  model.reports[0].after.privateText = 'PRIVATE_EMBEDDED_MARKER';
  const html = render(model);
  const embedded = html.match(/<script type="application\/json" id="core1-report-model">([\s\S]*?)<\/script>/);
  assert.ok(embedded, 'stable model element is present');
  assert.doesNotMatch(embedded[1], /[<>&\u2028\u2029]/);
  const decoded = JSON.parse(embedded[1]);
  assert.deepEqual(decoded.reports[0].metrics, model.reports[0].metrics);
  assert.equal(decoded.reports[0].suggestion, model.reports[0].suggestion);
  assert.equal(decoded.reports[0].after.metrics.maxRisk, 0.2);
  assert.ok(!html.includes('PRIVATE_EMBEDDED_MARKER'));
});

// Regression coverage for the exported renderer, independent of the safer CLI.
// Each mutation previously allowed a plausible-looking but contradictory report.
const contradictoryModels = [
  ['after row contradicts summary', model => { model.reports[0].metrics[0].after = 12345; }],
  ['before row contradicts summary', model => { model.reports[0].metrics[0].before = 12345; }],
  ['difference contradicts subtraction', model => { model.reports[0].metrics[0].difference = 999; }],
  ['rounded risk difference substitutes for exact difference', model => { model.reports[0].metrics[2].difference = -0.5; }],
  ['schema-incompatible row key', model => { model.reports[0].metrics[0].key = 'pages'; model.reports[0].metrics[0].label = 'Page count'; }],
  ['missing row key', model => { model.reports[0].metrics.pop(); }],
  ['snapshot schema mismatch', model => { model.reports[0].after.schema = 'aethera-save-export/v1'; }],
  ['before snapshot schema mismatch', model => { model.reports[0].before.schema = 'aethera-save-export/v1'; }],
  ['snapshot evidence mismatch', model => { model.reports[0].after.evidence = 'verified'; }],
  ['missing snapshot metric', model => { delete model.reports[0].after.metrics.maxRisk; }],
  ['extra snapshot metric', model => { model.reports[0].after.metrics.pages = 3; }],
  ['schema-incompatible snapshot keys', model => { model.reports[0].after.metrics = { saveRecords: 3 }; }],
  ['missing after snapshot', model => { model.reports[0].after = null; }],
  ['comparison has null before snapshot', model => { model.reports[0].before = null; }],
  ['comparison has null before row', model => { model.reports[0].metrics[0].before = null; }],
  ['comparison has null difference', model => { model.reports[0].metrics[0].difference = null; }],
  ['summary retains before snapshot', model => { model.mode = 'summary'; }],
  ['summary retains before row', model => { model.mode = 'summary'; model.reports[0].before = null; }],
  ['summary retains difference', model => { model.mode = 'summary'; model.reports[0].before = null; model.reports[0].metrics.forEach(metric => { metric.before = null; }); }],
  ['single report mode has multiple reports', model => { model.reports.push(structuredClone(model.reports[0])); }],
  ['showcase omits schemas', model => { model.mode = 'showcase'; }],
  ['showcase repeats one schema', model => { model.mode = 'showcase'; model.reports = Array.from({ length: 5 }, (_, i) => ({ ...structuredClone(model.reports[0]), id: `report-${i}` })); }],
  ['non-synthetic showcase', model => { model.mode = 'showcase'; model.synthetic = false; }],
  ['wrong pinned source hash', model => { model.source.sha256 = '0'.repeat(64); }],
  ['wrong pinned source byte length', model => { model.source.bytes = 999; }],
  ['misleading model title', model => { model.title = 'Verified engine'; }],
  ['misleading family label', model => { model.reports[0].family = 'Website health'; }],
  ['misleading metric label', model => { model.reports[0].metrics[0].label = 'Verified outcomes'; }],
  ['unsafe report id', model => { model.reports[0].id = '\" onclick=\"alert(1)'; }],
];
for (const [description, mutate] of contradictoryModels) {
  test(`rejects contradictory renderer model: ${description}`, () => {
    const model = fixture();
    mutate(model);
    assert.throws(() => render(model), { name: 'TypeError', message: 'Invalid report model.' });
  });
}

test('safe embedded summaries preserve their validated schemas and exact metrics', () => {
  const model = fixture();
  model.reports[0].before.unrelatedRawProperty = 'PRIVATE_SOURCE_EXTENSION';
  model.reports[0].after.unrelatedRawProperty = 'PRIVATE_SOURCE_EXTENSION';
  const html = render(model);
  const embedded = JSON.parse(html.match(/<script type="application\/json" id="core1-report-model">([\s\S]*?)<\/script>/)[1]);
  for (const side of ['before', 'after']) {
    assert.equal(embedded.reports[0][side].schema, model.reports[0][side].schema);
    assert.deepEqual(embedded.reports[0][side].metrics, model.reports[0][side].metrics);
    assert.equal(embedded.reports[0][side].evidence, model.reports[0][side].evidence);
  }
  assert.ok(!html.includes('PRIVATE_SOURCE_EXTENSION'));
});
