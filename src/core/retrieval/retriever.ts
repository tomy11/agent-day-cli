import type {CodeChunk, RankedChunk, RetrievalOptions} from './types'

const DEFAULT_CANDIDATE_LIMIT = 40
const DEFAULT_TOP_K = 8

export function rankRelevantChunks(
  chunks: CodeChunk[],
  query: string,
  options: RetrievalOptions = {},
): RankedChunk[] {
  const queryTokens = tokenize(query)
  if (queryTokens.length === 0 || chunks.length === 0) {
    return []
  }

  const candidateLimit = options.candidateLimit ?? DEFAULT_CANDIDATE_LIMIT
  const topK = options.topK ?? DEFAULT_TOP_K

  const stage1 = chunks
    .map(chunk => {
      const chunkTokens = tokenize(chunk.content)
      if (chunkTokens.length === 0) {
        return undefined
      }

      const stage1Score = computeStage1Score(queryTokens, chunkTokens)
      if (stage1Score <= 0) {
        return undefined
      }

      return {chunk, stage1Score}
    })
    .filter((value): value is {chunk: CodeChunk; stage1Score: number} => Boolean(value))
    .sort((a, b) => b.stage1Score - a.stage1Score)
    .slice(0, candidateLimit)

  return stage1
    .map(candidate => {
      const stage2Score = computeStage2Score(queryTokens, candidate.chunk)
      const score = candidate.stage1Score + stage2Score
      return {
        chunk: candidate.chunk,
        score,
        stage1Score: candidate.stage1Score,
        stage2Score,
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
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
