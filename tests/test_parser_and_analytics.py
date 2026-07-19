import json

from analyze import main
from chatgpt_analytics.analytics import (
    TokenCounter, calculate_conversation_stats, content_inventory, daily_rows,
    monthly_rows, reasoning_scenario, summary_rows,
)
from chatgpt_analytics.parser import load_export_parts, parse_conversation
from chatgpt_analytics.pricing import load_pricing


def sample_raw():
    return {"id": "one", "title": "Example", "create_time": 1704067200, "mapping": {
        "user": {"message": {"author": {"role": "user"}, "create_time": 1704067200, "content": {"parts": ["Hello"]}}},
        "assistant": {"message": {"author": {"role": "assistant"}, "create_time": 1704067210, "content": {"parts": ["Hi there"]}, "metadata": {"model_slug": "gpt"}}},
        "system": {"message": {"author": {"role": "system"}, "content": {"parts": ["ignore"]}}},
    }}


def test_parser_ignores_system_and_stats_roles():
    conversation = parse_conversation(sample_raw())
    assert [message.role for message in conversation.messages] == ["user", "assistant"]
    stats = calculate_conversation_stats(conversation, TokenCounter())
    assert stats.user_turns == stats.assistant_turns == 1
    assert stats.total_tokens > 0


def test_monthly_aggregation():
    conversation = parse_conversation(sample_raw())
    stats = [calculate_conversation_stats(conversation, TokenCounter())]
    rows = monthly_rows(stats, load_pricing(), TokenCounter())
    assert rows[0]["month"] == "2024-01"
    assert rows[0]["conversations"] == 1


def test_numbered_export_part_loads_all_siblings(tmp_path):
    for index in range(2):
        payload = sample_raw()
        payload["id"] = str(index)
        (tmp_path / f"conversations-{index:03}.json").write_text(json.dumps([payload]))
    conversations = load_export_parts(tmp_path / "conversations-000.json")
    assert [item.identifier for item in conversations] == ["0", "1"]


def test_non_billable_export_content_does_not_change_api_costs():
    raw = sample_raw()
    raw["mapping"].update({
        "multimodal": {"message": {"author": {"role": "user"}, "create_time": 1704067220,
                                  "content": {"content_type": "multimodal_text", "parts": ["Describe this image"]}}},
        "recap": {"message": {"author": {"role": "assistant"}, "create_time": 1704067230,
                              "content": {"content_type": "reasoning_recap", "content": "A private recap"}}},
        "thought": {"message": {"author": {"role": "assistant"}, "create_time": 1704067240,
                                "content": {"content_type": "thoughts", "thoughts": [{"text": "private"}]}}},
        "malformed": {"message": {"author": {"role": "assistant"}, "content": {"content_type": "reasoning_recap", "content": []}}},
    })
    counter = TokenCounter()
    stats = [calculate_conversation_stats(parse_conversation(raw), counter)]
    inventory = content_inventory(stats, counter)

    assert stats[0].user_turns == 2
    assert inventory["recap_nodes"] == 1
    assert inventory["recap_tokens"] == counter.count("A private recap")
    assert inventory["internal_artifact_nodes"] == 1
    assert summary_rows(stats, load_pricing())[0]["total_tokens"] == stats[0].total_tokens
    assert monthly_rows(stats, load_pricing(), counter)[0]["total_tokens"] == stats[0].total_tokens


def test_daily_rows_are_sorted_and_cumulative():
    raw = sample_raw()
    raw["mapping"]["later"] = {"message": {"author": {"role": "user"}, "create_time": 1704153600,
                                           "content": {"parts": ["Tomorrow"]}}}
    stats = [calculate_conversation_stats(parse_conversation(raw), TokenCounter())]
    rows = daily_rows(stats, load_pricing(), TokenCounter())

    assert [row["day"] for row in rows] == ["2024-01-01", "2024-01-02"]
    assert rows[-1]["cumulative_tokens"] == stats[0].total_tokens
    assert rows[-1]["cumulative_estimated_cost"] > 0


def test_reasoning_scenario_is_explicit_and_adds_only_output_cost():
    stats = [calculate_conversation_stats(parse_conversation(sample_raw()), TokenCounter())]
    scenario = reasoning_scenario(stats, load_pricing(), 1.0)

    assert scenario["estimated_reasoning_tokens"] == stats[0].output_tokens
    assert scenario["rows"][0]["scenario_cost"] > scenario["rows"][0]["visible_cost"]


def test_cli_output_modes_and_report_contract(tmp_path, monkeypatch):
    export = tmp_path / "conversations.json"
    export.write_text(json.dumps([sample_raw()]))

    default_output = tmp_path / "default"
    monkeypatch.setattr("sys.argv", ["analyze.py", str(export), "--output", str(default_output)])
    assert main() == 0
    assert (default_output / "summary.csv").read_text().startswith("model,input_tokens,output_tokens")
    assert (default_output / "plots" / "cumulative_tokens.html").is_file()
    report = (default_output / "report.html").read_text()
    for label in ("Executive Summary", "Export Content Inventory", "Cumulative Token Usage", "Top 10 Days", "GPT-5.6 Sol"):
        assert label in report

    scenario_output = tmp_path / "reasoning-scenario"
    monkeypatch.setattr("sys.argv", [
        "analyze.py", str(export), "--output", str(scenario_output), "--html",
        "--reasoning-output-multiplier", "1.0",
    ])
    assert main() == 0
    assert "What-if Reasoning Overhead" in (scenario_output / "report.html").read_text()

    html_output = tmp_path / "html-only"
    monkeypatch.setattr("sys.argv", ["analyze.py", str(export), "--output", str(html_output), "--html"])
    assert main() == 0
    assert (html_output / "report.html").is_file()
    assert not (html_output / "plots").exists()

    plots_output = tmp_path / "plots-only"
    monkeypatch.setattr("sys.argv", ["analyze.py", str(export), "--output", str(plots_output), "--plots"])
    assert main() == 0
    assert (plots_output / "plots" / "cumulative_cost.html").is_file()
    assert not (plots_output / "report.html").exists()
