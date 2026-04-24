import {mkdir, readdir, readFile, stat, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {buildChunksForFile} from './chunker'
import type {CodeChunk, CodeIndex} from './types'

const INDEX_DIR = path.join('.daycli', 'index')
const INDEX_PATH = path.join(INDEX_DIR, 'chunks.json')
const INDEX_VERSION = 1

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

export async function loadOrBuildIndex(workspaceRoot: string): Promise<CodeIndex> {
  const indexFilePath = getIndexPath(workspaceRoot)

  try {
    const raw = await readFile(indexFilePath, 'utf8')
    const parsed = JSON.parse(raw) as CodeIndex
    if (isValidIndex(parsed)) {
      return parsed
    }
  } catch {
    // no-op: build new index below
  }

  return buildAndSaveIndex(workspaceRoot)
}

async function buildAndSaveIndex(workspaceRoot: string): Promise<CodeIndex> {
  const files = await collectSourceFiles(workspaceRoot, workspaceRoot)
  const chunks: CodeChunk[] = []

  for (const filePath of files) {
    const absolutePath = path.join(workspaceRoot, filePath)

    try {
      const fileStat = await stat(absolutePath)
      if (fileStat.size > MAX_FILE_SIZE_BYTES) {
        continue
      }

      const content = await readFile(absolutePath, 'utf8')
      chunks.push(
        ...buildChunksForFile({
          filePath,
          content,
          updatedAt: fileStat.mtimeMs,
        }),
      )
    } catch {
      // Skip files that cannot be read as text.
    }
  }

  const index: CodeIndex = {
    version: INDEX_VERSION,
    workspaceRoot: path.resolve(workspaceRoot),
    generatedAt: new Date().toISOString(),
    chunks,
  }

  await mkdir(path.dirname(getIndexPath(workspaceRoot)), {recursive: true})
  await writeFile(getIndexPath(workspaceRoot), `${JSON.stringify(index, null, 2)}\n`, 'utf8')
  return index
}

async function collectSourceFiles(workspaceRoot: string, currentDir: string): Promise<string[]> {
  const output: string[] = []
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

    output.push(relativePath)
  }

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
    Array.isArray(candidate.chunks)
  )
}
