# TASKS.md

## Backlog
- [x] scaffold CLI (oclif)
- [x] implement OllamaProvider
- [x] implement read_file tool
- [x] implement path guard
- [x] implement approval prompt
- [x] implement safeExecutor
- [x] implement toolRouter
- [x] add config loader (`daycli.config.json`)
- [x] add structured logging + error codes
- [x] add unit tests (providers/tools/guards)
- [x] add E2E smoke test for CLI flow
- [x] write usage docs + examples
- [x] Phase 1 (MVP Retrieval): add chunk metadata (path/symbol/imports/language/updatedAt)
- [x] Phase 1 (MVP Retrieval): implement 2-stage retrieval (vector search + symbol/keyword rerank)
- [x] Phase 1 (MVP Retrieval): implement context assembly (top-k + neighbor chunks)
- [x] Phase 2 (Performance): implement incremental indexing based on changed files
- [x] Phase 3 (Quality): upgrade to syntax-aware chunking (AST/function boundary first)
- [x] Phase 3 (Quality): add safe noise reduction policy (trim logs/test fixtures, keep useful docs)
- [x] UI Workstream: build Ink UI components in `src/ui/components`
- [x] UI Workstream: implement interactive chat loop in `src/commands/chat.ts`
- [x] UI Workstream: add output formatter modes for `run` (plain/rich)
- [x] UI Workstream: add branded chat welcome hero (ASCII logo + prompt hints)
- [x] UX Workstream: inject workspace snapshot into `chat` system prompt for structure-aware responses
- [x] M7 (Session persistence): define session data model and storage layout
- [x] M7 (Session persistence): implement session storage adapter in `src/core/storage`
- [x] M7 (Session persistence): persist `chat` turns with role, content, model, workspace, and timestamps
- [x] M7 (Session persistence): persist `run` executions as resumable single-task sessions
- [x] M7 (Session persistence): implement `daycli session list` with recent sessions, status, and workspace path
- [x] M7 (Session persistence): implement `daycli session resume <id>` for interactive chat continuation
- [x] M7 (Session persistence): add session ids and resume hints to `chat` and `run` output
- [x] M7 (Session persistence): add safe storage path handling and corrupted-session error handling
- [x] M7 (Session persistence): add unit tests for storage create/read/write/list/status behavior
- [x] M7 (Session persistence): add E2E coverage for completed `run` session persistence
- [x] M7 (Session persistence): add command-level coverage for resume behavior
- [x] M7 (Session persistence): add E2E smoke test for create/list flow
- [x] M7 (Session persistence): add E2E smoke test for resume flow
- [x] M7 (Session persistence): add E2E coverage for session id and resume hints
- [x] M7 (Session persistence): update `ARCHITECTURE.md` and usage docs with session lifecycle
- [ ] M8 (Agent loop + real tool calling): define provider tool-call contract and message format
- [ ] M8 (Agent loop + real tool calling): add an agent orchestrator in `src/core/agent`
- [ ] M8 (Agent loop + real tool calling): implement loop limits for max steps, max tool calls, and timeout
- [ ] M8 (Agent loop + real tool calling): route model-requested tool calls through `SafeExecutor`
- [ ] M8 (Agent loop + real tool calling): feed tool results back into the model until final answer
- [ ] M8 (Agent loop + real tool calling): support tool-call events for UI rendering and structured logs
- [ ] M8 (Agent loop + real tool calling): integrate agent loop into `daycli run`
- [ ] M8 (Agent loop + real tool calling): integrate agent loop into `daycli chat`
- [ ] M8 (Agent loop + real tool calling): persist agent steps and tool results into sessions
- [ ] M8 (Agent loop + real tool calling): handle malformed/unknown tool calls with recoverable errors
- [ ] M8 (Agent loop + real tool calling): add tests for successful tool use, rejected approval, guard failure, and loop limit
- [ ] M8 (Agent loop + real tool calling): update `ARCHITECTURE.md` with agent loop sequence diagram

## In Progress
- [ ] (none)

## Done
- [x] create AGENTS.md (rule + contract)
- [x] create TASKS.md
- [x] create ARCHITECTURE.md

## Milestone Suggestion
- M1: Core CLI + Provider + Tool execution safety
- M2: Approval flow + Tests + Docs
- M3: Retrieval MVP (`2,3,5`)
- M4: Incremental indexing (`6`)
- M5: Quality upgrades (`1,4`)
- M6: CLI UX improvements (Ink UI + interactive chat)
- M7: Session persistence
- M8: Agent loop + real tool calling
- M9: Safe write/edit/run-command tools
- M10: Batch mode + policy file + CI-friendly output
