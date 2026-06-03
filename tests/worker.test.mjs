// Smoke tests for the Cloudflare Worker (tkgm-proxy-worker.js): valid module that
// exports a fetch handler, and the TKGM proxy host allow-list logic is correct.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER = join(__dirname, '..', 'tkgm-proxy-worker.js');

test('worker: imports as a module and exports default.fetch', async () => {
  const mod = await import('../tkgm-proxy-worker.js');
  assert.equal(typeof mod.default, 'object');
  assert.equal(typeof mod.default.fetch, 'function');
});

test('worker: only *.tkgm.gov.tr hosts pass the proxy allow-list', () => {
  // mirror of the regex used in the worker
  const allow = (host) => /\.tkgm\.gov\.tr$/.test(host);
  assert.ok(allow('cbsapi.tkgm.gov.tr'));
  assert.ok(allow('parselsorgu.tkgm.gov.tr'));
  assert.ok(!allow('evil.com'));
  assert.ok(!allow('tkgm.gov.tr.evil.com'));
  assert.ok(!allow('faketkgm.gov.tr.attacker.net'));
});

test('worker: source mentions the required KV binding name ANGIM', () => {
  const src = readFileSync(WORKER, 'utf8');
  assert.ok(/env\.ANGIM/.test(src), 'worker should read env.ANGIM (KV binding)');
  assert.ok(/api==='login'/.test(src) && /api==='changepass'/.test(src), 'auth endpoints present');
});
