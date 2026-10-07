#!/usr/bin/env node
'use strict';

// Local JSON-file adapter for the unchanged, SHA-256-pinned original OnyxCore.
// Input data is never evaluated. Only the verified bundled source is executed.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { TextDecoder } = require('node:util');

const RUNNER_VERSION = '0.1.0';
const CORE_SHA256 = '9289fa38751445dce26858585d276ee3c4c61ef809caef1ee85262ac115e24c7';
const CORE_BYTES = 3089;
const EVIDENCE_LABEL = 'user-supplied; not independently verified';
const LIMITS = Object.freeze({
  maxBytes: 2 * 1024 * 1024,
  maxDepth: 32,
  maxNodes: 50000,
  maxCollectionEntries: 10000,
  maxStringCodeUnits: 65536,
});
const ERROR_MESSAGES = Object.freeze({
  USAGE: 'Use summarize FILE, compare BEFORE AFTER, suggest FILE, --help, or --version.',
  INPUT_READ: 'Cannot read input as a stable, accessible regular file. Final path-component symbolic links are not accepted.',
  INPUT_TOO_LARGE: 'Input exceeds the 2 MiB byte limit.',
  UTF8_INVALID: 'Input is not valid UTF-8.',
  JSON_INVALID: 'Input is not valid JSON.',
  NUMBER_INVALID: 'JSON numbers must be finite.',
  KEY_UNSAFE: 'JSON contains an unsafe object key.',
  DEPTH_LIMIT: 'JSON exceeds the depth limit of 32 (root depth 0).',
  NODE_LIMIT: 'JSON exceeds the total limit of 50000 values, including containers.',
  COLLECTION_LIMIT: 'JSON exceeds the limit of 10000 entries per array or object.',
  STRING_LIMIT: 'JSON exceeds the limit of 65536 UTF-16 code units per string or key.',
  REPORT_INVALID: 'Input is not a valid supported original Aethera report.',
  SCHEMA_MISMATCH: 'Both original reports must use the same schema.',
  CORE_UNAVAILABLE: 'The bundled original core is not accessible as a regular file.',
  CORE_INTEGRITY: 'The bundled original core failed its pinned SHA-256 integrity check.',
  INTERNAL: 'The local report review could not be completed.',
});

class SafeError extends Error {
  constructor(code) {
    super(ERROR_MESSAGES[code]);
    this.code = code;
  }
}
function fail(code) { throw new SafeError(code); }

function readBoundedRegularFile(filename, readCode = 'INPUT_READ', sizeCode = 'INPUT_TOO_LARGE') {
  let fd;
  try {
    // Reject directories, devices, sockets, FIFOs, and final-component symlinks
    // before opening. Nonblocking and no-follow flags also protect the open step.
    const initial = fs.lstatSync(filename, { bigint: true });
    if (!initial.isFile()) fail(readCode);
    const flags = fs.constants.O_RDONLY |
      (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0);
    fd = fs.openSync(filename, flags);
    const before = fs.fstatSync(fd, { bigint: true });
    if (!before.isFile() || initial.dev !== before.dev || initial.ino !== before.ino) fail(readCode);
    if (before.size > BigInt(LIMITS.maxBytes)) fail(sizeCode);
    const buffer = Buffer.alloc(LIMITS.maxBytes + 1);
    let used = 0;
    while (used < buffer.length) {
      const count = fs.readSync(fd, buffer, used, Math.min(65536, buffer.length - used), null);
      if (count === 0) break;
      used += count;
    }
    if (used > LIMITS.maxBytes) fail(sizeCode);
    const after = fs.fstatSync(fd, { bigint: true });
    if (before.size !== after.size || before.mtimeNs !== after.mtimeNs ||
        before.ctimeNs !== after.ctimeNs || after.size !== BigInt(used)) fail(readCode);
    return buffer.subarray(0, used);
  } catch (error) {
    if (error instanceof SafeError) throw error;
    fail(readCode);
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch { /* Never include OS details in errors. */ }
    }
  }
}

function validateJson(value) {
  const stack = [{ value, depth: 0 }];
  let nodes = 1;
  while (stack.length) {
    const current = stack.pop();
    if (current.depth > LIMITS.maxDepth) fail('DEPTH_LIMIT');
    const item = current.value;
    if (typeof item === 'number' && !Number.isFinite(item)) fail('NUMBER_INVALID');
    if (typeof item === 'string' && item.length > LIMITS.maxStringCodeUnits) fail('STRING_LIMIT');
    if (item === null || typeof item !== 'object') continue;
    const keys = Object.keys(item);
    if (keys.length > LIMITS.maxCollectionEntries) fail('COLLECTION_LIMIT');
    for (const key of keys) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') fail('KEY_UNSAFE');
      if (key.length > LIMITS.maxStringCodeUnits) fail('STRING_LIMIT');
      nodes++;
      if (nodes > LIMITS.maxNodes) fail('NODE_LIMIT');
      stack.push({ value: item[key], depth: current.depth + 1 });
    }
  }
}

function readReport(filename) {
  const bytes = readBoundedRegularFile(filename);
  let text;
  try {
    // Preserve a leading BOM so JSON.parse rejects it as invalid JSON.
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch { fail('UTF8_INVALID'); }
  let report;
  try { report = JSON.parse(text); } catch { fail('JSON_INVALID'); }
  // JSON.parse is deliberate: duplicate object keys use their last value.
  // There are no revivers, getters, custom prototypes, or executable inputs.
  validateJson(report);
  return report;
}

function loadCore() {
  const bytes = readBoundedRegularFile(path.join(__dirname, 'onyx-core.js'),
    'CORE_UNAVAILABLE', 'CORE_INTEGRITY');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (bytes.length !== CORE_BYTES || sha256 !== CORE_SHA256) fail('CORE_INTEGRITY');
  // Execute exactly the already-hashed trusted bytes, avoiding a second-file-read
  // race. The VM is isolation for trusted code, not a sandbox for untrusted code.
  const context = vm.createContext(Object.create(null), {
    codeGeneration: { strings: false, wasm: false },
  });
  new vm.Script(bytes.toString('utf8'), { filename: 'onyx-core.js' })
    .runInContext(context, { timeout: 1000 });
  return { api: context.OnyxCore, sha256, bytes: bytes.length };
}

function summarize(core, filename) {
  const report = readReport(filename);
  try { return core.summarize(report); } catch { fail('REPORT_INVALID'); }
}

function main(args) {
  const startedAt = new Date().toISOString();
  const command = args[0];
  if (args.length === 1 && command === '--help') {
    return {
      command: 'help', runnerVersion: RUNNER_VERSION,
      commands: ['summarize FILE', 'compare BEFORE AFTER', 'suggest FILE'],
      limits: LIMITS,
      jsonParser: 'Standard JSON.parse: duplicate keys use the last value; numbers use IEEE-754 precision.',
      notes: [
        'Arguments select local JSON files; report text is never evaluated.',
        'Depth counts root as 0; nodes count every JSON value including containers.',
        'Comparisons and suggestions always summarize original reports first.',
        'Health staleness uses the current system clock and the original 120000 ms threshold.',
        'Suggestions are advisory only. No network, file writes, or follow-up actions are performed.',
      ],
    };
  }
  const version = args.length === 1 && command === '--version';
  if (!version && !((command === 'summarize' || command === 'suggest') && args.length === 2) &&
      !(command === 'compare' && args.length === 3)) fail('USAGE');
  const loaded = loadCore();
  let result;
  if (version) {
    result = { command: 'version', runnerVersion: RUNNER_VERSION, engineVersion: null };
  } else if (command === 'compare') {
    const before = summarize(loaded.api, args[1]);
    const after = summarize(loaded.api, args[2]);
    if (before.schema !== after.schema) fail('SCHEMA_MISMATCH');
    result = { command, before, after, differences: loaded.api.compare(before, after) };
  } else {
    const summary = summarize(loaded.api, args[1]);
    result = { command, summary };
    if (command === 'suggest') {
      result.suggestion = loaded.api.suggest(summary);
      result.advisoryOnly = true;
    }
  }
  result.evidence = {
    label: EVIDENCE_LABEL,
    coreSha256: loaded.sha256,
    coreBytes: loaded.bytes,
    runtime: { name: 'node', version: process.version },
    startedAt,
    completedAt: new Date().toISOString(),
  };
  return result;
}

try {
  process.stdout.write(JSON.stringify(main(process.argv.slice(2)), null, 2) + '\n');
} catch (error) {
  const code = error instanceof SafeError ? error.code : 'INTERNAL';
  process.stderr.write(JSON.stringify({ error: { code, message: ERROR_MESSAGES[code] } }) + '\n');
  process.exitCode = 1;
}
