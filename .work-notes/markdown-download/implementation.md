# Implementation — website

## What was built

The report page can now download a locally generated
`chatgpt-conversations-markdown.zip`. Each conversation becomes a dated,
title-slugged Markdown file containing the parser's visible user and assistant
messages, while duplicate filenames receive deterministic suffixes.

The original export ZIP is retained only for the active React session after a
successful analysis. It is never added to IndexedDB or transmitted. A refreshed
report remains available as aggregate data, but clearly asks the user to
re-upload before Markdown can be downloaded.

## Key decisions

- The browser performs the second parse and ZIP assembly in a Web Worker when
  the user requests the download, keeping raw messages out of persisted state.
- Analytics and Markdown export share the same streamed ZIP traversal, parser,
  input limits, and cross-part conversation-ID deduplication.
- The generated archive has a separate 1 GiB chunk cap and stable export error
  messages; browser object URLs are revoked after the download is started.

## Tiers changed

- Analysis/worker: shared streamed conversation reader, Markdown formatter,
  archive writer, and typed worker protocol.
- Frontend: session-only source ownership, download/re-upload states, and safe
  browser download lifecycle.
- Tests/docs: formatter and worker coverage, Playwright archive inspection,
  benchmark download metrics, and product privacy documentation.

## Deviations from plan

None. The generic `test-failures` helper is not configured for this static
application, so validation used the repository's npm scripts instead.

## How to verify

```bash
npm run check
npm run test:parity
npm run test:browser
npm run benchmark -- --size-mib 100
```

Upload a valid export, choose **Download Markdown ZIP** before refresh, and
inspect the archive for `YYYY-MM-DD-title-slug.md` files. Refresh the report to
confirm its aggregate data remains while the download control asks for a
re-upload.
