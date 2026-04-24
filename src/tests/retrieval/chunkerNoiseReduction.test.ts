import test from 'node:test'
import assert from 'node:assert/strict'
import {buildChunksForFile} from '../../core/retrieval'

test('chunker reduces verbose logs and large fixture blocks for test files', () => {
  const noisyLogLine = `console.log('${'debug-data-'.repeat(30)}')`
  const fixtureLines = [
    'const mockPayload = [',
    ...Array.from({length: 25}, (_, index) => `  {"id": ${index}, "name": "fixture-${index}"},`),
    ']',
  ]

  const content = [
    'export function createFixture(): unknown {',
    noisyLogLine,
    ...fixtureLines,
    '  return mockPayload',
    '}',
  ].join('\n')

  const chunks = buildChunksForFile({
    filePath: 'src/tests/unit/createFixture.test.ts',
    content,
    updatedAt: Date.now(),
    options: {chunkSizeLines: 400},
  })

  assert.equal(chunks.length, 1)
  assert.ok(chunks[0].content.includes('[noise-reduction] verbose log removed'))
  assert.ok(chunks[0].content.includes('[noise-reduction] large fixture block collapsed'))
  assert.equal(chunks[0].content.includes('fixture-24'), false)
})
