import {mkdir, readdir, readFile, stat, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {buildChunksForFile} from './chunker'
import type {CodeChunk, CodeIndex, IndexedFile} from './types'
import type {LlmProvider} from '../providers'

const INDEX_DIR = path.join('.daycli', 'index')
const INDEX_PATH = path.join(INDEX_DIR, 'chunks.json')
const INDEX_VERSION = 3
const EMBEDDING_BATCH_SIZE = 24

export interface IndexBuildOptions {
  embeddingProvider?: Pick<LlmProvider, 'embed'>
  embeddingModel?: string
}

const IGNORED_DIRS = new Set([
  '.git',
  '.daycli',
  'node_modules',
  'dist',
  'coverage',
])

const ALLOWED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.json',
  '.md',
  '.yml',
  '.yaml',
  '.txt',
])

const MAX_FILE_SIZE_BYTES = 250_000

export async function loadOrBuildIndex(workspaceRoot: string, options: IndexBuildOptions = {}): Promise<CodeIndex> {
  const indexFilePath = getIndexPath(workspaceRoot)
  const normalizedRoot = path.resolve(workspaceRoot)

  try {
    const raw = await readFile(indexFilePath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (isValidIndex(parsed) && parsed.workspaceRoot === normalizedRoot && parsed.version === INDEX_VERSION) {
      const refreshed = await refreshIndexIncrementally(workspaceRoot, parsed)
      const embedded = await ensureChunkEmbeddings(
        refreshed.index.chunks,
        options.embeddingProvider,
        options.embeddingModel,
      )

      if (refreshed.changed || embedded.changed) {
        refreshed.index = {
          ...refreshed.index,
          generatedAt: new Date().toISOString(),
          chunks: embedded.chunks,
        }
        await saveIndex(workspaceRoot, refreshed.index)
      }

      return refreshed.index
    }
  } catch {
    // no-op: build new index below
  }

  return buildAndSaveIndex(workspaceRoot, options)
}

async function buildAndSaveIndex(workspaceRoot: string, options: IndexBuildOptions): Promise<CodeIndex> {
  const files = await collectSourceFiles(workspaceRoot, workspaceRoot)
  let chunks: CodeChunk[] = []

  for (const file of files) {
    chunks.push(...(await buildChunksForIndexedFile(workspaceRoot, file)))
  }

  chunks = (await ensureChunkEmbeddings(chunks, options.embeddingProvider, options.embeddingModel)).chunks

  const index: CodeIndex = {
    version: INDEX_VERSION,
    workspaceRoot: path.resolve(workspaceRoot),
    generatedAt: new Date().toISOString(),
    files,
    chunks,
  }

  await saveIndex(workspaceRoot, index)
  return index
}

async function refreshIndexIncrementally(
  workspaceRoot: string,
  previousIndex: CodeIndex,
): Promise<{index: CodeIndex; changed: boolean}> {
  const currentFiles = await collectSourceFiles(workspaceRoot, workspaceRoot)
  const previousFilesByPath = new Map(previousIndex.files.map(file => [file.filePath, file]))
  const previousChunksByPath = groupChunksByFile(previousIndex.chunks)

  let changed = false
  const chunks: CodeChunk[] = []

  for (const file of currentFiles) {
    const previousFile = previousFilesByPath.get(file.filePath)

    if (previousFile && isSameFileSnapshot(previousFile, file)) {
      const oldChunks = previousChunksByPath.get(file.filePath) ?? []
      chunks.push(...oldChunks)
      continue
    }

    changed = true
    chunks.push(...(await buildChunksForIndexedFile(workspaceRoot, file)))
  }

  if (!changed && previousIndex.files.length !== currentFiles.length) {
    changed = true
  }

  if (!changed) {
    return {index: previousIndex, changed: false}
  }

  return {
    changed: true,
    index: {
      version: INDEX_VERSION,
      workspaceRoot: path.resolve(workspaceRoot),
      generatedAt: new Date().toISOString(),
      files: currentFiles,
      chunks,
    },
  }
}

async function collectSourceFiles(workspaceRoot: string, currentDir: string): Promise<IndexedFile[]> {
  const output: IndexedFile[] = []
  const entries = await readdir(currentDir, {withFileTypes: true})

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name)
    const relativePath = path.relative(workspaceRoot, absolutePath)

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) {
        continue
      }

      output.push(...(await collectSourceFiles(workspaceRoot, absolutePath)))
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    if (relativePath.startsWith('.')) {
      continue
    }

    const ext = path.extname(entry.name).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      continue
    }

    try {
      const fileStat = await stat(absolutePath)
      if (fileStat.size > MAX_FILE_SIZE_BYTES) {
        continue
      }

      output.push({
        filePath: normalizePath(relativePath),
        updatedAt: fileStat.mtimeMs,
        size: fileStat.size,
      })
    } catch {
      // Ignore files that cannot be stat-ed.
    }
  }

  output.sort((a, b) => a.filePath.localeCompare(b.filePath))
  return output
}

function getIndexPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, INDEX_PATH)
}

function isValidIndex(index: unknown): index is CodeIndex {
  if (!index || typeof index !== 'object') {
    return false
  }

  const candidate = index as Partial<CodeIndex>
  return (
    typeof candidate.version === 'number' &&
    typeof candidate.workspaceRoot === 'string' &&
    typeof candidate.generatedAt === 'string' &&
    Array.isArray(candidate.files) &&
    Array.isArray(candidate.chunks)
  )
}

async function buildChunksForIndexedFile(workspaceRoot: string, file: IndexedFile): Promise<CodeChunk[]> {
  const absolutePath = path.join(workspaceRoot, file.filePath)

  try {
    const content = await readFile(absolutePath, 'utf8')
    return buildChunksForFile({
      filePath: file.filePath,
      content,
      updatedAt: file.updatedAt,
    })
  } catch {
    return []
  }
}

async function ensureChunkEmbeddings(
  chunks: CodeChunk[],
  embeddingProvider: Pick<LlmProvider, 'embed'> | undefined,
  expectedModel: string | undefined,
): Promise<{chunks: CodeChunk[]; changed: boolean}> {
  if (!embeddingProvider?.embed || chunks.length === 0) {
    return {chunks, changed: false}
  }

  let changed = false
  const output = chunks.slice()

  for (let start = 0; start < output.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = output.slice(start, start + EMBEDDING_BATCH_SIZE)
    const pending = batch
      .map((chunk, index) => ({chunk, index: start + index}))
      .filter(item => !item.chunk.embedding || (expectedModel !== undefined && item.chunk.embedding.model !== expectedModel))

    if (pending.length === 0) {
      continue
    }

    const response = await embeddingProvider.embed({
      inputs: pending.map(item => formatChunkForEmbedding(item.chunk)),
    })

    response.embeddings.forEach((vector, index) => {
      const target = pending[index]
      if (!target) {
        return
      }

      output[target.index] = {
        ...target.chunk,
        embedding: {
          model: response.model,
          vector,
        },
      }
      changed = true
    })
  }

  return {chunks: output, changed}
}

function formatChunkForEmbedding(chunk: CodeChunk): string {
  return [
    `path: ${chunk.filePath}`,
    chunk.symbol ? `symbol: ${chunk.symbol}` : undefined,
    chunk.imports.length > 0 ? `imports: ${chunk.imports.join(', ')}` : undefined,
    chunk.content,
  ].filter((part): part is string => Boolean(part)).join('\n')
}

function groupChunksByFile(chunks: CodeChunk[]): Map<string, CodeChunk[]> {
  const grouped = new Map<string, CodeChunk[]>()
  for (const chunk of chunks) {
    const fileChunks = grouped.get(chunk.filePath) ?? []
    fileChunks.push(chunk)
    grouped.set(chunk.filePath, fileChunks)
  }

  return grouped
}

function isSameFileSnapshot(a: IndexedFile, b: IndexedFile): boolean {
  return a.updatedAt === b.updatedAt && a.size === b.size
}

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join('/')
}

async function saveIndex(workspaceRoot: string, index: CodeIndex): Promise<void> {
  await mkdir(path.dirname(getIndexPath(workspaceRoot)), {recursive: true})
  await writeFile(getIndexPath(workspaceRoot), `${JSON.stringify(index, null, 2)}\n`, 'utf8')
}
