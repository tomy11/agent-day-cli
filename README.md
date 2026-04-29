# daycli

TypeScript AI CLI coding agent (Codex/OpenCode style) with safety guardrails.

## Prerequisites

- Node.js 22+
- npm
- Ollama running at `http://localhost:11434` (default)

## Install

```bash
npm install
npm run build
```

Run locally:

```bash
./bin/run.js --help
```

## Quick Start

```bash
# Interactive chat
./bin/run.js chat

# One-shot task
./bin/run.js run "summarize this project"
```

## Commands

### `daycli chat`

Start an interactive chat session. Chat turns are persisted under `.daycli/sessions`.

```bash
./bin/run.js chat
```

### `daycli run "<task>"`

Run a single task prompt via Ollama provider. Each run is saved as a resumable session.

```bash
./bin/run.js run "explain current architecture"
```

Options:

- `--model <name>` override model from config
- `--base-url <url>` override Ollama base URL from config
- `--timeout-ms <number>` request timeout in ms (`0` disables timeout)
- `--system <text>` add system prompt
- `--read-file <path>` read file in workspace and inject as context

Examples:

```bash
./bin/run.js run "review this config" --read-file daycli.config.json
./bin/run.js run "propose safer defaults" --system "You are a strict reviewer"
./bin/run.js run "hello" --model llama3.1 --timeout-ms 30000
```

### `daycli config set <key> <value>`

Update `daycli.config.json`.

Supported keys:

- `ollama.model`
- `ollama.baseUrl`
- `ollama.timeoutMs`

Examples:

```bash
./bin/run.js config set ollama.model llama3.1
./bin/run.js config set ollama.baseUrl http://localhost:11434
./bin/run.js config set ollama.timeoutMs 180000
```

### `daycli session list`

List recent sessions in the current workspace.

```bash
./bin/run.js session list
./bin/run.js session list --limit 5
```

### `daycli session resume <id>`

Resume a saved session by id. In an interactive terminal this opens chat with the saved history loaded. In non-interactive output it prints a session summary.

```bash
./bin/run.js session resume 20260429072136-7fb68c05-e6bc-44d3-8f7e-f62768291dcf
```

## Sessions

`daycli` stores session files in the current workspace:

```txt
.daycli/
  sessions/
    <session-id>.json
```

Session ids are shown after `daycli run` completes and in the interactive chat footer. Use `daycli session list` to find recent sessions and `daycli session resume <id>` to continue one.

## Configuration File

Default config file: `daycli.config.json` in current workspace root.

Example:

```json
{
  "ollama": {
    "model": "llama3.1",
    "baseUrl": "http://localhost:11434",
    "timeoutMs": 180000
  }
}
```

## Safety Notes

- Tool execution is routed through `SafeExecutor`
- Workspace path access is guarded by `WorkspacePathGuard`
- High-risk tools require explicit approval

## Development

```bash
npm run build
npm run typecheck
npm run test
```

## Project Docs

- `AGENTS.md` project rules and collaboration contract
- `ARCHITECTURE.md` system architecture and module map
- `TASKS.md` current backlog/progress
