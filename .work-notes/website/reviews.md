# Reviews — website

## 2026-07-19 15:00 EDT — torch (Full staged website changes since main)

## Fixed

### src/worker/analyzeExport.ts

- **Line 46**: [breakage] — Duplicate conversation IDs were only rejected after every visible and recap string had already been passed through the WASM tokenizer. A repeated conversation across ZIP parts therefore multiplied CPU work (and can make a valid, bounded upload needlessly slow) even though it contributes no report data.
  **Was:** `const messages = parsed.messages.map((message) => ({ role: message.role, tokens: encoding.encode(message.text, [], []).length, characters: message.text.length, timestamp: message.timestamp, model: message.model }))`
  **Now:** `if (seenConversationIds.has(parsed.id)) return`
  **Why:** Reserve an ID immediately after parsing, so duplicate records are discarded before tokenization; the accumulator retains its existing output-level deduplication safeguard.

## Considered and Dropped

### Persisted snapshot validation is shallow

- **Claim:** `validSnapshot` does not recursively validate every report row.
- **Why dropped:** The only application writer is the worker-produced snapshot, and the worker constructs its persisted shape without raw message or recap fields; a same-origin user can already inspect or modify its own browser storage, so this does not create a shipping data-exposure path.

### Strict CSP and Plotly rendering

- **Claim:** A restrictive `style-src` policy could conflict with chart-library styling.
- **Why dropped:** The deployed-browser suite exercises the report under the production CSP in Chromium, Firefox, and WebKit, and the chart library is locally bundled; no failed consumer or runtime breakage was confirmed.

