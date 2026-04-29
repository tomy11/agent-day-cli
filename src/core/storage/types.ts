export type SessionKind = 'chat' | 'run'
export type SessionStatus = 'active' | 'completed' | 'failed'
export type SessionMessageRole = 'system' | 'user' | 'assistant' | 'tool'

export interface SessionMessage {
  id: string
  role: SessionMessageRole
  content: string
  createdAt: string
  toolName?: string
  metadata?: Record<string, unknown>
}

export interface SessionRecord {
  id: string
  version: number
  kind: SessionKind
  status: SessionStatus
  title: string
  workspaceRoot: string
  model?: string
  createdAt: string
  updatedAt: string
  messages: SessionMessage[]
  metadata?: Record<string, unknown>
}

export interface SessionSummary {
  id: string
  kind: SessionKind
  status: SessionStatus
  title: string
  workspaceRoot: string
  model?: string
  createdAt: string
  updatedAt: string
  messageCount: number
}

export interface CreateSessionInput {
  kind: SessionKind
  title: string
  workspaceRoot: string
  model?: string
  status?: SessionStatus
  metadata?: Record<string, unknown>
}

export interface AppendSessionMessageInput {
  role: SessionMessageRole
  content: string
  toolName?: string
  metadata?: Record<string, unknown>
}
