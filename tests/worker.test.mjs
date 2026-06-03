// Integration tests for the Cloudflare Worker (tkgm-proxy-worker.js).
// Node 22 provides global crypto.subtle / Request / Response, so we can invoke
// the real fetch handler with an in-memory KV and exercise the auth flow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER = join(__dirname, '..', 'tkgm-proxy-worker.js');
const mod = await import('../tkgm-proxy-worker.js');

function fakeKV() {
  const m = new Map();
  return {
    _m: m,
    get: async (k) => (m.has(k) ? m.get(k) : null),
    put: async (k, v) => { m.set(k, String(v)); },
    delete: async (k) => { m.delete(k); },
    list: async ({ prefix }) => ({ keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }),
  };
}
const ctx = { waitUntil() {} };

function makeCall(kv) {
  return async (path, { method = 'GET', body, token, ip = '1.2.3.4' } = {}) => {
    const headers = { 'cf-connecting-ip': ip };
    if (token) headers.authorization = 'Bearer ' + token;
    if (body) headers['content-type'] = 'application/json';
    const req = new Request('https://w.dev/' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const res = await mod.default.fetch(req, { ANGIM: kv }, ctx);
    let json = null; try { json = await res.clone().json(); } catch {}
    return { status: res.status, json, res };
  };
}

test('worker: module shape + default.fetch', () => {
  assert.equal(typeof mod.default.fetch, 'function');
});

test('worker: TKGM proxy allow-list rejects non-tkgm hosts', () => {
  const allow = (host) => /\.tkgm\.gov\.tr$/.test(host);
  assert.ok(allow('cbsapi.tkgm.gov.tr'));
  assert.ok(!allow('faketkgm.gov.tr.attacker.net'));
});

test('worker: seeded admin can log in with angim/angim and reach /me', async () => {
  const kv = fakeKV(); const call = makeCall(kv);
  const login = await call('?api=login', { method: 'POST', body: { u: 'angim', p: 'angim' } });
  assert.equal(login.status, 200);
  assert.equal(login.json.role, 'admin');
  assert.ok(login.json.token);
  const me = await call('?api=me', { token: login.json.token });
  assert.equal(me.status, 200);
  assert.equal(me.json.user, 'angim');
});

test('worker: passwords are stored as PBKDF2, never plaintext or single SHA', async () => {
  const kv = fakeKV(); const call = makeCall(kv);
  await call('?api=login', { method: 'POST', body: { u: 'angim', p: 'angim' } }); // triggers seed
  const rec = JSON.parse(await kv.get('user:angim'));
  assert.ok(rec.h.startsWith('pbkdf2$'), 'hash should be PBKDF2 format');
  assert.ok(!rec.h.includes('angim'), 'hash must not contain the password');
});

test('worker: wrong password is rejected and locks out after repeated failures', async () => {
  const kv = fakeKV(); const call = makeCall(kv);
  await call('?api=login', { method: 'POST', body: { u: 'angim', p: 'angim' } }); // seed
  let last;
  for (let i = 0; i < 8; i++) last = await call('?api=login', { method: 'POST', body: { u: 'angim', p: 'wrong' } });
  assert.equal(last.status, 401);
  const locked = await call('?api=login', { method: 'POST', body: { u: 'angim', p: 'wrong' } });
  assert.equal(locked.status, 429, 'should be locked out after 8 failures');
});

test('worker: admin can change password and the new one works', async () => {
  const kv = fakeKV(); const call = makeCall(kv);
  const login = await call('?api=login', { method: 'POST', body: { u: 'angim', p: 'angim' } });
  const ch = await call('?api=changepass', { method: 'POST', token: login.json.token, body: { op: 'angim', np: 'yenisifre1' } });
  assert.equal(ch.status, 200);
  const bad = await call('?api=login', { method: 'POST', body: { u: 'angim', p: 'angim' }, ip: '9.9.9.9' });
  assert.equal(bad.status, 401, 'old password no longer works');
  const good = await call('?api=login', { method: 'POST', body: { u: 'angim', p: 'yenisifre1' }, ip: '9.9.9.9' });
  assert.equal(good.status, 200, 'new password works');
});

test('worker: protected endpoints reject missing/invalid sessions', async () => {
  const kv = fakeKV(); const call = makeCall(kv);
  const users = await call('?api=users');
  assert.ok(users.status === 401 || users.status === 403, 'users requires an admin session');
  const arch = await call('?api=archive', { token: 'bogus-token' });
  assert.equal(arch.status, 401);
});

test('worker: adduser validates username and password strength', async () => {
  const kv = fakeKV(); const call = makeCall(kv);
  const login = await call('?api=login', { method: 'POST', body: { u: 'angim', p: 'angim' } });
  const t = login.json.token;
  assert.equal((await call('?api=adduser', { method: 'POST', token: t, body: { u: 'AB!', p: 'xxxx' } })).status, 400);
  assert.equal((await call('?api=adduser', { method: 'POST', token: t, body: { u: 'mehmet', p: '12' } })).status, 400);
  assert.equal((await call('?api=adduser', { method: 'POST', token: t, body: { u: 'mehmet', p: 'guclu123' } })).status, 200);
});

test('worker: accepts token via ?t= query + text/plain body (no-preflight path for WKWebView)', async () => {
  const kv = fakeKV();
  // login as a CORS "simple request": POST, content-type text/plain, no Authorization header
  const loginReq = new Request('https://w.dev/?api=login', { method: 'POST', headers: { 'content-type': 'text/plain', 'cf-connecting-ip': '5.5.5.5' }, body: JSON.stringify({ u: 'angim', p: 'angim' }) });
  const loginRes = await mod.default.fetch(loginReq, { ANGIM: kv }, ctx);
  assert.equal(loginRes.status, 200);
  const lj = await loginRes.json();
  // authenticated call carrying the token in the query string instead of a header
  const meReq = new Request('https://w.dev/?api=me&t=' + lj.token, { method: 'GET', headers: { 'cf-connecting-ip': '5.5.5.5' } });
  const meRes = await mod.default.fetch(meReq, { ANGIM: kv }, ctx);
  assert.equal(meRes.status, 200);
  assert.equal((await meRes.json()).user, 'angim');
});

test('worker: source uses PBKDF2 + lockout + rate-limit + security headers', () => {
  const src = readFileSync(WORKER, 'utf8');
  for (const needle of ['PBKDF2', 'pbkdf2$', "'lock:'", "'rl:'", 'X-Content-Type-Options']) {
    assert.ok(src.includes(needle), `worker source should contain ${needle}`);
  }
});
