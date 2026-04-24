import test from 'node:test'
import assert from 'node:assert/strict'
import {buildChunksForFile} from '../../core/retrieval'

test('chunker extracts metadata fields from code chunk', () => {
  const content = [
    "import {createInterface} from 'node:readline/promises'",
    "const fs = require('node:fs')",
    '',
    'export class InteractiveApprovalManager {',
    '  public async ask(): Promise<boolean> {',
    '    return true',
    '  }',
    '}',
  ].join('\n')

  const chunks = buildChunksForFile({
    filePath: 'src/core/security/approvalManager.ts',
    content,
    updatedAt: Date.now(),
    options: {chunkSizeLines: 50},
  })

  assert.equal(chunks.length, 1)
  assert.equal(chunks[0].language, 'typescript')
  assert.equal(chunks[0].symbol, 'InteractiveApprovalManager')
  assert.deepEqual(chunks[0].imports, ['node:readline/promises', 'node:fs'])
  assert.equal(chunks[0].filePath, 'src/core/security/approvalManager.ts')
})
