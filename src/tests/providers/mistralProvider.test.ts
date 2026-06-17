import test from 'node:test'
import assert from 'node:assert/strict'
import {parseToolCallMessage} from '../../core/agent'
import {AppError} from '../../core/errors'
import {MistralProvider} from '../../core/providers'
import {createSearchFilesTool} from '../../core/tools'

test('MistralProvider sends OpenAI-compatible tools and converts tool calls to agent JSON', async () => {
  const originalFetch = globalThis.fetch
  let requestUrl = ''
  let requestBody: Record<string, unknown> | undefined

  globalThis.fetch = (async (input, init) => {
    requestUrl = String(input)
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
    return new Response(
      JSON.stringify({
        model: 'mistral-large-latest',
        choices: [
          {
            message: {
              content: 'Searching.',
              tool_calls: [
                {
                  id: 'call-mistral',
                  type: 'function',
                  function: {
                    name: 'search_files',
                    arguments: JSON.stringify({query: 'Needle', path: 'src'}),
                  },
                },
              ],
            },
          },
        ],
      }),
      {status: 200},
    )
  }) as typeof fetch

  try {
    const provider = new MistralProvider({
      apiKey: 'test-key',
      model: 'mistral-large-latest',
      baseUrl: 'https://api.mistral.ai/v1',
      timeoutMs: 1000,
      tools: [createSearchFilesTool()],
    })

    const response = await provider.chat({
      messages: [{role: 'user', content: 'find Needle'}],
    })
    const parsed = parseToolCallMessage(response.content)

    assert.equal(requestUrl, 'https://api.mistral.ai/v1/chat/completions')
    assert.equal(response.model, 'mistral-large-latest')
    assert.equal(parsed.content, 'Searching.')
    assert.deepEqual(parsed.toolCalls, [
      {
        id: 'call-mistral',
        name: 'search_files',
        input: {
          query: 'Needle',
          path: 'src',
        },
      },
    ])
    assert.equal((requestBody?.tools as unknown[] | undefined)?.length, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('MistralProvider requires MISTRAL_API_KEY when apiKey option is absent', () => {
  const original = process.env.MISTRAL_API_KEY
  delete process.env.MISTRAL_API_KEY

  try {
    assert.throws(
      () => new MistralProvider({model: 'mistral-large-latest', apiKey: ''}),
      (error: unknown) => {
        assert.ok(error instanceof AppError)
        assert.equal(error.code, 'MISTRAL_API_KEY_MISSING')
        return true
      },
    )
  } finally {
    if (original !== undefined) {
      process.env.MISTRAL_API_KEY = original
    }
  }
})

test('MistralProvider creates embeddings with the configured embedding model', async () => {
  const originalFetch = globalThis.fetch
  let requestUrl = ''
  let requestBody: Record<string, unknown> | undefined

  globalThis.fetch = (async (input, init) => {
    requestUrl = String(input)
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
    return new Response(
      JSON.stringify({
        model: 'mistral-embed',
        data: [
          {index: 0, embedding: [1, 0]},
          {index: 1, embedding: [0, 1]},
        ],
      }),
      {status: 200},
    )
  }) as typeof fetch

  try {
    const provider = new MistralProvider({
      apiKey: 'test-key',
      model: 'mistral-large-latest',
      embeddingModel: 'mistral-embed',
      baseUrl: 'https://api.mistral.ai/v1',
      timeoutMs: 1000,
    })

    const response = await provider.embed({inputs: ['alpha', 'beta']})

    assert.equal(requestUrl, 'https://api.mistral.ai/v1/embeddings')
    assert.deepEqual(requestBody, {
      model: 'mistral-embed',
      input: ['alpha', 'beta'],
      encoding_format: 'float',
    })
    assert.deepEqual(response.embeddings, [[1, 0], [0, 1]])
  } finally {
    globalThis.fetch = originalFetch
  }
})
