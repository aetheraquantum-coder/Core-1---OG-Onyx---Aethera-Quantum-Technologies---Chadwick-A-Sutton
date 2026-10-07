'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const skillRoot = path.join(__dirname, '..', 'skills', 'review-mantis-plans');
const bundle = path.join(skillRoot, 'resources', 'praying-mantis');
const expectedFiles = [
  'LICENSE', 'MANIFEST.json', 'PATCH.md', 'README.md', 'SECURITY.md', 'START_WINDOWS.bat',
  'VERSION', 'cli.py', 'mantis_os.py', 'tests/test_mantis_os.py',
  'tests/test_network_regressions.py', 'tests/test_policy_validation.py',
  'web/README.txt', 'web/autosave.js', 'web/exchange-core.js', 'web/exchange-ui.js',
  'web/favicon.svg', 'web/index.html', 'web/navigation.css', 'web/result-events.js',
  'web/security-plans.js', 'web/tokens.css',
].sort();
const read = file => fs.readFileSync(path.join(bundle, file), 'utf8');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function files(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    assert.equal(entry.isSymbolicLink(), false, 'bundle must not contain symlinks');
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? files(path.join(dir, entry.name), relative) : [relative];
  });
}

test('Mantis companion includes all 21 source files, the MIT license, and no caches', () => {
  assert.ok(fs.existsSync(bundle), 'bounded Mantis companion has not been packaged');
  assert.deepEqual(files(bundle).sort(), expectedFiles);
});

test('Mantis engines, CLI, and validator retain original hashes', () => {
  const expected = {
    'mantis_os.py': '7455eebc45b1d2ef498a9d638973f12622958e4ac16460f0ccaed64485d1b928',
    'cli.py': 'e5195926d8925c6f860cb3fa0a9afc1d832bd9a859fadeb29e20ef56f78887dc',
    'web/security-plans.js': '4c207ca1fa7c24196af21f8e9dd31e2994fa86eaebfefc564ace3dfb4dfb2b3b',
    'web/exchange-core.js': 'ada4562ddf63d36649532a307fb8c21f8e6e2207ee883ee88c4a4151ce06dbc7',
  };
  for (const [file, digest] of Object.entries(expected)) {
    assert.equal(hash(fs.readFileSync(path.join(bundle, file))), digest, file);
  }
});

test('Mantis manifest accounts for every bundled file with exact bytes and SHA-256', () => {
  const manifest = JSON.parse(read('MANIFEST.json'));
  assert.equal(manifest.version, '0.2.1-candidate');
  assert.equal(manifest.enforce, false);
  assert.deepEqual(manifest.files.map(entry => entry.path).sort(), expectedFiles.filter(file => file !== 'MANIFEST.json'));
  for (const entry of manifest.files) {
    const bytes = fs.readFileSync(path.join(bundle, entry.path));
    assert.equal(bytes.length, entry.bytes, `${entry.path} bytes`);
    assert.equal(hash(bytes), entry.sha256, `${entry.path} SHA-256`);
  }
});

test('Mantis skill describes portable opt-in CLI and standalone web workflows', () => {
  const file = path.join(skillRoot, 'SKILL.md');
  assert.ok(fs.existsSync(file), 'Mantis workflow instructions have not been added');
  const skill = fs.readFileSync(file, 'utf8');
  assert.match(skill, /^---\nname: review-mantis-plans\ndescription: Use when/m);
  assert.match(skill, /Python 3\.10\+/);
  assert.match(skill, /python cli\.py antivirus/);
  assert.match(skill, /python cli\.py firewall --direction in --port 443/);
  assert.match(skill, /python cli\.py vpn-plan --endpoint vpn\.example\.invalid:51820 --dns 9\.9\.9\.9/);
  assert.match(skill, /python -m http\.server 8767 --bind 127\.0\.0\.1 --directory web/);
  assert.match(skill, /does not install, activate, or launch/i);
  assert.match(skill, /network scan|network scanning/);
  assert.match(skill, /no-match.*(?:safe|clean)/i);
  assert.match(skill, /Launch, Assets, Saves, Boundary, Security, Portable/);
  assert.match(skill, /0\.65/);
});

test('Mantis docs explain static localStorage limitation and OG advisory separation', () => {
  for (const file of ['README.md', 'web/README.txt']) {
    const doc = read(file);
    assert.match(doc, /localStorage/);
    assert.match(doc, /(?:no disk mirror|disk mirroring is disabled)/i);
    assert.match(doc, /aethera-insight\/v1/);
    assert.match(doc, /run\.cjs.*does not support/);
    assert.match(doc, /24 Python/);
    assert.doesNotMatch(doc, /parent\s+Aethera workspace|15 Python|Per\s+your\s+device\s+constraint/i);
  }
});

test('Mantis UI retains release limits and uses neutral separate-client wording', () => {
  const html = read('web/index.html');
  assert.doesNotMatch(html, /Per\s+your\s+device\s+constraint/i);
  assert.match(html, /separate supported device or client/i);
  assert.match(html, /No connection is attempted/);
  assert.match(html, /cannot inspect your PC, change a firewall, scan real files, or establish a tunnel/);
  assert.match(html, /(?:no disk mirror|disk mirroring is disabled)/i);
  const exchange = read('web/exchange-ui.js');
  assert.match(exchange, /manual legacy advisory/i);
  assert.match(exchange, /OG.*does not support/i);
});
