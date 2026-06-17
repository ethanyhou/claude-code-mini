# claude-code-mini

A minimal, learning-focused reimplementation of [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — an AI coding agent that runs in the terminal and can read, write, and edit files, search code, and execute shell commands.

Built to understand how agentic tool-use loops work under the hood.

## How it works

The agent follows a simple agentic loop:

1. User sends a message via CLI
2. The `Agent` class sends the message (plus full conversation history) to Claude
3. Claude responds — either with text or tool-use requests
4. Tool calls are executed locally (file I/O, shell, grep, etc.) and results are fed back to Claude
5. The loop continues until Claude returns a final text response with no pending tool calls

```
User prompt → Claude API → tool_use? → execute tool → feed result back → repeat
                                ↓ no
                         final response
```

## Tools

| Tool | Description |
|------|-------------|
| `read_file` | Read a file and return its content with line numbers |
| `write_file` | Create or overwrite a file |
| `edit_file` | Replace an exact string in a file (like a surgical patch) |
| `insert_into_file` | Insert content at a specific line number |
| `list_files` | List files matching a glob pattern |
| `grep_search` | Search for a regex pattern across files |
| `run_shell` | Execute an arbitrary shell command |

## Project structure

```
src/
  agent.ts   — Agent class: agentic loop, message history, tool dispatch
  tools.ts   — Tool definitions (Anthropic schema) + implementations
  cli.ts     — CLI entry point: reads prompt from argv and runs the agent
  hello.ts   — Simple multi-turn chat example using GitHub Models (OpenAI-compatible)
  prompt.ts  — (scratch file, unused)
```

## Getting started

### Prerequisites

- Node.js 18+
- An Anthropic API key **or** a GitHub Copilot subscription (see proxy option below)

### Install dependencies

```bash
npm install
```

### Option A — Anthropic API directly

Set your API key and run:

```bash
ANTHROPIC_AUTH_TOKEN=sk-ant-... npm run dev "list all TypeScript files in src/"
```

### Option B — GitHub Copilot as backend (no Anthropic key needed)

Start the [`copilot-api`](https://github.com/nicepkg/copilot-api) proxy in a separate terminal (the first run triggers a GitHub device-flow login):

```bash
npm run proxy
```

Then in another terminal:

```bash
npm run dev "explain what agent.ts does"
```

The proxy listens on `http://localhost:4141` and exposes an Anthropic-compatible `/v1/messages` endpoint backed by your Copilot subscription.

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_BASE_URL` | `http://localhost:4141` | API base URL (set to `https://api.anthropic.com` for direct Anthropic access) |
| `ANTHROPIC_AUTH_TOKEN` | `dummy` | Anthropic API key (required for direct access, ignored by the proxy) |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-5` | Model to use |

You can put these in a `.env` file — the `dev` script loads it automatically via `tsx --env-file=.env`.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Run the agent (reads prompt from CLI args) |
| `npm run proxy` | Start the copilot-api proxy |
| `npm run build` | Compile TypeScript to `dist/` |

## Purpose

This project is purely for learning. It strips away everything non-essential to show the minimal moving parts of an AI coding agent:

- How to maintain multi-turn message history
- How to wire up tool definitions and dispatch tool calls
- How the agentic loop terminates (when `stop_reason` is `end_turn` with no tool use)
- How to proxy Anthropic-compatible requests through GitHub Copilot
