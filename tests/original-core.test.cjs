'use strict';

// Synthetic characterization tests for the unchanged original engine.
// No test input contains private reports, account data, or remote resources.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const bytes = fs.readFileSync(path.join(__dirname, '..', 'skills', 'review-onyx-reports', 'scripts', 'onyx-core.js'));
const expectedHash = '9289fa38751445dce26858585d276ee3c4c61ef809caef1ee85262ac115e24c7';
const observedAt = Date.parse('2026-10-07T00:00:00Z');
const evidence = 'user-supplied; not independently verified';
const plain = value => JSON.parse(JSON.stringify(value));

function load() {
  class FixedDate extends Date {
    static now() { return observedAt; }
  }
  const context = vm.createContext({ Date: FixedDate });
  vm.runInContext(bytes.toString('utf8'), context, { filename: 'onyx-core.js' });
  return { context, core: context.OnyxCore };
}

const fixtures = [
  {
    name: 'website health', schema: 'aethera-health-export/v1',
    report: { pages: [
      { at: observedAt - 120001, issues: [{ active: true }, { active: false }] },
      { at: observedAt, issues: [{ active: true }] },
    ] },
    metrics: { pages: 2, activeIssues: 2, stalePages: 1 },
  },
  {
    name: 'game design', schema: 'aethera-game-design-handoff/v1',
    report: { learning: { stats: { synthetic: { helpYes: 2, helpNo: 1, funYes: 3, funNo: 4 } } } },
    metrics: { helpfulRatings: 2, funRatings: 3, learningContexts: 1 },
  },
  {
    name: 'game learning', schema: 'aethera-game-learning/v1',
    report: { stats: { synthetic: { helpYes: 2, helpNo: 1, funYes: 3, funNo: 4 } } },
    metrics: { helpfulRatings: 2, funRatings: 3, learningContexts: 1 },
  },
  {
    name: 'iteration', schema: 'aethera-iterations/v1',
    report: { results: [{ blocked: false, max: 0.1 }, { blocked: true, max: 0.7 }] },
    metrics: { completedSets: 2, blockedSets: 1, maxRisk: 0.7 },
  },
  {
    name: 'save', schema: 'aethera-save-export/v1',
    report: { records: [{ schema: 'aethera-save/v1', id: 'synthetic-save' }] },
    metrics: { saveRecords: 1 },
  },
];

test('source retains the original byte length and SHA-256', () => {
  assert.equal(bytes.length, 3089);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expectedHash);
});

test('public API is exactly summarize, compare, suggest', () => {
  const { core } = load();
  assert.deepEqual(Object.keys(core), ['summarize', 'compare', 'suggest']);
  for (const value of Object.values(core)) assert.equal(typeof value, 'function');
});

test('trusted source installs only OnyxCore in the supplied context', () => {
  const { context } = load();
  assert.deepEqual(Object.keys(context).sort(), ['Date', 'OnyxCore']);
});

for (const fixture of fixtures) {
  test(`${fixture.name} summary preserves exact metrics and evidence label`, () => {
    const { core } = load();
    assert.deepEqual(plain(core.summarize({ schema: fixture.schema, ...fixture.report })), {
      schema: fixture.schema, metrics: fixture.metrics, evidence,
    });
  });

  test(`${fixture.name} self-comparison returns zero differences`, () => {
    const { core } = load();
    const summary = core.summarize({ schema: fixture.schema, ...fixture.report });
    assert.deepEqual(plain(core.compare(summary, summary)),
      Object.keys(fixture.metrics).map(metric => ({
        metric, before: fixture.metrics[metric], after: fixture.metrics[metric], difference: 0,
      })));
  });

  test(`${fixture.name} rejects absent required report structure`, () => {
    assert.throws(() => load().core.summarize({ schema: fixture.schema }));
  });
}

test('comparison reports after minus before', () => {
  const { core } = load();
  const before = core.summarize({ schema: 'aethera-iterations/v1', results: [
    { blocked: false, max: 0.1 }, { blocked: true, max: 0.7 },
  ] });
  const after = core.summarize({ schema: 'aethera-iterations/v1', results: [
    { blocked: false, max: 0.2 },
  ] });
  assert.deepEqual(plain(core.compare(before, after)), [
    { metric: 'completedSets', before: 2, after: 1, difference: -1 },
    { metric: 'blockedSets', before: 1, after: 0, difference: -1 },
    { metric: 'maxRisk', before: 0.7, after: 0.2, difference: 0.2 - 0.7 },
  ]);
});

test('comparison rejects different schemas', () => {
  const { core } = load();
  const first = core.summarize({ schema: fixtures[0].schema, ...fixtures[0].report });
  const second = core.summarize({ schema: fixtures[4].schema, ...fixtures[4].report });
  assert.throws(() => core.compare(first, second), /same schema/);
});

const suggestions = [
  ['active issue', { activeIssues: 1 }, 'Reproduce one active issue in Firefox, make one isolated fix, then export a new health report. Treat stale tabs separately from failures.'],
  ['blocked set', { blockedSets: 1 }, 'Review the blocked risk axes and original inputs. Fix the underlying issue, then rerun the same scenario. Do not lower scores merely to clear the gate.'],
  ['zero fun ratings', { funRatings: 0 }, 'Play one mechanic and explicitly rate whether it was fun. Do not infer enjoyment from completion.'],
  ['recorded fun ratings', { funRatings: 1 }, 'Compare a clue with a direct answer on the same mechanic, then collect explicit helpfulness and fun ratings.'],
  ['save records', { saveRecords: 1 }, 'Use a test save, reload the same game in Firefox, and compare the scene and inventory. Export a backup first.'],
  ['default', {}, 'Run one repeatable browser scenario and collect a second report. No recorded issue is not proof that every feature works.'],
];

for (const [name, metrics, expected] of suggestions) {
  test(`${name} suggestion preserves the original advisory wording`, () => {
    assert.equal(load().core.suggest({ metrics }), expected);
  });
}

test('report root rejects null, arrays, primitives, and unsupported schemas', () => {
  const { core } = load();
  for (const input of [null, [], 42, 'text', true, {},
    { schema: 'onyx-review/v1' }, { schema: 'aethera-graphics-evidence/v1' }]) {
    assert.throws(() => core.summarize(input));
  }
});

test('iteration summary rejects invalid risk values and blocked types', () => {
  const { core } = load();
  for (const result of [null, { blocked: false, max: -1 }, { blocked: false, max: 1.1 },
    { blocked: false, max: NaN }, { blocked: false, max: Infinity },
    { blocked: false, max: '0.1' }, { blocked: 0, max: 0.1 }]) {
    assert.throws(() => core.summarize({ schema: 'aethera-iterations/v1', results: [result] }));
  }
});

test('iteration summary accepts risk endpoints zero and one', () => {
  assert.deepEqual(plain(load().core.summarize({ schema: 'aethera-iterations/v1', results: [
    { blocked: false, max: 0 }, { blocked: true, max: 1 },
  ] }).metrics), { completedSets: 2, blockedSets: 1, maxRisk: 1 });
});

test('rating counts reject negatives, fractions, oversized numbers, and wrong types', () => {
  const { core } = load();
  for (const count of [-1, 100001, 1.5, NaN, Infinity, '1', null]) {
    assert.throws(() => core.summarize({ schema: 'aethera-game-learning/v1', stats: {
      synthetic: { helpYes: count, helpNo: 0, funYes: 0, funNo: 0 },
    } }));
  }
});

test('rating counts accept zero and 100000', () => {
  assert.deepEqual(plain(load().core.summarize({ schema: 'aethera-game-learning/v1', stats: {
    synthetic: { helpYes: 100000, helpNo: 0, funYes: 100000, funNo: 0 },
  } }).metrics), { helpfulRatings: 100000, funRatings: 100000, learningContexts: 1 });
});

test('save summary rejects wrong record schemas and non-string IDs', () => {
  const { core } = load();
  for (const record of [null, {}, { schema: 'aethera-save/v2', id: 'synthetic' },
    { schema: 'aethera-save/v1', id: 1 }]) {
    assert.throws(() => core.summarize({ schema: 'aethera-save-export/v1', records: [record] }));
  }
});

test('website health rejects pages without issue arrays', () => {
  const { core } = load();
  for (const page of [null, {}, { issues: {} }]) {
    assert.throws(() => core.summarize({ schema: 'aethera-health-export/v1', pages: [page] }));
  }
});

test('website health counts only explicitly active issues', () => {
  assert.equal(load().core.summarize({ schema: 'aethera-health-export/v1', pages: [
    { issues: [null, {}, { active: false }, { active: 'true' }, { active: true }] },
  ] }).metrics.activeIssues, 1);
});

test('website health staleness is strictly greater than 120000 milliseconds', () => {
  assert.deepEqual(plain(load().core.summarize({ schema: 'aethera-health-export/v1', pages: [
    { at: observedAt - 120000, issues: [] },
    { at: observedAt - 120001, issues: [] },
    { at: observedAt + 1, issues: [] },
    { issues: [] },
    { at: 'not-a-timestamp', issues: [] },
  ] }).metrics), { pages: 5, activeIssues: 0, stalePages: 1 });
});

test('empty valid collections produce zero-valued summaries', () => {
  const { core } = load();
  const cases = [
    [{ schema: 'aethera-health-export/v1', pages: [] }, { pages: 0, activeIssues: 0, stalePages: 0 }],
    [{ schema: 'aethera-game-learning/v1', stats: {} }, { helpfulRatings: 0, funRatings: 0, learningContexts: 0 }],
    [{ schema: 'aethera-game-design-handoff/v1', learning: { stats: {} } }, { helpfulRatings: 0, funRatings: 0, learningContexts: 0 }],
    [{ schema: 'aethera-iterations/v1', results: [] }, { completedSets: 0, blockedSets: 0, maxRisk: 0 }],
    [{ schema: 'aethera-save-export/v1', records: [] }, { saveRecords: 0 }],
  ];
  for (const [report, metrics] of cases) assert.deepEqual(plain(core.summarize(report).metrics), metrics);
});

test('summarize, compare, and suggest leave valid input objects unchanged', () => {
  const { core } = load();
  for (const fixture of fixtures) {
    const input = plain({ schema: fixture.schema, ...fixture.report });
    const savedInput = plain(input);
    const summary = core.summarize(input);
    const savedSummary = plain(summary);
    core.compare(summary, summary);
    core.suggest(summary);
    assert.deepEqual(input, savedInput);
    assert.deepEqual(plain(summary), savedSummary);
  }
});

test('runnable example uses only bundled samples and returns exact comparisons', () => {
  const output = execFileSync(process.execPath, [path.join(__dirname, '..', 'skills', 'review-onyx-reports', 'examples', 'compare.cjs')], {
    cwd: __dirname, encoding: 'utf8',
  });
  const result = JSON.parse(output);
  assert.match(result.example, /Synthetic reports only/);
  assert.equal(result.before.evidence, evidence);
  assert.equal(result.after.evidence, evidence);
  assert.deepEqual(result.comparison, [
    { metric: 'completedSets', before: 2, after: 2, difference: 0 },
    { metric: 'blockedSets', before: 1, after: 0, difference: -1 },
    { metric: 'maxRisk', before: 0.7, after: 0.3, difference: 0.3 - 0.7 },
  ]);
  assert.equal(result.nextTest, suggestions.find(([name]) => name === 'default')[2]);
});
