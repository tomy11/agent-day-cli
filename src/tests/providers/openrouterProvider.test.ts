import test from 'node:test'
import assert from 'node:assert/strict'
import {parseToolCallMessage} from '../../core/agent'
import {AppError} from '../../core/errors'
import {OpenRouterProvider} from '../../core/providers'
import {createSearchFilesTool} from '../../core/tools'

test('OpenRouterProvider sends OpenAI-compatible tools and converts tool calls to agent JSON', async () => {
  const originalFetch = globalThis.fetch
  let requestUrl = ''
  let requestBody: Record<string, unknown> | undefined

  globalThis.fetch = (async (input, init) => {
    requestUrl = String(input)
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
    return new Response(
      JSON.stringify({
        model: 'anthropic/claude-sonnet-4.5',
        choices: [
          {
            message: {
              content: 'Searching.',
              tool_calls: [
                {
                  id: 'call-openrouter',
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
    const provider = new OpenRouterProvider({
      apiKey: 'test-key',
      model: 'anthropic/claude-sonnet-4.5',
      baseUrl: 'https://openrouter.ai/api/v1',
      timeoutMs: 1000,
      tools: [createSearchFilesTool()],
    })

    const response = await provider.chat({
      messages: [{role: 'user', content: 'find Needle'}],
    })
    const parsed = parseToolCallMessage(response.content)

    assert.equal(requestUrl, 'https://openrouter.ai/api/v1/chat/completions')
    assert.equal(response.model, 'anthropic/claude-sonnet-4.5')
    assert.equal(parsed.content, 'Searching.')
    assert.deepEqual(parsed.toolCalls, [
      {
        id: 'call-openrouter',
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

test('OpenRouterProvider requires OPENROUTER_API_KEY when apiKey option is absent', () => {
  const original = process.env.OPENROUTER_API_KEY
  delete process.env.OPENROUTER_API_KEY

  try {
    assert.throws(
      () => new OpenRouterProvider({model: 'openai/gpt-4.1-mini', apiKey: ''}),
      (error: unknown) => {
        assert.ok(error instanceof AppError)
        assert.equal(error.code, 'OPENROUTER_API_KEY_MISSING')
        return true
      },
    )
  } finally {
    if (original !== undefined) {
      process.env.OPENROUTER_API_KEY = original
    }
  }
})
