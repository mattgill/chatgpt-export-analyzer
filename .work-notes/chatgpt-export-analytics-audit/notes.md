# chatgpt-export-analytics-audit notes

## 2026-07-19 — gameplan

**Decisions:**
- Keep API-cost estimation conservative: normal visible user/assistant text only.
- Render recap tokens separately as non-billable export context in HTML.
- Count structured thoughts only as excluded internal artifacts; do not expose or bill them.
- Make `--plots` independently control standalone Plotly artifact files.

**Risks:** Export content types may drift; report labels and tests will make the accounting boundary explicit.

**Sanity check overrides:** None.
