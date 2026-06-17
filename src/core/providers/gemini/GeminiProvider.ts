import type {ChatMessage, ChatRequest, ChatResponse, LlmProvider} from '../types'
import type {ToolDefinition} from '../../tools'
import {AppError} from '../../errors'
import {formatNativeToolCallResponse} from '../nativeToolCalls'
import {getToolInputSchema, toProviderJsonSchema} from '../toolSchemas'

interface GeminiProviderOptions {
  apiKey?: string
  baseUrl?: string
  model: string
  timeoutMs?: number
  tools?: ToolDefinition[]
}

interface GeminiFunctionCall {
  id?: string
  name?: string
  args?: unknown
}

interface GeminiPart {
  text?: string
  functionCall?: GeminiFunctionCall
  function_call?: GeminiFunctionCall
}

interface GeminiResponse {
  error?: {
    message?: string
  }
  modelVersion?: string
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[]
    }
  }>
}

interface GeminiContent {
  role: 'user' | 'model'
  parts: Array<{text: string}>
}

export class GeminiProvider implements LlmProvider {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly model: string
  private readonly timeoutMs: number
  private readonly tools: ToolDefinition[]

  public constructor(options: GeminiProviderOptions) {
    this.apiKey = options.apiKey ?? process.env.GEMINI_API_KEY ?? ''
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta')
    this.model = options.model
    this.timeoutMs = options.timeoutMs ?? 60_000
    this.tools = options.tools ?? []

    if (!this.apiKey) {
      throw new AppError('GEMINI_API_KEY_MISSING', 'GEMINI_API_KEY is required for provider.type=gemini', {
        meta: {provider: 'gemini'},
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
      const response = await fetch(`${this.baseUrl}/${toGeminiModelPath(this.model)}:generateContent`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify({
          contents: split.contents,
          ...(split.system.length > 0
            ? {
                systemInstruction: {
                  parts: [{text: split.system.join('\n\n')}],
                },
              }
            : {}),
          ...(request.temperature !== undefined || request.maxTokens !== undefined
            ? {
                generationConfig: {
                  ...(request.temperature !== undefined ? {temperature: request.temperature} : {}),
                  ...(request.maxTokens !== undefined ? {maxOutputTokens: request.maxTokens} : {}),
                },
              }
            : {}),
          ...(this.tools.length > 0
            ? {
                tools: [
                  {
                    functionDeclarations: this.tools.map(toGeminiFunctionDeclaration),
                  },
                ],
              }
            : {}),
        }),
        signal: shouldUseTimeout ? controller.signal : undefined,
      })

      const rawBody = (await response.json()) as GeminiResponse

      if (!response.ok) {
        const detail = rawBody.error?.message ?? `HTTP ${response.status}`
        throw new AppError('GEMINI_HTTP_ERROR', `Gemini request failed: ${detail}`, {
          meta: {status: response.status, model: this.model},
        })
      }

      const parts = rawBody.candidates?.[0]?.content?.parts ?? []
      const text = parts.map(part => part.text ?? '').join('')
      const toolCalls = parts.flatMap((part, index) => {
        const functionCall = part.functionCall ?? part.function_call
        if (!functionCall?.name) {
          return []
        }

        return [{
          id: functionCall.id ?? `call-${index + 1}`,
          name: functionCall.name,
          input: functionCall.args ?? {},
        }]
      })

      if (toolCalls.length === 0 && text.length === 0) {
        throw new AppError('GEMINI_RESPONSE_ERROR', 'Gemini response missing content and function calls', {
          meta: {model: this.model},
        })
      }

      return {
        content: toolCalls.length > 0 ? formatNativeToolCallResponse(text, toolCalls) : text,
        model: rawBody.modelVersion ?? this.model,
        raw: rawBody,
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AppError(
          'GEMINI_TIMEOUT',
          `Gemini request timed out after ${this.timeoutMs}ms (model: ${this.model}).`,
          {cause: error, meta: {model: this.model, timeoutMs: this.timeoutMs}},
        )
      }

      if (error instanceof AppError) {
        throw error
      }

      throw new AppError('GEMINI_NETWORK_ERROR', `Gemini network error: ${getErrorMessage(error)}`, {
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

function splitSystemMessages(messages: ChatMessage[]): {system: string[]; contents: GeminiContent[]} {
  return {
    system: messages.filter(message => message.role === 'system').map(message => message.content),
    contents: messages
      .filter(message => message.role !== 'system')
      .map(message => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{text: message.content}],
      })),
  }
}

function toGeminiFunctionDeclaration(tool: ToolDefinition): Record<string, unknown> {
  return {
    name: tool.name,
    description: tool.description,
    parameters: toProviderJsonSchema(getToolInputSchema(tool)),
  }
}

function toGeminiModelPath(model: string): string {
  return model.startsWith('models/') ? model : `models/${model}`
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
