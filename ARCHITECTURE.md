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
Safe Executor --> Path Guard --> Approval Manager
  |                                       |
  v                                       |
Tool Implementations (read_file, etc.)    |
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
  | enforce workspace and approval policy
  v
WorkspacePathGuard / ApprovalManager
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

## Core Modules
- `src/cli/*` : command entrypoints (oclif)
- `src/providers/OllamaProvider.ts` : เชื่อม Ollama API
- `src/tools/toolRouter.ts` : map tool name -> handler
- `src/execution/safeExecutor.ts` : บังคับ policy ก่อน execute
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
