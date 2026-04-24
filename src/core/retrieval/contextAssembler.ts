import type {AssembledContext, CodeChunk, ContextAssemblyOptions, RankedChunk} from './types'

const DEFAULT_TOP_K = 4
const DEFAULT_NEIGHBOR_WINDOW = 1
const DEFAULT_CHAR_BUDGET = 12_000

export function assembleContext(
  rankedChunks: RankedChunk[],
  allChunks: CodeChunk[],
  options: ContextAssemblyOptions = {},
): AssembledContext {
  const topK = options.topK ?? DEFAULT_TOP_K
  const neighborWindow = options.neighborWindow ?? DEFAULT_NEIGHBOR_WINDOW
  const charBudget = options.charBudget ?? DEFAULT_CHAR_BUDGET
  const chunksByFile = groupByFile(allChunks)

  const selected: CodeChunk[] = []
  const seen = new Set<string>()
  const primaries = rankedChunks.slice(0, topK).map(item => item.chunk)

  for (const primary of primaries) {
    const fileChunks = chunksByFile.get(primary.filePath) ?? []
    const start = Math.max(0, primary.indexInFile - neighborWindow)
    const end = Math.min(fileChunks.length - 1, primary.indexInFile + neighborWindow)

    for (let index = start; index <= end; index += 1) {
      const candidate = fileChunks[index]
      if (!candidate || seen.has(candidate.id)) {
        continue
      }

      selected.push(candidate)
      seen.add(candidate.id)
    }
  }

  let output = ''
  const included: CodeChunk[] = []
  let truncated = false

  for (const chunk of selected) {
    const section = formatChunkSection(chunk)
    if (output.length + section.length <= charBudget) {
      output += section
      included.push(chunk)
      continue
    }

    const remaining = charBudget - output.length
    if (remaining > 0 && included.length === 0) {
      output += section.slice(0, remaining)
      included.push(chunk)
    }

    truncated = true
    break
  }

  return {
    context: output.trim(),
    includedChunks: included,
    truncated,
  }
}

function groupByFile(chunks: CodeChunk[]): Map<string, CodeChunk[]> {
  const grouped = new Map<string, CodeChunk[]>()

  for (const chunk of chunks) {
    const fileChunks = grouped.get(chunk.filePath) ?? []
    fileChunks.push(chunk)
    grouped.set(chunk.filePath, fileChunks)
  }

  for (const [filePath, fileChunks] of grouped.entries()) {
    fileChunks.sort((a, b) => a.indexInFile - b.indexInFile)
    grouped.set(filePath, fileChunks)
  }

  return grouped
}

function formatChunkSection(chunk: CodeChunk): string {
  return `\n[${chunk.filePath}:${chunk.startLine}-${chunk.endLine}]\n${chunk.content}\n`
}
