// Test harness: extracts the inline <script> from mimari-tasarim.html and runs it
// inside a stubbed DOM sandbox so the PURE domain functions (compute, feasibility,
// parseImarNotes, solarPos, sunHours, ...) can be tested against the REAL shipped code.
// No build step, no dependencies — uses Node's built-in vm + node:test.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML = join(__dirname, '..', 'mimari-tasarim.html');

function extractInlineScript(html) {
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m, best = '';
  while ((m = re.exec(html))) { if (m[1].length > best.length) best = m[1]; }
  if (!best) throw new Error('inline script not found');
  return best;
}

// A forgiving fake DOM element: any unknown method is a no-op returning another fake.
function fakeEl() {
  const t = {
    style: {}, dataset: {}, value: '', checked: false, textContent: '',
    innerHTML: '', className: '', files: [], selectedOptions: [],
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  };
  return new Proxy(t, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'querySelectorAll') return () => fakeList();
      if (k === 'querySelector') return () => fakeEl();
      if (k === 'getBoundingClientRect') return () => ({ width: 760, height: 560, left: 0, top: 0 });
      if (k === 'getContext') return () => fakeCtx();
      if (k === 'getAttribute') return () => '';
      if (k === 'closest' || k === 'parentNode' || k === 'firstChild') return fakeEl();
      // any other property is treated as a callable no-op (covers addEventListener,
      // appendChild, setAttribute, scrollIntoView, dispatchEvent, focus, remove, ...)
      return () => fakeEl();
    },
    set(o, k, v) { o[k] = v; return true; },
  });
}
function fakeList() { const a = []; a.forEach = () => {}; a.item = () => fakeEl(); return a; }
function fakeCtx() { return new Proxy({}, { get: () => () => {} }); }

export function loadSandbox() {
  const script = extractInlineScript(readFileSync(HTML, 'utf8'));
  const elCache = {};
  const documentElement = (() => {
    const d = fakeEl();
    d.getAttribute = () => 'light';
    d.setAttribute = () => {};
    return d;
  })();
  const document = {
    getElementById: (id) => (elCache[id] || (elCache[id] = fakeEl())),
    querySelector: () => fakeEl(),
    querySelectorAll: () => fakeList(),
    createElement: () => fakeEl(),
    createElementNS: () => fakeEl(),
    addEventListener() {}, removeEventListener() {},
    documentElement, body: fakeEl(), head: fakeEl(), title: '',
    cookie: '', referrer: '', visibilityState: 'visible',
  };
  const storage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: () => null, length: 0 }; };
  const sandbox = {};
  const win = {
    document, addEventListener() {}, removeEventListener() {},
    localStorage: storage(), sessionStorage: storage(),
    location: { href: 'https://example.com/', search: '', hash: '', origin: 'https://example.com', reload() {} },
    history: { replaceState() {}, pushState() {} },
    navigator: { language: 'tr-TR', languages: ['tr-TR'], vibrate() {}, onLine: true, userAgent: 'node' },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    devicePixelRatio: 1, innerWidth: 1024, innerHeight: 768,
    requestAnimationFrame() { return 0; }, cancelAnimationFrame() {},
    setTimeout() { return 0; }, clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
    fetch: () => Promise.reject(new Error('no network in test')),
    alert() {}, confirm() { return false; }, prompt() { return null; },
    open: () => ({ document: { write() {}, close() {} }, focus() {}, print() {} }),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    URL, Image: class { set src(_) {} }, FileReader: class {},
    console, Math, Date, JSON, isFinite, isNaN, parseFloat, parseInt, Intl,
  };
  Object.assign(sandbox, win);
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  // Function declarations are hoisted before execution, so even if a top-level
  // statement throws (a stub gap), the domain functions are still defined.
  try { vm.runInContext(script, sandbox, { filename: 'mimari-inline.js' }); }
  catch (e) { sandbox.__topLevelError = e; }
  return sandbox;
}
