"""CSV, Plotly, and Jinja report output."""

from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from jinja2 import Environment, PackageLoader, select_autoescape

LOGGER = logging.getLogger(__name__)


def write_csvs(output: Path, summary: list[dict[str, object]], monthly: list[dict[str, object]],
               conversations: list[dict[str, object]]) -> None:
    """Write all requested machine-readable tables."""
    _csv(output / "summary.csv", summary)
    _csv(output / "monthly.csv", monthly)
    _csv(output / "conversation_stats.csv", conversations)
    _csv(output / "largest_conversations.csv", conversations[:20])
    _csv(output / "top_100_conversations.csv", conversations[:100])


def _csv(path: Path, rows: list[dict[str, object]]) -> None:
    pd.DataFrame(rows).to_csv(path, index=False)


def build_plots(
    monthly: list[dict[str, object]], conversations: list[dict[str, object]],
    daily: list[dict[str, object]], output: Path | None = None,
) -> dict[str, str]:
    """Build embeddable figures and optionally persist standalone Plotly files."""
    monthly_frame = pd.DataFrame(monthly)
    if monthly_frame.empty:
        monthly_frame = pd.DataFrame(columns=["month", "input_tokens", "output_tokens", "estimated_cost"])
    cost = px.line(monthly_frame, x="month", y="estimated_cost", markers=True, title="Monthly Estimated Spend")
    tokens = px.bar(monthly_frame, x="month", y=["input_tokens", "output_tokens"], barmode="stack", title="Monthly Token Usage")
    conversation_frame = pd.DataFrame(conversations or [{"total_tokens": 0}])
    histogram = px.histogram(conversation_frame, x="total_tokens", nbins=30, title="Conversation Size Distribution")
    heatmap = _heatmap(monthly_frame)
    daily_frame = pd.DataFrame(daily)
    if daily_frame.empty:
        daily_frame = pd.DataFrame(columns=["day", "cumulative_tokens", "cumulative_estimated_cost"])
    cumulative_tokens = px.line(daily_frame, x="day", y="cumulative_tokens", title="Cumulative Token Usage")
    cumulative_cost = px.line(
        daily_frame, x="day", y="cumulative_estimated_cost", title="Cumulative Estimated Spend"
    )
    figures = {
        "monthly_cost": cost, "monthly_tokens": tokens, "histogram": histogram, "heatmap": heatmap,
        "cumulative_tokens": cumulative_tokens, "cumulative_cost": cumulative_cost,
    }
    if output is not None:
        plots_dir = output / "plots"
        plots_dir.mkdir(exist_ok=True)
        for name, figure in figures.items():
            figure.write_html(plots_dir / f"{name}.html", include_plotlyjs="cdn")
    return {name: figure.to_html(full_html=False, include_plotlyjs="cdn") for name, figure in figures.items()}


def _heatmap(monthly: pd.DataFrame) -> go.Figure:
    """Render a compact month-by-year token usage heatmap."""
    if monthly.empty:
        return go.Figure().update_layout(title="Monthly Token Usage Heatmap")
    frame = monthly.copy()
    frame["year"] = frame["month"].str[:4]
    frame["month_name"] = frame["month"].str[5:]
    pivot = frame.pivot(index="year", columns="month_name", values="total_tokens").fillna(0)
    return px.imshow(pivot, aspect="auto", title="Monthly Token Usage Heatmap", labels={"x": "Month", "y": "Year", "color": "Tokens"})


def write_html(output: Path, summary: list[dict[str, object]], monthly: list[dict[str, object]],
               conversations: list[dict[str, object]], metrics: dict[str, object],
               inventory: dict[str, int], reasoning_scenario: dict[str, object] | None,
               charts: dict[str, str]) -> None:
    """Render the self-contained dashboard shell with interactive figures."""
    lifetime = summary[0]["estimated_cost"] if summary else 0
    primary_model = str(summary[0]["model"]) if summary else "configured model"
    totals = {"conversations": len(conversations), "prompts": sum(int(r["user_turns"]) for r in conversations),
              "replies": sum(int(r["assistant_turns"]) for r in conversations),
              "input_tokens": sum(int(r["input_tokens"]) for r in conversations),
              "output_tokens": sum(int(r["output_tokens"]) for r in conversations), "cost": lifetime}
    environment = Environment(loader=PackageLoader("chatgpt_analytics", "templates"), autoescape=select_autoescape())
    html = environment.get_template("report.html.j2").render(
        totals=totals, summary=summary, monthly=monthly, conversations=conversations[:100], metrics=metrics,
        inventory=inventory, reasoning_scenario=reasoning_scenario, charts=charts, primary_model=primary_model,
    )
    (output / "report.html").write_text(html, encoding="utf-8")
    LOGGER.info("Wrote HTML report to %s", output / "report.html")
