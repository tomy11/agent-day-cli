import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import {tmpdir} from 'node:os'
import {mkdtemp, mkdir, readFile, rm, unlink, writeFile} from 'node:fs/promises'
import {loadOrBuildIndex} from '../../core/retrieval'

test('indexStore refreshes changed files incrementally and drops deleted files', async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'daycli-index-'))
  t.after(async () => {
    await rm(workspace, {recursive: true, force: true})
  })

  const srcDir = path.join(workspace, 'src')
  await mkdir(srcDir, {recursive: true})

  const alphaPath = path.join(srcDir, 'alpha.ts')
  const betaPath = path.join(srcDir, 'beta.ts')
  await writeFile(alphaPath, 'export function alpha() { return 1 }\n', 'utf8')
  await writeFile(betaPath, 'export function beta() { return 2 }\n', 'utf8')

  const first = await loadOrBuildIndex(workspace)
  assert.ok(first.files.some(file => file.filePath === 'src/alpha.ts'))
  assert.ok(first.files.some(file => file.filePath === 'src/beta.ts'))

  const alphaInitialUpdatedAt = getChunkUpdatedAt(first, 'src/alpha.ts')
  const betaInitialUpdatedAt = getChunkUpdatedAt(first, 'src/beta.ts')

  await sleep(20)
  await writeFile(alphaPath, 'export function alpha() { return 100 }\n', 'utf8')

  const second = await loadOrBuildIndex(workspace)
  const alphaSecondUpdatedAt = getChunkUpdatedAt(second, 'src/alpha.ts')
  const betaSecondUpdatedAt = getChunkUpdatedAt(second, 'src/beta.ts')

  assert.ok(alphaSecondUpdatedAt > alphaInitialUpdatedAt)
  assert.equal(betaSecondUpdatedAt, betaInitialUpdatedAt)

  await sleep(20)
  await unlink(betaPath)

  const third = await loadOrBuildIndex(workspace)
  assert.ok(third.files.some(file => file.filePath === 'src/alpha.ts'))
  assert.equal(third.files.some(file => file.filePath === 'src/beta.ts'), false)
  assert.equal(third.chunks.some(chunk => chunk.filePath === 'src/beta.ts'), false)

  const indexRaw = await readFile(path.join(workspace, '.daycli', 'index', 'chunks.json'), 'utf8')
  assert.ok(indexRaw.includes('"version": 3'))
})

test('indexStore embeds new chunks incrementally and re-embeds when the model changes', async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'daycli-index-embedding-'))
  t.after(async () => {
    await rm(workspace, {recursive: true, force: true})
  })

  const srcDir = path.join(workspace, 'src')
  await mkdir(srcDir, {recursive: true})
  const alphaPath = path.join(srcDir, 'alpha.ts')
  const betaPath = path.join(srcDir, 'beta.ts')
  await writeFile(alphaPath, 'export function alpha() { return 1 }\n', 'utf8')
  await writeFile(betaPath, 'export function beta() { return 2 }\n', 'utf8')

  const provider = createFakeEmbeddingProvider('embed-v1')
  const first = await loadOrBuildIndex(workspace, {
    embeddingProvider: provider,
    embeddingModel: 'embed-v1',
  })

  assert.equal(provider.callInputs.length, 2)
  assert.ok(first.chunks.every(chunk => chunk.embedding?.model === 'embed-v1'))

  await loadOrBuildIndex(workspace, {
    embeddingProvider: provider,
    embeddingModel: 'embed-v1',
  })
  assert.equal(provider.callInputs.length, 2)

  await sleep(20)
  await writeFile(alphaPath, 'export function alpha() { return 100 }\n', 'utf8')
  await loadOrBuildIndex(workspace, {
    embeddingProvider: provider,
    embeddingModel: 'embed-v1',
  })
  assert.equal(provider.callInputs.length, 3)

  const nextProvider = createFakeEmbeddingProvider('embed-v2')
  const modelChanged = await loadOrBuildIndex(workspace, {
    embeddingProvider: nextProvider,
    embeddingModel: 'embed-v2',
  })
  assert.equal(nextProvider.callInputs.length, 2)
  assert.ok(modelChanged.chunks.every(chunk => chunk.embedding?.model === 'embed-v2'))
})

function getChunkUpdatedAt(index: Awaited<ReturnType<typeof loadOrBuildIndex>>, filePath: string): number {
  const chunk = index.chunks.find(item => item.filePath === filePath)
  assert.ok(chunk, `expected chunk for ${filePath}`)
  return chunk.updatedAt
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function createFakeEmbeddingProvider(model: string): {
  callInputs: string[]
  embed(input: {inputs: string[]}): Promise<{embeddings: number[][]; model: string}>
} {
  return {
    callInputs: [],
    async embed(input: {inputs: string[]}): Promise<{embeddings: number[][]; model: string}> {
      this.callInputs.push(...input.inputs)
      return {
        model,
        embeddings: input.inputs.map((text, index) => [index + 1, text.length]),
      }
    },
  }
}
