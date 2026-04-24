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
  assert.ok(indexRaw.includes('"version": 2'))
})

function getChunkUpdatedAt(index: Awaited<ReturnType<typeof loadOrBuildIndex>>, filePath: string): number {
  const chunk = index.chunks.find(item => item.filePath === filePath)
  assert.ok(chunk, `expected chunk for ${filePath}`)
  return chunk.updatedAt
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
