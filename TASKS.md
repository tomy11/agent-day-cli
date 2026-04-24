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
- [ ] UI Workstream: add output formatter modes for `run` (plain/rich)

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
