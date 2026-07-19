# ChatGPT Export Analytics Tool

Write a production-quality Python 3.13 application that analyzes a ChatGPT export (`conversations.json`) and estimates API token usage and cost.

The code should be clean, modular, type hinted, documented, and suitable for a GitHub repository.

---

## Goals

Analyze an exported `conversations.json` from ChatGPT and generate:

* Overall token usage
* Monthly token usage
* Per-conversation statistics
* Estimated API cost across multiple model families
* CSV exports
* Interactive HTML dashboard

The application should be completely offline. No OpenAI API calls.

---

## Dependencies

Use:

* tiktoken
* pandas
* plotly
* jinja2
* tqdm
* python-dateutil

Do not use obscure libraries.

---

## CLI

Use argparse.

Example:

```bash
python analyze.py conversations.json
```

Optional arguments:

```
--output reports/
--pricing pricing.json
--html
--csv
--plots
--summary
```

Default should generate everything.

---

## Parsing

Properly parse ChatGPT export format.

Traverse every conversation.

Handle missing or malformed nodes gracefully.

Extract:

* conversation title
* create/update time
* every message
* author role
* message text
* model (when available)
* metadata if present

Ignore empty/system artifacts that contain no user-visible text.

---

## Token estimation

Use tiktoken.

Prefer o200k_base.

Estimate:

* input tokens
* output tokens

Treat

role=user

as API input.

Treat

role=assistant

as API output.

Ignore tool artifacts unless they contain visible text.

---

## Per-conversation metrics

Generate:

* title
* first message date
* last message date
* number of user turns
* number of assistant turns
* input tokens
* output tokens
* total tokens
* average message size
* largest message
* estimated cost by model

Sort conversations by total estimated cost.

---

## Monthly metrics

Aggregate by month.

For every month calculate

* conversations
* prompts
* assistant replies
* input tokens
* output tokens
* total tokens
* estimated API cost

---

## Pricing

Support a pricing.json file.

If none supplied, include defaults.

Structure:

```json
{
  "GPT-5": {
    "input": 1.25,
    "output": 10.0
  },
  "GPT-5 Mini": {
    "input": 0.25,
    "output": 2.0
  },
  "Claude Sonnet": {
    "input": ...,
    "output": ...
  },
  "Claude Opus": {
    "input": ...,
    "output": ...
  },
  "Gemini": {
    "input": ...,
    "output": ...
  }
}
```

Values are dollars per million tokens.

The code should automatically calculate estimated cost for every configured model.

Adding a new model should only require editing pricing.json.

---

## CSV outputs

Produce:

summary.csv

Columns:

* model
* input tokens
* output tokens
* total tokens
* estimated cost

monthly.csv

conversation_stats.csv

largest_conversations.csv

top_100_conversations.csv

---

## HTML report

Generate a polished dashboard.

Sections:

# Executive Summary

Display

* total conversations
* total prompts
* total assistant replies
* total input tokens
* total output tokens
* lifetime estimated cost

---

# Cost by Model

Table comparing every configured model.

---

# Monthly Spending

Interactive Plotly chart.

---

# Monthly Token Usage

Stacked bar chart

Input vs Output.

---

# Top Conversations

Sortable table.

Columns:

Title

Date

Tokens

Estimated Cost

Turns

---

# Conversation Size Distribution

Histogram.

---

# Monthly Heatmap

Calendar-style heatmap of token usage.

---

## Nice-to-have analytics

Calculate:

* average conversation length
* median conversation length
* longest conversation
* longest assistant reply
* longest prompt
* top 10 days
* busiest month
* cumulative token graph
* cumulative spend graph

---

## Output directory

Generate

```
reports/

    report.html

    summary.csv

    monthly.csv

    conversation_stats.csv

    top_100_conversations.csv

    plots/

        monthly_cost.html

        monthly_tokens.html

        histogram.html
```

Create directories automatically.

---

## Code quality

Requirements:

* object-oriented where appropriate
* dataclasses for models
* pathlib throughout
* logging
* graceful error handling
* progress bar
* unit-test-friendly architecture
* comments explaining assumptions
* functions under ~50 lines when practical

---

## README

Generate a README.md explaining:

* installation
* dependencies
* usage
* assumptions
* limitations
* pricing configuration
* sample screenshots placeholder

---

The final result should feel like a polished open-source analytics tool rather than a quick script.
