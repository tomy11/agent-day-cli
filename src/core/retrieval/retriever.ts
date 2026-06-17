import type {CodeChunk, RankedChunk, RetrievalOptions} from './types'

const DEFAULT_CANDIDATE_LIMIT = 40
const DEFAULT_TOP_K = 8
const DEFAULT_EMBEDDING_WEIGHT = 0.65

interface RetrievalCandidate {
  chunk: CodeChunk
  stage1Score: number
  stage2Score: number
  keywordScore: number
  vectorScore: number | undefined
}

export function rankRelevantChunks(
  chunks: CodeChunk[],
  query: string,
  options: RetrievalOptions = {},
): RankedChunk[] {
  const queryTokens = tokenize(query)
  const hasQueryEmbedding = Array.isArray(options.queryEmbedding) && options.queryEmbedding.length > 0
  if ((queryTokens.length === 0 && !hasQueryEmbedding) || chunks.length === 0) {
    return []
  }

  const candidateLimit = options.candidateLimit ?? DEFAULT_CANDIDATE_LIMIT
  const topK = options.topK ?? DEFAULT_TOP_K

  const keywordCandidates = chunks
    .map(chunk => {
      const chunkTokens = tokenize(chunk.content)
      const stage1Score = chunkTokens.length > 0 ? computeStage1Score(queryTokens, chunkTokens) : 0
      const stage2Score = computeStage2Score(queryTokens, chunk)
      const keywordScore = stage1Score + stage2Score
      const vectorScore = hasQueryEmbedding
        ? computeCosineSimilarity(options.queryEmbedding ?? [], chunk.embedding?.vector)
        : undefined

      if (keywordScore <= 0 && (vectorScore ?? 0) <= 0) {
        return undefined
      }

      return {chunk, stage1Score, stage2Score, keywordScore, vectorScore}
    })
    .filter((value): value is RetrievalCandidate => value !== undefined)
    .sort((a, b) => {
      if (hasQueryEmbedding) {
        return computeHybridScore(b.keywordScore, b.vectorScore, options.embeddingWeight) -
          computeHybridScore(a.keywordScore, a.vectorScore, options.embeddingWeight)
      }

      return b.keywordScore - a.keywordScore
    })
    .slice(0, candidateLimit)

  return keywordCandidates
    .map(candidate => {
      const score = hasQueryEmbedding
        ? computeHybridScore(candidate.keywordScore, candidate.vectorScore, options.embeddingWeight)
        : candidate.keywordScore

      return {
        chunk: candidate.chunk,
        score,
        stage1Score: candidate.stage1Score,
        stage2Score: candidate.stage2Score,
        ...(candidate.vectorScore !== undefined ? {vectorScore: candidate.vectorScore} : {}),
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

function computeHybridScore(keywordScore: number, vectorScore: number | undefined, embeddingWeight: number | undefined): number {
  const boundedWeight = clamp(embeddingWeight ?? DEFAULT_EMBEDDING_WEIGHT, 0, 1)
  const normalizedKeyword = keywordScore / (keywordScore + 1)
  return (normalizedKeyword * (1 - boundedWeight)) + ((vectorScore ?? 0) * boundedWeight)
}

function computeStage1Score(queryTokens: string[], chunkTokens: string[]): number {
  const counts = countTokens(chunkTokens)
  let matched = 0

  for (const token of queryTokens) {
    matched += counts.get(token) ?? 0
  }

  return matched / Math.sqrt(chunkTokens.length)
}

function computeStage2Score(queryTokens: string[], chunk: CodeChunk): number {
  const lowerPath = chunk.filePath.toLowerCase()
  const lowerSymbol = (chunk.symbol ?? '').toLowerCase()
  const lowerImports = chunk.imports.join(' ').toLowerCase()
  const lowerContent = chunk.content.toLowerCase()

  let score = 0

  for (const token of queryTokens) {
    if (lowerSymbol.includes(token)) {
      score += 2
    }

    if (lowerPath.includes(token)) {
      score += 1
    }

    if (lowerImports.includes(token)) {
      score += 0.75
    }

    if (lowerContent.includes(token)) {
      score += 0.1
    }
  }

  return score
}

function computeCosineSimilarity(queryVector: number[], chunkVector: number[] | undefined): number {
  if (!chunkVector || queryVector.length === 0 || queryVector.length !== chunkVector.length) {
    return 0
  }

  let dot = 0
  let queryMagnitude = 0
  let chunkMagnitude = 0

  for (let index = 0; index < queryVector.length; index += 1) {
    const queryValue = queryVector[index] ?? 0
    const chunkValue = chunkVector[index] ?? 0
    dot += queryValue * chunkValue
    queryMagnitude += queryValue * queryValue
    chunkMagnitude += chunkValue * chunkValue
  }

  if (queryMagnitude === 0 || chunkMagnitude === 0) {
    return 0
  }

  return Math.max(0, dot / (Math.sqrt(queryMagnitude) * Math.sqrt(chunkMagnitude)))
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min
  }

  return Math.min(max, Math.max(min, value))
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9_]+/g)
    .filter(token => token.length >= 2)
}

function countTokens(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>()

  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1)
  }

  return counts
}
