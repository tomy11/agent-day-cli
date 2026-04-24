import {assembleContext} from './contextAssembler'
import {loadOrBuildIndex} from './indexStore'
import {rankRelevantChunks} from './retriever'

interface BuildCodeContextInput {
  workspaceRoot: string
  query: string
}

export interface BuiltCodeContext {
  context: string
  chunkCount: number
  truncated: boolean
}

export async function buildCodeContext(input: BuildCodeContextInput): Promise<BuiltCodeContext> {
  const index = await loadOrBuildIndex(input.workspaceRoot)
  const ranked = rankRelevantChunks(index.chunks, input.query)
  const assembled = assembleContext(ranked, index.chunks)

  return {
    context: assembled.context,
    chunkCount: assembled.includedChunks.length,
    truncated: assembled.truncated,
  }
}
