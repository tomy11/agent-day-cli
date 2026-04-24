import type {ChatRequest, ChatResponse, LlmProvider} from '../types'
import {AppError} from '../../errors'

interface OllamaProviderOptions {
  baseUrl?: string
  model: string
  timeoutMs?: number
}

interface OllamaChatResponse {
  error?: string
  model?: string
  message?: {
    role?: string
    content?: string
  }
}

export class OllamaProvider implements LlmProvider {
  private readonly baseUrl: string
  private readonly model: string
  private readonly timeoutMs: number

  public constructor(options: OllamaProviderOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? 'http://localhost:11434')
    this.model = options.model
    this.timeoutMs = options.timeoutMs ?? 60_000
  }

  public async chat(request: ChatRequest): Promise<ChatResponse> {
    const controller = new AbortController()
    const shouldUseTimeout = this.timeoutMs > 0
    const timeout = shouldUseTimeout
      ? setTimeout(() => controller.abort(), this.timeoutMs)
      : undefined

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          messages: request.messages,
          options: {
            temperature: request.temperature,
            num_predict: request.maxTokens,
          },
        }),
        signal: shouldUseTimeout ? controller.signal : undefined,
      })

      const rawBody = (await response.json()) as OllamaChatResponse

      if (!response.ok) {
        const detail = rawBody.error ?? `HTTP ${response.status}`
        throw new AppError('OLLAMA_HTTP_ERROR', `Ollama request failed: ${detail}`, {
          meta: {status: response.status, model: this.model},
        })
      }

      if (rawBody.error) {
        throw new AppError('OLLAMA_RESPONSE_ERROR', `Ollama request failed: ${rawBody.error}`, {
          meta: {model: this.model},
        })
      }

      const content = rawBody.message?.content
      const model = rawBody.model ?? this.model

      if (!content) {
        throw new AppError('OLLAMA_RESPONSE_ERROR', 'Ollama response missing message content', {
          meta: {model: this.model},
        })
      }

      return {
        content,
        model,
        raw: rawBody,
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AppError(
          'OLLAMA_TIMEOUT',
          `Ollama request timed out after ${this.timeoutMs}ms (model: ${this.model}). ` +
            'Try increasing --timeout-ms for slower models.',
          {cause: error, meta: {model: this.model, timeoutMs: this.timeoutMs}},
        )
      }

      if (error instanceof AppError) {
        throw error
      }

      throw new AppError('OLLAMA_NETWORK_ERROR', `Ollama network error: ${getErrorMessage(error)}`, {
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

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
