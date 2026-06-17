import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import {tmpdir} from 'node:os'
import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises'
import {buildCodeContext} from '../../core/retrieval/contextBuilder'

test('buildCodeContext uses hybrid retrieval when embeddings are available', async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'daycli-context-hybrid-'))
  t.after(async () => {
    await rm(workspace, {recursive: true, force: true})
  })

  await mkdir(path.join(workspace, 'src'), {recursive: true})
  await writeFile(path.join(workspace, 'src', 'billing.ts'), 'export const invoiceRetry = true\n', 'utf8')

  const context = await buildCodeContext({
    workspaceRoot: workspace,
    query: 'money collection',
    embeddingModel: 'embed-test',
    embeddingProvider: {
      async embed(input: {inputs: string[]}): Promise<{embeddings: number[][]; model: string}> {
        return {
          model: 'embed-test',
          embeddings: input.inputs.map(() => [1, 0]),
        }
      },
    },
  })

  assert.equal(context.retrievalMode, 'hybrid')
  assert.match(context.context, /src\/billing\.ts/)
})

test('buildCodeContext falls back to keyword retrieval when embeddings fail', async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'daycli-context-fallback-'))
  t.after(async () => {
    await rm(workspace, {recursive: true, force: true})
  })

  await mkdir(path.join(workspace, 'src'), {recursive: true})
  await writeFile(path.join(workspace, 'src', 'auth.ts'), 'export const approvalManager = true\n', 'utf8')

  const context = await buildCodeContext({
    workspaceRoot: workspace,
    query: 'approval manager',
    embeddingModel: 'embed-test',
    embeddingProvider: {
      async embed(): Promise<{embeddings: number[][]; model: string}> {
        throw new Error('embedding unavailable')
      },
    },
  })

  assert.equal(context.retrievalMode, 'keyword')
  assert.match(context.context, /src\/auth\.ts/)
})
