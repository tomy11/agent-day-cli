import {lstat, readdir, readFile} from 'node:fs/promises'
import path from 'node:path'
import type {
  FindFilesToolInput,
  FindFilesToolOutput,
  ListDirEntry,
  ListDirToolInput,
  ListDirToolOutput,
  SearchFilesMatch,
  SearchFilesToolInput,
  SearchFilesToolOutput,
} from '../contracts'
import type {ToolContext, ToolDefinition} from '../types'

const DEFAULT_SEARCH_MAX_RESULTS = 50
const DEFAULT_FIND_MAX_RESULTS = 100
const DEFAULT_LIST_MAX_ENTRIES = 200
const DEFAULT_MAX_FILE_BYTES = 512_000
const MAX_RESULT_LIMIT = 1_000
const MAX_FILE_BYTES = 2_000_000
const PREVIEW_CHARS = 160

export function createSearchFilesTool(): ToolDefinition {
  return {
    name: 'search_files',
    description: 'Search text content in workspace files',
    riskLevel: 'low',
    extractPaths(input: unknown): string[] {
      const payload = parseSearchFilesInput(input)
      return [payload.path ?? '.']
    },
    async execute(input: unknown, context: ToolContext): Promise<SearchFilesToolOutput> {
      const payload = parseSearchFilesInput(input)
      const searchPath = payload.path ?? '.'
      const absolutePath = resolveWorkspacePath(searchPath, context.workspaceRoot)
      const maxResults = payload.maxResults ?? DEFAULT_SEARCH_MAX_RESULTS
      const maxFileBytes = payload.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES
      const query = payload.caseSensitive ? payload.query : payload.query.toLocaleLowerCase()
      const matches: SearchFilesMatch[] = []
      let filesSearched = 0
      let filesSkipped = 0
      let totalMatches = 0
      let truncated = false

      for await (const filePath of walkFiles(absolutePath)) {
        const stats = await safeLstat(filePath)
        if (!stats || !stats.isFile() || stats.size > maxFileBytes) {
          filesSkipped += 1
          continue
        }

        let content: string
        try {
          content = await readFile(filePath, 'utf8')
        } catch {
          filesSkipped += 1
          continue
        }

        if (content.includes('\0')) {
          filesSkipped += 1
          continue
        }

        filesSearched += 1
        const lines = content.split(/\r?\n/)
        for (const [lineIndex, line] of lines.entries()) {
          const haystack = payload.caseSensitive ? line : line.toLocaleLowerCase()
          let offset = haystack.indexOf(query)
          while (offset !== -1) {
            totalMatches += 1
            if (matches.length < maxResults) {
              matches.push({
                path: toWorkspacePath(filePath, context.workspaceRoot),
                line: lineIndex + 1,
                column: offset + 1,
                preview: trimPreview(line),
              })
            } else {
              truncated = true
              break
            }

            offset = haystack.indexOf(query, offset + Math.max(query.length, 1))
          }

          if (truncated) {
            break
          }
        }

        if (truncated) {
          break
        }
      }

      return {
        query: payload.query,
        path: searchPath,
        absolutePath,
        matches,
        totalMatches,
        filesSearched,
        filesSkipped,
        truncated,
      }
    },
  }
}

export function createFindFilesTool(): ToolDefinition {
  return {
    name: 'find_files',
    description: 'Find workspace files by path or basename',
    riskLevel: 'low',
    extractPaths(input: unknown): string[] {
      const payload = parseFindFilesInput(input)
      return [payload.path ?? '.']
    },
    async execute(input: unknown, context: ToolContext): Promise<FindFilesToolOutput> {
      const payload = parseFindFilesInput(input)
      const searchPath = payload.path ?? '.'
      const absolutePath = resolveWorkspacePath(searchPath, context.workspaceRoot)
      const maxResults = payload.maxResults ?? DEFAULT_FIND_MAX_RESULTS
      const query = payload.caseSensitive ? payload.query : payload.query.toLocaleLowerCase()
      const paths: string[] = []
      let totalMatches = 0
      let truncated = false

      for await (const filePath of walkFiles(absolutePath)) {
        const relativePath = toWorkspacePath(filePath, context.workspaceRoot)
        const basename = path.basename(relativePath)
        const pathHaystack = payload.caseSensitive ? relativePath : relativePath.toLocaleLowerCase()
        const nameHaystack = payload.caseSensitive ? basename : basename.toLocaleLowerCase()

        if (!pathHaystack.includes(query) && !nameHaystack.includes(query)) {
          continue
        }

        totalMatches += 1
        if (paths.length < maxResults) {
          paths.push(relativePath)
          continue
        }

        truncated = true
        break
      }

      return {
        query: payload.query,
        path: searchPath,
        absolutePath,
        paths,
        totalMatches,
        truncated,
      }
    },
  }
}

export function createListDirTool(): ToolDefinition {
  return {
    name: 'list_dir',
    description: 'List entries in a workspace directory',
    riskLevel: 'low',
    extractPaths(input: unknown): string[] {
      const payload = parseListDirInput(input)
      return [payload.path ?? '.']
    },
    async execute(input: unknown, context: ToolContext): Promise<ListDirToolOutput> {
      const payload = parseListDirInput(input)
      const listPath = payload.path ?? '.'
      const absolutePath = resolveWorkspacePath(listPath, context.workspaceRoot)
      const maxEntries = payload.maxEntries ?? DEFAULT_LIST_MAX_ENTRIES
      const entries: ListDirEntry[] = []
      let totalEntries = 0
      let truncated = false

      for await (const entryPath of walkEntries(absolutePath, payload.recursive ?? false)) {
        totalEntries += 1
        if (entries.length < maxEntries) {
          const entry = await createListEntry(entryPath, context.workspaceRoot)
          if (entry) {
            entries.push(entry)
          }

          continue
        }

        truncated = true
        break
      }

      return {
        path: listPath,
        absolutePath,
        entries,
        totalEntries,
        truncated,
      }
    },
  }
}

function parseSearchFilesInput(input: unknown): SearchFilesToolInput {
  const candidate = assertToolInput<SearchFilesToolInput>(input, 'search_files')
  assertNonEmptyString(candidate.query, 'search_files input.query')
  assertOptionalString(candidate.path, 'search_files input.path')
  assertOptionalBoolean(candidate.caseSensitive, 'search_files input.caseSensitive')
  assertOptionalPositiveInteger(candidate.maxResults, 'search_files input.maxResults', MAX_RESULT_LIMIT)
  assertOptionalPositiveInteger(candidate.maxFileBytes, 'search_files input.maxFileBytes', MAX_FILE_BYTES)

  return {
    query: candidate.query,
    path: candidate.path ?? '.',
    caseSensitive: candidate.caseSensitive ?? false,
    maxResults: candidate.maxResults ?? DEFAULT_SEARCH_MAX_RESULTS,
    maxFileBytes: candidate.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
  }
}

function parseFindFilesInput(input: unknown): FindFilesToolInput {
  const candidate = assertToolInput<FindFilesToolInput>(input, 'find_files')
  assertNonEmptyString(candidate.query, 'find_files input.query')
  assertOptionalString(candidate.path, 'find_files input.path')
  assertOptionalBoolean(candidate.caseSensitive, 'find_files input.caseSensitive')
  assertOptionalPositiveInteger(candidate.maxResults, 'find_files input.maxResults', MAX_RESULT_LIMIT)

  return {
    query: candidate.query,
    path: candidate.path ?? '.',
    caseSensitive: candidate.caseSensitive ?? false,
    maxResults: candidate.maxResults ?? DEFAULT_FIND_MAX_RESULTS,
  }
}

function parseListDirInput(input: unknown): ListDirToolInput {
  const candidate = input === undefined ? {} : assertToolInput<ListDirToolInput>(input, 'list_dir')
  assertOptionalString(candidate.path, 'list_dir input.path')
  assertOptionalBoolean(candidate.recursive, 'list_dir input.recursive')
  assertOptionalPositiveInteger(candidate.maxEntries, 'list_dir input.maxEntries', MAX_RESULT_LIMIT)

  return {
    path: candidate.path ?? '.',
    recursive: candidate.recursive ?? false,
    maxEntries: candidate.maxEntries ?? DEFAULT_LIST_MAX_ENTRIES,
  }
}

function assertToolInput<T>(input: unknown, toolName: string): Partial<T> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(`${toolName} input must be an object`)
  }

  return input as Partial<T>
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`)
  }
}

function assertOptionalString(value: unknown, field: string): asserts value is string | undefined {
  if (value !== undefined && typeof value !== 'string') {
    throw new Error(`${field} must be a string`)
  }
}

function assertOptionalBoolean(value: unknown, field: string): asserts value is boolean | undefined {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new Error(`${field} must be a boolean`)
  }
}

function assertOptionalPositiveInteger(value: unknown, field: string, maximum: number): asserts value is number | undefined {
  if (value === undefined) {
    return
  }

  if (!Number.isInteger(value) || (value as number) <= 0 || (value as number) > maximum) {
    throw new Error(`${field} must be an integer between 1 and ${maximum}`)
  }
}

async function* walkFiles(rootPath: string): AsyncGenerator<string> {
  const stats = await safeLstat(rootPath)
  if (!stats) {
    return
  }

  if (stats.isFile()) {
    yield rootPath
    return
  }

  if (!stats.isDirectory()) {
    return
  }

  for await (const entryPath of walkEntries(rootPath, true)) {
    const entryStats = await safeLstat(entryPath)
    if (entryStats?.isFile()) {
      yield entryPath
    }
  }
}

async function* walkEntries(rootPath: string, recursive: boolean): AsyncGenerator<string> {
  const stats = await safeLstat(rootPath)
  if (!stats?.isDirectory()) {
    return
  }

  let entries
  try {
    entries = await readdir(rootPath, {withFileTypes: true})
  } catch {
    return
  }

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(rootPath, entry.name)
    yield entryPath

    if (recursive && entry.isDirectory()) {
      yield* walkEntries(entryPath, recursive)
    }
  }
}

async function createListEntry(entryPath: string, workspaceRoot: string): Promise<ListDirEntry | undefined> {
  const stats = await safeLstat(entryPath)
  if (!stats) {
    return undefined
  }

  const type = stats.isFile()
    ? 'file'
    : stats.isDirectory()
      ? 'directory'
      : stats.isSymbolicLink()
        ? 'symlink'
        : 'other'

  return {
    path: toWorkspacePath(entryPath, workspaceRoot),
    name: path.basename(entryPath),
    type,
    size: stats.isFile() && typeof stats.size === 'number' ? stats.size : undefined,
    modifiedAt: stats.mtime.toISOString(),
  }
}

async function safeLstat(candidatePath: string): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
  try {
    return await lstat(candidatePath)
  } catch {
    return undefined
  }
}

function resolveWorkspacePath(candidatePath: string, workspaceRoot: string): string {
  const root = path.resolve(workspaceRoot)
  if (path.isAbsolute(candidatePath)) {
    return path.resolve(candidatePath)
  }

  return path.resolve(root, candidatePath)
}

function toWorkspacePath(candidatePath: string, workspaceRoot: string): string {
  const relativePath = path.relative(path.resolve(workspaceRoot), path.resolve(candidatePath))
  return relativePath === '' ? '.' : relativePath.split(path.sep).join('/')
}

function trimPreview(line: string): string {
  if (line.length <= PREVIEW_CHARS) {
    return line
  }

  return `${line.slice(0, PREVIEW_CHARS)}...`
}
