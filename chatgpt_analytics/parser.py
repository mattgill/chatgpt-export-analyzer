"""Defensive parser for the JSON format produced by ChatGPT exports."""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dateutil.parser import isoparse

from .models import Conversation, ExportArtifact, Message

LOGGER = logging.getLogger(__name__)


def load_conversations(path: Path) -> list[Conversation]:
    """Load one export file, skipping malformed conversations where possible."""
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Could not read valid JSON from {path}: {exc}") from exc
    if not isinstance(payload, list):
        raise ValueError("conversations.json must contain a JSON list")
    conversations: list[Conversation] = []
    for index, raw in enumerate(payload):
        if not isinstance(raw, dict):
            LOGGER.warning("Skipping non-object conversation at index %d", index)
            continue
        try:
            conversations.append(parse_conversation(raw, index))
        except (TypeError, ValueError) as exc:
            LOGGER.warning("Skipping malformed conversation %d: %s", index, exc)
    return conversations


def load_export_parts(path: Path) -> list[Conversation]:
    """Load a normal export, a numbered export part, or a directory of parts.

    Selecting any ``conversations-000.json``-style shard automatically includes
    its siblings, which is how large ChatGPT exports are commonly split.
    """
    if path.is_dir():
        paths = sorted(path.glob("conversations*.json"))
    elif re.fullmatch(r"conversations-\d+\.json", path.name):
        paths = sorted(path.parent.glob("conversations-*.json"))
    else:
        paths = [path]
    if not paths:
        raise ValueError(f"No conversations JSON files found at {path}")
    conversations: list[Conversation] = []
    seen_ids: set[str] = set()
    for export_path in paths:
        LOGGER.info("Loading export part %s", export_path)
        for conversation in load_conversations(export_path):
            if conversation.identifier in seen_ids:
                LOGGER.warning("Skipping duplicate conversation ID %s", conversation.identifier)
                continue
            seen_ids.add(conversation.identifier)
            conversations.append(conversation)
    return conversations


def parse_conversation(raw: dict[str, Any], index: int = 0) -> Conversation:
    """Parse all visible message nodes in a single exported conversation."""
    identifier = str(raw.get("id") or raw.get("conversation_id") or index)
    title = str(raw.get("title") or "Untitled conversation")
    created_at = parse_timestamp(raw.get("create_time"))
    updated_at = parse_timestamp(raw.get("update_time"))
    mapping = raw.get("mapping")
    if not isinstance(mapping, dict):
        mapping = {}
    messages: list[Message] = []
    artifacts: list[ExportArtifact] = []
    for node_id, node in mapping.items():
        if not isinstance(node, dict):
            continue
        message = parse_node(node_id, node, identifier, created_at)
        if message is not None:
            messages.append(message)
        artifact = parse_artifact(node_id, node, identifier, created_at)
        if artifact is not None:
            artifacts.append(artifact)
    messages.sort(key=lambda item: (item.timestamp is None, item.timestamp or datetime.max.replace(tzinfo=timezone.utc)))
    artifacts.sort(key=lambda item: (item.timestamp is None, item.timestamp or datetime.max.replace(tzinfo=timezone.utc)))
    return Conversation(identifier, title, created_at, updated_at, tuple(messages), tuple(artifacts))


def parse_node(
    node_id: object, node: dict[str, Any], conversation_id: str, fallback_time: datetime | None
) -> Message | None:
    """Return a user/assistant node only when it contains visible text."""
    raw_message = node.get("message")
    if not isinstance(raw_message, dict):
        return None
    author = raw_message.get("author")
    role = author.get("role") if isinstance(author, dict) else None
    if role not in {"user", "assistant"}:
        return None
    content = raw_message.get("content")
    text = extract_text(content)
    if not text:
        return None
    if isinstance(content, dict) and content.get("content_type") not in {None, "text", "multimodal_text"}:
        return None
    metadata = raw_message.get("metadata")
    if not isinstance(metadata, dict):
        metadata = {}
    model = metadata.get("model_slug") or raw_message.get("model_slug")
    return Message(
        conversation_id=conversation_id,
        node_id=str(node_id),
        role=role,
        text=text,
        timestamp=parse_timestamp(raw_message.get("create_time")) or fallback_time,
        model=str(model) if model else None,
        metadata=metadata,
    )


def parse_artifact(
    node_id: object, node: dict[str, Any], conversation_id: str, fallback_time: datetime | None
) -> ExportArtifact | None:
    """Classify non-billable export content without retaining private payloads."""
    raw_message = node.get("message")
    if not isinstance(raw_message, dict):
        return None
    author = raw_message.get("author")
    role = author.get("role") if isinstance(author, dict) else None
    content = raw_message.get("content")
    if role not in {"user", "assistant"} or not isinstance(content, dict):
        return None
    content_type = content.get("content_type")
    timestamp = parse_timestamp(raw_message.get("create_time")) or fallback_time
    if role == "assistant" and content_type == "reasoning_recap":
        recap = content.get("content")
        if recap is not None and not isinstance(recap, str):
            LOGGER.debug("Ignoring non-string reasoning recap in node %s", node_id)
            return None
        return ExportArtifact(
            conversation_id, str(node_id), role, "retained_recap", content_type, timestamp,
            recap.strip() if isinstance(recap, str) and recap.strip() else None,
        )
    if content_type == "thoughts":
        return ExportArtifact(conversation_id, str(node_id), role, "internal_thought", content_type, timestamp)
    return None


def extract_text(content: object) -> str:
    """Extract readable text from standard export content shapes."""
    if not isinstance(content, dict):
        return ""
    parts = content.get("parts")
    if isinstance(parts, list):
        return "\n".join(part for part in parts if isinstance(part, str)).strip()
    text = content.get("text")
    return text.strip() if isinstance(text, str) else ""


def parse_timestamp(value: object) -> datetime | None:
    """Accept the epoch and ISO timestamp forms seen in exports."""
    try:
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(value, tz=timezone.utc)
        if isinstance(value, str) and value.strip():
            parsed = isoparse(value)
            return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed
    except (OverflowError, TypeError, ValueError):
        return None
    return None
