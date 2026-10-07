'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const entry = path.join(root, 'preview', 'index.html');
function read() {
  assert.ok(fs.existsSync(entry), 'A release navigation page is provided');
  return fs.readFileSync(entry, 'utf8');
}
test('release navigation links resolve within the complete package', () => {
  const html = read();
  const links = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
  assert.ok(links.includes('Core-1-OG-Onyx-Showcase.html'));
  assert.ok(links.includes('../skills/review-mantis-plans/resources/praying-mantis/web/index.html'));
  for (const link of links) {
    assert.ok(!/^(?:[a-z]+:|\/\/)/i.test(link), 'No remote navigation destination');
    const target = path.resolve(path.dirname(entry), link.split('#')[0]);
    assert.ok(target.startsWith(root + path.sep));
    assert.ok(fs.existsSync(target), `Missing local destination: ${link}`);
  }
});
test('release navigation is a script-free local entry page', () => {
  const html = read();
  assert.doesNotMatch(html, /<script\b|<iframe\b|<form\b|\son\w+=|url\s*\(/i);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /name="viewport"/);
});
test('release navigation distinguishes the original engine and audit-only companion', () => {
  const html = read();
  assert.match(html, /Core 1 - OG Onyx/);
  assert.match(html, /Praying Mantis/);
  assert.match(html, /fixture/i);
  assert.match(html, /synthetic/i);
  assert.match(html, /Enforcement off/i);
  assert.match(html, /separate/i);
  assert.match(html, /automated browser checks remain unverified/i);
});
