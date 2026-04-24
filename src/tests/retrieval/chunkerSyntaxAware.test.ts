import test from 'node:test'
import assert from 'node:assert/strict'
import {buildChunksForFile} from '../../core/retrieval'

test('chunker splits TypeScript by declaration boundaries', () => {
  const content = [
    "import {readFile} from 'node:fs/promises'",
    '',
    'export async function loadConfig(path: string): Promise<string> {',
    "  const raw = await readFile(path, 'utf8')",
    '  return raw',
    '}',
    '',
    'export function resolveRunSettings(): string {',
    "  return 'ok'",
    '}',
  ].join('\n')

  const chunks = buildChunksForFile({
    filePath: 'src/core/config/daycliConfig.ts',
    content,
    updatedAt: Date.now(),
    options: {chunkSizeLines: 200},
  })

  assert.ok(chunks.length >= 2)
  const symbols = chunks.map(chunk => chunk.symbol).filter(Boolean)
  assert.ok(symbols.includes('loadConfig'))
  assert.ok(symbols.includes('resolveRunSettings'))
})
