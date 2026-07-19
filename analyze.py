#!/usr/bin/env python3
"""Analyze a local ChatGPT conversations.json export without network calls."""

from __future__ import annotations

import argparse
import logging
from pathlib import Path

from tqdm import tqdm

from chatgpt_analytics.analytics import (
    TokenCounter, calculate_conversation_stats, content_inventory, conversation_rows,
    daily_rows, extra_metrics, monthly_rows, reasoning_scenario, summary_rows,
)
from chatgpt_analytics.parser import load_export_parts
from chatgpt_analytics.pricing import load_pricing
from chatgpt_analytics.reporting import build_plots, write_csvs, write_html


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create offline token and cost analytics from a ChatGPT export.")
    parser.add_argument("export", type=Path, help="Export JSON file, numbered part, or directory")
    parser.add_argument("--output", type=Path, default=Path("reports"), help="Output directory (default: reports)")
    parser.add_argument("--pricing", type=Path, help="Optional JSON pricing configuration")
    parser.add_argument("--html", action="store_true", help="Generate report.html")
    parser.add_argument("--csv", action="store_true", help="Generate CSV files")
    parser.add_argument("--plots", action="store_true", help="Generate standalone Plotly HTML files")
    parser.add_argument("--summary", action="store_true", help="Print a terminal summary")
    parser.add_argument(
        "--reasoning-output-multiplier",
        type=float,
        help="What-if hidden reasoning tokens per visible assistant-output token (must be non-negative)",
    )
    parser.add_argument("--verbose", action="store_true", help="Show diagnostic logging")
    return parser.parse_args()


def main() -> int:
    args = arguments()
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(levelname)s: %(message)s")
    if args.reasoning_output_multiplier is not None and args.reasoning_output_multiplier < 0:
        logging.error("--reasoning-output-multiplier must be non-negative")
        return 2
    requested = any((args.html, args.csv, args.plots, args.summary))
    make_html, make_csv, make_plots, print_summary = (args.html, args.csv, args.plots, args.summary) if requested else (True, True, True, True)
    try:
        conversations = load_export_parts(args.export)
        pricing = load_pricing(args.pricing)
    except ValueError as exc:
        logging.error("%s", exc)
        return 2
    counter = TokenCounter()
    stats = [calculate_conversation_stats(item, counter) for item in tqdm(conversations, desc="Counting tokens")]
    summary = summary_rows(stats, pricing)
    rows = conversation_rows(stats, pricing)
    monthly = monthly_rows(stats, pricing, counter)
    daily = daily_rows(stats, pricing, counter)
    inventory = content_inventory(stats, counter)
    scenario = (
        reasoning_scenario(stats, pricing, args.reasoning_output_multiplier)
        if args.reasoning_output_multiplier is not None else None
    )
    args.output.mkdir(parents=True, exist_ok=True)
    if make_csv:
        write_csvs(args.output, summary, monthly, rows)
    charts = build_plots(monthly, rows, daily, args.output if make_plots else None) if make_html or make_plots else {}
    if make_html:
        write_html(args.output, summary, monthly, rows, extra_metrics(stats, daily), inventory, scenario, charts)
    if print_summary:
        total = summary[0] if summary else {"total_tokens": 0, "estimated_cost": 0, "model": "—"}
        print(f"Conversations: {len(stats):,}\nTokens: {total['total_tokens']:,}\nEstimated {total['model']} cost: ${total['estimated_cost']:.2f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
