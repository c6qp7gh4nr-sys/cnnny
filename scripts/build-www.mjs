// Build the Capacitor webDir (www/) from the single-file web app.
// - mimari-tasarim.html -> www/index.html (entry point for the native shell)
// - copies local assets (icon, manifest, service worker)
// - removes the page CSP <meta> (the native shell has its own security model;
//   CSP stays on the web/Pages build). No bundler needed.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const www = join(root, 'www');
mkdirSync(www, { recursive: true });

// 1) entry HTML
let html = readFileSync(join(root, 'mimari-tasarim.html'), 'utf8');
// strip the CSP meta for the native WebView (Capacitor bridge + schemes)
html = html.replace(/\s*<meta http-equiv="Content-Security-Policy"[\s\S]*?>\n?/i, '\n');
writeFileSync(join(www, 'index.html'), html);

// 2) local assets referenced by the app
for (const f of ['icon.svg', 'mimari-manifest.json', 'mimari-sw.js']) {
  if (existsSync(join(root, f))) copyFileSync(join(root, f), join(www, f));
}

console.log('www/ built:', ['index.html', 'icon.svg', 'mimari-manifest.json', 'mimari-sw.js'].join(', '));
