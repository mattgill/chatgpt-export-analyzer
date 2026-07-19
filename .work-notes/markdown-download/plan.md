# Browser download of conversations as Markdown

## Context

The static GitHub Pages application currently streams a user-selected ChatGPT
export ZIP through a Web Worker, derives a privacy-minimized analytics snapshot,
and persists only that snapshot in IndexedDB. Message text and the source ZIP
are intentionally excluded from persistence. The report page therefore has no
conversation content available after navigation or a refresh.

An untracked Node CLI, `scripts/conversations-to-markdown.mjs`, already shows
the desired document shape: one Markdown file per conversation, named from the
UTC creation date and a title slug. It is not part of the committed browser
product and must not become a second authoritative parser/formatter.

The requested product behavior is one **Download Markdown ZIP** action. It
must package files named `YYYY-MM-DD-title-slug.md` (or `undated-...` when no
usable date exists), keep collision-safe suffixes, and include visible user and
assistant text. The conversion and download must remain entirely local; GitHub
Pages supplies only static assets and no application server is involved.

## Decisions

- Generate the Markdown ZIP on demand in a Web Worker, rather than storing
  messages or a prebuilt archive in IndexedDB. This preserves the existing
  privacy boundary and avoids work for visitors who only want analytics.
- Retain the successfully analyzed source `File` only in React session memory.
  It is never written to IndexedDB or sent over the network. A refresh retains
  the aggregate report but makes Markdown download unavailable until the user
  selects the export again; the UI explains that condition.
- Reuse the TypeScript conversation parser and a new shared Markdown formatter.
  The Node CLI remains untouched as user-owned, untracked work; it is not
  migrated or deleted by this feature.
- Preserve the existing worker's ZIP-entry matching, ID deduplication, and
  compressed/expanded/entry/string safety limits. The archive is assembled from
  streamed ZIP output chunks into a `Blob`, then saved via an object URL and a
  user-initiated anchor click. This is compatible with the in-scope desktop
  Chrome, Firefox, and Safari browsers without a server or File System Access
  API dependency.
- Treat output-memory pressure as a real browser limitation: separately cap
  accumulated generated ZIP chunks at 1 GiB and surface stable,
  non-content-bearing `markdown_archive_limit` or `markdown_export_failed`
  errors when that cap or ZIP/Blob construction fails. Do not claim every
  accepted 100 MiB input can produce an archive on every machine.

## Technical Flow

**Before:** Upload posts the ZIP to `analyze.worker.ts`; the worker streams and
parses matching conversation JSON, tokenizes visible text, returns an aggregate
snapshot, and is terminated. `ReportPage` reloads only the persisted snapshot,
which deliberately contains no source file or message bodies.

**After:** A successful upload additionally places its original `File` in a
session-only provider before navigating to the report. The report header enables
**Download Markdown ZIP** while that file exists. Clicking it starts a fresh
worker request. The worker streams the same matching entries, parses and
deduplicates conversations, formats each visible conversation as Markdown, and
streams file entries into an output ZIP. It posts a completed `Blob` to the main
thread, which downloads `chatgpt-conversations-markdown.zip` and schedules
object-URL revocation after the browser starts the download. Worker/source state and generated text are released on
completion, error, clear, replacement upload, or refresh.

```text
local source ZIP (session only) -> export worker -> parser + Markdown formatter
                                                   -> ZIP Blob -> browser download

IndexedDB report snapshot (no text, no ZIP) -----> report UI
```

## Tasks

### Shared analysis/export code

- [x] Task 1 — `src/analysis/markdown.ts` (new), `src/analysis/parser.ts`, and tests in `src/analysis/markdown.test.ts` (new) / `src/analysis/parser.test.ts`
  **What:** Add a pure formatter that accepts the existing parsed-conversation
  shape and returns `{ filename, contents }`. Use `createdAt`, falling back to
  `updatedAt`, for a UTC `YYYY-MM-DD` filename prefix; use `undated` otherwise.
  Normalize titles to an ASCII lowercase slug, cap it at the established
  72-character boundary, and fall back to `untitled-conversation`. Emit YAML
  front matter (`title`, `conversation_id`, `created_at`, `updated_at`), an H1
  title, and chronological `## User` / `## Assistant` sections using the
  existing parser timestamp (the message's ISO time, or its conversation
  creation-time fallback when the source lacks one). Emit the parser's retained
  message text unchanged as Markdown (which intentionally follows the parser's
  current trimming and multipart-joining semantics). Keep
  reasoning recaps, thoughts, tool messages, malformed nodes, and empty visible
  messages out, matching `parseConversation` semantics. Provide deterministic
  collision naming at the archive coordinator (`-2`, `-3`, …), after
  cross-part ID deduplication.
  **Why:** Parsing and formatting must have one browser-native definition; the
  current Node script must not drift from the supported product behavior.
  **Depends on:** none
  **Verify:** `npm test -- src/analysis/markdown.test.ts src/analysis/parser.test.ts`

- [x] Task 2 — `src/worker/analyzeExport.ts`, `src/worker/exportMarkdown.ts` (new), `src/worker/protocol.ts`, `src/worker/analyze.worker.ts`, and `src/worker/analyze.worker.test.ts`
  **What:** Extract the existing streamed matching-entry/JSON-object traversal
  into a reusable worker-local primitive so analysis and Markdown export apply
  identical ZIP validation, path matching, decompression limits, per-string
  limits, malformed-JSON handling, and conversation-ID deduplication. Add an
  `exportMarkdown` request plus typed progress, complete, and error events; do
  not change the persisted `AnalysisSnapshot` contract. Implement export with
  fflate's streaming ZIP writer: add each formatted Markdown file as a ZIP entry,
  count generated chunks and abort at 1 GiB, then collect output chunks as a
  `Blob` only after a successful finalization and release intermediate parsed
  objects immediately. Add `markdown_archive_limit` and
  `markdown_export_failed` to the protocol's stable error code/message mapping;
  map input and ZIP-generation failures to those content-safe errors. The worker
  adapter remains thin and handles both analysis and export requests.
  **Why:** The same safety posture and conversation interpretation must apply to
  analytics and downloadable documents, while Worker execution keeps expensive
  parsing/compression off the UI thread.
  **Depends on:** Task 1
  **Verify:** `npm test -- src/worker/analyze.worker.test.ts`; tests must unzip
  the returned Blob and assert numbered input parts, duplicate IDs, unrelated
  files, title/date slugging, filename collisions, omitted private artifacts,
  malformed ZIP/JSON behavior, and no conversation-file behavior.

### Frontend/session experience

- [x] Task 3 — `src/export/ExportSession.tsx` (new), `src/App.tsx`, `src/hooks/useExportAnalysis.ts`, `src/pages/UploadPage.tsx`, `src/pages/ReportPage.tsx`, and `src/styles.css`
  **What:** Add an app-scoped session provider for the most recently successful
  input `File`; it must hold the file in memory only and expose replacement and
  clear operations. Set it only after analysis has saved a valid snapshot, clear
  it at the start of a replacement run and whenever the user clears the local
  report, and never pass it to `reportRepository`. Add a report-header download
  button that starts an export worker, exposes accessible progress/busy state,
  prevents duplicate clicks, reports safe errors, and turns the completed Blob
  into `chatgpt-conversations-markdown.zip` through `URL.createObjectURL` plus a
  programmatic anchor click. Append the anchor to the document, click it, remove
  it, and schedule object-URL revocation after the browser has consumed the
  navigation rather than revoking synchronously; terminate the worker in all
  terminal/unmount paths. Display the stable `markdown_archive_limit` or
  `markdown_export_failed` message on export failure. When a report was restored after a
  refresh and no session file exists, show explanatory copy and a link to
  analyze the original export again instead of an unusable download control.
  **Why:** The feature remains one-click for the active session without weakening
  the explicit privacy promise of persistent report storage.
  **Depends on:** Task 2
  **Verify:** `npm test -- src/pages/UploadPage.test.tsx src/pages/ReportPage.test.tsx`; tests must cover enabled active-session state, restored-report/re-upload state, busy/error state, and clear/replacement removal of the session source.

### Browser and documentation tests

- [x] Task 4 — `tests/browser/upload-report.spec.ts` and `README.md`
  **What:** Extend the Playwright fixture with duplicated titles and a dated
  conversation, trigger the report download, wait for the browser download,
  and inspect its ZIP entries/content from the test process. Assert the archive
  contains the exact expected date-and-slug filenames (including a collision
  suffix) and visible user/assistant body text, while no external request is
  made beyond the Pages origin and bundled worker/WASM assets. Reload before a
  second assertion to prove the existing report persists but the download path
  correctly asks for re-upload. Update README's product usage/privacy section
  with the local download flow, session-only limitation after refresh, browser
  memory caveat, and explicit statement that GitHub Pages does not receive the
  export. Do not document or alter the untracked CLI as part of this feature.
  **Why:** Browser download behavior, asset paths, and the privacy contract are
  observable product requirements that unit tests alone cannot prove.
  **Depends on:** Task 3
  **Verify:** `npm run test:browser`

- [x] Task 5 — `scripts/benchmark-browser-export.ts` and repository-wide regression validation
  **What:** Run the existing lint/unit/build/golden/browser suite, then rerun
  the synthetic 100 MiB benchmark with a Markdown download: wait for the
  download, record download completion, archive byte size, and export elapsed
  time alongside the existing analysis metric. The success criterion is a
  completed local download with a nonzero archive rather than a universal timing
  threshold. Inspect the built HTML and network behavior to ensure no API
  endpoint or third-party CDN was introduced.
  **Why:** The new download pipeline shares parsing and browser memory with a
  performance-sensitive, static application.
  **Depends on:** Tasks 1–4
  **Verify:** `npm run check && npm run test:parity && npm run test:browser && npm run benchmark -- --size-mib 100`; confirm benchmark output reports completed Markdown download and nonzero archive bytes, `dist/index.html` contains no external runtime URL, and browser test requests remain same-origin.

## Demo Cases

### Active-session Markdown download

- **Happy path** — upload a valid ZIP containing dated visible conversations,
  then click **Download Markdown ZIP** before reloading (browser-local session)
  → expect a browser download named `chatgpt-conversations-markdown.zip` whose
  entries include `YYYY-MM-DD-title-slug.md` with user and assistant sections.
- **Filename collision** — upload two distinct conversations with the same date
  and title, then download (browser-local session) → expect both Markdown files
  with deterministic collision-safe names such as `2024-01-01-project.md` and
  `2024-01-01-project-2.md`.
- **Artifact exclusion** — upload a conversation with visible text plus
  reasoning recap/thought/tool nodes, then download (browser-local session) →
  expect only visible user/assistant text; no recap or internal artifact payload
  appears in the Markdown ZIP.
- **Invalid/malformed source** — select an invalid ZIP or an archive with no
  valid conversations (no valid local source session) → expect the existing
  safe validation error and no download control that could produce an archive.

### Persisted-report boundary

- **Refresh boundary** — upload and analyze a valid ZIP, reload the report, and
  inspect local storage (no source File session) → expect the aggregate report
  to remain visible, the download action to be replaced by re-upload guidance,
  and IndexedDB to contain no ZIP/message fields.
- **Clear boundary** — click **Clear local report** after a successful upload
  (browser-local session) → expect navigation to upload, removal of the saved
  report and session source, and no subsequent Markdown download availability.

## Risks

- **Large export memory:** Any portable browser ZIP download ultimately needs a
  completed Blob. Streaming limits parsing memory, but output Blob allocation
  can still fail for unusually large exports. Keep the existing limits, avoid
  duplicate copies, provide a safe error, and validate with the 100 MiB
  benchmark.
- **Privacy regression:** Persisting a `File`, Blob, or messages in IndexedDB
  would violate the current product contract. The session provider is explicitly
  in-memory, repository validation remains message/file-free, and refresh tests
  prove the boundary.
- **Behavior drift:** Separate analysis and export traversal could disagree on
  which conversations are valid. Extracting common traversal plus tests for
  parts, IDs, and artifacts mitigates this.
