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
7. แสดงผลสุดท้ายให้ผู้ใช้ พร้อม log ที่ตรวจสอบย้อนหลังได้

## Core Modules
- `src/cli/*` : command entrypoints (oclif)
- `src/providers/OllamaProvider.ts` : เชื่อม Ollama API
- `src/tools/toolRouter.ts` : map tool name -> handler
- `src/execution/safeExecutor.ts` : บังคับ policy ก่อน execute
- `src/security/pathGuard.ts` : ตรวจ path traversal / out-of-scope
- `src/security/approvalManager.ts` : interactive approval flow

## UI Composition (Ink)
- `src/ui/components/AppFrame.ts` : กรอบหลักของหน้าจอ chat/run
- `src/ui/components/ChatApp.ts` : state machine ของ interactive session
- `src/ui/components/WelcomeHero.ts` : branded welcome (ASCII logo + usage hints) แสดงตอนเริ่ม session

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
