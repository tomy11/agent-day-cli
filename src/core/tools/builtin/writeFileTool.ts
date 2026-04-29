import {mkdir, stat, writeFile} from 'node:fs/promises'
import path from 'node:path'
import type {WriteFileToolInput, WriteFileToolOutput} from '../contracts'
import type {ToolContext, ToolDefinition} from '../types'

export function createWriteFileTool(): ToolDefinition {
  return {
    name: 'write_file',
    description: 'Write text content to a file in the workspace',
    riskLevel: 'high',
    extractPaths(input: unknown): string[] {
      const payload = parseWriteFileInput(input)
      return [payload.path]
    },
    async execute(input: unknown, context: ToolContext): Promise<WriteFileToolOutput> {
      const payload = parseWriteFileInput(input)
      const absolutePath = resolveWorkspacePath(payload.path, context.workspaceRoot)
      const encoding = payload.encoding ?? 'utf8'
      const existing = await getExistingFileState(absolutePath)

      if (existing.exists && !payload.overwrite) {
        throw new Error('write_file target exists; set overwrite=true to replace it')
      }

      if (payload.createDirs) {
        await mkdir(path.dirname(absolutePath), {recursive: true})
      }

      await writeFile(absolutePath, payload.content, {encoding})

      return {
        path: payload.path,
        absolutePath,
        bytesWritten: Buffer.byteLength(payload.content, encoding),
        created: !existing.exists,
        overwritten: existing.exists,
      }
    },
  }
}

function parseWriteFileInput(input: unknown): WriteFileToolInput {
  if (!input || typeof input !== 'object') {
    throw new Error('write_file input must be an object')
  }

  const candidate = input as Partial<WriteFileToolInput>

  if (!candidate.path || typeof candidate.path !== 'string') {
    throw new Error('write_file input.path must be a string')
  }

  if (typeof candidate.content !== 'string') {
    throw new Error('write_file input.content must be a string')
  }

  if (candidate.encoding !== undefined) {
    if (typeof candidate.encoding !== 'string' || !Buffer.isEncoding(candidate.encoding)) {
      throw new Error('write_file input.encoding must be a valid BufferEncoding')
    }
  }

  if (candidate.createDirs !== undefined && typeof candidate.createDirs !== 'boolean') {
    throw new Error('write_file input.createDirs must be a boolean')
  }

  if (candidate.overwrite !== undefined && typeof candidate.overwrite !== 'boolean') {
    throw new Error('write_file input.overwrite must be a boolean')
  }

  return {
    path: candidate.path,
    content: candidate.content,
    encoding: candidate.encoding,
    createDirs: candidate.createDirs ?? false,
    overwrite: candidate.overwrite ?? false,
  }
}

async function getExistingFileState(absolutePath: string): Promise<{exists: boolean}> {
  try {
    const existing = await stat(absolutePath)
    if (!existing.isFile()) {
      throw new Error('write_file target exists but is not a file')
    }

    return {exists: true}
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {exists: false}
    }

    throw error
  }
}

function resolveWorkspacePath(candidatePath: string, workspaceRoot: string): string {
  const root = path.resolve(workspaceRoot)
  if (path.isAbsolute(candidatePath)) {
    return path.resolve(candidatePath)
  }

  return path.resolve(root, candidatePath)
}
