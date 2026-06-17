# daycli

TypeScript AI CLI coding agent (Codex/OpenCode style) with safety guardrails.

## Prerequisites

- Node.js 22+
- npm
- Ollama running at `http://localhost:11434` (default), or a configured cloud provider API key

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

- `provider.type` (`ollama`, `openai`, `anthropic`, `openrouter`, `gemini`, or `mistral`)
- `ollama.model`
- `ollama.baseUrl`
- `ollama.timeoutMs`
- `openai.model`
- `openai.baseUrl`
- `openai.timeoutMs`
- `anthropic.model`
- `anthropic.baseUrl`
- `anthropic.timeoutMs`
- `openrouter.model`
- `openrouter.baseUrl`
- `openrouter.timeoutMs`
- `gemini.model`
- `gemini.baseUrl`
- `gemini.timeoutMs`
- `mistral.model`
- `mistral.baseUrl`
- `mistral.timeoutMs`

Examples:

```bash
./bin/run.js config set provider.type ollama
./bin/run.js config set ollama.model llama3.1
./bin/run.js config set ollama.baseUrl http://localhost:11434
./bin/run.js config set ollama.timeoutMs 180000

./bin/run.js config set provider.type openai
./bin/run.js config set openai.model gpt-4.1-mini

./bin/run.js config set provider.type anthropic
./bin/run.js config set anthropic.model claude-3-5-sonnet-latest

./bin/run.js config set provider.type openrouter
./bin/run.js config set openrouter.model anthropic/claude-sonnet-4.5

./bin/run.js config set provider.type gemini
./bin/run.js config set gemini.model gemini-3.5-flash

./bin/run.js config set provider.type mistral
./bin/run.js config set mistral.model mistral-large-latest
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
  "provider": {
    "type": "ollama"
  },
  "ollama": {
    "model": "llama3.1",
    "baseUrl": "http://localhost:11434",
    "timeoutMs": 180000
  },
  "openai": {
    "model": "gpt-4.1-mini",
    "baseUrl": "https://api.openai.com/v1",
    "timeoutMs": 180000
  },
  "anthropic": {
    "model": "claude-3-5-sonnet-latest",
    "baseUrl": "https://api.anthropic.com",
    "timeoutMs": 180000
  },
  "openrouter": {
    "model": "openai/gpt-4.1-mini",
    "baseUrl": "https://openrouter.ai/api/v1",
    "timeoutMs": 180000
  },
  "gemini": {
    "model": "gemini-3.5-flash",
    "baseUrl": "https://generativelanguage.googleapis.com/v1beta",
    "timeoutMs": 180000
  },
  "mistral": {
    "model": "mistral-large-latest",
    "baseUrl": "https://api.mistral.ai/v1",
    "timeoutMs": 180000
  }
}
```

API keys are read only from environment variables and should not be committed to `daycli.config.json`:

```bash
export OPENAI_API_KEY=...
export ANTHROPIC_API_KEY=...
export OPENROUTER_API_KEY=...
export GEMINI_API_KEY=...
export MISTRAL_API_KEY=...
```

## Safety Notes

- Tool execution is routed through `SafeExecutor`
- Workspace path access is guarded by `WorkspacePathGuard`
- High-risk tools require explicit approval

## Built-in Tools

The agent can request built-in tools through the default tool router:

| Tool | Risk | Purpose |
|------|------|---------|
| `read_file` | low | Read one workspace file with a character limit. |
| `search_files` | low | Search literal text in workspace files with match and file-size limits. |
| `find_files` | low | Find workspace file paths by literal path or basename query. |
| `list_dir` | low | List directory entries with optional recursion and entry limits. |
| `write_file` | high | Create or overwrite workspace files after approval. |
| `edit_file` | high | Apply exact patch-style text replacements after approval. |
| `run_command` | high | Run a command with `shell: false`, guarded `cwd`, timeout handling, and captured output. |

All tools are safe-by-default. Paths must stay inside the current workspace, read/navigation tools enforce output limits, protected directories such as `.git`, `node_modules`, and `dist` are blocked for writes, and dangerous commands such as `rm`, `sudo`, `chmod`, `dd`, `shutdown`, and `reboot` are denied before approval. High-risk tool calls ask for confirmation in interactive use.

Examples:

```bash
./bin/run.js run "Find where ToolRouter is defined"
./bin/run.js run "List the files under src/core/tools"
./bin/run.js run "Create notes/todo.txt with a short todo list"
./bin/run.js run "Change the heading in README.md from daycli to DayCLI"
./bin/run.js run "Run npm test and summarize failures"
```

`write_file` rejects overwriting an existing file unless the model explicitly requests overwrite. `edit_file` uses exact `oldText` / `newText` replacements and reports conflicts when text is missing or ambiguous. `run_command` captures stdout, stderr, exit code, timeout state, and duration.

Every tool call is persisted in `.daycli/sessions`. Tool session metadata includes compact audit fields such as matched paths, match counts, changed path, bytes written, replacement count, command cwd, exit code, timeout state, and output byte counts.

## Batch Mode

`daycli run "<task>" --batch` runs non-interactively for scripts and CI:

- runs only as a one-shot `run` command
- never opens the rich Ink UI
- never prompts for approval — tool decisions are driven by the active policy
- supports `plain` (default) and `json` output modes
- persists the session like a normal run

**Exit codes**

| Code | Meaning |
|------|---------|
| `0` | Agent produced a final answer |
| `1` | Command error (invalid config, session failure, etc.) |
| `2` | Agent stopped early (`step_limit`, `tool_call_limit`, or `timeout`) |

**CI examples**

```bash
# Plain output — response text followed by session info
./bin/run.js run "summarize this project" --batch

# JSON output — machine-readable, safe to pipe and parse
./bin/run.js run "check for lint errors" --batch --output json

# Policy file is loaded automatically from daycli.policy.json in the workspace
./bin/run.js run "run the test suite and report failures" --batch
```

**JSON output format**

```json
{
  "status": "completed",
  "stoppedReason": "final_answer",
  "response": "...",
  "sessionId": "20260429125510-59a4e79b-...",
  "metadata": {"model": "llama3.1", "stepCount": 3, "toolResultCount": 2}
}
```

`status` is `"completed"` when `stoppedReason` is `"final_answer"` and `"stopped"` for all other reasons. `metadata` is only included when `output.includeMetadata: true` is set in the policy. On error, `status` is `"error"` and the JSON contains an `error` field instead of `response`.

### Policy File

Create `daycli.policy.json` in the workspace root to control tool approvals, path access, command rules, agent limits, and output format. If the file is absent, the conservative default policy applies: reads are allowed and all writes and commands are denied.

**Full schema example:**

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
      "search_files": "allow",
      "find_files": "allow",
      "list_dir": "allow",
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

The policy loader validates the file before use. Missing default policy files fall back to the conservative default; explicit missing paths fail with `POLICY_NOT_FOUND`. Invalid JSON, unsupported schema versions, unknown keys, wrong value types, and out-of-workspace paths fail with `POLICY_INVALID`. File-system read failures use `POLICY_IO_ERROR`.

**Recommended safe defaults**

For read-only analysis (code review, summarisation, Q&A):

```json
{
  "version": 1,
  "output": {"mode": "json", "includeSessionId": true}
}
```

For CI with controlled write access (e.g. writing reports):

```json
{
  "version": 1,
  "approvals": {
    "tools": {
      "read_file": "allow",
      "search_files": "allow",
      "find_files": "allow",
      "list_dir": "allow",
      "write_file": "allow",
      "edit_file": "deny",
      "run_command": "deny"
    }
  },
  "paths": {
    "write": {"allow": ["reports/**"], "deny": [".git/**", "node_modules/**", "dist/**"]}
  },
  "limits": {"maxSteps": 8, "maxToolCalls": 4, "runTimeoutMs": 120000},
  "output": {"mode": "json", "includeSessionId": true, "includeMetadata": true}
}
```

For CI that can also run commands (e.g. test runners):

```json
{
  "version": 1,
  "approvals": {
    "tools": {
      "read_file": "allow",
      "search_files": "allow",
      "find_files": "allow",
      "list_dir": "allow",
      "run_command": "allow",
      "write_file": "deny",
      "edit_file": "deny"
    }
  },
  "paths": {
    "execute": {"allow": ["."], "deny": [".git/**", "node_modules/**"]}
  },
  "commands": {"allow": ["npm", "node", "npx"], "deny": ["rm", "sudo", "chmod", "dd", "shutdown", "reboot"]},
  "limits": {"maxSteps": 12, "maxToolCalls": 6, "runTimeoutMs": 180000, "commandTimeoutMs": 30000},
  "output": {"mode": "json", "includeSessionId": true, "includeMetadata": true}
}
```

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
