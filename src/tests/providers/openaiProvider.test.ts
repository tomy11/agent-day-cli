import test from 'node:test'
import assert from 'node:assert/strict'
import {parseToolCallMessage} from '../../core/agent'
import {AppError} from '../../core/errors'
import {OpenAIProvider} from '../../core/providers'
import {createSearchFilesTool} from '../../core/tools'

test('OpenAIProvider sends native tools and converts native tool calls to agent JSON', async () => {
  const originalFetch = globalThis.fetch
  let requestBody: Record<string, unknown> | undefined

  globalThis.fetch = (async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
    return new Response(
      JSON.stringify({
        model: 'gpt-test',
        choices: [
          {
            message: {
              content: 'Searching.',
              tool_calls: [
                {
                  id: 'call-openai',
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
    const provider = new OpenAIProvider({
      apiKey: 'test-key',
      model: 'gpt-test',
      baseUrl: 'https://api.openai.test/v1',
      timeoutMs: 1000,
      tools: [createSearchFilesTool()],
    })

    const response = await provider.chat({
      messages: [{role: 'user', content: 'find Needle'}],
    })
    const parsed = parseToolCallMessage(response.content)

    assert.equal(response.model, 'gpt-test')
    assert.equal(parsed.content, 'Searching.')
    assert.deepEqual(parsed.toolCalls, [
      {
        id: 'call-openai',
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

test('OpenAIProvider requires OPENAI_API_KEY when apiKey option is absent', () => {
  const original = process.env.OPENAI_API_KEY
  delete process.env.OPENAI_API_KEY

  try {
    assert.throws(
      () => new OpenAIProvider({model: 'gpt-test', apiKey: ''}),
      (error: unknown) => {
        assert.ok(error instanceof AppError)
        assert.equal(error.code, 'OPENAI_API_KEY_MISSING')
        return true
      },
    )
  } finally {
    if (original !== undefined) {
      process.env.OPENAI_API_KEY = original
    }
  }
})
