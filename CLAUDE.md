# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build        # compile TypeScript to dist/
npm run typecheck    # type-check without emitting
npm run test         # build then run all tests
npm run clean        # remove dist/

# Run a single test file
node --test dist/tests/tools/readFileTool.test.js

# Run the CLI locally
./bin/run.js chat
./bin/run.js run "explain this project"
./bin/dev.js chat    # dev wrapper (ts-node / source)
```

Tests use Node's built-in `node:test` runner. All tests live under `src/tests/` and are compiled to `dist/tests/` before running. There is no watch mode — rebuild before running tests.

## Architecture

`daycli` is a TypeScript CLI coding agent built on **oclif** + **Ink** (React terminal UI). It sends prompts to **Ollama** (local LLM), parses structured JSON tool calls from the model's responses, executes them through a strict safety pipeline, and persists everything in workspace-local session files.

### Request Flow

```
CLI command (oclif)
  └─► AgentOrchestrator          // src/core/agent/orchestrator.ts
        ├─► OllamaProvider        // src/core/providers/ollama/OllamaProvider.ts
        │     (streams chat completions, parses JSON tool calls)
        ├─► SafeExecutor          // src/core/execution/safeExecutor.ts
        │     ├─► WorkspacePathGuard   // src/core/security/pathGuard.ts
        │     ├─► SafetyPolicy         // src/core/security/safetyPolicy.ts
        │     ├─► ApprovalManager      // src/core/security/approvalManager.ts
        │     └─► ToolRouter           // src/core/tools/toolRouter.ts
        │           └─► built-in tools (read_file, write_file, edit_file, run_command)
        └─► SessionStore          // src/core/storage/sessionStore.ts
              (.daycli/sessions/<id>.json)
```

The orchestrator runs a multi-step loop: call provider → parse tool calls → execute via SafeExecutor → feed results back as user messages → repeat until `final_answer`, `step_limit`, `tool_call_limit`, or `timeout`. Each step emits an `AgentEvent` for UI rendering.

### Key Modules

| Path | Responsibility |
|---|---|
| `src/commands/` | oclif command entrypoints (chat, run, config, session/*) |
| `src/core/agent/orchestrator.ts` | multi-step agent loop, stop conditions, event emission |
| `src/core/agent/types.ts` | AgentStep, AgentEvent, AgentLimits, AgentRequest/Result |
| `src/core/providers/ollama/OllamaProvider.ts` | Ollama HTTP API, JSON tool-call parsing |
| `src/core/tools/contracts.ts` | tool input schemas and risk metadata |
| `src/core/tools/toolPrompt.ts` | system prompt text that exposes tool contracts to the model |
| `src/core/tools/toolRouter.ts` | maps tool name → handler |
| `src/core/tools/builtin/` | read_file, write_file, edit_file, run_command implementations |
| `src/core/execution/safeExecutor.ts` | orchestrates path guard + policy + approval before dispatch |
| `src/core/security/safetyPolicy.ts` | write-path rules, command allow/deny, risk levels |
| `src/core/security/pathGuard.ts` | workspace path traversal guard |
| `src/core/security/approvalManager.ts` | interactive confirmation flow for high-risk tools |
| `src/core/batch/batchMode.ts` | non-interactive run contract (--batch flag) |
| `src/core/batch/policyFile.ts` | daycli.policy.json schema, loader, validation |
| `src/core/storage/sessionStore.ts` | JSON session persistence under .daycli/sessions/ |
| `src/core/retrieval/` | code indexing, chunking, ranking, context assembly for RAG |
| `src/core/workspace/workspaceSummary.ts` | read-only workspace snapshot for system prompt context |
| `src/ui/components/` | Ink/React terminal UI (AppFrame, ChatApp, ChatHeader, HelpHints) |

### Tool Call Protocol

The model must respond with structured JSON to invoke tools:

```json
{
  "content": "short reason",
  "toolCalls": [{ "id": "call-1", "name": "read_file", "input": { "path": "README.md" } }]
}
```

`toolPrompt.ts` injects this contract into every system prompt. Malformed calls and blocked operations return structured `{ ok: false, error: { code, message, recoverable } }` results that the orchestrator feeds back to the model rather than crashing.

### Safety Layers

1. **PathGuard** — all file paths must resolve inside the workspace root; no traversal.
2. **SafetyPolicy** — writes blocked from `.git/**`, `node_modules/**`, `dist/**`; dangerous commands (`rm`, `sudo`, `chmod`, `dd`, `shutdown`, `reboot`, etc.) denied before approval.
3. **ApprovalManager** — high-risk tools (`write_file`, `edit_file`, `run_command`) require interactive confirmation; in `--batch` mode they are denied by default.
4. **Policy file** (`daycli.policy.json`) — optional JSON file overriding approvals, path rules, command lists, limits, and output mode for CI/batch use.

### Session Files

Sessions are stored in `.daycli/sessions/<id>.json` (workspace-local). Each file contains the full message history plus agent metadata. Mutation tool results include compact audit fields (paths, bytes, exit codes) rather than full output.

### Retrieval System

`src/core/retrieval/` implements a two-stage code search pipeline: `Chunker` splits source files into `CodeChunk` records (syntax-aware, with symbol/import metadata), `IndexStore` persists them in `.daycli/index/chunks.json`, and `Retriever` does keyword + TF-IDF stage-1 ranking followed by stage-2 re-ranking. `ContextAssembler` budgets chunks by character limit and expands neighbor windows before injecting context into prompts.

### Configuration

`daycli.config.json` (workspace root) stores Ollama settings. Update via `daycli config set <key> <value>` or edit directly. Keys: `ollama.model`, `ollama.baseUrl`, `ollama.timeoutMs`.
