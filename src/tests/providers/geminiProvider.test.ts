import test from 'node:test'
import assert from 'node:assert/strict'
import {parseToolCallMessage} from '../../core/agent'
import {AppError} from '../../core/errors'
import {GeminiProvider} from '../../core/providers'
import {createSearchFilesTool} from '../../core/tools'

test('GeminiProvider sends generateContent tools and converts function calls to agent JSON', async () => {
  const originalFetch = globalThis.fetch
  let requestUrl = ''
  let requestHeaders: Headers | undefined
  let requestBody: Record<string, unknown> | undefined

  globalThis.fetch = (async (input, init) => {
    requestUrl = String(input)
    requestHeaders = new Headers(init?.headers)
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
    return new Response(
      JSON.stringify({
        modelVersion: 'gemini-3.5-flash',
        candidates: [
          {
            content: {
              parts: [
                {text: 'Searching.'},
                {
                  functionCall: {
                    id: 'call-gemini',
                    name: 'search_files',
                    args: {query: 'Needle', path: 'src'},
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
    const provider = new GeminiProvider({
      apiKey: 'test-key',
      model: 'gemini-3.5-flash',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      timeoutMs: 1000,
      tools: [createSearchFilesTool()],
    })

    const response = await provider.chat({
      messages: [
        {role: 'system', content: 'Use tools carefully.'},
        {role: 'user', content: 'find Needle'},
        {role: 'assistant', content: 'I will look.'},
      ],
    })
    const parsed = parseToolCallMessage(response.content)
    const contents = requestBody?.contents as Array<{role?: string; parts?: Array<{text?: string}>}> | undefined
    const tools = requestBody?.tools as Array<{functionDeclarations?: unknown[]}> | undefined

    assert.equal(requestUrl, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent')
    assert.equal(requestHeaders?.get('x-goog-api-key'), 'test-key')
    assert.equal(response.model, 'gemini-3.5-flash')
    assert.deepEqual(
      contents?.map(content => content.role),
      ['user', 'model'],
    )
    assert.deepEqual(requestBody?.systemInstruction, {parts: [{text: 'Use tools carefully.'}]})
    assert.equal(tools?.[0]?.functionDeclarations?.length, 1)
    assert.equal(parsed.content, 'Searching.')
    assert.deepEqual(parsed.toolCalls, [
      {
        id: 'call-gemini',
        name: 'search_files',
        input: {
          query: 'Needle',
          path: 'src',
        },
      },
    ])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('GeminiProvider requires GEMINI_API_KEY when apiKey option is absent', () => {
  const original = process.env.GEMINI_API_KEY
  delete process.env.GEMINI_API_KEY

  try {
    assert.throws(
      () => new GeminiProvider({model: 'gemini-3.5-flash', apiKey: ''}),
      (error: unknown) => {
        assert.ok(error instanceof AppError)
        assert.equal(error.code, 'GEMINI_API_KEY_MISSING')
        return true
      },
    )
  } finally {
    if (original !== undefined) {
      process.env.GEMINI_API_KEY = original
    }
  }
})

test('GeminiProvider creates embeddings through batchEmbedContents', async () => {
  const originalFetch = globalThis.fetch
  let requestUrl = ''
  let requestBody: Record<string, unknown> | undefined

  globalThis.fetch = (async (input, init) => {
    requestUrl = String(input)
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
    return new Response(
      JSON.stringify({
        embeddings: [
          {values: [1, 0]},
          {values: [0, 1]},
        ],
      }),
      {status: 200},
    )
  }) as typeof fetch

  try {
    const provider = new GeminiProvider({
      apiKey: 'test-key',
      model: 'gemini-3.5-flash',
      embeddingModel: 'gemini-embedding-001',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      timeoutMs: 1000,
    })

    const response = await provider.embed({inputs: ['alpha', 'beta']})
    const requests = requestBody?.requests as Array<{model?: string; content?: {parts?: Array<{text?: string}>}}> | undefined

    assert.equal(
      requestUrl,
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents',
    )
    assert.equal(requests?.[0]?.model, 'models/gemini-embedding-001')
    assert.equal(requests?.[1]?.content?.parts?.[0]?.text, 'beta')
    assert.deepEqual(response.embeddings, [[1, 0], [0, 1]])
  } finally {
    globalThis.fetch = originalFetch
  }
})
