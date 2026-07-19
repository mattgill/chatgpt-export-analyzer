"""Token counting and aggregate metric calculations."""

from __future__ import annotations

from collections import Counter
from datetime import datetime
from statistics import median

import tiktoken

from .models import Conversation, ConversationStats, Message, PricingModel
from .pricing import estimate_cost


class TokenCounter:
    """Counts text with o200k_base, falling back to cl100k_base if needed."""

    def __init__(self) -> None:
        try:
            self.encoding = tiktoken.get_encoding("o200k_base")
        except ValueError:
            self.encoding = tiktoken.get_encoding("cl100k_base")

    def count(self, text: str) -> int:
        """Return the encoded-token length of visible text."""
        return len(self.encoding.encode(text, disallowed_special=()))


def calculate_conversation_stats(
    conversation: Conversation, counter: TokenCounter
) -> ConversationStats:
    """Compute message, turn, and token measures for one conversation."""
    token_counts = [(message, counter.count(message.text)) for message in conversation.messages]
    user = [(message, count) for message, count in token_counts if message.role == "user"]
    assistant = [(message, count) for message, count in token_counts if message.role == "assistant"]
    timestamps = [message.timestamp for message, _ in token_counts if message.timestamp]
    all_counts = [count for _, count in token_counts]
    return ConversationStats(
        conversation=conversation,
        first_message_at=min(timestamps) if timestamps else conversation.created_at,
        last_message_at=max(timestamps) if timestamps else conversation.updated_at,
        user_turns=len(user), assistant_turns=len(assistant),
        input_tokens=sum(count for _, count in user),
        output_tokens=sum(count for _, count in assistant),
        average_message_tokens=sum(all_counts) / len(all_counts) if all_counts else 0.0,
        largest_message_tokens=max(all_counts, default=0),
    )


def summary_rows(stats: list[ConversationStats], pricing: list[PricingModel]) -> list[dict[str, object]]:
    """Build cost comparison rows for each configured model."""
    input_tokens = sum(item.input_tokens for item in stats)
    output_tokens = sum(item.output_tokens for item in stats)
    return [{
        "model": model.name, "input_tokens": input_tokens, "output_tokens": output_tokens,
        "total_tokens": input_tokens + output_tokens,
        "estimated_cost": estimate_cost(input_tokens, output_tokens, model),
    } for model in pricing]


def conversation_rows(stats: list[ConversationStats], pricing: list[PricingModel]) -> list[dict[str, object]]:
    """Build sortable, flat conversation records including all model costs."""
    primary = pricing[0] if pricing else None
    rows: list[dict[str, object]] = []
    for item in stats:
        row: dict[str, object] = {
            "conversation_id": item.conversation.identifier, "title": item.conversation.title,
            "first_message_date": format_time(item.first_message_at),
            "last_message_date": format_time(item.last_message_at),
            "user_turns": item.user_turns, "assistant_turns": item.assistant_turns,
            "input_tokens": item.input_tokens, "output_tokens": item.output_tokens,
            "total_tokens": item.total_tokens,
            "average_message_tokens": round(item.average_message_tokens, 2),
            "largest_message_tokens": item.largest_message_tokens,
        }
        for model in pricing:
            row[f"cost_{model.name}"] = estimate_cost(item.input_tokens, item.output_tokens, model)
        row["estimated_cost"] = estimate_cost(item.input_tokens, item.output_tokens, primary) if primary else 0.0
        rows.append(row)
    return sorted(rows, key=lambda row: float(row["estimated_cost"]), reverse=True)


def monthly_rows(stats: list[ConversationStats], pricing: list[PricingModel], counter: TokenCounter | None = None) -> list[dict[str, object]]:
    """Aggregate messages and token counts into calendar months."""
    primary = pricing[0] if pricing else None
    counter = counter or TokenCounter()
    buckets: dict[str, Counter[str]] = {}
    seen_conversations: dict[str, set[str]] = {}
    for item in stats:
        for message in item.conversation.messages:
            if not message.timestamp:
                continue
            month = message.timestamp.strftime("%Y-%m")
            bucket = buckets.setdefault(month, Counter())
            seen_conversations.setdefault(month, set()).add(item.conversation.identifier)
            count = counter.count(message.text)
            bucket["input_tokens" if message.role == "user" else "output_tokens"] += count
            bucket["prompts" if message.role == "user" else "assistant_replies"] += 1
    rows = []
    for month, counts in buckets.items():
        input_tokens, output_tokens = counts["input_tokens"], counts["output_tokens"]
        rows.append({"month": month, "conversations": len(seen_conversations[month]),
                     "prompts": counts["prompts"], "assistant_replies": counts["assistant_replies"],
                     "input_tokens": input_tokens, "output_tokens": output_tokens,
                     "total_tokens": input_tokens + output_tokens,
                     "estimated_cost": estimate_cost(input_tokens, output_tokens, primary) if primary else 0.0})
    return sorted(rows, key=lambda row: str(row["month"]))


def content_inventory(stats: list[ConversationStats], counter: TokenCounter) -> dict[str, int]:
    """Summarize billable text and non-billable export artifacts separately."""
    recap_artifacts = [
        artifact
        for item in stats
        for artifact in item.conversation.artifacts
        if artifact.category == "retained_recap"
    ]
    internal_artifacts = [
        artifact
        for item in stats
        for artifact in item.conversation.artifacts
        if artifact.category == "internal_thought"
    ]
    input_tokens = sum(item.input_tokens for item in stats)
    output_tokens = sum(item.output_tokens for item in stats)
    return {
        "api_input_tokens": input_tokens,
        "api_output_tokens": output_tokens,
        "api_total_tokens": input_tokens + output_tokens,
        "recap_nodes": len(recap_artifacts),
        "recap_tokens": sum(counter.count(artifact.text) for artifact in recap_artifacts if artifact.text),
        "internal_artifact_nodes": len(internal_artifacts),
    }


def reasoning_scenario(
    stats: list[ConversationStats], pricing: list[PricingModel], output_multiplier: float
) -> dict[str, object]:
    """Build a user-supplied hidden-reasoning cost scenario.

    The export does not expose reasoning-token counts. This is intentionally a
    scenario, not an inferred measurement: the multiplier represents additional
    hidden output tokens per visible assistant-output token.
    """
    input_tokens = sum(item.input_tokens for item in stats)
    output_tokens = sum(item.output_tokens for item in stats)
    reasoning_tokens = round(output_tokens * output_multiplier)
    rows = []
    for model in pricing:
        visible_cost = estimate_cost(input_tokens, output_tokens, model)
        scenario_cost = estimate_cost(input_tokens, output_tokens + reasoning_tokens, model)
        rows.append({
            "model": model.name,
            "visible_cost": visible_cost,
            "scenario_cost": scenario_cost,
            "additional_cost": scenario_cost - visible_cost,
        })
    return {
        "output_multiplier": output_multiplier,
        "estimated_reasoning_tokens": reasoning_tokens,
        "rows": rows,
    }


def daily_rows(
    stats: list[ConversationStats], pricing: list[PricingModel], counter: TokenCounter | None = None
) -> list[dict[str, object]]:
    """Aggregate API-equivalent message usage by date with cumulative totals."""
    primary = pricing[0] if pricing else None
    counter = counter or TokenCounter()
    buckets: dict[str, Counter[str]] = {}
    for item in stats:
        for message in item.conversation.messages:
            if not message.timestamp:
                continue
            day = message.timestamp.date().isoformat()
            bucket = buckets.setdefault(day, Counter())
            tokens = counter.count(message.text)
            bucket["input_tokens" if message.role == "user" else "output_tokens"] += tokens
            bucket["prompts" if message.role == "user" else "assistant_replies"] += 1
    rows: list[dict[str, object]] = []
    cumulative_tokens = 0
    cumulative_cost = 0.0
    for day in sorted(buckets):
        counts = buckets[day]
        input_tokens, output_tokens = counts["input_tokens"], counts["output_tokens"]
        total_tokens = input_tokens + output_tokens
        cost = estimate_cost(input_tokens, output_tokens, primary) if primary else 0.0
        cumulative_tokens += total_tokens
        cumulative_cost += cost
        rows.append({
            "day": day, "prompts": counts["prompts"], "assistant_replies": counts["assistant_replies"],
            "input_tokens": input_tokens, "output_tokens": output_tokens, "total_tokens": total_tokens,
            "estimated_cost": cost, "cumulative_tokens": cumulative_tokens,
            "cumulative_estimated_cost": cumulative_cost,
        })
    return rows


def extra_metrics(stats: list[ConversationStats], daily: list[dict[str, object]] | None = None) -> dict[str, object]:
    """Return concise lifetime insights for the HTML dashboard."""
    totals = [item.total_tokens for item in stats]
    messages = [message for item in stats for message in item.conversation.messages]
    daily = daily or []
    longest = max(stats, key=lambda item: item.total_tokens, default=None)
    largest_prompt = max((m for m in messages if m.role == "user"), key=lambda m: len(m.text), default=None)
    largest_reply = max((m for m in messages if m.role == "assistant"), key=lambda m: len(m.text), default=None)
    return {"average_conversation_tokens": sum(totals) / len(totals) if totals else 0,
            "median_conversation_tokens": median(totals) if totals else 0,
            "longest_conversation": longest.conversation.title if longest else "—",
            "longest_prompt_characters": len(largest_prompt.text) if largest_prompt else 0,
            "longest_reply_characters": len(largest_reply.text) if largest_reply else 0,
            "top_days": sorted(daily, key=lambda row: int(row["total_tokens"]), reverse=True)[:10]}


def format_time(value: datetime | None) -> str:
    """Format timestamps consistently for CSV and HTML."""
    return value.isoformat() if value else ""
