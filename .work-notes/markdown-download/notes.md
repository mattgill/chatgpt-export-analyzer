# markdown-download notes

## 2026-07-19 — gameplan

**Decisions:**
- Provide one browser-generated Markdown ZIP, not individual file downloads.
- Process and package it locally in a worker; GitHub Pages has no role beyond
  serving the static app.
- Keep the source ZIP only for the active browser session and require re-upload
  after refresh; never persist conversation text or source bytes with the report.
- Leave the existing untracked Node CLI alone; the supported formatter is shared
  TypeScript code for the browser feature.

**Risks:** Output ZIP Blob memory can be substantial for a large export; test
the 100 MiB target and show a safe failure if browser memory is insufficient.

**Sanity check overrides:** Existing CLI functionality was found, but the
requested browser-download behavior proceeds as a separate supported path.
