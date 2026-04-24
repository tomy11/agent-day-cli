import {readFile} from 'node:fs/promises'
import path from 'node:path'
import type {ToolContext, ToolDefinition} from '../types'

interface ReadFileToolInput {
  path: string
  encoding?: BufferEncoding
  maxChars?: number
}

interface ReadFileToolOutput {
  path: string
  absolutePath: string
  content: string
  truncated: boolean
}

const DEFAULT_MAX_CHARS = 20_000

export function createReadFileTool(): ToolDefinition {
  return {
    name: 'read_file',
    description: 'Read text content from a file in the workspace',
    riskLevel: 'low',
    extractPaths(input: unknown): string[] {
      const payload = parseReadFileInput(input)
      return [payload.path]
    },
    async execute(input: unknown, context: ToolContext): Promise<ReadFileToolOutput> {
      const payload = parseReadFileInput(input)
      const absolutePath = resolveWorkspacePath(payload.path, context.workspaceRoot)
      const encoding = payload.encoding ?? 'utf8'
      const maxChars = payload.maxChars ?? DEFAULT_MAX_CHARS

      const content = await readFile(absolutePath, {encoding})
      const truncated = content.length > maxChars

      return {
        path: payload.path,
        absolutePath,
        content: truncated ? content.slice(0, maxChars) : content,
        truncated,
      }
    },
  }
}

function parseReadFileInput(input: unknown): ReadFileToolInput {
  if (!input || typeof input !== 'object') {
    throw new Error('read_file input must be an object')
  }

  const candidate = input as Partial<ReadFileToolInput>

  if (!candidate.path || typeof candidate.path !== 'string') {
    throw new Error('read_file input.path must be a string')
  }

  if (candidate.encoding && typeof candidate.encoding !== 'string') {
    throw new Error('read_file input.encoding must be a string')
  }

  if (
    candidate.maxChars !== undefined &&
    (typeof candidate.maxChars !== 'number' || !Number.isFinite(candidate.maxChars) || candidate.maxChars <= 0)
  ) {
    throw new Error('read_file input.maxChars must be a positive number')
  }

  return {
    path: candidate.path,
    encoding: candidate.encoding,
    maxChars: candidate.maxChars,
  }
}

function resolveWorkspacePath(candidatePath: string, workspaceRoot: string): string {
  const root = path.resolve(workspaceRoot)
  if (path.isAbsolute(candidatePath)) {
    return path.resolve(candidatePath)
  }

  return path.resolve(root, candidatePath)
}
