import {assembleContext} from './contextAssembler'
import {loadOrBuildIndex} from './indexStore'
import {rankRelevantChunks} from './retriever'
import type {LlmProvider} from '../providers'

interface BuildCodeContextInput {
  workspaceRoot: string
  query: string
  embeddingProvider?: Pick<LlmProvider, 'embed'>
  embeddingModel?: string
  embeddingWeight?: number
}

export interface BuiltCodeContext {
  context: string
  chunkCount: number
  truncated: boolean
  retrievalMode: 'keyword' | 'hybrid'
}

export async function buildCodeContext(input: BuildCodeContextInput): Promise<BuiltCodeContext> {
  const indexed = await loadIndexWithOptionalEmbeddings(input)
  const queryEmbedding = indexed.embeddingEnabled
    ? await embedQuery(input.embeddingProvider, input.query)
    : undefined
  const ranked = rankRelevantChunks(indexed.index.chunks, input.query, {
    ...(queryEmbedding !== undefined ? {queryEmbedding} : {}),
    ...(input.embeddingWeight !== undefined ? {embeddingWeight: input.embeddingWeight} : {}),
  })
  const assembled = assembleContext(ranked, indexed.index.chunks)

  return {
    context: assembled.context,
    chunkCount: assembled.includedChunks.length,
    truncated: assembled.truncated,
    retrievalMode: queryEmbedding !== undefined ? 'hybrid' : 'keyword',
  }
}

async function loadIndexWithOptionalEmbeddings(input: BuildCodeContextInput): Promise<{
  index: Awaited<ReturnType<typeof loadOrBuildIndex>>
  embeddingEnabled: boolean
}> {
  if (!input.embeddingProvider?.embed) {
    return {
      index: await loadOrBuildIndex(input.workspaceRoot),
      embeddingEnabled: false,
    }
  }

  try {
    return {
      index: await loadOrBuildIndex(input.workspaceRoot, {
        embeddingProvider: input.embeddingProvider,
        embeddingModel: input.embeddingModel,
      }),
      embeddingEnabled: true,
    }
  } catch {
    return {
      index: await loadOrBuildIndex(input.workspaceRoot),
      embeddingEnabled: false,
    }
  }
}

async function embedQuery(
  embeddingProvider: Pick<LlmProvider, 'embed'> | undefined,
  query: string,
): Promise<number[] | undefined> {
  if (!embeddingProvider?.embed) {
    return undefined
  }

  try {
    const response = await embeddingProvider.embed({inputs: [query]})
    return response.embeddings[0]
  } catch {
    return undefined
  }
}
