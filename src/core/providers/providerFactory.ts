import {AppError} from '../errors'
import type {LlmProvider, ProviderSettings, ProviderToolOptions} from './types'
import {AnthropicProvider} from './anthropic/AnthropicProvider'
import {OllamaProvider} from './ollama/OllamaProvider'
import {OpenAIProvider} from './openai/OpenAIProvider'
import {OpenRouterProvider} from './openrouter/OpenRouterProvider'
import {GeminiProvider} from './gemini/GeminiProvider'
import {MistralProvider} from './mistral/MistralProvider'

export function createProvider(settings: ProviderSettings, options: ProviderToolOptions = {}): LlmProvider {
  switch (settings.type) {
    case 'ollama':
      return new OllamaProvider({
        model: settings.model,
        baseUrl: settings.baseUrl,
        timeoutMs: settings.timeoutMs,
      })
    case 'openai':
      return new OpenAIProvider({
        model: settings.model,
        embeddingModel: settings.embeddingModel,
        baseUrl: settings.baseUrl,
        timeoutMs: settings.timeoutMs,
        tools: options.tools,
      })
    case 'anthropic':
      return new AnthropicProvider({
        model: settings.model,
        baseUrl: settings.baseUrl,
        timeoutMs: settings.timeoutMs,
        tools: options.tools,
      })
    case 'openrouter':
      return new OpenRouterProvider({
        model: settings.model,
        baseUrl: settings.baseUrl,
        timeoutMs: settings.timeoutMs,
        tools: options.tools,
      })
    case 'gemini':
      return new GeminiProvider({
        model: settings.model,
        embeddingModel: settings.embeddingModel,
        baseUrl: settings.baseUrl,
        timeoutMs: settings.timeoutMs,
        tools: options.tools,
      })
    case 'mistral':
      return new MistralProvider({
        model: settings.model,
        embeddingModel: settings.embeddingModel,
        baseUrl: settings.baseUrl,
        timeoutMs: settings.timeoutMs,
        tools: options.tools,
      })
    default:
      throw new AppError('CONFIG_INVALID', `Unsupported provider type: ${(settings as {type?: unknown}).type}`)
  }
}
