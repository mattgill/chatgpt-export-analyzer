# ChatGPT export analytics audit remediation

## Context

The repository already implements an offline Python CLI that parses ChatGPT
`conversations.json` exports, estimates `o200k_base` tokens, compares configured
API prices, and writes CSV, Plotly, and Jinja HTML reports. Its tests pass with
`python3` (the environment does not provide a `python` executable).

An end-to-end run against `/home/matt/chatgpt-convs` completed successfully:
886 conversations, 4,838,740 API-equivalent visible-text tokens, and all current
artifacts were produced. The audit found missing cumulative charts, an
unrendered top-days metric, a missing Executive Summary heading, thin test
coverage, and output-selection behavior that writes plot files whenever HTML is
requested.

The export contains standard text messages plus 250 `reasoning_recap` nodes and
383 structured `thoughts` nodes. Existing parsing silently excludes both. This
plan makes that boundary explicit without changing cost estimates.

## Decisions

- API-equivalent input/output totals and every cost calculation remain
  conservative: only ordinary visible user and assistant text is billable.
- `reasoning_recap.content` is retained and token-counted as a separate,
  non-billable export-footprint category in the dashboard.
- Structured `thoughts` remain excluded from token and cost totals; their node
  count is displayed as an internal artifact. They are not rendered or exported
  verbatim.
- The HTML dashboard is the big-picture presentation. Existing CSV schemas stay
  focused on API-equivalent analysis unless a clearly named inventory CSV proves
  useful later.
- `--plots` controls creation of standalone `plots/*.html`; `--html` still
  embeds the charts it needs in `report.html`.

## Technical Flow

**Before:** The parser accepts only user/assistant nodes with string `parts` or
`text`. Analytics uses those messages for token totals, cost, month aggregation,
and a top-days calculation. Reporting writes monthly cost/token, histogram, and
heatmap figures, but only renders some insights. Plot files are written whenever
HTML is requested. The dashboard has metric cards but no named Executive Summary
section, no cumulative charts, and no transparency about excluded content.

**After:** Parsing classifies normal visible messages, recap text, and internal
artifacts. Analytics maintains separate API-equivalent and non-billable inventory
totals. Costs, CSV token columns, conversation ranking, and monthly API spending
remain based only on the former. Reporting names the executive summary, renders
the inventory/top-day insight, embeds cumulative charts, and independently
controls persistent standalone plot files. Tests cover each classification,
output contract, and CLI option combination.

## Tasks

Tasks with `Depends on: none` can run in parallel.

### Parser and domain model

- [x] Task 1 — `chatgpt_analytics/models.py` and `chatgpt_analytics/parser.py`
  **What:** Add typed representation for non-billable export content/artifacts
  associated with a conversation (content category, optional text, and source
  role/node ID). Preserve the current `Message` path for ordinary user/assistant
  text. Classify `content_type: text` and string-bearing `multimodal_text` as
  API-equivalent messages; classify assistant `reasoning_recap.content` as
  retained recap text; classify `thoughts` as an internal artifact without
  serializing its structured payload. Keep malformed/missing shapes non-fatal and
  logged at diagnostic level.
  **Why:** The report must show the export's broader footprint while preventing
  platform-internal artifacts from inflating API-equivalent token and cost totals.
  **Depends on:** none
  **Verify:** `python3 -m pytest tests/test_parser_and_analytics.py -q`

### Analytics

- [x] Task 2 — `chatgpt_analytics/analytics.py`
  **What:** Add pure aggregation helpers for (a) export-content inventory,
  including API-equivalent input/output tokens, recap node/token totals, and
  internal-artifact counts, and (b) chronological daily usage rows. Use daily
  rows to derive top 10 days plus cumulative API-equivalent tokens and cost for
  the primary configured model. Ensure `summary_rows`, `conversation_rows`, and
  `monthly_rows` retain their conservative token/cost semantics and explicitly
  do not consume recap/artifact data.
  **Why:** It makes the accounting boundary testable and provides the data needed
  for the requested big-picture dashboard analytics.
  **Depends on:** Task 1
  **Verify:** `python3 -m pytest tests/test_parser_and_analytics.py -q`

### CLI and reporting

- [x] Task 3 — `analyze.py` and `chatgpt_analytics/reporting.py`
  **What:** Pass inventory and daily analytics into report generation. Refactor
  plot construction so it can return embeddable figures for `--html` without
  writing files, and write `plots/*.html` only when `--plots` is selected (or
  when no output selector is supplied and all outputs are intentionally enabled).
  Add cumulative-token and cumulative-spend figures alongside the existing
  monthly, histogram, and heatmap figures; write each standalone file under
  `plots/` when requested. Keep the current output directory creation and error
  handling behavior.
  **Why:** This fills the missing requested analytics while making CLI output
  flags honor their documented contract.
  **Depends on:** Task 2
  **Verify:** `rm -rf /tmp/chatgpt-analytics-html /tmp/chatgpt-analytics-plots && python3 analyze.py /home/matt/chatgpt-convs --output /tmp/chatgpt-analytics-html --html && test -f /tmp/chatgpt-analytics-html/report.html && test ! -d /tmp/chatgpt-analytics-html/plots && python3 analyze.py /home/matt/chatgpt-convs --output /tmp/chatgpt-analytics-plots --plots && test -f /tmp/chatgpt-analytics-plots/plots/cumulative_tokens.html && test ! -f /tmp/chatgpt-analytics-plots/report.html`

- [x] Task 4 — `chatgpt_analytics/templates/report.html.j2`
  **What:** Add a visible `Executive Summary` heading above the existing cards;
  add a clearly labeled `Export Content Inventory` section with API-equivalent
  tokens, non-billable recap nodes/tokens, and excluded internal-artifact count;
  render the existing top-10-days insight; and add cumulative token/spend chart
  sections. State that cost cards and model comparisons use only the
  API-equivalent categories. Preserve sortable top-conversation behavior and
  HTML autoescaping.
  **Why:** It makes the accounting policy understandable at the point where users
  interpret totals, without exposing conversation contents or misrepresenting
  internal reasoning as billable API usage.
  **Depends on:** Task 3
  **Verify:** `rg -n 'Executive Summary|Export Content Inventory|Cumulative Token Usage|Cumulative Estimated Spend|Top 10 Days' /tmp/chatgpt-analytics-html/report.html` after a generated report run.

### Tests

- [x] Task 5 — `tests/test_parser_and_analytics.py`
  **What:** Extend parser and analytics fixtures with normal text, multimodal
  string parts, recap text, structured thoughts, malformed content, and missing
  timestamps. Assert recap tokens/counts are placed only in the non-billable
  inventory; thought artifacts are counted but never tokenized for costs; all
  summary/conversation/monthly costs remain unchanged by them; and daily/cumulative
  aggregation is ordered and correct.
  **Why:** The primary risk is silently changing the conservative cost estimate
  while adding big-picture analytics.
  **Depends on:** Tasks 1–2
  **Verify:** `python3 -m pytest tests/test_parser_and_analytics.py -q`

- [x] Task 6 — `tests/test_parser_and_analytics.py`
  **What:** Extend the existing test module with temporary-directory tests for complete CSV headers/row output,
  required report labels and inventory disclosure, cumulative chart generation,
  and the three output modes: default all outputs, `--html` only without a plots
  directory, and `--plots` only without `report.html`. Invoke `analyze.main`
  through patched arguments or a subprocess using a tiny fixture export.
  **Why:** The current three tests do not cover reporting or CLI flag behavior;
  these tests prevent regressions in observable artifacts.
  **Depends on:** Tasks 3–4
  **Verify:** `python3 -m pytest -q`

### Documentation

- [x] Task 7 — `README.md`
  **What:** Use `python3` in executable examples (or document an activated
  environment where `python` is available), document the conservative
  API-equivalent policy, the separate recap/artifact inventory, cumulative plots,
  and precise behavior of output selectors. Keep the pricing caveat prominent.
  **Why:** Users need to understand that dashboard cost is an estimate and that
  the inventory is informational rather than billable usage.
  **Depends on:** Tasks 3–4
  **Verify:** `rg -n 'python3|reasoning_recap|API-equivalent|--plots|cumulative' README.md`

## Demo Cases

### Conservative cost accounting and export-content inventory

- **Normal user and assistant text** — run `python3 analyze.py fixture.json --output /tmp/report --html --csv` → expect exit status 0; input/output tokens, monthly totals, and configured-model costs include only normal visible text.
- **Assistant recap text** — run the same command with a fixture containing `content_type: reasoning_recap` and a string `content` → expect exit status 0; the HTML inventory shows recap nodes/tokens, while summary and monthly estimated cost are unchanged from the normal-text fixture.
- **Structured thought artifact** — run the same command with a fixture containing `content_type: thoughts` and structured `thoughts` data → expect exit status 0; the HTML inventory shows an excluded-artifact count and no structured thought text appears in output files.
- **Malformed content node** — run the same command with a role node whose content has an unexpected shape → expect exit status 0; the node is skipped or categorized safely and report generation completes.

### Output-selection contract

- **HTML-only mode** — `python3 analyze.py fixture.json --output /tmp/html-only --html` → expect exit status 0; `/tmp/html-only/report.html` exists and `/tmp/html-only/plots` does not.
- **Plots-only mode** — `python3 analyze.py fixture.json --output /tmp/plots-only --plots` → expect exit status 0; standalone Plotly HTML files, including cumulative charts, exist and `report.html` does not.
- **Default mode** — `python3 analyze.py fixture.json --output /tmp/default` → expect exit status 0; report, all CSVs, and all standalone plots exist.

## Risks

- **Interpretation risk:** recap text may look like model output. Mitigation:
  keep it outside every cost field, label it non-billable, and document why.
  Accepted with the explicit dashboard disclosure.
- **Export-schema drift:** ChatGPT can add content types or alter nested shapes.
  Mitigation: defensive classification, diagnostic logging, and tests for
  unknown/malformed nodes. Requires ongoing maintenance only if a new content
  type needs a user-facing policy.
- **Browser payload size:** embedding several Plotly charts may make the report
  larger for very large exports. Mitigation: preserve CDN Plotly loading and use
  aggregated daily/monthly rows rather than raw messages. Accepted for an
  offline local report.
