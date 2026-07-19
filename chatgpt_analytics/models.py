"""Domain models shared by the analytics pipeline."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass(frozen=True)
class Message:
    """A visible message extracted from one export node."""

    conversation_id: str
    node_id: str
    role: str
    text: str
    timestamp: datetime | None
    model: str | None = None
    metadata: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class ExportArtifact:
    """Non-billable content retained in an export node.

    Artifact payloads are deliberately not retained. A recap's readable text is
    kept only for aggregate token estimation; structured internal thoughts are
    represented by metadata alone.
    """

    conversation_id: str
    node_id: str
    role: str
    category: str
    content_type: str
    timestamp: datetime | None
    text: str | None = None


@dataclass(frozen=True)
class Conversation:
    """A ChatGPT conversation and its visible messages."""

    identifier: str
    title: str
    created_at: datetime | None
    updated_at: datetime | None
    messages: tuple[Message, ...]
    artifacts: tuple[ExportArtifact, ...] = ()


@dataclass(frozen=True)
class PricingModel:
    """Per-million-token API pricing."""

    name: str
    input_per_million: float
    output_per_million: float


@dataclass(frozen=True)
class ConversationStats:
    """Computed, token-based statistics for a conversation."""

    conversation: Conversation
    first_message_at: datetime | None
    last_message_at: datetime | None
    user_turns: int
    assistant_turns: int
    input_tokens: int
    output_tokens: int
    average_message_tokens: float
    largest_message_tokens: int

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens
