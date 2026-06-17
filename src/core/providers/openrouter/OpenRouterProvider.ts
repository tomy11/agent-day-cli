import type {ChatRequest, ChatResponse, LlmProvider} from '../types'
import type {ToolDefinition} from '../../tools'
import {AppError} from '../../errors'
import {formatNativeToolCallResponse, parseToolArguments} from '../nativeToolCalls'
import {getToolInputSchema, toProviderJsonSchema} from '../toolSchemas'

interface OpenRouterProviderOptions {
  apiKey?: string
  baseUrl?: string
  model: string
  timeoutMs?: number
  tools?: ToolDefinition[]
}

interface OpenRouterChatResponse {
  error?: {
    message?: string
  }
  model?: string
  choices?: Array<{
    message?: {
      content?: string | null
      tool_calls?: Array<{
        id?: string
        type?: string
        function?: {
          name?: string
          arguments?: string
        }
      }>
    }
  }>
}

export class OpenRouterProvider implements LlmProvider {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly model: string
  private readonly timeoutMs: number
  private readonly tools: ToolDefinition[]

  public constructor(options: OpenRouterProviderOptions) {
    this.apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY ?? ''
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? 'https://openrouter.ai/api/v1')
    this.model = options.model
    this.timeoutMs = options.timeoutMs ?? 60_000
    this.tools = options.tools ?? []

    if (!this.apiKey) {
      throw new AppError('OPENROUTER_API_KEY_MISSING', 'OPENROUTER_API_KEY is required for provider.type=openrouter', {
        meta: {provider: 'openrouter'},
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
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: request.messages,
          ...(request.temperature !== undefined ? {temperature: request.temperature} : {}),
          ...(request.maxTokens !== undefined ? {max_tokens: request.maxTokens} : {}),
          ...(this.tools.length > 0 ? {tools: this.tools.map(toOpenRouterTool), tool_choice: 'auto'} : {}),
        }),
        signal: shouldUseTimeout ? controller.signal : undefined,
      })

      const rawBody = (await response.json()) as OpenRouterChatResponse

      if (!response.ok) {
        const detail = rawBody.error?.message ?? `HTTP ${response.status}`
        throw new AppError('OPENROUTER_HTTP_ERROR', `OpenRouter request failed: ${detail}`, {
          meta: {status: response.status, model: this.model},
        })
      }

      const message = rawBody.choices?.[0]?.message
      if (!message) {
        throw new AppError('OPENROUTER_RESPONSE_ERROR', 'OpenRouter response missing assistant message', {
          meta: {model: this.model},
        })
      }

      const toolCalls = (message.tool_calls ?? [])
        .filter(toolCall => toolCall.type === undefined || toolCall.type === 'function')
        .flatMap((toolCall, index) => {
          const name = toolCall.function?.name
          if (!name) {
            return []
          }

          return [{
            id: toolCall.id ?? `call-${index + 1}`,
            name,
            input: parseToolArguments(toolCall.function?.arguments),
          }]
        })
      const content = message.content ?? ''

      if (toolCalls.length === 0 && content.length === 0) {
        throw new AppError('OPENROUTER_RESPONSE_ERROR', 'OpenRouter response missing content and tool calls', {
          meta: {model: this.model},
        })
      }

      return {
        content: toolCalls.length > 0 ? formatNativeToolCallResponse(content, toolCalls) : content,
        model: rawBody.model ?? this.model,
        raw: rawBody,
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AppError(
          'OPENROUTER_TIMEOUT',
          `OpenRouter request timed out after ${this.timeoutMs}ms (model: ${this.model}).`,
          {cause: error, meta: {model: this.model, timeoutMs: this.timeoutMs}},
        )
      }

      if (error instanceof AppError) {
        throw error
      }

      throw new AppError('OPENROUTER_NETWORK_ERROR', `OpenRouter network error: ${getErrorMessage(error)}`, {
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

function toOpenRouterTool(tool: ToolDefinition): Record<string, unknown> {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: toProviderJsonSchema(getToolInputSchema(tool)),
    },
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
