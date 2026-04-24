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
# Interactive scaffold
./bin/run.js chat

# One-shot task
./bin/run.js run "summarize this project"
```

## Commands

### `daycli chat`

Start interactive chat session scaffold.

```bash
./bin/run.js chat
```

### `daycli run "<task>"`

Run a single task prompt via Ollama provider.

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

List sessions scaffold.

```bash
./bin/run.js session list
```

### `daycli session resume <id>`

Resume a session by id scaffold.

```bash
./bin/run.js session resume abc123
```

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
