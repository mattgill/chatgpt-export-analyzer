# Browser-only ChatGPT export analytics website

## Context

Today the repository is a Python 3.13 CLI. `analyze.py` loads one or more
`conversations*.json` files through `chatgpt_analytics/parser.py`, counts visible
user and assistant text with `tiktoken`'s `o200k_base` encoding, aggregates the
result in `chatgpt_analytics/analytics.py`, and renders CSV/Plotly/Jinja output.
`serve.py` only serves a previously generated report; there is no upload flow,
browser application, persistence, or deployed site.

The new product is a free public portfolio utility. A visitor selects a ChatGPT
export ZIP, the browser analyzes it locally, and the visitor is taken to an
interactive report. Conversation data must never be sent to an application
server. The latest derived report should survive a refresh and should be
replaced by the next successfully analyzed upload. Desktop Chrome, Firefox, and
Safari are in scope; mobile is not. A compressed ZIP of 100 MiB is the target
input ceiling, with the owner's current 42 MiB export used as an optional private
performance fixture from `/tmp` during implementation.

This is a port, not a Python-in-the-browser wrapper. Python remains temporarily
as the behavioral oracle. Shared fixtures and cross-language parity tests prove
the TypeScript implementation before the Python implementation is removed.

## Decisions

- Ship a fully static React + TypeScript + Vite application. Use hash routing so
  the upload and report screens work after refresh from a GitHub Pages project
  path without server-side rewrite rules.
- Analyze inside a dedicated Web Worker. Stream ZIP bytes through `fflate`,
  select only `conversations.json` and `conversations-NNN.json` entries, and
  stream each top-level JSON-array item through `@streamparser/json` with
  `paths: ["$.*"]` and `keepStack: false`. Do not inflate unrelated export
  assets or materialize an entire decompressed JSON file.
- Use the browser-compatible `tiktoken` WASM/lite package with only the bundled
  `o200k_base` ranks. Tokenize each retained message once, then feed that count
  into conversation, daily, monthly, inventory, and cost aggregations. Do not
  use Pyodide or a looser character-based token approximation.
- Treat 100 MiB as the maximum compressed upload. Enforce additional defenses:
  at most 1 GiB of cumulative decompressed conversation JSON, at most 1,000
  matching parts, supported ZIP methods only, and cancellation by terminating
  the worker. These are product limits, not claims that every 100 MiB ZIP will
  complete on every machine.
- Persist one versioned `AnalysisSnapshot` in IndexedDB only after a complete,
  successful run. Persist aggregate data and the top-100 conversation rows
  needed by the report, including their titles; never persist the ZIP, message
  bodies, node metadata, recap text, or internal thought payloads. A failed or
  cancelled replacement leaves the previous good report intact.
- Phase 1 reproduces the current visual dashboard and its accounting semantics.
  CSV/HTML downloads, custom pricing uploads, accounts, share links, mobile
  optimization, and server storage are out of scope.
- Phase 2 adds the reasoning-overhead multiplier and comparison UI. It remains
  explicitly a user-supplied what-if scenario and can be computed from persisted
  aggregate output tokens without retaining raw conversations.
- Keep Python only through browser parity, real-export validation, and Phase 2
  parity. Then remove the Python CLI/reporting stack and keep a committed golden
  snapshot as the permanent TypeScript regression oracle.
- Bundle all runtime code and chart assets with the site. Do not load Plotly,
  tokenizer ranks, analytics, fonts, or telemetry from a third-party CDN.

## Technical Flow

**Before:** A user manually extracts or locates `conversations*.json`, installs
Python dependencies, runs `python3 analyze.py`, waits while text is tokenized
multiple times for different aggregates, then opens a generated `report.html`.
The generated report is not an application and has no retained browser state.

**After:** The upload screen accepts one local ZIP and validates its compressed
size. It posts the `File` to a dedicated worker. The worker streams ZIP chunks,
ignores unrelated entries, emits individual conversation objects from each
matching JSON array, deduplicates conversation IDs across parts, defensively
extracts visible messages and non-billable artifact classifications, and counts
each visible/recap string once with `o200k_base`. It periodically posts typed
progress events. On completion it posts one privacy-minimized,
schema-versioned `AnalysisSnapshot`. The main thread writes that snapshot in a
single IndexedDB transaction and navigates to `/#/report`. The report screen can
also hydrate the last snapshot at startup; missing/corrupt/unknown-version data
returns the user to upload with a recoverable message. A new successful analysis
atomically replaces the stored snapshot.

```text
local ZIP -> Web Worker -> streamed ZIP entry -> streamed conversation object
                                      |                    |
                                      |                    +-> parse/classify
                                      |                    +-> tokenize once
                                      |                    +-> aggregate
                                      v
                              typed progress events

worker snapshot -> IndexedDB latest report -> /#/report -> cards/charts/tables
```

## Data contracts

Define these contracts once in `src/analysis/types.ts`; the worker, storage,
pages, and tests must import them rather than recreating object shapes.

- `AnalysisSnapshot`: `schemaVersion`, `analyzedAt`, `source` (`name`,
  `compressedBytes`, `conversationParts`), `totals`, `inventory`, `summaryByModel`,
  `monthly`, `daily`, `conversationHistogram`, `metrics`, and `topConversations`
  (maximum 100).
- `totals`: conversation, prompt, and reply counts plus integer input, output,
  and total tokens.
- `inventory`: API-equivalent token totals, recap node/token totals, and
  internal-artifact node count. Recap text itself is never returned by the
  worker.
- `summaryByModel`: model name, integer input/output/total tokens, and numeric
  estimated cost using the checked-in illustrative pricing configuration.
- `monthly`/`daily`: the same fields and chronological semantics as Python.
  Daily rows include cumulative tokens and cumulative estimated cost.
- `conversationHistogram`: at most 30 deterministic bins containing lower bound,
  upper bound, and conversation count. For no conversations return `[]`; when
  `min === max`, return one inclusive bin containing every conversation;
  otherwise create exactly 30 equal-width bins across `[min, max]`, use
  lower-inclusive/upper-exclusive bounds for bins 0–28 and an inclusive upper
  bound for bin 29, and explicitly place `value === max` in bin 29. Compute it
  from numeric per-conversation totals during finalization so the persisted
  report can reproduce the histogram without retaining every conversation row.
- `metrics`: average and median conversation tokens, longest-conversation title,
  longest prompt/reply character counts, and top 10 days.
- `topConversations`: title, first/last ISO timestamp, turn counts, token counts,
  average/largest message tokens, and per-model/primary cost. Omit message text,
  conversation IDs, node IDs, and metadata after deduplication is complete.
- Worker request: `{ type: "analyze"; file: File }`. Cancellation is deliberately
  termination-only (`worker.terminate()`); do not define an unused cooperative
  cancel message that cannot interrupt a synchronous tokenizer call.
- Worker events: `{ type: "progress"; phase; completed; total?; detail? }`,
  `{ type: "complete"; snapshot }`, and `{ type: "error"; code; message }`.
  Stable error codes cover invalid type, too large, invalid/unsupported ZIP, no
  conversation files, decompressed limit, individual-string limit, malformed
  JSON, no valid conversations, and internal failure. UI copy must not echo
  conversation content.

## Tasks

Tasks with `Depends on: none` can start independently. Phases are deliberate:
do not retire Python before the Phase 1 and Phase 2 parity gates pass.

### Phase 1 — static application foundation

- [x] Task 1 — `package.json`, `package-lock.json`, `tsconfig*.json`,
  `vite.config.ts`, `eslint.config.js`, `index.html`, `src/main.tsx`,
  `src/App.tsx`, and `src/styles.css`
  **What:** Scaffold a strict TypeScript React/Vite application in the repository
  root without moving the Python code. Configure `base: "./"`, a `HashRouter`
  with `/#/` (upload) and `/#/report`, an error boundary, and responsive desktop
  layout tokens. Add pinned runtime dependencies for React, routing, `fflate`,
  `@streamparser/json`, the `tiktoken` package, and locally bundled Plotly React
  bindings; add dev dependencies for TypeScript, Vite, `tsx`,
  `@vitejs/plugin-react`, `vite-plugin-wasm`, `vite-plugin-top-level-await`,
  ESLint, Vitest, Testing Library, and Playwright. Configure Vite explicitly as
  `plugins: [react(), wasm(), topLevelAwait()]`; Task 4 must not have to retrofit
  build support for the WASM dependency.
  Provide scripts `dev`, `lint`, `test`, `test:parity`, `test:browser`, `build`,
  and `check` (`lint`, unit tests, and production build).
  Keep production free of Node-only imports and external CDN tags.
  **Why:** GitHub Pages can serve only static artifacts, while local Node tooling
  remains appropriate for development and tests.
  **Depends on:** none
  **Verify:** `npm install && npm run lint && npm run build`; then
  `! rg -n '<(script|link)[^>]+https?://' dist/index.html` confirms the document
  has no CDN runtime imports (third-party bundles may contain inert URL strings).

- [x] Task 2 — `src/analysis/types.ts`, `src/analysis/pricing.ts`, and
  `src/analysis/analytics.ts`
  **What:** Implement the contracts above, port `pricing.py` and the pure
  aggregations from `analytics.py`, and expose an accumulator that accepts one
  parsed conversation at a time with already-counted message/recap token values.
  Maintain deduplication by conversation ID while processing, chronological ISO
  dates, input=user/output=assistant accounting, primary-model costs, sorted
  monthly/daily rows, cumulative values, a deterministic 30-bin conversation-size
  histogram using the exact empty/equal/30-bin/boundary algorithm in the data
  contract, median/average metrics, and a bounded top-100 conversation collection.
  Build all report aggregates in one pass plus final sorting; retaining one
  numeric total per conversation until histogram/median finalization is acceptable,
  but never retain all message bodies or parsed conversation objects.
  `pricing.json` remains the single checked-in pricing source and is imported at
  build time. Validate its object/rate shape before analysis begins.
  **Why:** A pure, environment-independent core makes Python parity and browser
  worker integration separately testable while eliminating repeated tokenization.
  **Depends on:** Task 1
  **Verify:** `npm test -- src/analysis/analytics.test.ts`

- [x] Task 3 — `src/analysis/parser.ts` and `src/analysis/parser.test.ts`
  **What:** Port the defensive behavior from `chatgpt_analytics/parser.py` for one
  raw conversation object. Accept `id`/`conversation_id`, epoch or ISO timestamps,
  mapping nodes, user/assistant roles, standard `parts`, string `text`, and
  string-bearing `multimodal_text`. Classify assistant `reasoning_recap.content`
  as a token-countable but non-billable recap and `thoughts` as a counted internal
  artifact without retaining its structured payload. Skip malformed nodes and
  conversations without throwing the whole upload. Return the temporary
  conversation ID solely for worker-side deduplication and return message text
  only until the worker tokenizes it.
  **Why:** Export schema drift and malformed nodes should not crash otherwise
  usable exports or leak internal content into spend estimates.
  **Depends on:** Task 1
  **Verify:** `npm test -- src/analysis/parser.test.ts`

### Phase 1 — large-file worker pipeline

- [x] Task 4 — `src/worker/protocol.ts`, `src/worker/analyzeExport.ts`,
  `src/worker/analyze.worker.ts`, and `src/worker/analyze.worker.test.ts`
  **What:** Implement the typed worker protocol and complete local pipeline.
  Validate `.zip` input and `file.size <= 100 * 1024 * 1024`; read the `Blob`
  stream in bounded chunks; feed `fflate.Unzip` with DEFLATE support; normalize
  entry paths and start only basenames matching
  `^conversations(?:-\d+)?\.json$`; reject more than 1,000 matching entries;
  stream decompressed `Uint8Array` chunks through an `@streamparser/json`
  `Tokenizer({ emitPartialTokens: true, stringBufferSize: 64 * 1024 })` wired to
  a `TokenParser({ paths: ["$.*"], keepStack: false })`. The tokenizer callback
  must observe every token and then forward it to `tokenParser.write`; do not
  replace the library's tokenizer-to-parser flow merely to enforce a limit.
  Track tokenizer byte offsets from the start of the current partial string token
  and abort before forwarding once its span exceeds 16 MiB. The buffer setting
  limits concatenation overhead; it is not the semantic string limit. Abort after
  1 GiB cumulative
  conversation JSON. Create one JSON parser per started ZIP entry, call its
  `end()` only on that entry's final callback, and resolve analysis only after
  the ZIP input has ended and every started entry has delivered its final
  callback. For every emitted conversation, call the
  parser, deduplicate by ID across parts, tokenize each retained visible/recap
  string once with lite/WASM `o200k_base`, immediately discard strings, and feed
  Task 2's accumulator. Put the reusable pipeline in `analyzeExport.ts`; keep
  `analyze.worker.ts` as the thin `self.onmessage` adapter so Vitest/parity code
  can invoke the same core without emulating browser worker globals. Initialize
  `init`/`Tiktoken` from `tiktoken/lite/init`, the emitted
  `tiktoken_bg.wasm` module, and `tiktoken/encoders/o200k_base.json` using the
  Vite WASM/top-level-await plugins configured in Task 1. Confirm those exact
  package exports in Task 1's production build and always call `encoding.free()`
  in `finally`. Post throttled
  progress no more frequently than about every 100 ms. On cancel/new upload,
  terminate the worker and release the tokenizer. Convert library/parser errors
  to stable user-safe error codes.
  Tests should build ZIP blobs in memory and cover ordinary and numbered parts,
  duplicate IDs, unrelated assets, malformed conversations, corrupt ZIPs,
  missing conversation files, compressed/expanded/entry/single-string limits,
  finalization with multiple concurrent entries, and termination behavior.
  **Why:** Streaming and a worker are what make a 100 MiB target plausible
  without freezing the UI or retaining the full expanded export.
  **Depends on:** Tasks 2–3
  **Verify:** `npm test -- src/worker/analyze.worker.test.ts`

- [x] Task 5 — `src/storage/reportRepository.ts` and
  `src/storage/reportRepository.test.ts`
  **What:** Wrap native IndexedDB in a small repository with `loadLatest`,
  `replaceLatest`, and `clear`. Use database `chatgpt-export-analytics`, one
  object store, key `latest`, and explicit snapshot schema version 1. Validate
  the stored top-level shape/version on read; clear corrupt or incompatible data
  and return a typed recoverable result. `replaceLatest` must perform one atomic
  transaction after analysis completes. Confirm via tests that only
  `AnalysisSnapshot` fields are written and no raw ZIP/message fields can enter
  the persistence call.
  **Why:** Refresh persistence is useful, but private source data should have a
  sharply bounded lifetime and storage shape.
  **Depends on:** Task 2
  **Verify:** `npm test -- src/storage/reportRepository.test.ts`

### Phase 1 — upload and report experience

- [x] Task 6 — `src/pages/UploadPage.tsx`, `src/components/UploadDropzone.tsx`,
  `src/hooks/useExportAnalysis.ts`, and colocated tests
  **What:** Build an accessible file picker/drop zone accepting one ZIP, a
  prominent “processed only in this browser” explanation, the 100 MiB limit,
  progress phases, cancel action, and recoverable error states. The hook owns
  worker creation and termination, rejects invalid files before spawning,
  preserves the previous report during a failed/cancelled replacement, writes a
  completed snapshot via `replaceLatest`, and navigates only after persistence
  succeeds. Starting a second upload cancels the first. Provide a link to an
  already-persisted report and a clear-local-report action when applicable.
  **Why:** Users need trustworthy privacy language and visible progress for a
  CPU-heavy local operation rather than an ambiguous “uploading” spinner.
  **Depends on:** Tasks 4–5
  **Verify:** `npm test -- src/pages/UploadPage.test.tsx`

- [x] Task 7 — `src/pages/ReportPage.tsx`, `src/components/report/`, and
  colocated tests
  **What:** Hydrate the snapshot from router state or IndexedDB and reproduce
  the Phase 1 dashboard: executive cards, export content inventory, cost by
  model, monthly spend, monthly input/output tokens, cumulative tokens,
  cumulative spend, conversation-size histogram, monthly heatmap, additional
  insights/top 10 days, and sortable top-100 conversations. Use locally bundled
  Plotly, render loading/error/empty states, format numbers/dates consistently,
  and offer “Analyze another export” plus “Clear local report.” Unknown snapshot
  versions return to upload with an explanation. Do not render or log message,
  recap, or internal-thought content. Do not add reasoning controls in Phase 1.
  **Why:** This is the user-visible replacement for the generated Jinja report.
  **Depends on:** Tasks 5–6
  **Verify:** `npm test -- src/pages/ReportPage.test.tsx && npm run build`

### Phase 1 — parity, privacy, deployment, and performance gate

- [x] Task 8 — `tests/fixtures/parity-export/conversations-000.json`,
  `tests/fixtures/parity-export/conversations-001.json`,
  `tests/fixtures/parity-expected.json`,
  `tests/parity/generate_python_snapshot.py`, and
  `tests/parity/python-parity.test.ts`
  **What:** Create two synthetic, non-private numbered export parts covering
  cross-part deduplication, epochs/ISO/missing timestamps, normal and multimodal text,
  malformed nodes, recap text, structured thoughts, multiple months/days, empty
  conversations, and Unicode/tokenizer edge cases. The Python helper must call
  the existing parser/analytics modules and serialize the exact Phase 1
  `AnalysisSnapshot` shape with a fixed analyzed timestamp/source wrapper and
  deterministic float normalization. It must compute histogram bins directly
  from Python conversation totals using the algorithm in `## Data contracts`
  rather than extracting Plotly rendering output. The TypeScript parity test analyzes the
  same fixture using a direct worker-core entry point and compares every string
  and integer exactly; compare floating costs with a documented tight tolerance.
  Generate and commit `parity-expected.json` only after Python and TypeScript
  agree. The TypeScript test must build a ZIP containing both parts before it
  invokes `analyzeExport`; the Python helper must call `load_export_parts` on
  `tests/fixtures/parity-export/conversations-000.json` so the existing numbered
  basename rule discovers both siblings. Never derive this fixture from the
  private real export.
  **Why:** This is the objective retirement gate for the reference implementation.
  **Depends on:** Tasks 2–4
  **Verify:** `python3 -m pytest -q && npm run test:parity`

- [x] Task 9 — `package.json`, `tests/browser/upload-report.spec.ts`,
  `playwright.config.ts`, and browser test ZIP fixtures generated in test setup
  **What:** Exercise the production-like static application in Chromium,
  Firefox, and WebKit: select a ZIP, see progress, land on `/#/report`, verify
  representative cards/charts/tables, reload and restore from IndexedDB, upload
  a replacement, cancel a run, reject invalid/oversized/corrupt inputs, clear
  persistence, and deep-load the report hash route. Record requests during
  analysis: allow same-origin GETs for lazily loaded worker/WASM/static assets,
  but fail on any external origin, non-GET request, or request carrying
  export-derived data.
  Add `"preview:pages": "vite preview --base /chatgpt-export-analytics-tool/"`
  and configure Playwright's web server/base URL to exercise
  `/chatgpt-export-analytics-tool/#/` rather than serving `dist` only at `/`.
  Assert that emitted worker and WASM asset requests resolve beneath that project
  prefix, as they will on GitHub Pages.
  Add component tests for loading, empty, and storage-error states not economical
  to express end-to-end.
  **Why:** Node unit tests alone cannot prove that workers, WASM, IndexedDB,
  bundled assets, and GitHub-Pages-style routing work in real browsers.
  **Depends on:** Tasks 6–8
  **Verify:** `npm run build && npm run test:browser`; the Playwright trace/request
  assertions show successful worker and WASM loads under
  `/chatgpt-export-analytics-tool/assets/`.

- [x] Task 10 — `.github/workflows/pages.yml`, `index.html`, and `README.md`
  **What:** Add a GitHub Actions Pages workflow that installs with `npm ci`, runs
  `npm run check` plus browser tests (including
  `npx playwright install --with-deps`), builds `dist`, configures Pages, and
  deploys only the static artifact from the default branch. Add a meta Content
  Security Policy compatible with same-origin worker/WASM asset loading
  (`connect-src 'self'`, `worker-src 'self' blob:`) while blocking external
  origins and `script-src 'self' 'wasm-unsafe-eval'` for WASM compilation;
  include no telemetry. Rewrite the README around browser privacy,
  supported desktop
  browsers, size limits, local development/testing, Pages deployment, estimate
  caveats, retained IndexedDB fields (including conversation titles), and how to
  clear the report. Mark Python as temporary until Task 13.
  **Why:** The privacy claim must be reflected in deployment configuration and
  reproducible checks, not only marketing copy.
  **Depends on:** Tasks 1 and 9
  **Verify:** `npm ci && npm run check && npm run test:browser`; inspect the
  workflow with `rg -n 'npm ci|npm run check|test:browser|upload-pages-artifact|deploy-pages' .github/workflows/pages.yml`.

- [x] Task 11 — `package.json`, `scripts/benchmark-browser-export.ts`, and
  `.work-notes/website/validation.md`
  **What:** Add a fixture generator/benchmark harness that produces synthetic
  exports without committing large files and records compressed size, expanded
  conversation JSON bytes, conversation/message counts, elapsed time, completion,
  and browser console/page errors. Validate at least the checked-in small fixture,
  a generated near-100-MiB ZIP, and—when present—the private path supplied by the
  owner under `/tmp`. Never copy, print, snapshot, or commit private titles/text;
  record only size/timing/peak-memory observations that reveal no conversation
  content. If the 100-MiB case cannot complete in current desktop Chromium,
  optimize or revise the advertised ceiling before release rather than silently
  claiming support.
  **Why:** “100 MiB would be cool” needs a measured release gate, and synthetic
  data keeps the repository safe to publish. Add
  `"benchmark": "tsx scripts/benchmark-browser-export.ts"` to `package.json`
  when adding the harness; it may be absent before this task.
  **Depends on:** Tasks 4, 7, and 9
  Support `--size-mib 100` for the generated case and
  `--zip /tmp/chatgpt-export.zip` for the agreed private fixture; the private
  command must report a clear skip rather than fail when that path is absent.
  **Verify:** `npm run benchmark -- --size-mib 100` and
  `npm run benchmark -- --zip /tmp/chatgpt-export.zip` when present.

### Phase 2 — reasoning-overhead scenario

- [x] Task 12 — `src/analysis/reasoningScenario.ts`,
  `src/components/report/ReasoningScenario.tsx`,
  `tests/parity/reasoning-parity.test.ts`, and colocated tests
  **What:** Port `reasoning_scenario` from Python. Add a report control accepting
  a finite multiplier `>= 0`, with clear explanatory copy that it represents
  additional hidden output tokens per visible assistant-output token and is not
  measured from the export. Compute estimated reasoning tokens by rounding
  `visibleOutputTokens * multiplier`; show visible, scenario, and additional cost
  for every configured model. Keep the control session-local unless a later UX
  decision explicitly adds it to snapshot schema version 2. Cover zero, decimal,
  large, negative, empty, NaN, and Infinity inputs without changing the base
  report totals. Implement a small TypeScript `roundTiesToEven` helper matching
  Python's `round` for non-negative `.5` ties; do not use JavaScript `Math.round`
  for estimated reasoning tokens. Extend the temporary Python helper/test so
  `0`, `0.5`, and `1.0` scenarios are compared with Python's existing
  `reasoning_scenario` function before retirement, including an odd visible-
  output-token total whose `0.5` multiplier lands exactly on a half tie.
  **Why:** This preserves the existing optional analytical feature without
  delaying the core browser release or conflating scenarios with observed data.
  **Depends on:** Tasks 7–8
  **Verify:** `npm test -- src/analysis/reasoningScenario.test.ts src/components/report/ReasoningScenario.test.tsx && npm run test:parity`

### Phase 3 — retire the Python reference

- [x] Task 13 — `analyze.py`, `serve.py`, `chatgpt_analytics/`,
  `tests/test_parser_and_analytics.py`, `requirements.txt`, `pyproject.toml`,
  `tests/parity/generate_python_snapshot.py`,
  `tests/parity/python-parity.test.ts`, `tests/parity/reasoning-parity.test.ts`,
  `tests/golden/analysis-golden.test.ts`,
  `tests/fixtures/parity-expected.json`, and `README.md`
  **What:** Only after Tasks 8–12 are green and validation is recorded, promote
  `parity-expected.json` to the permanent TypeScript golden fixture, replace the
  two Python-spawning parity tests with `tests/golden/analysis-golden.test.ts`
  that runs TypeScript against the committed expected snapshot, then remove the
  Python helper and CLI/server/package/template/tests and Python dependency files.
  Update the `test:parity` package script to run the new TypeScript-only golden
  test; remove the now-empty `tests/parity/` directory only after its tests have
  moved. Retain
  `pricing.json` as the browser build input. Remove Python setup/use documentation,
  explain that the website is the supported product, and rerun all static/browser
  tests from a clean npm install. Do not remove Python earlier merely to simplify
  CI.
  **Why:** One supported implementation avoids indefinite cross-language drift,
  but retirement is safe only after independent parity and real-browser gates.
  **Depends on:** Tasks 8–12
  **Verify:** `npm ci && npm run lint && npm test && npm run build && npm run test:browser && ! rg -n 'python3|analyze\.py|serve\.py|chatgpt_analytics' README.md package.json src tests`.

## Tests

The test tasks above are required; existing Python coverage is not sufficient
for a browser port. The permanent testing pyramid after Python retirement is:

- Pure Vitest tests for parser, pricing, single-pass aggregation, reasoning
  scenario, worker protocol/limits, and IndexedDB repository behavior.
- A committed golden snapshot created only after exact Python/TypeScript parity.
- React Testing Library coverage for upload/report loading, error, empty,
  persistence, sorting, cancellation, and validation states.
- Playwright coverage in Chromium, Firefox, and WebKit against the built static
  app, including worker/WASM/IndexedDB operation and zero analysis-time network
  requests.
- A non-CI 100-MiB generated performance benchmark plus optional private-export
  validation. Large/private ZIPs must never be committed.

## Demo Cases

### Local ZIP analysis and navigation

- **Valid normal export** — open `/#/`, select a ZIP containing
  `conversations.json` → expect progress phases followed by `/#/report`; report
  cards and charts match the golden snapshot.
- **Valid numbered export** — select a ZIP containing
  `conversations-000.json` and `conversations-001.json` with one repeated ID →
  expect both parts processed once and the duplicate conversation counted once.
- **Export with unrelated assets** — select a normal ChatGPT export ZIP with
  images and other files → expect only matching conversation JSON entries to be
  decompressed/analyzed and report completion.
- **No conversation JSON** — select a valid ZIP without a matching entry →
  expect a recoverable “no conversations file found” state; remain on upload and
  preserve the prior report.
- **Malformed/corrupt input** — select a corrupt ZIP or malformed top-level JSON
  → expect a safe error with no conversation content echoed and no IndexedDB
  replacement.
- **Boundary abuse** — select an input over 100 MiB, over 1,000 matching entries,
  or over 1 GiB expanded JSON → expect rejection at the corresponding guard,
  worker termination, and the previous report preserved.
- **Cancellation/double submit** — cancel a running analysis or select a second
  ZIP while the first is active → expect the old worker to terminate, no stale
  completion to overwrite storage, and only the latest successful run to navigate.

### Privacy and persistence

- **Refresh latest report** — complete an analysis, reload `/#/report` → expect
  the same derived report restored from IndexedDB without reselecting the ZIP.
- **Atomic replacement** — begin with report A, fail/cancel analysis B, then
  complete analysis C → expect A retained after B and replaced by C only after C
  succeeds.
- **Clear local data** — choose “Clear local report” → expect IndexedDB key
  removal and navigation to the empty upload state.
- **No data transmission** — monitor browser requests while analyzing → allow
  same-origin GETs for lazily loaded worker/WASM/static assets, but expect no
  request carrying export-derived data, no non-GET request, and no request to an
  external origin; CSP blocks external connections.
- **Persisted shape inspection** — inspect the IndexedDB record → expect report
  aggregates and top titles only; no ZIP bytes, message/recap text, node metadata,
  or thought payloads.

### Phase 1 report parity

- **Accounting boundary** — analyze a fixture containing normal text, recap,
  and thoughts → expect normal user/assistant tokens included in costs, recap
  nodes/tokens shown only in inventory, and thought nodes counted without text or
  cost.
- **Complete visual report** — analyze the parity fixture → expect all current
  non-scenario dashboard sections, chronological/cumulative charts, top days, and
  sortable top conversations; empty dated data yields an explicit empty state.
- **Cross-language oracle** — run `npm run test:parity` before Python retirement
  → expect exact strings/integers and tolerance-equal floating results across all
  snapshot fields.

### Phase 2 reasoning scenario

- **Positive multiplier** — enter `1.0` → expect additional reasoning tokens
  equal visible output tokens and higher output-based cost for every model while
  base report totals remain unchanged.
- **Zero multiplier** — enter `0` → expect zero additional tokens/cost and scenario
  costs equal visible costs.
- **Invalid multiplier** — enter negative, blank, NaN-like, or infinite input →
  expect inline validation and no scenario calculation.

## Risks

- **Browser memory/CPU:** ZIP size does not predict expanded JSON size, and
  tokenizing tens or hundreds of megabytes is CPU-heavy. Mitigation: stream ZIP
  and top-level JSON objects, tokenize once, bound decompressed input, keep work
  off the main thread, allow cancellation, and gate the 100-MiB claim on an
  automated benchmark. Action required before release.
- **ZIP bombs and parser abuse:** A tiny archive can expand enormously or contain
  excessive entries/strings. Mitigation: compressed, expanded-byte, and matching
  entry-count ceilings; process only exact conversation basenames; stop the
  worker on any limit; never write archive paths. Accepted after negative tests.
- **Export schema drift:** ChatGPT may change content shapes. Mitigation: preserve
  defensive parsing, skip malformed/unknown nodes, expose safe diagnostics, and
  keep representative fixtures. Ongoing maintenance risk.
- **Privacy perception and persistence:** Conversation titles can themselves be
  sensitive even without bodies. Mitigation: disclose exactly what remains in
  IndexedDB, provide one-click clearing, store no raw content, send no telemetry,
  and enforce a same-origin-only CSP. Accepted because persistence was explicitly
  requested.
- **Tokenizer/browser integration:** WASM asset loading and worker bundling can
  pass Node tests yet fail under a Pages base path. Mitigation: bundle ranks/WASM,
  use relative Vite base, and require three-browser Playwright tests against the
  production build before deployment.
- **Two implementations during migration:** Python and TypeScript can drift.
  Mitigation: keep the overlap time-bounded, make parity a required test, and
  remove Python only after both phases and real-export validation pass.

## Explicitly deferred

- CSV, generated HTML, or ZIP downloads. Browser downloads are technically
  possible with generated `Blob` object URLs, but their format and value should
  be discussed after users experience the visual report.
- Shareable links, accounts, server storage, telemetry, custom uploaded pricing,
  mobile optimization, and processing outside the user's browser.
