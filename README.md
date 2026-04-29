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
- `--batch` run non-interactively for scripts and CI

Examples:

```bash
./bin/run.js run "review this config" --read-file daycli.config.json
./bin/run.js run "propose safer defaults" --system "You are a strict reviewer"
./bin/run.js run "hello" --model llama3.1 --timeout-ms 30000
./bin/run.js run "summarize this project" --batch
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

## Safe Mutation And Command Tools

The agent can request built-in tools through the default tool router:

- `read_file` reads workspace files.
- `write_file` creates or overwrites workspace files after approval.
- `edit_file` applies exact patch-style text replacements after approval.
- `run_command` runs a command with `shell: false`, a guarded workspace `cwd`, timeout handling, and captured output.

Mutation and command tools are safe-by-default. Paths must stay inside the current workspace, protected directories such as `.git`, `node_modules`, and `dist` are blocked for writes, and dangerous commands such as `rm`, `sudo`, `chmod`, `dd`, `shutdown`, and `reboot` are denied before approval. High-risk tool calls ask for confirmation in interactive use.

Examples:

```bash
./bin/run.js run "Create notes/todo.txt with a short todo list"
./bin/run.js run "Change the heading in README.md from daycli to DayCLI"
./bin/run.js run "Run npm test and summarize failures"
```

`write_file` rejects overwriting an existing file unless the model explicitly requests overwrite. `edit_file` uses exact `oldText` / `newText` replacements and reports conflicts when text is missing or ambiguous. `run_command` captures stdout, stderr, exit code, timeout state, and duration.

Every tool call is persisted in `.daycli/sessions`. For write, edit, and command tools, session metadata includes compact audit fields such as changed path, bytes written, replacement count, command cwd, exit code, timeout state, and output byte counts.

## Batch Mode

`daycli run "<task>" --batch` defines the non-interactive CLI contract for scripts and CI:

- runs only as a one-shot `run` command
- never opens the rich Ink UI
- never prompts for approval
- uses plain output for now
- persists the session like a normal run

Until policy files are implemented later in M10, high-risk tools such as `write_file`, `edit_file`, and `run_command` are denied in batch mode instead of prompting. Low-risk tools such as `read_file` can still run through the normal guards.

### Policy File Schema

M10 policy files use `daycli.policy.json` with schema version `1`. The schema covers approval decisions, workspace path rules, command allow/deny rules, run limits, and output mode.

```json
{
  "version": 1,
  "name": "safe-ci",
  "approvals": {
    "default": "deny",
    "riskLevels": {
      "low": "allow",
      "high": "deny"
    },
    "tools": {
      "read_file": "allow",
      "write_file": "deny",
      "edit_file": "deny",
      "run_command": "allow"
    }
  },
  "paths": {
    "read": {"allow": ["**"]},
    "write": {"allow": ["reports/**"], "deny": [".git/**", "node_modules/**", "dist/**"]},
    "execute": {"allow": ["."], "deny": [".git/**", "node_modules/**"]}
  },
  "commands": {
    "allow": ["npm", "node"],
    "deny": ["rm", "sudo", "chmod", "dd", "shutdown", "reboot"]
  },
  "limits": {
    "maxSteps": 12,
    "maxToolCalls": 4,
    "runTimeoutMs": 120000,
    "commandTimeoutMs": 30000,
    "commandOutputBytes": 32000
  },
  "output": {
    "mode": "json",
    "includeSessionId": true,
    "includeMetadata": true
  }
}
```

The policy loader validates this file before use. Missing default policy files fall back to the conservative default policy; explicit missing policy paths fail with `POLICY_NOT_FOUND`. Invalid JSON, unsupported schema versions, unknown keys, wrong value types, and unsafe policy paths fail with `POLICY_INVALID`. File-system read failures use `POLICY_IO_ERROR`.

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
