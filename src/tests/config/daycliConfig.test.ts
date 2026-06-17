import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {loadDaycliConfig, resolveRunSettings} from '../../core/config'
import {AppError} from '../../core/errors'

test('resolveRunSettings defaults to backward-compatible Ollama settings', () => {
  assert.deepEqual(resolveRunSettings({}, {}), {
    type: 'ollama',
    model: 'llama3.1',
    baseUrl: 'http://localhost:11434',
    timeoutMs: 180_000,
  })
})

test('resolveRunSettings selects provider-specific config', () => {
  assert.deepEqual(
    resolveRunSettings(
      {
        provider: {type: 'openai'},
        openai: {
          model: 'gpt-test',
          baseUrl: 'https://example.test/v1',
          timeoutMs: 1234,
        },
      },
      {},
    ),
    {
      type: 'openai',
      model: 'gpt-test',
      baseUrl: 'https://example.test/v1',
      timeoutMs: 1234,
    },
  )
})

test('resolveRunSettings supports OpenRouter defaults', () => {
  assert.deepEqual(
    resolveRunSettings(
      {
        provider: {type: 'openrouter'},
      },
      {},
    ),
    {
      type: 'openrouter',
      model: 'openai/gpt-4.1-mini',
      baseUrl: 'https://openrouter.ai/api/v1',
      timeoutMs: 180_000,
    },
  )
})

test('resolveRunSettings supports Gemini defaults', () => {
  assert.deepEqual(
    resolveRunSettings(
      {
        provider: {type: 'gemini'},
      },
      {},
    ),
    {
      type: 'gemini',
      model: 'gemini-3.5-flash',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      timeoutMs: 180_000,
    },
  )
})

test('resolveRunSettings supports Mistral defaults', () => {
  assert.deepEqual(
    resolveRunSettings(
      {
        provider: {type: 'mistral'},
      },
      {},
    ),
    {
      type: 'mistral',
      model: 'mistral-large-latest',
      baseUrl: 'https://api.mistral.ai/v1',
      timeoutMs: 180_000,
    },
  )
})

test('loadDaycliConfig rejects invalid provider type', async t => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'daycli-config-'))
  t.after(async () => {
    await rm(workspace, {recursive: true, force: true})
  })

  await writeFile(
    path.join(workspace, 'daycli.config.json'),
    JSON.stringify({
      provider: {
        type: 'unknown',
      },
    }),
    'utf8',
  )

  await assert.rejects(
    () => loadDaycliConfig(workspace),
    (error: unknown) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.code, 'CONFIG_INVALID')
      assert.match(error.message, /provider\.type/)
      return true
    },
  )
})
