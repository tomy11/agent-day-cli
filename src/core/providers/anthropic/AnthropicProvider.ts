import type {ChatMessage, ChatRequest, ChatResponse, LlmProvider} from '../types'
import type {ToolDefinition} from '../../tools'
import {AppError} from '../../errors'
import {formatNativeToolCallResponse} from '../nativeToolCalls'
import {getToolInputSchema, toProviderJsonSchema} from '../toolSchemas'

interface AnthropicProviderOptions {
  apiKey?: string
  baseUrl?: string
  model: string
  timeoutMs?: number
  tools?: ToolDefinition[]
}

interface AnthropicResponse {
  error?: {
    message?: string
  }
  model?: string
  content?: Array<
    | {
        type: 'text'
        text?: string
      }
    | {
        type: 'tool_use'
        id?: string
        name?: string
        input?: unknown
      }
  >
}

export class AnthropicProvider implements LlmProvider {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly model: string
  private readonly timeoutMs: number
  private readonly tools: ToolDefinition[]

  public constructor(options: AnthropicProviderOptions) {
    this.apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? ''
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? 'https://api.anthropic.com')
    this.model = options.model
    this.timeoutMs = options.timeoutMs ?? 60_000
    this.tools = options.tools ?? []

    if (!this.apiKey) {
      throw new AppError('ANTHROPIC_API_KEY_MISSING', 'ANTHROPIC_API_KEY is required for provider.type=anthropic', {
        meta: {provider: 'anthropic'},
      })
    }
  }

  public async chat(request: ChatRequest): Promise<ChatResponse> {
    const controller = new AbortController()
    const shouldUseTimeout = this.timeoutMs > 0
    const timeout = shouldUseTimeout
      ? setTimeout(() => controller.abort(), this.timeoutMs)
      : undefined

    try {
      const split = splitSystemMessages(request.messages)
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: request.maxTokens ?? 4096,
          messages: split.messages,
          ...(split.system.length > 0 ? {system: split.system.join('\n\n')} : {}),
          ...(request.temperature !== undefined ? {temperature: request.temperature} : {}),
          ...(this.tools.length > 0 ? {tools: this.tools.map(toAnthropicTool)} : {}),
        }),
        signal: shouldUseTimeout ? controller.signal : undefined,
      })

      const rawBody = (await response.json()) as AnthropicResponse

      if (!response.ok) {
        const detail = rawBody.error?.message ?? `HTTP ${response.status}`
        throw new AppError('ANTHROPIC_HTTP_ERROR', `Anthropic request failed: ${detail}`, {
          meta: {status: response.status, model: this.model},
        })
      }

      const blocks = rawBody.content ?? []
      const text = blocks
        .filter((block): block is {type: 'text'; text?: string} => block.type === 'text')
        .map(block => block.text ?? '')
        .join('')
      const toolCalls = blocks
        .filter((block): block is {type: 'tool_use'; id?: string; name?: string; input?: unknown} => block.type === 'tool_use')
        .flatMap((block, index) => {
          if (!block.name) {
            return []
          }

          return [{
            id: block.id ?? `call-${index + 1}`,
            name: block.name,
            input: block.input ?? {},
          }]
        })

      if (toolCalls.length === 0 && text.length === 0) {
        throw new AppError('ANTHROPIC_RESPONSE_ERROR', 'Anthropic response missing content and tool calls', {
          meta: {model: this.model},
        })
      }

      return {
        content: toolCalls.length > 0 ? formatNativeToolCallResponse(text, toolCalls) : text,
        model: rawBody.model ?? this.model,
        raw: rawBody,
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AppError(
          'ANTHROPIC_TIMEOUT',
          `Anthropic request timed out after ${this.timeoutMs}ms (model: ${this.model}).`,
          {cause: error, meta: {model: this.model, timeoutMs: this.timeoutMs}},
        )
      }

      if (error instanceof AppError) {
        throw error
      }

      throw new AppError('ANTHROPIC_NETWORK_ERROR', `Anthropic network error: ${getErrorMessage(error)}`, {
        cause: error,
        meta: {model: this.model, baseUrl: this.baseUrl},
      })
    } finally {
      if (timeout) {
        clearTimeout(timeout)
      }
    }
  }
}

function splitSystemMessages(messages: ChatMessage[]): {system: string[]; messages: ChatMessage[]} {
  return {
    system: messages.filter(message => message.role === 'system').map(message => message.content),
    messages: messages.filter(message => message.role !== 'system'),
  }
}

function toAnthropicTool(tool: ToolDefinition): Record<string, unknown> {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: toProviderJsonSchema(getToolInputSchema(tool)),
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
