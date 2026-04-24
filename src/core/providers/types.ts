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
