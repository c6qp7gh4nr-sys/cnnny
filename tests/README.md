# Tests

Automated tests for the architectural design generator. They run with **zero
dependencies** using Node's built-in test runner (`node --test`), so CI works
offline.

```bash
npm test          # runs tests/*.test.mjs
```

## How it works

`harness.mjs` reads the inline `<script>` from `mimari-tasarim.html` and runs it
inside a `vm` sandbox with a stubbed DOM. This means the tests exercise the
**real shipped code** — there is no separate copy of the domain logic to drift
out of sync. Function declarations are hoisted before execution, so the domain
functions are available even if a browser-only top-level statement no-ops.

- `zoning.test.mjs` — `compute`, `feasibility`, `parseImarNotes`, `solarPos`,
  `sunHours`: parcel math, emsal/Hmax limits, imar audit warnings, plan-note
  parsing (incl. regression for `KAKS (Emsal): 1.05`), solar geometry, neighbour
  shadowing.
- `worker.test.mjs` — Cloudflare Worker module shape, the `*.tkgm.gov.tr`
  proxy allow-list, and presence of the `ANGIM` KV binding + auth endpoints.

## CI

- `.github/workflows/ci.yml` runs the suite on PRs and feature-branch pushes.
- `.github/workflows/pages.yml` runs the suite as a `test` job and the Pages
  `deploy` job `needs: test` — **a red build never ships to production.**

When you add a domain function or change a formula, add/adjust a fixture here.
