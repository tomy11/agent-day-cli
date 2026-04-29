# ARCHITECTURE.md

## Overview
`daycli` คือ TypeScript CLI ที่รับคำสั่งจากผู้ใช้, ส่งต่อให้ LLM provider (เช่น Ollama), แล้วเรียกใช้ local tools อย่างปลอดภัยผ่าน guard และ approval layer

## High-Level Diagram
```text
User
  |
  v
CLI (oclif)
  |
  v
Command Handler
  |
  v
Tool Router <-----------------------------+
  |                                       |
  v                                       |
Safe Executor --> Safety Policy --> Path Guard --> Approval Manager
  |                                       |
  v                                       |
Tool Implementations                       |
(read_file, write_file, edit_file,         |
 run_command)                             |
  |                                       |
  +-------------------- result ---------->+

Command Handler <-> LLM Provider (OllamaProvider)

Command Handler <-> SessionStore (.daycli/sessions/*.json)
```

## Flow
1. ผู้ใช้เรียกคำสั่งผ่าน CLI
2. Command Handler parse input + load config
3. ส่ง prompt/context ไปที่ `OllamaProvider`
4. ถ้าโมเดลร้องขอ tool call ให้เข้า `toolRouter`
5. `safeExecutor` ตรวจ guard:
   - path guard: อนุญาตเฉพาะ path ใน workspace
   - safety policy: บังคับ write path policy, command allow/deny rules, และ risk level
   - approval manager: ขออนุมัติเมื่อเป็น action เสี่ยง
6. เรียก tool implementation และส่งผลลัพธ์กลับ handler
7. บันทึก session/message metadata ลง `.daycli/sessions`
8. แสดงผลสุดท้ายให้ผู้ใช้ พร้อม log ที่ตรวจสอบย้อนหลังได้

## Agent Loop Sequence
`daycli run` และ `daycli chat` ใช้ `AgentOrchestrator` เพื่อเรียก provider ซ้ำจนได้ final answer หรือชน guard limit

```text
User
  |
  v
CLI Command (run/chat)
  |
  v
AgentOrchestrator
  |
  | 1. send messages
  v
LLM Provider (OllamaProvider)
  |
  | 2a. final answer without toolCalls
  v
AgentOrchestrator
  |
  | append final_answer step
  v
CLI Command -> SessionStore -> User

Tool-call path:

AgentOrchestrator
  |
  | 2b. parse JSON { content, toolCalls[] }
  v
SafeExecutor
  |
  | resolve tool
  v
ToolRouter
  |
  | enforce workspace, command, and approval policy
  v
SafetyPolicy / WorkspacePathGuard / ApprovalManager
  |
  | execute allowed tool
  v
Tool Implementation (read_file, etc.)
  |
  | tool result
  v
AgentOrchestrator
  |
  | append tool_call + tool_result steps
  | convert tool result into provider-compatible user message
  +-----------------------------> LLM Provider

Recoverable tool-error path:

Malformed tool call / unknown tool / blocked path / rejected approval
  |
  v
AgentOrchestrator
  |
  | append tool_result with { ok: false, error: { code, message, recoverable: true } }
  | feed error result back to provider
  +-----------------------------> LLM Provider

Stop conditions:

- `final_answer`: provider returns normal assistant content with no tool calls
- `step_limit`: max agent steps reached before another model/tool/final step can be appended
- `tool_call_limit`: max tool calls reached, or tool executor/context is missing
- `timeout`: total agent loop exceeds configured timeout
```

Each loop step emits an `AgentEvent` (`model_response`, `tool_call`, `tool_result`, `final_answer`, `stopped`) for UI rendering and structured logs. Completed runs persist assistant messages plus agent metadata, and tool result steps are persisted as session messages with role `tool`.

## Safe Mutation And Command Execution
M9 adds first-class mutation and command tools to the default tool router. The model can request these tools only through the strict JSON tool-call contract included in the system prompt:

```json
{
  "content": "short reason",
  "toolCalls": [
    {
      "id": "call-1",
      "name": "tool_name",
      "input": {}
    }
  ]
}
```

Available built-in tools:

- `read_file`: low-risk workspace read. Input is a workspace-relative `path`.
- `write_file`: high-risk workspace write. Input includes `path`, `content`, optional `createDirs`, and optional `overwrite`. Existing files are rejected unless `overwrite` is explicitly true.
- `edit_file`: high-risk patch-style edit. Input includes `path` and ordered `edits` with exact `oldText` / `newText` replacements. Missing matches, ambiguous matches, and unchanged edits return structured conflicts unless the request explicitly allows `replaceAll` or relaxed exact matching.
- `run_command`: high-risk command execution. Input includes `command`, optional `args`, optional workspace-relative `cwd`, optional `timeoutMs`, and optional output limit. Commands run with `shell: false`, capture stdout/stderr, and report exit code, timeout state, and duration.

### Safety Policy
`src/core/security/safetyPolicy.ts` defines the default safety policy used by `SafeExecutor` and `WorkspacePathGuard`.

- All file paths must resolve inside the active workspace.
- Reads are allowed for workspace paths by default.
- Writes are allowed only inside the workspace and deny protected paths such as `.git/**`, `node_modules/**`, and `dist/**`.
- Command `cwd` must resolve inside the workspace and denies protected paths such as `.git/**` and `node_modules/**`.
- Dangerous command names such as `rm`, `rmdir`, `sudo`, `su`, `chmod`, `chown`, `mkfs`, `mount`, `umount`, `dd`, `shutdown`, and `reboot` are blocked before approval.
- Risk levels are part of each tool contract. High-risk tools require explicit approval before execution in interactive mode.

Rejected approvals, blocked paths, denied commands, edit conflicts, command failures, and timeouts are returned as structured tool results so the agent loop can recover or explain the failure instead of crashing the whole run.

### Session Audit Metadata
Tool results are persisted as session messages with role `tool`. Mutation and command tools also include compact audit metadata in `metadata.toolResult`:

- `write_file`: `path`, `absolutePath`, `bytesWritten`, `created`, `overwritten`
- `edit_file`: `path`, `absolutePath`, `replacementsApplied`, `changed`
- `run_command`: `command`, `args`, `cwd`, `exitCode`, `timedOut`, `durationMs`, `stdoutBytes`, `stderrBytes`
- recoverable failures: `ok: false` plus the structured error code and message

This keeps session history useful for debugging without storing unnecessarily large command output in metadata.

## Batch Mode Contract
`daycli run "<task>" --batch` is the non-interactive execution contract for scripts and CI.

- Scope: batch mode applies only to `run`, not `chat`.
- UI: batch mode never renders Ink/rich UI. Supports `plain` (default) and `json` output modes.
- Approval: batch mode never prompts for approval. All tool decisions are made by `PolicyApprovalManager` using the active `daycli.policy.json` (or the conservative default if the file is absent).
- Safety: workspace path guard, command policy, and tool risk levels still run before execution.
- Sessions: batch runs create normal `run` sessions with metadata fields `batch`, `nonInteractive`, and `approvalMode`.
- Exit codes: `0` = final answer, `1` = command error, `2` = agent stopped early (step_limit / tool_call_limit / timeout).

### Policy File Schema
The batch policy file contract lives in `src/core/batch/policyFile.ts`. Default filename: `daycli.policy.json`; schema version: `1`.

Policy sections:

- `approvals`: default decision, risk-level decisions, and per-tool overrides using `allow` or `deny`.
- `paths`: workspace-relative allow/deny patterns for `read`, `write`, and `execute` access.
- `commands`: command name allow/deny lists. Deny rules take precedence over allow rules.
- `limits`: `maxSteps`, `maxToolCalls`, full-run timeout, per-command timeout, and command output byte budget.
- `output`: batch output mode (`plain` or `json`) and metadata/session id inclusion flags.

The default policy is intentionally conservative: low-risk reads are allowed, high-risk tools are denied, writes and command execution have empty allow lists, protected paths remain denied, and plain output is the default.

The loader resolves `daycli.policy.json` inside the workspace by default, validates the schema, and normalizes omitted sections with the conservative defaults. Explicit missing files fail with `POLICY_NOT_FOUND`; invalid JSON, unknown keys, unsupported versions, wrong value types, and out-of-workspace policy paths fail with `POLICY_INVALID`; file-system read failures fail with `POLICY_IO_ERROR`.

## Core Modules
- `src/cli/*` : command entrypoints (oclif)
- `src/providers/OllamaProvider.ts` : เชื่อม Ollama API
- `src/core/batch/batchMode.ts` : batch CLI contract and non-interactive behavior
- `src/core/batch/policyFile.ts` : batch policy schema, loader, validation, and `policyToSafetyPolicy` converter
- `src/core/batch/policyApprovalManager.ts` : approval manager that evaluates tool calls against the loaded batch policy
- `src/tools/toolRouter.ts` : map tool name -> handler
- `src/execution/safeExecutor.ts` : บังคับ policy ก่อน execute
- `src/core/tools/contracts.ts` : shared tool input contracts and risk metadata
- `src/core/tools/toolPrompt.ts` : prompt text that exposes tool contracts to the agent
- `src/core/tools/builtin/*Tool.ts` : built-in tool implementations
- `src/core/security/safetyPolicy.ts` : write path policy, command policy, and risk rules
- `src/security/pathGuard.ts` : ตรวจ path traversal / out-of-scope
- `src/security/approvalManager.ts` : interactive approval flow
- `src/core/workspace/workspaceSummary.ts` : สร้าง workspace snapshot แบบ read-only สำหรับระบบ prompt/context
- `src/core/storage/sessionStore.ts` : จัดเก็บ session แบบ JSON ต่อ workspace ใน `.daycli/sessions`

## UI Composition (Ink)
- `src/ui/components/AppFrame.ts` : กรอบหลักของหน้าจอ chat/run
- `src/ui/components/ChatApp.ts` : state machine ของ interactive session
- `src/ui/components/WelcomeHero.ts` : branded welcome (ASCII logo + usage hints) แสดงตอนเริ่ม session

## Session Lifecycle
```text
daycli run <task>
  -> create run session
  -> append user task
  -> call provider
  -> append assistant response
  -> mark completed or failed

daycli chat
  -> create chat session
  -> append each user/assistant turn

daycli session list
  -> read summaries from .daycli/sessions

daycli session resume <id>
  -> load session history
  -> render ChatApp with initial messages
  -> append new turns to the same session
```

Session files are workspace-local JSON records. Session ids are validated before file access, and invalid or corrupted session files return coded `SESSION_*` errors.

## Safety Principles
- Default deny: ปฏิเสธการเข้าถึงที่ไม่ตรง policy
- Explicit approval: งานเสี่ยงต้องยืนยันก่อน
- Least privilege: tool แต่ละตัวได้สิทธิ์เท่าที่จำเป็น
- Auditability: ต้องมี log เพียงพอสำหรับ trace

## Future Extensions
- เพิ่ม provider abstraction เพื่อรองรับหลาย backend
- เพิ่ม tool permission matrix รายคำสั่ง
- รองรับ non-interactive mode (CI) พร้อม policy file

## Related Docs
- การใช้งาน CLI และตัวอย่างคำสั่ง: `README.md`
