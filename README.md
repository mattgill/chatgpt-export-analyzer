# ChatGPT Export Analytics Tool

A local Python CLI that analyzes a ChatGPT `conversations.json` export, estimates tokens with `tiktoken`, and produces CSV and interactive HTML reports. It does not call an OpenAI API or upload export data.

## Requirements

- Python 3.13 or later
- A ChatGPT data export containing `conversations.json` (or numbered `conversations-000.json`-style parts)

## Install

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Usage

Export your ChatGPT data, locate `conversations.json`, then run:

```bash
python3 analyze.py /path/to/conversations.json
```

Large exports split into `conversations-000.json`, `conversations-001.json`, and so on are supported automatically: pass any one part (usually `conversations-000.json`) or the directory containing all parts. The tool loads matching parts once and skips duplicate conversation IDs.

By default it prints a terminal summary and creates:

- `reports/report.html` — interactive dashboard
- `reports/summary.csv`, `monthly.csv`, `conversation_stats.csv`, `largest_conversations.csv`, and `top_100_conversations.csv`
- `reports/plots/` — standalone Plotly HTML charts

Use `--output my-reports` or `--pricing pricing.json` to customize a run. Supplying one or more output selectors limits a run to those selectors: `--html` creates only the dashboard, `--csv` creates only CSV files, `--plots` creates only standalone Plotly HTML files, and `--summary` prints only the terminal summary. Add `--verbose` for parser diagnostics.

To explore a declared (not measured) reasoning-overhead scenario in the HTML report, add `--reasoning-output-multiplier FACTOR`. For example, `--reasoning-output-multiplier 1.0` assumes one additional hidden reasoning token for every visible assistant-output token. The export cannot verify this assumption, so no multiplier is applied by default.

## Pricing

`pricing.json` contains US dollars per million input and output tokens. Supplying `--pricing FILE` replaces the built-in illustrative defaults. Add a model by adding an object with `input` and `output` values; every configured model appears in `summary.csv` and the dashboard. Review and update rates before using the estimates for purchasing decisions.

## View a report locally

After generating `reports/report.html`, start the local static server:

```bash
python3 serve.py
```

Open [http://127.0.0.1:8761/report.html](http://127.0.0.1:8761/report.html). The server binds to `0.0.0.0` by default so it is reachable outside the terminal; use `--host 127.0.0.1` to restrict it to this machine.

## Accounting assumptions and limitations

The tool estimates API-equivalent usage with `o200k_base` (falling back to `cl100k_base` if unavailable): visible `user` text is input and visible `assistant` text is output. The dashboard's costs, monthly metrics, CSV token columns, and conversation rankings use only those categories.

The HTML **Export Content Inventory** also shows broader export context without changing spend estimates. It counts `reasoning_recap` text as non-billable retained content and reports structured `thoughts` as excluded internal artifacts; neither is added to API-equivalent tokens or cost. This makes the boundary visible without treating platform-internal reasoning as billable API output.

The dashboard includes monthly and cumulative token/spend charts, a size histogram, a monthly heatmap, a top-conversations table, and top token-usage days. It does **not** account for reasoning tokens, internal prompts, tool calls, attachments, cached input, or message-formatting overhead: those details are unavailable or not comparable to API billing in a ChatGPT export. Every result is therefore an estimate rather than a billing record. Export histories can contain branches; this tool analyzes every visible user and assistant node in the exported mapping.
