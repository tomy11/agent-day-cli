import test from 'node:test'
import assert from 'node:assert/strict'
import {OllamaProvider} from '../../core/providers'
import {AppError} from '../../core/errors'

test('OllamaProvider returns content on success', async () => {
  const originalFetch = globalThis.fetch

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        model: 'llama3.1',
        message: {
          role: 'assistant',
          content: 'ok',
        },
      }),
      {status: 200},
    )) as typeof fetch

  try {
    const provider = new OllamaProvider({
      model: 'llama3.1',
      baseUrl: 'http://localhost:11434',
      timeoutMs: 1000,
    })

    const response = await provider.chat({
      messages: [{role: 'user', content: 'hello'}],
    })

    assert.equal(response.content, 'ok')
    assert.equal(response.model, 'llama3.1')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('OllamaProvider returns OLLAMA_HTTP_ERROR on non-2xx', async () => {
  const originalFetch = globalThis.fetch

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        error: 'bad request',
      }),
      {status: 400},
    )) as typeof fetch

  try {
    const provider = new OllamaProvider({model: 'llama3.1'})

    await assert.rejects(
      () => provider.chat({messages: [{role: 'user', content: 'hello'}]}),
      (error: unknown) => {
        assert.ok(error instanceof AppError)
        assert.equal(error.code, 'OLLAMA_HTTP_ERROR')
        return true
      },
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('OllamaProvider returns OLLAMA_RESPONSE_ERROR on missing content', async () => {
  const originalFetch = globalThis.fetch

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        model: 'llama3.1',
        message: {
          role: 'assistant',
        },
      }),
      {status: 200},
    )) as typeof fetch

  try {
    const provider = new OllamaProvider({model: 'llama3.1'})

    await assert.rejects(
      () => provider.chat({messages: [{role: 'user', content: 'hello'}]}),
      (error: unknown) => {
        assert.ok(error instanceof AppError)
        assert.equal(error.code, 'OLLAMA_RESPONSE_ERROR')
        return true
      },
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('OllamaProvider returns OLLAMA_TIMEOUT when aborted by timeout', async () => {
  const originalFetch = globalThis.fetch

  globalThis.fetch = (async (_input, init) => {
    const signal = init?.signal
    return new Promise<Response>((_, reject) => {
      signal?.addEventListener('abort', () => {
        const abortError = new Error('The operation was aborted')
        abortError.name = 'AbortError'
        reject(abortError)
      })
    })
  }) as typeof fetch

  try {
    const provider = new OllamaProvider({
      model: 'llama3.1',
      timeoutMs: 20,
    })

    await assert.rejects(
      () => provider.chat({messages: [{role: 'user', content: 'hello'}]}),
      (error: unknown) => {
        assert.ok(error instanceof AppError)
        assert.equal(error.code, 'OLLAMA_TIMEOUT')
        return true
      },
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('OllamaProvider returns OLLAMA_NETWORK_ERROR on fetch failure', async () => {
  const originalFetch = globalThis.fetch

  globalThis.fetch = (async () => {
    throw new Error('fetch failed')
  }) as typeof fetch

  try {
    const provider = new OllamaProvider({model: 'llama3.1'})

    await assert.rejects(
      () => provider.chat({messages: [{role: 'user', content: 'hello'}]}),
      (error: unknown) => {
        assert.ok(error instanceof AppError)
        assert.equal(error.code, 'OLLAMA_NETWORK_ERROR')
        return true
      },
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
