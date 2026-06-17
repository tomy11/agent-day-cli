import type {ToolDefinition} from '../tools'

export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface ChatRequest {
  messages: ChatMessage[]
  maxTokens?: number
  temperature?: number
}

export interface ChatResponse {
  content: string
  model: string
  raw?: unknown
}

export interface LlmProvider {
  chat(request: ChatRequest): Promise<ChatResponse>
}

export const PROVIDER_TYPES = ['ollama', 'openai', 'anthropic', 'openrouter', 'gemini', 'mistral'] as const

export type ProviderType = (typeof PROVIDER_TYPES)[number]

export interface ProviderSettings {
  type: ProviderType
  model: string
  baseUrl: string
  timeoutMs: number
}

export interface ProviderToolOptions {
  tools?: ToolDefinition[]
}

export function isProviderType(value: unknown): value is ProviderType {
  return typeof value === 'string' && (PROVIDER_TYPES as readonly string[]).includes(value)
}

export function formatProviderTypes(): string {
  return PROVIDER_TYPES.join(', ')
}
