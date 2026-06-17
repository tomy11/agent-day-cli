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
  embedding?: CodeChunkEmbedding
}

export interface CodeChunkEmbedding {
  model: string
  vector: number[]
}

export interface IndexedFile {
  filePath: string
  updatedAt: number
  size: number
}

export interface CodeIndex {
  version: number
  workspaceRoot: string
  generatedAt: string
  files: IndexedFile[]
  chunks: CodeChunk[]
}

export interface RankedChunk {
  chunk: CodeChunk
  score: number
  stage1Score: number
  stage2Score: number
  vectorScore?: number
}

export interface RetrievalOptions {
  candidateLimit?: number
  topK?: number
  queryEmbedding?: number[]
  embeddingWeight?: number
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
