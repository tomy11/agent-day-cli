import type {ChatRequest, ChatResponse, EmbeddingRequest, EmbeddingResponse, LlmProvider} from '../types'
import type {ToolDefinition} from '../../tools'
import {AppError} from '../../errors'
import {formatNativeToolCallResponse, parseToolArguments} from '../nativeToolCalls'
import {getToolInputSchema, toProviderJsonSchema} from '../toolSchemas'

interface OpenAIProviderOptions {
  apiKey?: string
  baseUrl?: string
  model: string
  embeddingModel?: string
  timeoutMs?: number
  tools?: ToolDefinition[]
}

interface OpenAIChatResponse {
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

interface OpenAIEmbeddingResponse {
  error?: {
    message?: string
  }
  model?: string
  data?: Array<{
    index?: number
    embedding?: number[]
  }>
}

export class OpenAIProvider implements LlmProvider {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly model: string
  private readonly embeddingModel?: string
  private readonly timeoutMs: number
  private readonly tools: ToolDefinition[]

  public constructor(options: OpenAIProviderOptions) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY ?? ''
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? 'https://api.openai.com/v1')
    this.model = options.model
    this.embeddingModel = options.embeddingModel
    this.timeoutMs = options.timeoutMs ?? 60_000
    this.tools = options.tools ?? []

    if (!this.apiKey) {
      throw new AppError('OPENAI_API_KEY_MISSING', 'OPENAI_API_KEY is required for provider.type=openai', {
        meta: {provider: 'openai'},
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
          ...(this.tools.length > 0 ? {tools: this.tools.map(toOpenAITool), tool_choice: 'auto'} : {}),
        }),
        signal: shouldUseTimeout ? controller.signal : undefined,
      })

      const rawBody = (await response.json()) as OpenAIChatResponse

      if (!response.ok) {
        const detail = rawBody.error?.message ?? `HTTP ${response.status}`
        throw new AppError('OPENAI_HTTP_ERROR', `OpenAI request failed: ${detail}`, {
          meta: {status: response.status, model: this.model},
        })
      }

      const message = rawBody.choices?.[0]?.message
      if (!message) {
        throw new AppError('OPENAI_RESPONSE_ERROR', 'OpenAI response missing assistant message', {
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
        throw new AppError('OPENAI_RESPONSE_ERROR', 'OpenAI response missing content and tool calls', {
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
          'OPENAI_TIMEOUT',
          `OpenAI request timed out after ${this.timeoutMs}ms (model: ${this.model}).`,
          {cause: error, meta: {model: this.model, timeoutMs: this.timeoutMs}},
        )
      }

      if (error instanceof AppError) {
        throw error
      }

      throw new AppError('OPENAI_NETWORK_ERROR', `OpenAI network error: ${getErrorMessage(error)}`, {
        cause: error,
        meta: {model: this.model, baseUrl: this.baseUrl},
      })
    } finally {
      if (timeout) {
        clearTimeout(timeout)
      }
    }
  }

  public async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    if (!this.embeddingModel) {
      throw new AppError('OPENAI_RESPONSE_ERROR', 'OpenAI embeddingModel is not configured', {
        meta: {provider: 'openai'},
      })
    }

    const controller = new AbortController()
    const shouldUseTimeout = this.timeoutMs > 0
    const timeout = shouldUseTimeout
      ? setTimeout(() => controller.abort(), this.timeoutMs)
      : undefined

    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.embeddingModel,
          input: request.inputs,
          encoding_format: 'float',
        }),
        signal: shouldUseTimeout ? controller.signal : undefined,
      })

      const rawBody = (await response.json()) as OpenAIEmbeddingResponse

      if (!response.ok) {
        const detail = rawBody.error?.message ?? `HTTP ${response.status}`
        throw new AppError('OPENAI_HTTP_ERROR', `OpenAI embeddings request failed: ${detail}`, {
          meta: {status: response.status, model: this.embeddingModel},
        })
      }

      const embeddings = normalizeIndexedEmbeddings(rawBody.data)
      if (embeddings.length !== request.inputs.length) {
        throw new AppError('OPENAI_RESPONSE_ERROR', 'OpenAI embeddings response count did not match inputs', {
          meta: {model: this.embeddingModel, expected: request.inputs.length, actual: embeddings.length},
        })
      }

      return {
        embeddings,
        model: rawBody.model ?? this.embeddingModel,
        raw: rawBody,
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AppError(
          'OPENAI_TIMEOUT',
          `OpenAI embeddings request timed out after ${this.timeoutMs}ms (model: ${this.embeddingModel}).`,
          {cause: error, meta: {model: this.embeddingModel, timeoutMs: this.timeoutMs}},
        )
      }

      if (error instanceof AppError) {
        throw error
      }

      throw new AppError('OPENAI_NETWORK_ERROR', `OpenAI embeddings network error: ${getErrorMessage(error)}`, {
        cause: error,
        meta: {model: this.embeddingModel, baseUrl: this.baseUrl},
      })
    } finally {
      if (timeout) {
        clearTimeout(timeout)
      }
    }
  }
}

function toOpenAITool(tool: ToolDefinition): Record<string, unknown> {
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

function normalizeIndexedEmbeddings(data: OpenAIEmbeddingResponse['data']): number[][] {
  return (data ?? [])
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .flatMap(item => (Array.isArray(item.embedding) ? [item.embedding] : []))
}
