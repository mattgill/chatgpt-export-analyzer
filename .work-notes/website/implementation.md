# Implementation — website

## What was built

The repository is now a browser-only React application that analyzes a local ChatGPT export ZIP in a dedicated worker and displays a persisted local report. ZIP bytes and message content never leave the browser. The report is stored only as a bounded aggregate snapshot in IndexedDB, supports refresh recovery and clearing, and includes an optional session-local reasoning-overhead scenario.

## Key decisions

- Hash routing and a relative Vite base make the static build work from a GitHub Pages project path.
- The worker streams matching conversation JSON entries from ZIPs and uses the bundled `o200k_base` WASM tokenizer.
- A committed TypeScript golden snapshot replaces the temporary Python reference after parity, browser, and benchmark gates passed.

## Tiers changed

- Frontend: React upload/report routes, local Plotly charts, and reasoning scenario.
- Analysis: TypeScript parser, pricing, single-pass aggregation, worker protocol, tokenizer, and limits.
- Storage: native IndexedDB repository for one privacy-minimized latest snapshot.
- Tests: unit, golden, Playwright browser, and 100 MiB browser benchmark coverage.
- Deployment: Pages workflow, CSP, and product documentation.

## Deviations from plan

None. The private benchmark fixture was absent, so the required skip behavior was recorded instead of fabricating private validation.

## How to verify

```bash
npm run check
npm run test:parity
npm run test:browser
npm run benchmark -- --size-mib 100
npm run benchmark -- --zip /tmp/chatgpt-export.zip
```
