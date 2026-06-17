import test from 'node:test'
import assert from 'node:assert/strict'
import {parseToolCallMessage} from '../../core/agent'
import {AppError} from '../../core/errors'
import {AnthropicProvider} from '../../core/providers'
import {createListDirTool} from '../../core/tools'

test('AnthropicProvider sends native tools and converts tool_use blocks to agent JSON', async () => {
  const originalFetch = globalThis.fetch
  let requestBody: Record<string, unknown> | undefined

  globalThis.fetch = (async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
    return new Response(
      JSON.stringify({
        model: 'claude-test',
        content: [
          {
            type: 'text',
            text: 'Listing.',
          },
          {
            type: 'tool_use',
            id: 'call-anthropic',
            name: 'list_dir',
            input: {
              path: 'src',
            },
          },
        ],
      }),
      {status: 200},
    )
  }) as typeof fetch

  try {
    const provider = new AnthropicProvider({
      apiKey: 'test-key',
      model: 'claude-test',
      baseUrl: 'https://api.anthropic.test',
      timeoutMs: 1000,
      tools: [createListDirTool()],
    })

    const response = await provider.chat({
      messages: [
        {role: 'system', content: 'Be concise.'},
        {role: 'user', content: 'list src'},
      ],
    })
    const parsed = parseToolCallMessage(response.content)

    assert.equal(response.model, 'claude-test')
    assert.equal(parsed.content, 'Listing.')
    assert.deepEqual(parsed.toolCalls, [
      {
        id: 'call-anthropic',
        name: 'list_dir',
        input: {
          path: 'src',
        },
      },
    ])
    assert.equal(requestBody?.system, 'Be concise.')
    assert.equal((requestBody?.tools as unknown[] | undefined)?.length, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('AnthropicProvider requires ANTHROPIC_API_KEY when apiKey option is absent', () => {
  const original = process.env.ANTHROPIC_API_KEY
  delete process.env.ANTHROPIC_API_KEY

  try {
    assert.throws(
      () => new AnthropicProvider({model: 'claude-test', apiKey: ''}),
      (error: unknown) => {
        assert.ok(error instanceof AppError)
        assert.equal(error.code, 'ANTHROPIC_API_KEY_MISSING')
        return true
      },
    )
  } finally {
    if (original !== undefined) {
      process.env.ANTHROPIC_API_KEY = original
    }
  }
})
