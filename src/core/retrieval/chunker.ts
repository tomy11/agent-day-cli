import path from 'node:path'
import type {CodeChunk} from './types'

export interface ChunkingOptions {
  chunkSizeLines?: number
}

const DEFAULT_CHUNK_SIZE_LINES = 300
const MIN_DECLARATION_GAP_LINES = 2
const IMPORT_REGEX = /^\s*import\s.+from\s+['"]([^'"]+)['"]\s*;?\s*$/
const REQUIRE_REGEX = /require\(\s*['"]([^'"]+)['"]\s*\)/
const DECLARATION_START_REGEX =
  /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|enum|const|let|var)\s+[A-Za-z_][A-Za-z0-9_]*/
const NOISE_LOG_REGEX = /\b(?:console|logger)\.(?:log|debug|trace|info)\(/
const FIXTURE_BLOCK_START_REGEX = /^\s*(?:const|let|var)\s+[A-Za-z0-9_]*(?:fixture|fixtures|mock|data|payload)\w*\s*=\s*[\[{`]/
const FIXTURE_HEAVY_LINE_REGEX = /^[\s"',`:[\]{}0-9A-Za-z._+-]*,?$/

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
  const language = getLanguageFromPath(filePath)
  const ranges = getChunkRanges(lines, language, chunkSize)
  const draftChunks: Omit<CodeChunk, 'indexInFile' | 'totalChunksInFile'>[] = []

  for (const range of ranges) {
    const slice = lines.slice(range.startLine - 1, range.endLine)
    const reducedLines = applyNoiseReduction(slice, filePath)
    const content = reducedLines.join('\n').trimEnd()
    if (!content.trim()) {
      continue
    }

    draftChunks.push({
      id: `${filePath}:${range.startLine}-${range.endLine}`,
      filePath,
      language,
      startLine: range.startLine,
      endLine: range.endLine,
      symbol: detectSymbol(slice),
      imports: detectImports(slice),
      updatedAt: input.updatedAt,
      content,
    })
  }

  const totalChunks = draftChunks.length
  return draftChunks.map((chunk, index) => ({
    ...chunk,
    indexInFile: index,
    totalChunksInFile: totalChunks,
  }))
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

function getChunkRanges(
  lines: string[],
  language: string,
  chunkSizeLines: number,
): Array<{startLine: number; endLine: number}> {
  const lineCount = Math.max(lines.length, 1)

  if (!isSyntaxAwareLanguage(language)) {
    return getFixedRanges(lineCount, chunkSizeLines)
  }

  const declarationStarts = findDeclarationStarts(lines)
  if (declarationStarts.length <= 1) {
    return getFixedRanges(lineCount, chunkSizeLines)
  }

  const ranges: Array<{startLine: number; endLine: number}> = []

  for (let i = 0; i < declarationStarts.length; i += 1) {
    const start = declarationStarts[i] + 1
    const nextStart = i + 1 < declarationStarts.length ? declarationStarts[i + 1] + 1 : lineCount + 1
    const end = nextStart - 1
    ranges.push(...splitRangeByLimit(start, end, chunkSizeLines))
  }

  return ranges
}

function isSyntaxAwareLanguage(language: string): boolean {
  return language === 'typescript' || language === 'tsx' || language === 'javascript' || language === 'jsx'
}

function getFixedRanges(lineCount: number, chunkSizeLines: number): Array<{startLine: number; endLine: number}> {
  const ranges: Array<{startLine: number; endLine: number}> = []

  for (let startLine = 1; startLine <= lineCount; startLine += chunkSizeLines) {
    ranges.push({
      startLine,
      endLine: Math.min(startLine + chunkSizeLines - 1, lineCount),
    })
  }

  return ranges
}

function findDeclarationStarts(lines: string[]): number[] {
  const starts = [0]
  let braceDepth = 0
  let lastAccepted = 0

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()

    if (
      index > 0 &&
      braceDepth === 0 &&
      DECLARATION_START_REGEX.test(trimmed) &&
      index - lastAccepted >= MIN_DECLARATION_GAP_LINES
    ) {
      starts.push(index)
      lastAccepted = index
    }

    braceDepth += countChar(line, '{')
    braceDepth -= countChar(line, '}')
    if (braceDepth < 0) {
      braceDepth = 0
    }
  }

  return starts
}

function splitRangeByLimit(
  startLine: number,
  endLine: number,
  chunkSizeLines: number,
): Array<{startLine: number; endLine: number}> {
  if (endLine < startLine) {
    return []
  }

  const ranges: Array<{startLine: number; endLine: number}> = []
  for (let start = startLine; start <= endLine; start += chunkSizeLines) {
    ranges.push({
      startLine: start,
      endLine: Math.min(start + chunkSizeLines - 1, endLine),
    })
  }

  return ranges
}

function countChar(input: string, char: string): number {
  let count = 0
  for (const candidate of input) {
    if (candidate === char) {
      count += 1
    }
  }

  return count
}

function applyNoiseReduction(lines: string[], filePath: string): string[] {
  const isTestOrFixtureFile = /(test|spec|__tests__|__fixtures__|fixtures|mock)/i.test(filePath)
  const output: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]

    if (NOISE_LOG_REGEX.test(line) && line.length > 140) {
      output.push('/* [noise-reduction] verbose log removed */')
      continue
    }

    if (isTestOrFixtureFile && FIXTURE_BLOCK_START_REGEX.test(line)) {
      const block = collectFixtureBlock(lines, index)
      if (block.shouldCollapse) {
        output.push('/* [noise-reduction] large fixture block collapsed */')
        index = block.endIndex
        continue
      }
    }

    output.push(line)
  }

  return output
}

function collectFixtureBlock(lines: string[], startIndex: number): {endIndex: number; shouldCollapse: boolean} {
  let braceDepth = 0
  let heavyLines = 0
  let endIndex = startIndex
  let seenStart = false

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index]
    const openCount = countChar(line, '{') + countChar(line, '[')
    const closeCount = countChar(line, '}') + countChar(line, ']')
    braceDepth += openCount - closeCount
    if (openCount > 0) {
      seenStart = true
    }

    if (FIXTURE_HEAVY_LINE_REGEX.test(line.trim())) {
      heavyLines += 1
    }

    endIndex = index
    if (seenStart && braceDepth <= 0 && index > startIndex) {
      break
    }

    if (index - startIndex >= 120) {
      break
    }
  }

  const blockLength = endIndex - startIndex + 1
  const shouldCollapse = blockLength >= 20 && heavyLines / blockLength > 0.7
  return {endIndex, shouldCollapse}
}
