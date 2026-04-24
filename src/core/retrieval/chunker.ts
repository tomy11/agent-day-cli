import path from 'node:path'
import type {CodeChunk} from './types'

export interface ChunkingOptions {
  chunkSizeLines?: number
}

const DEFAULT_CHUNK_SIZE_LINES = 300
const IMPORT_REGEX = /^\s*import\s.+from\s+['"]([^'"]+)['"]\s*;?\s*$/
const REQUIRE_REGEX = /require\(\s*['"]([^'"]+)['"]\s*\)/

const PRIMARY_SYMBOL_PATTERNS = [
  /^\s*export\s+(?:default\s+)?class\s+([A-Za-z0-9_]+)/,
  /^\s*class\s+([A-Za-z0-9_]+)/,
  /^\s*export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/,
  /^\s*(?:async\s+)?function\s+([A-Za-z0-9_]+)/,
  /^\s*export\s+interface\s+([A-Za-z0-9_]+)/,
  /^\s*interface\s+([A-Za-z0-9_]+)/,
  /^\s*export\s+type\s+([A-Za-z0-9_]+)/,
  /^\s*type\s+([A-Za-z0-9_]+)/,
]

const SECONDARY_SYMBOL_PATTERNS = [
  /^\s*export\s+const\s+([A-Za-z0-9_]+)\s*=/,
  /^\s*const\s+([A-Za-z0-9_]+)\s*=/,
]

export function buildChunksForFile(input: {
  filePath: string
  content: string
  updatedAt: number
  options?: ChunkingOptions
}): CodeChunk[] {
  const filePath = normalizePath(input.filePath)
  const lines = input.content.split(/\r?\n/)
  const chunkSize = input.options?.chunkSizeLines ?? DEFAULT_CHUNK_SIZE_LINES
  const totalChunks = Math.max(1, Math.ceil(Math.max(lines.length, 1) / chunkSize))
  const language = getLanguageFromPath(filePath)
  const chunks: CodeChunk[] = []

  for (let index = 0; index < totalChunks; index += 1) {
    const startLine = index * chunkSize + 1
    const endLine = Math.min((index + 1) * chunkSize, Math.max(lines.length, 1))
    const slice = lines.slice(startLine - 1, endLine)
    const content = slice.join('\n').trimEnd()

    if (!content.trim()) {
      continue
    }

    chunks.push({
      id: `${filePath}:${startLine}-${endLine}`,
      filePath,
      language,
      startLine,
      endLine,
      symbol: detectSymbol(slice),
      imports: detectImports(slice),
      updatedAt: input.updatedAt,
      content,
      indexInFile: index,
      totalChunksInFile: totalChunks,
    })
  }

  return chunks
}

function getLanguageFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.ts':
      return 'typescript'
    case '.tsx':
      return 'tsx'
    case '.js':
      return 'javascript'
    case '.jsx':
      return 'jsx'
    case '.json':
      return 'json'
    case '.md':
      return 'markdown'
    case '.yml':
    case '.yaml':
      return 'yaml'
    default:
      return 'text'
  }
}

function detectSymbol(lines: string[]): string | undefined {
  for (const line of lines) {
    for (const pattern of PRIMARY_SYMBOL_PATTERNS) {
      const match = line.match(pattern)
      if (match?.[1]) {
        return match[1]
      }
    }
  }

  for (const line of lines) {
    if (line.includes('require(')) {
      continue
    }

    for (const pattern of SECONDARY_SYMBOL_PATTERNS) {
      const match = line.match(pattern)
      if (match?.[1]) {
        return match[1]
      }
    }
  }

  return undefined
}

function detectImports(lines: string[]): string[] {
  const imports = new Set<string>()

  for (const line of lines) {
    const esmMatch = line.match(IMPORT_REGEX)
    if (esmMatch?.[1]) {
      imports.add(esmMatch[1])
    }

    const cjsMatch = line.match(REQUIRE_REGEX)
    if (cjsMatch?.[1]) {
      imports.add(cjsMatch[1])
    }
  }

  return [...imports]
}

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join('/')
}
