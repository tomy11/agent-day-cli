import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AnthropicProvider,
  GeminiProvider,
  MistralProvider,
  OllamaProvider,
  OpenAIProvider,
  OpenRouterProvider,
  createProvider,
} from '../../core/providers'

test('createProvider selects Ollama provider without requiring cloud API keys', () => {
  const provider = createProvider({
    type: 'ollama',
    model: 'llama3.1',
    baseUrl: 'http://localhost:11434',
    timeoutMs: 1000,
  })

  assert.ok(provider instanceof OllamaProvider)
})

test('createProvider selects OpenAI provider using OPENAI_API_KEY from env', t => {
  const original = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = 'test-openai-key'
  t.after(() => {
    if (original === undefined) {
      delete process.env.OPENAI_API_KEY
    } else {
      process.env.OPENAI_API_KEY = original
    }
  })

  const provider = createProvider({
    type: 'openai',
    model: 'gpt-test',
    baseUrl: 'https://api.openai.test/v1',
    timeoutMs: 1000,
  })

  assert.ok(provider instanceof OpenAIProvider)
})

test('createProvider selects Anthropic provider using ANTHROPIC_API_KEY from env', t => {
  const original = process.env.ANTHROPIC_API_KEY
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key'
  t.after(() => {
    if (original === undefined) {
      delete process.env.ANTHROPIC_API_KEY
    } else {
      process.env.ANTHROPIC_API_KEY = original
    }
  })

  const provider = createProvider({
    type: 'anthropic',
    model: 'claude-test',
    baseUrl: 'https://api.anthropic.test',
    timeoutMs: 1000,
  })

  assert.ok(provider instanceof AnthropicProvider)
})

test('createProvider selects OpenRouter provider using OPENROUTER_API_KEY from env', t => {
  const original = process.env.OPENROUTER_API_KEY
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key'
  t.after(() => {
    if (original === undefined) {
      delete process.env.OPENROUTER_API_KEY
    } else {
      process.env.OPENROUTER_API_KEY = original
    }
  })

  const provider = createProvider({
    type: 'openrouter',
    model: 'openai/gpt-4.1-mini',
    baseUrl: 'https://openrouter.ai/api/v1',
    timeoutMs: 1000,
  })

  assert.ok(provider instanceof OpenRouterProvider)
})

test('createProvider selects Gemini provider using GEMINI_API_KEY from env', t => {
  const original = process.env.GEMINI_API_KEY
  process.env.GEMINI_API_KEY = 'test-gemini-key'
  t.after(() => {
    if (original === undefined) {
      delete process.env.GEMINI_API_KEY
    } else {
      process.env.GEMINI_API_KEY = original
    }
  })

  const provider = createProvider({
    type: 'gemini',
    model: 'gemini-3.5-flash',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    timeoutMs: 1000,
  })

  assert.ok(provider instanceof GeminiProvider)
})

test('createProvider selects Mistral provider using MISTRAL_API_KEY from env', t => {
  const original = process.env.MISTRAL_API_KEY
  process.env.MISTRAL_API_KEY = 'test-mistral-key'
  t.after(() => {
    if (original === undefined) {
      delete process.env.MISTRAL_API_KEY
    } else {
      process.env.MISTRAL_API_KEY = original
    }
  })

  const provider = createProvider({
    type: 'mistral',
    model: 'mistral-large-latest',
    baseUrl: 'https://api.mistral.ai/v1',
    timeoutMs: 1000,
  })

  assert.ok(provider instanceof MistralProvider)
})
