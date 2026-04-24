import test from 'node:test'
import assert from 'node:assert/strict'
import {assembleContext} from '../../core/retrieval'
import type {CodeChunk, RankedChunk} from '../../core/retrieval'

function createChunk(indexInFile: number, content: string): CodeChunk {
  return {
    id: `src/core/sample.ts:${indexInFile}`,
    filePath: 'src/core/sample.ts',
    language: 'typescript',
    startLine: indexInFile * 10 + 1,
    endLine: indexInFile * 10 + 10,
    symbol: indexInFile === 1 ? 'TargetFunction' : undefined,
    imports: [],
    updatedAt: Date.now(),
    content,
    indexInFile,
    totalChunksInFile: 4,
  }
}

test('context assembler includes neighbor chunks and respects budget', () => {
  const chunks = [
    createChunk(0, 'alpha '.repeat(40)),
    createChunk(1, 'target '.repeat(40)),
    createChunk(2, 'neighbor '.repeat(40)),
    createChunk(3, 'tail '.repeat(40)),
  ]

  const ranked: RankedChunk[] = [
    {
      chunk: chunks[1],
      score: 10,
      stage1Score: 5,
      stage2Score: 5,
    },
  ]

  const assembled = assembleContext(ranked, chunks, {
    topK: 1,
    neighborWindow: 1,
    charBudget: 700,
  })

  assert.ok(assembled.includedChunks.length >= 2)
  assert.equal(assembled.includedChunks[0].indexInFile, 0)
  assert.equal(assembled.includedChunks[1].indexInFile, 1)
  assert.equal(assembled.truncated, true)
  assert.ok(assembled.context.length <= 700)
})
