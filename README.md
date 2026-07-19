# ChatGPT Export Analytics Tool

An offline Python 3.13 CLI that analyzes a ChatGPT `conversations.json` export, estimates tokens with `tiktoken`, and produces CSV and interactive HTML reports. It never calls an OpenAI API.

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

Large exports split into `conversations-000.json`, `conversations-001.json`, and so on are supported automatically: pass any one part (usually `conversations-000.json`) or the directory containing all parts. The tool loads every matching part once.

By default it creates `reports/report.html`, five CSV tables, and Plotly charts under `reports/plots/`. Use `--output my-reports` or `--pricing pricing.json` to customize a run. Supplying one or more output selectors limits output to those selectors: `--html` creates only the dashboard, `--csv` creates only CSV files, `--plots` creates only standalone Plotly HTML files, and `--summary` prints only the terminal summary. Add `--verbose` for parser diagnostics.

To explore a declared (not measured) reasoning-overhead scenario in the HTML report, add `--reasoning-output-multiplier FACTOR`. For example, `--reasoning-output-multiplier 1.0` assumes one additional hidden reasoning token for every visible assistant-output token. The export cannot verify this assumption, so no multiplier is applied by default.

## Pricing

`pricing.json` contains dollars per million input and output tokens. Supplying `--pricing FILE` replaces the built-in defaults. Add a model by adding an object with `input` and `output` values; every configured model appears in `summary.csv` and the dashboard.

## View a report locally

After generating `reports/report.html`, start the local static server:

```bash
python3 serve.py
```

Open [http://127.0.0.1:8761/report.html](http://127.0.0.1:8761/report.html). The server binds to `0.0.0.0` by default so it is reachable outside the terminal; use `--host 127.0.0.1` to restrict it to this machine.

## Accounting assumptions and limitations

The tool estimates API-equivalent usage with `o200k_base` (with a compatible fallback): visible `user` text is input and visible `assistant` text is output. The dashboard's costs, monthly metrics, CSV token columns, and conversation rankings use only those categories.

The HTML **Export Content Inventory** also shows broader export context without changing spend estimates. It counts `reasoning_recap` text as non-billable retained content and reports structured `thoughts` as excluded internal artifacts; neither is added to API-equivalent tokens or cost. This makes the boundary visible without treating platform-internal reasoning as billable API output.

The dashboard includes monthly and cumulative token/spend charts, a size histogram, a monthly heatmap, top conversation table, and top token-usage days. It does **not** account for reasoning tokens, internal prompts, tool calls, attachments, cached input, or message-formatting overhead: those details are unavailable or not comparable to API billing in a ChatGPT export. Every result is therefore an estimate rather than a billing record. Export histories can contain branches; this tool analyzes every visible node in the exported mapping. Default prices are point-in-time examples and should be reviewed before making purchasing decisions.

## Screenshots

_Add a screenshot of `reports/report.html` here._
