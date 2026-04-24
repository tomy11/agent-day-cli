# AGENTS.md

## Purpose
เอกสารนี้กำหนดกติกาการทำงานร่วมกันระหว่าง Human และ Agent ในโปรเจกต์ `daycli` เพื่อให้ส่งมอบงานได้เร็ว ปลอดภัย และตรวจสอบได้

## Rules
- Agent ต้องทำงานแบบ `safe-by-default` ทุกครั้ง โดยเฉพาะคำสั่งที่แตะไฟล์ระบบหรือรันคำสั่งเสี่ยง
- ทุกการเปลี่ยนแปลงต้องอธิบายได้ว่า “ทำไมต้องทำ” และ “ผลกระทบคืออะไร”
- ห้ามแก้ไขไฟล์นอกขอบเขตงานโดยไม่แจ้ง
- ก่อนเขียนทับ/ลบไฟล์ ต้องมีการยืนยัน (approval) เมื่อเสี่ยงข้อมูลสูญหาย
- การเรียก tool ต้องผ่าน path guard และ permission guard เสมอ
- โค้ดใหม่ต้องอ่านง่าย, มี error handling และมีจุด log ที่ช่วย debug
- งานที่ยังไม่เสร็จต้องสะท้อนใน `TASKS.md`

## Contract (Human <-> Agent)

### Human รับผิดชอบ
- ระบุเป้าหมาย, ขอบเขต และข้อจำกัดของงาน
- ตอบ approval prompt เมื่อมี operation เสี่ยง
- Review ผลลัพธ์และยืนยัน acceptance criteria

### Agent รับผิดชอบ
- แตกงานเป็นขั้นตอนเล็ก ๆ และรายงานความคืบหน้า
- เสนอทางเลือกเมื่อมี trade-off สำคัญ
- ไม่รันคำสั่ง destructive โดยไม่ได้รับอนุมัติ
- เขียนเอกสาร/โค้ดให้สอดคล้องกับสถาปัตยกรรมที่ตกลงกัน

## Definition of Done
- ฟีเจอร์ทำงานตาม acceptance criteria
- ผ่านการทดสอบที่เกี่ยวข้อง
- อัปเดตเอกสาร (`TASKS.md`, `ARCHITECTURE.md`) แล้ว
- ไม่มี known critical issue ค้างอยู่

## Working Style
- Branch-per-feature
- Commit message ชัดเจน (เช่น `feat:`, `fix:`, `docs:`)
- เปิด PR พร้อมสรุปเหตุผลการเปลี่ยนแปลงและวิธีทดสอบ

# AGENTS.md

## Project Identity

This project is a TypeScript-based AI CLI coding agent.

Tech stack:
- Node.js (TypeScript)
- CLI framework: oclif (or Commander in early stage)
- Terminal UI: Ink (React-based)
- Validation: zod
- Shell execution: execa
- LLM providers:
  - Ollama (local) via http://localhost:11434
  - OpenAI (cloud)

The CLI behaves similarly to Codex/OpenCode:
- interactive chat in terminal
- file system access
- code modification
- shell execution with approval
- strong safety guardrails

---

## CLI Commands

Expected commands:

- `daycli chat`
- `daycli run "<task>"`
- `daycli config set`
- `daycli session list`
- `daycli session resume <id>`

All commands must go through CLI layer only (no direct execution from core).

---

## Folder Structure (Target)

```txt
src/
  cli/
    commands/
  ui/
    components/
  core/
    agent/
    providers/
      ollama/
      openai/
    tools/
    safety/
    storage/
    workspace/
  domain/
  tests/