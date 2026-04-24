import test from 'node:test'
import assert from 'node:assert/strict'
import {rankRelevantChunks} from '../../core/retrieval'
import type {CodeChunk} from '../../core/retrieval'

function chunk(input: {
  id: string
  filePath: string
  symbol?: string
  content: string
  imports?: string[]
  indexInFile?: number
}): CodeChunk {
  return {
    id: input.id,
    filePath: input.filePath,
    language: 'typescript',
    startLine: 1,
    endLine: 20,
    symbol: input.symbol,
    imports: input.imports ?? [],
    updatedAt: Date.now(),
    content: input.content,
    indexInFile: input.indexInFile ?? 0,
    totalChunksInFile: 1,
  }
}

test('retriever ranks the most relevant chunk first', () => {
  const chunks: CodeChunk[] = [
    chunk({
      id: 'a',
      filePath: 'src/core/security/approvalManager.ts',
      symbol: 'InteractiveApprovalManager',
      content: 'approval manager asks user before high risk tool execution',
      imports: ['node:readline/promises'],
    }),
    chunk({
      id: 'b',
      filePath: 'src/core/providers/ollama/OllamaProvider.ts',
      symbol: 'OllamaProvider',
      content: 'sends chat request to ollama and handles timeout',
    }),
  ]

  const ranked = rankRelevantChunks(chunks, 'approval manager high risk tool')

  assert.ok(ranked.length >= 1)
  assert.equal(ranked[0].chunk.id, 'a')
  assert.ok(ranked[0].score > 0)
})
