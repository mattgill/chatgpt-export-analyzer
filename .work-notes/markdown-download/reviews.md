# Reviews — website

## 2026-07-19 — torch (Full branch since fork from main)

## Fixed

### src/worker/readConversations.ts

- **Line 55**: [breakage] — Abort pending entry parsing as soon as a decompression, string-size, or malformed-JSON failure is detected.
  **Was:** `if (final && !ended) { ... resolve() }`
  **Now:** `if ((final || failure) && !ended) { ... resolve() }`
  **Why:** The read loop stops pushing ZIP data after setting `failure`; waiting only for `final` left the current entry promise unresolved and the worker download/analysis hung instead of returning the safety error.

### src/hooks/useExportAnalysis.ts

- **Line 28**: [breakage] — Ignore an old analysis's asynchronous IndexedDB completion after the user starts another upload.
  **Was:** `reportRepository.replaceLatest(message.snapshot).then(() => { session.setSourceFile(file); ... navigate('/report') })`
  **Now:** `reportRepository.replaceLatest(message.snapshot).then(() => { if (currentRun !== run.current) return; session.setSourceFile(file); ... navigate('/report') })`
  **Why:** `cancel()` invalidates a Worker message but cannot cancel its already-started persistence promise; without the run check, a superseded upload could restore its source ZIP and navigate the user to the wrong report.

## Considered and Dropped

### Markdown archive completion handler replacement

- **Claim:** Replacing `archive.ondata` just before `archive.end()` might lose archive chunks emitted while entries are added.
- **Why dropped:** The replacement explicitly invokes the constructor callback, which has already accumulated preceding chunks; `Zip` emits the final archive chunk only after `end()`, so the final completion promise observes it.
