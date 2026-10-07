'use strict';

// Synthetic example using the same bounded, hash-checked path as the skill.
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const runner = path.join(__dirname, '..', 'scripts', 'run.cjs');

function invoke(args) {
  return JSON.parse(execFileSync(process.execPath, [runner, ...args], {
    encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'],
  }));
}

try {
  const afterPath = path.join(__dirname, 'after.json');
  const compared = invoke(['compare', path.join(__dirname, 'before.json'), afterPath]);
  const advised = invoke(['suggest', afterPath]);
  console.log(JSON.stringify({
    example: 'Synthetic reports only; these are not measured or independently verified results.',
    before: compared.before,
    after: compared.after,
    comparison: compared.differences,
    nextTest: advised.suggestion,
    evidence: compared.evidence,
  }, null, 2));
} catch {
  console.error(JSON.stringify({ error: {
    code: 'EXAMPLE_FAILED',
    message: 'Could not compare the bundled synthetic reports. Run the bounded CLI directly for its sanitized error code.',
  } }));
  process.exitCode = 1;
}
