#!/usr/bin/env node
'use strict';

// Local, opt-in HTML adapter. Metrics come from the unchanged bounded runner.
// Only the exact hash-verified original engine supplies snapshot-based advice.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const CORE_SHA256 = '9289fa38751445dce26858585d276ee3c4c61ef809caef1ee85262ac115e24c7';
const CORE_BYTES = 3089;
const EVIDENCE = 'user-supplied; not independently verified';
const LIMITS = Object.freeze({ maxBytes: 2097152, maxDepth: 32, maxNodes: 50000,
  maxCollectionEntries: 10000, maxStringCodeUnits: 65536 });
const METRICS = Object.freeze({
  pages: ['Page count', 'count'], activeIssues: ['Active issues', 'count'],
  stalePages: ['Stale pages', 'count'], helpfulRatings: ['Helpful ratings', 'count'],
  funRatings: ['Fun ratings', 'count'], learningContexts: ['Learning contexts', 'count'],
  completedSets: ['Completed sets', 'count'], blockedSets: ['Blocked sets', 'count'],
  maxRisk: ['Maximum reported risk', 'score'], saveRecords: ['Save records', 'count'],
});
const SCHEMAS = Object.freeze({
  'aethera-health-export/v1': { id: 'health', family: 'Website health', keys: ['pages', 'activeIssues', 'stalePages'] },
  'aethera-game-design-handoff/v1': { id: 'handoff', family: 'Game design handoff', keys: ['helpfulRatings', 'funRatings', 'learningContexts'] },
  'aethera-game-learning/v1': { id: 'learning', family: 'Game learning', keys: ['helpfulRatings', 'funRatings', 'learningContexts'] },
  'aethera-iterations/v1': { id: 'iterations', family: 'Iteration risk', keys: ['completedSets', 'blockedSets', 'maxRisk'] },
  'aethera-save-export/v1': { id: 'saves', family: 'Save export', keys: ['saveRecords'] },
});
const ERRORS = Object.freeze({
  USAGE: 'Use summarize FILE --output REPORT.html, compare BEFORE AFTER --output REPORT.html, showcase --output REPORT.html, or --help.',
  INPUT_READ: 'Cannot read input as a stable, accessible regular file. Final path-component symbolic links are not accepted.',
  INPUT_TOO_LARGE: 'Input exceeds the 2 MiB byte limit.',
  UTF8_INVALID: 'Input is not valid UTF-8.', JSON_INVALID: 'Input is not valid JSON.',
  NUMBER_INVALID: 'JSON numbers must be finite.', KEY_UNSAFE: 'JSON contains an unsafe object key.',
  DEPTH_LIMIT: 'JSON exceeds the depth limit of 32 (root depth 0).',
  NODE_LIMIT: 'JSON exceeds the total limit of 50000 values, including containers.',
  COLLECTION_LIMIT: 'JSON exceeds the limit of 10000 entries per array or object.',
  STRING_LIMIT: 'JSON exceeds the limit of 65536 UTF-16 code units per string or key.',
  REPORT_INVALID: 'Input is not a valid supported original Aethera report.',
  SCHEMA_MISMATCH: 'Both original reports must use the same schema.',
  CORE_UNAVAILABLE: 'The bundled original core is not accessible as a regular file.',
  CORE_INTEGRITY: 'The bundled original core failed its pinned SHA-256 integrity check.',
  RUNNER_FAILED: 'The bounded local runner did not return a valid original-engine result.',
  RENDER_FAILED: 'The local HTML report could not be rendered safely.',
  OUTPUT_PATH: 'Choose an explicit .html output file in an existing directory.',
  OUTPUT_EXISTS: 'The output already exists. Choose a new file; existing files and symbolic links are never overwritten.',
  OUTPUT_WRITE: 'The new HTML output could not be written.',
  INTERNAL: 'The local visual report could not be completed.',
});
const RUNNER_ERRORS = new Set(['INPUT_READ', 'INPUT_TOO_LARGE', 'UTF8_INVALID', 'JSON_INVALID',
  'NUMBER_INVALID', 'KEY_UNSAFE', 'DEPTH_LIMIT', 'NODE_LIMIT', 'COLLECTION_LIMIT', 'STRING_LIMIT',
  'REPORT_INVALID', 'SCHEMA_MISMATCH', 'CORE_UNAVAILABLE', 'CORE_INTEGRITY']);
class SafeError extends Error {
  constructor(code) { super(ERRORS[code]); this.code = code; }
}
function fail(code) { throw new SafeError(code); }
function hash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exactKeys(value, expected) {
  return record(value) && Object.keys(value).length === expected.length &&
    expected.every(key => Object.hasOwn(value, key));
}
function iso(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value;
}

function loadCore() {
  let fd;
  let bytes;
  try {
    const filename = path.join(__dirname, 'onyx-core.js');
    const initial = fs.lstatSync(filename, { bigint: true });
    if (!initial.isFile()) fail('CORE_UNAVAILABLE');
    fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) |
      (fs.constants.O_NONBLOCK || 0));
    const before = fs.fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.dev !== initial.dev || before.ino !== initial.ino) fail('CORE_UNAVAILABLE');
    if (before.size !== BigInt(CORE_BYTES)) fail('CORE_INTEGRITY');
    const buffer = Buffer.alloc(CORE_BYTES + 1);
    let used = 0;
    while (used < buffer.length) {
      const count = fs.readSync(fd, buffer, used, buffer.length - used, null);
      if (count === 0) break;
      used += count;
    }
    const after = fs.fstatSync(fd, { bigint: true });
    if (before.size !== after.size || before.mtimeNs !== after.mtimeNs ||
        before.ctimeNs !== after.ctimeNs || after.size !== BigInt(used)) fail('CORE_UNAVAILABLE');
    bytes = buffer.subarray(0, used);
    if (bytes.length !== CORE_BYTES || hash(bytes) !== CORE_SHA256) fail('CORE_INTEGRITY');
  } catch (error) {
    if (error instanceof SafeError) throw error;
    fail('CORE_UNAVAILABLE');
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* No OS details in errors. */ } }
  }
  // Evaluate precisely these already-hashed bytes, never a second source read.
  // This VM hosts trusted pinned code; it is not an untrusted-report sandbox.
  try {
    const context = vm.createContext(Object.create(null), {
      codeGeneration: { strings: false, wasm: false },
    });
    new vm.Script(bytes.toString('utf8'), { filename: 'onyx-core.js' })
      .runInContext(context, { timeout: 1000 });
    return context.OnyxCore;
  } catch { fail('CORE_INTEGRITY'); }
}

function acceptedSummary(value) {
  if (!exactKeys(value, ['schema', 'metrics', 'evidence']) || typeof value.schema !== 'string' ||
      !Object.hasOwn(SCHEMAS, value.schema) || value.evidence !== EVIDENCE) fail('RUNNER_FAILED');
  const spec = SCHEMAS[value.schema];
  if (!exactKeys(value.metrics, spec.keys)) fail('RUNNER_FAILED');
  const metrics = {};
  for (const key of spec.keys) {
    const number = value.metrics[key];
    if (key === 'maxRisk' ? !Number.isFinite(number) || number < 0 || number > 1 :
      !Number.isSafeInteger(number) || number < 0) fail('RUNNER_FAILED');
    metrics[key] = number;
  }
  return { schema: value.schema, metrics, evidence: EVIDENCE };
}
function acceptedReceipt(value) {
  if (!record(value) || value.label !== EVIDENCE || value.coreSha256 !== CORE_SHA256 ||
      value.coreBytes !== CORE_BYTES || !record(value.runtime) || value.runtime.name !== 'node' ||
      value.runtime.version !== process.version || !iso(value.startedAt) || !iso(value.completedAt) ||
      Date.parse(value.completedAt) < Date.parse(value.startedAt)) fail('RUNNER_FAILED');
  return { startedAt: value.startedAt, completedAt: value.completedAt };
}
function runGroup(command, filenames, core, id) {
  // A single process invocation reads each selected original exactly once per
  // group. No suggest invocation or input reread can replace this snapshot.
  const child = spawnSync(process.execPath, [path.join(__dirname, 'run.cjs'), command, ...filenames], {
    encoding: 'utf8', timeout: 10000, maxBuffer: 131072,
    env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' },
  });
  if (child.error || child.signal) fail('RUNNER_FAILED');
  if (child.status !== 0) {
    let result;
    try { result = JSON.parse(child.stderr); } catch { fail('RUNNER_FAILED'); }
    if (record(result) && record(result.error) && RUNNER_ERRORS.has(result.error.code)) fail(result.error.code);
    fail('RUNNER_FAILED');
  }
  if (child.stderr !== '') fail('RUNNER_FAILED');
  let result;
  try { result = JSON.parse(child.stdout); } catch { fail('RUNNER_FAILED'); }
  if (!record(result) || result.command !== command) fail('RUNNER_FAILED');
  const execution = acceptedReceipt(result.evidence);
  const before = command === 'compare' ? acceptedSummary(result.before) : null;
  const after = acceptedSummary(command === 'compare' ? result.after : result.summary);
  if (before && before.schema !== after.schema) fail('RUNNER_FAILED');
  const spec = SCHEMAS[after.schema];
  if (before) {
    if (!Array.isArray(result.differences) || result.differences.length !== spec.keys.length) fail('RUNNER_FAILED');
    for (let i = 0; i < spec.keys.length; i++) {
      const key = spec.keys[i];
      const row = result.differences[i];
      if (!exactKeys(row, ['metric', 'before', 'after', 'difference']) || row.metric !== key ||
          row.before !== before.metrics[key] || row.after !== after.metrics[key] ||
          row.difference !== after.metrics[key] - before.metrics[key]) fail('RUNNER_FAILED');
    }
  }
  const metrics = spec.keys.map((key, index) => ({
    key, label: METRICS[key][0], unit: METRICS[key][1],
    before: before ? before.metrics[key] : null, after: after.metrics[key],
    difference: before ? result.differences[index].difference : null,
  }));
  let suggestion;
  try { suggestion = core.suggest(after); } catch { fail('RUNNER_FAILED'); }
  if (typeof suggestion !== 'string') fail('RUNNER_FAILED');
  return { id, schema: after.schema, family: spec.family, before, after, metrics, suggestion, execution };
}

function buildModel(command, filenames) {
  if (!Array.isArray(filenames) || !filenames.every(name => typeof name === 'string') ||
      !((command === 'summarize' && filenames.length === 1) ||
        (command === 'compare' && filenames.length === 2) ||
        (command === 'showcase' && filenames.length === 0))) fail('USAGE');
  const core = loadCore();
  const reports = command === 'showcase' ? Object.values(SCHEMAS).map(spec => {
    const directory = path.join(__dirname, '..', 'examples', 'visual');
    return runGroup('compare', [path.join(directory, `${spec.id}-before.json`),
      path.join(directory, `${spec.id}-after.json`)], core, spec.id);
  }) : [runGroup(command, filenames, core, 'report-1')];
  return {
    mode: command === 'summarize' ? 'summary' : command === 'compare' ? 'comparison' : 'showcase',
    title: 'Core 1 - OG Onyx', generatedAt: new Date().toISOString(),
    source: { sha256: CORE_SHA256, bytes: CORE_BYTES, version: null },
    runtime: { name: 'node', version: process.version }, synthetic: command === 'showcase',
    evidence: EVIDENCE, reports,
  };
}

function outputPath(filename) {
  if (typeof filename !== 'string' || filename.includes('\0') || path.extname(filename) !== '.html' ||
      /[\\/]$/.test(filename)) fail('OUTPUT_PATH');
  try {
    if (!fs.statSync(path.dirname(path.resolve(filename))).isDirectory()) fail('OUTPUT_PATH');
  } catch { fail('OUTPUT_PATH'); }
  try {
    fs.lstatSync(filename);
    fail('OUTPUT_EXISTS');
  } catch (error) {
    if (error instanceof SafeError) throw error;
    if (error.code !== 'ENOENT') fail('OUTPUT_PATH');
  }
  return filename;
}
function writeExclusive(filename, html) {
  let fd;
  let created;
  try {
    fd = fs.openSync(filename, fs.constants.O_WRONLY | fs.constants.O_CREAT |
      fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600);
    created = fs.fstatSync(fd);
    fs.writeFileSync(fd, html, 'utf8');
    fs.closeSync(fd);
    fd = undefined;
  } catch (error) {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* Fixed error below. */ } }
    // Remove only the incomplete file this invocation created, if still ours.
    if (created) {
      try {
        const current = fs.lstatSync(filename);
        if (current.dev === created.dev && current.ino === created.ino) fs.unlinkSync(filename);
      } catch { /* Never overwrite or delete a replacement. */ }
    }
    fail(error.code === 'EEXIST' ? 'OUTPUT_EXISTS' : 'OUTPUT_WRITE');
  }
}
function main(args) {
  if (args.length === 1 && args[0] === '--help') return {
    command: 'help', commands: ['summarize FILE --output REPORT.html',
      'compare BEFORE AFTER --output REPORT.html', 'showcase --output REPORT.html'],
    limits: LIMITS, notes: [
      'An existing Node.js runtime is required; no installation or network is used.',
      'Each group invokes the unchanged bounded runner once on original JSON reports.',
      'Output is an explicit new .html file, created exclusively; no overwrite is allowed.',
      'Showcase uses only bundled synthetic fixtures for all five original schemas.',
      'Advice is original-engine wording from the accepted summary snapshot and remains advisory.',
      'Risk is a normalized score from 0 to 1, not a probability or percentage.',
      'Health staleness uses the system clock and the original 120000 ms threshold.',
      'Derived HTML is user-requested local data; selected input files remain read-only.',
    ],
  };
  const command = args[0];
  const expected = command === 'summarize' ? 4 : command === 'compare' ? 5 : command === 'showcase' ? 3 : 0;
  if (!expected || args.length !== expected || args[expected - 2] !== '--output') fail('USAGE');
  const filename = outputPath(args[expected - 1]);
  const model = buildModel(command, args.slice(1, expected - 2));
  let html;
  try { html = require('./report-view.cjs').renderReport(model); } catch { fail('RENDER_FAILED'); }
  if (typeof html !== 'string' || !/^<!doctype html>/i.test(html) || !/<\/html>\s*$/i.test(html) ||
      Buffer.byteLength(html) > 1048576) fail('RENDER_FAILED');
  // All input, trusted engine, receipt and renderer validation precedes creation.
  writeExclusive(filename, html);
  return { command, reportCount: model.reports.length, synthetic: model.synthetic,
    generatedAt: model.generatedAt, source: model.source, runtime: model.runtime, evidence: model.evidence,
    output: { format: 'html', bytes: Buffer.byteLength(html), sha256: hash(Buffer.from(html)) } };
}

module.exports = { buildModel };
if (require.main === module) {
  try { process.stdout.write(JSON.stringify(main(process.argv.slice(2))) + '\n'); }
  catch (error) {
    const code = error instanceof SafeError ? error.code : 'INTERNAL';
    process.stderr.write(JSON.stringify({ error: { code, message: ERRORS[code] } }) + '\n');
    process.exitCode = 1;
  }
}
