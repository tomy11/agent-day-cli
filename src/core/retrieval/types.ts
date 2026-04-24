export interface CodeChunk {
  id: string
  filePath: string
  language: string
  startLine: number
  endLine: number
  symbol?: string
  imports: string[]
  updatedAt: number
  content: string
  indexInFile: number
  totalChunksInFile: number
}

export interface CodeIndex {
  version: number
  workspaceRoot: string
  generatedAt: string
  chunks: CodeChunk[]
}

export interface RankedChunk {
  chunk: CodeChunk
  score: number
  stage1Score: number
  stage2Score: number
}

export interface RetrievalOptions {
  candidateLimit?: number
  topK?: number
}

export interface ContextAssemblyOptions {
  topK?: number
  neighborWindow?: number
  charBudget?: number
}

export interface AssembledContext {
  context: string
  includedChunks: CodeChunk[]
  truncated: boolean
}
