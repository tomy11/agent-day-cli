import {randomUUID} from 'node:crypto'
import {mkdir, readdir, readFile, rename, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {AppError} from '../errors'
import type {
  AppendSessionMessageInput,
  CreateSessionInput,
  SessionMessage,
  SessionRecord,
  SessionStatus,
  SessionSummary,
} from './types'

const SESSION_VERSION = 1
const SESSION_DIR = path.join('.daycli', 'sessions')

export class SessionStore {
  private readonly workspaceRoot: string
  private readonly sessionDir: string

  public constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot)
    this.sessionDir = path.join(this.workspaceRoot, SESSION_DIR)
  }

  public async create(input: CreateSessionInput): Promise<SessionRecord> {
    const now = new Date().toISOString()
    const session: SessionRecord = {
      id: createSessionId(),
      version: SESSION_VERSION,
      kind: input.kind,
      status: input.status ?? 'active',
      title: input.title,
      workspaceRoot: path.resolve(input.workspaceRoot),
      ...(input.model !== undefined ? {model: input.model} : {}),
      createdAt: now,
      updatedAt: now,
      messages: [],
      ...(input.metadata !== undefined ? {metadata: input.metadata} : {}),
    }

    await this.save(session)
    return session
  }

  public async get(id: string): Promise<SessionRecord> {
    const filePath = this.getSessionPath(id)

    try {
      const raw = await readFile(filePath, 'utf8')
      return parseSession(raw, filePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new AppError('SESSION_NOT_FOUND', `Session not found: ${id}`, {
          cause: error,
          meta: {sessionId: id},
        })
      }

      if (error instanceof AppError) {
        throw error
      }

      throw new AppError('SESSION_IO_ERROR', `Failed to read session: ${id}`, {
        cause: error,
        meta: {sessionId: id},
      })
    }
  }

  public async list(): Promise<SessionSummary[]> {
    let entries: string[]

    try {
      entries = await readdir(this.sessionDir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return []
      }

      throw new AppError('SESSION_IO_ERROR', 'Failed to list sessions', {cause: error})
    }

    const summaries: SessionSummary[] = []

    for (const entry of entries) {
      if (!entry.endsWith('.json')) {
        continue
      }

      const session = await this.get(path.basename(entry, '.json'))
      summaries.push(toSummary(session))
    }

    summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return summaries
  }

  public async appendMessage(
    id: string,
    input: AppendSessionMessageInput,
  ): Promise<SessionRecord> {
    const session = await this.get(id)
    const now = new Date().toISOString()
    const message: SessionMessage = {
      id: randomUUID(),
      role: input.role,
      content: input.content,
      createdAt: now,
      ...(input.toolName !== undefined ? {toolName: input.toolName} : {}),
      ...(input.metadata !== undefined ? {metadata: input.metadata} : {}),
    }

    const updated: SessionRecord = {
      ...session,
      updatedAt: now,
      messages: [...session.messages, message],
    }

    await this.save(updated)
    return updated
  }

  public async updateStatus(id: string, status: SessionStatus): Promise<SessionRecord> {
    const session = await this.get(id)
    const updated: SessionRecord = {
      ...session,
      status,
      updatedAt: new Date().toISOString(),
    }

    await this.save(updated)
    return updated
  }

  private async save(session: SessionRecord): Promise<void> {
    validateSession(session, this.getSessionPath(session.id))

    try {
      await mkdir(this.sessionDir, {recursive: true})
      const filePath = this.getSessionPath(session.id)
      const tempPath = `${filePath}.${process.pid}.tmp`
      await writeFile(tempPath, `${JSON.stringify(session, null, 2)}\n`, 'utf8')
      await rename(tempPath, filePath)
    } catch (error) {
      throw new AppError('SESSION_IO_ERROR', `Failed to save session: ${session.id}`, {
        cause: error,
        meta: {sessionId: session.id},
      })
    }
  }

  private getSessionPath(id: string): string {
    if (!isSafeSessionId(id)) {
      throw new AppError('SESSION_INVALID', `Invalid session id: ${id}`, {
        meta: {sessionId: id},
      })
    }

    const filePath = path.resolve(this.sessionDir, `${id}.json`)
    if (!filePath.startsWith(`${this.sessionDir}${path.sep}`)) {
      throw new AppError('SESSION_INVALID', `Session path escaped storage root: ${id}`, {
        meta: {sessionId: id},
      })
    }

    return filePath
  }
}

function createSessionId(): string {
  const stamp = new Date().toISOString().replaceAll(/[-:.TZ]/g, '').slice(0, 14)
  return `${stamp}-${randomUUID()}`
}

function parseSession(raw: string, filePath: string): SessionRecord {
  try {
    const parsed = JSON.parse(raw) as unknown
    validateSession(parsed, filePath)
    return parsed
  } catch (error) {
    if (error instanceof AppError) {
      throw error
    }

    throw new AppError('SESSION_INVALID', `Invalid session JSON: ${filePath}`, {
      cause: error,
      meta: {filePath},
    })
  }
}

function validateSession(input: unknown, filePath: string): asserts input is SessionRecord {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AppError('SESSION_INVALID', `Invalid session: root must be an object (${filePath})`)
  }

  const session = input as Partial<SessionRecord>
  if (
    typeof session.id !== 'string' ||
    !isSafeSessionId(session.id) ||
    session.version !== SESSION_VERSION ||
    (session.kind !== 'chat' && session.kind !== 'run') ||
    !isSessionStatus(session.status) ||
    typeof session.title !== 'string' ||
    typeof session.workspaceRoot !== 'string' ||
    typeof session.createdAt !== 'string' ||
    typeof session.updatedAt !== 'string' ||
    !Array.isArray(session.messages)
  ) {
    throw new AppError('SESSION_INVALID', `Invalid session shape: ${filePath}`)
  }

  if (session.model !== undefined && typeof session.model !== 'string') {
    throw new AppError('SESSION_INVALID', `Invalid session model: ${filePath}`)
  }

  for (const message of session.messages) {
    validateMessage(message, filePath)
  }
}

function validateMessage(input: unknown, filePath: string): asserts input is SessionMessage {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AppError('SESSION_INVALID', `Invalid session message: ${filePath}`)
  }

  const message = input as Partial<SessionMessage>
  if (
    typeof message.id !== 'string' ||
    !isMessageRole(message.role) ||
    typeof message.content !== 'string' ||
    typeof message.createdAt !== 'string'
  ) {
    throw new AppError('SESSION_INVALID', `Invalid session message shape: ${filePath}`)
  }

  if (message.toolName !== undefined && typeof message.toolName !== 'string') {
    throw new AppError('SESSION_INVALID', `Invalid session message tool name: ${filePath}`)
  }
}

function isSafeSessionId(id: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id)
}

function isSessionStatus(status: unknown): status is SessionStatus {
  return status === 'active' || status === 'completed' || status === 'failed'
}

function isMessageRole(role: unknown): role is SessionMessage['role'] {
  return role === 'system' || role === 'user' || role === 'assistant' || role === 'tool'
}

function toSummary(session: SessionRecord): SessionSummary {
  return {
    id: session.id,
    kind: session.kind,
    status: session.status,
    title: session.title,
    workspaceRoot: session.workspaceRoot,
    ...(session.model !== undefined ? {model: session.model} : {}),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messageCount: session.messages.length,
  }
}
