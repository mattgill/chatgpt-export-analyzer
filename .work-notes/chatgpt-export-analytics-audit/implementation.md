# Implementation — chatgpt export analytics audit remediation

## What was built

The analyzer now separates conservative API-equivalent accounting from the
broader content retained in a ChatGPT export. Normal visible user and assistant
text continues to drive input/output tokens, all cost estimates, monthly totals,
and conversation rankings. Assistant reasoning recaps are retained only for a
separate non-billable dashboard inventory, while structured internal thoughts
are counted as excluded artifacts without storing or rendering their payloads.

The dashboard now labels its executive summary, explains the accounting
boundary, shows the content inventory and top usage days, and includes
cumulative token and spend charts. Standalone Plotly files are emitted only for
`--plots`; HTML-only reports embed their charts without creating `plots/`.

## Key decisions

- API cost remains based only on ordinary visible prompt/reply text.
- `reasoning_recap` is contextual, non-billable text; `thoughts` is a counted
  internal artifact and is never surfaced verbatim.
- CSV schemas remain API-equivalent output; the richer inventory is presented in
  HTML to avoid mixing incomparable figures with billing data.
- `python3` is used in documentation because this environment has no `python`
  executable.

## Tiers changed

- Parser and model: classified recap and thought export nodes defensively.
- Analytics: added content inventory and daily/cumulative aggregates.
- CLI and reporting: separated plot persistence from chart embedding and added
  dashboard sections/charts.
- Tests: covered accounting boundaries, report contract, and all output modes.
- Documentation: clarified estimates, inventory, selectors, and usage.

## Deviations from plan

None. The repository is not a Git worktree, so no branch, staging, or commit
operation was possible.

## How to verify

```bash
python3 -m pytest -q
python3 analyze.py /home/matt/chatgpt-convs --output /tmp/chatgpt-analytics-final
```

Confirm that the output includes `report.html`, all CSV files, and plots for
monthly cost/tokens, histogram, heatmap, cumulative tokens, and cumulative
cost. For selector behavior, run `--html` and confirm no `plots/` directory is
created; run `--plots` and confirm no `report.html` is created.
