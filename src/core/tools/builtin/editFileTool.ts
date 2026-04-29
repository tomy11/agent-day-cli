import {readFile, stat, writeFile} from 'node:fs/promises'
import path from 'node:path'
import type {EditFileReplacement, EditFileToolInput, EditFileToolOutput} from '../contracts'
import type {ToolContext, ToolDefinition} from '../types'

export function createEditFileTool(): ToolDefinition {
  return {
    name: 'edit_file',
    description: 'Apply exact text replacements to a file in the workspace',
    riskLevel: 'high',
    extractPaths(input: unknown): string[] {
      const payload = parseEditFileInput(input)
      return [payload.path]
    },
    async execute(input: unknown, context: ToolContext): Promise<EditFileToolOutput> {
      const payload = parseEditFileInput(input)
      const absolutePath = resolveWorkspacePath(payload.path, context.workspaceRoot)
      const encoding = payload.encoding ?? 'utf8'
      const requireExactMatch = payload.requireExactMatch ?? true

      await assertExistingFile(absolutePath)
      const originalContent = await readFile(absolutePath, {encoding})
      const result = applyReplacements(originalContent, payload.replacements, requireExactMatch)

      if (result.changed) {
        await writeFile(absolutePath, result.content, {encoding})
      }

      return {
        path: payload.path,
        absolutePath,
        replacementsApplied: result.replacementsApplied,
        changed: result.changed,
      }
    },
  }
}

function parseEditFileInput(input: unknown): EditFileToolInput {
  if (!input || typeof input !== 'object') {
    throw new Error('edit_file input must be an object')
  }

  const candidate = input as Partial<EditFileToolInput>

  if (!candidate.path || typeof candidate.path !== 'string') {
    throw new Error('edit_file input.path must be a string')
  }

  if (!Array.isArray(candidate.replacements) || candidate.replacements.length === 0) {
    throw new Error('edit_file input.replacements must be a non-empty array')
  }

  const replacements = candidate.replacements.map(parseReplacement)

  if (candidate.encoding !== undefined) {
    if (typeof candidate.encoding !== 'string' || !Buffer.isEncoding(candidate.encoding)) {
      throw new Error('edit_file input.encoding must be a valid BufferEncoding')
    }
  }

  if (candidate.requireExactMatch !== undefined && typeof candidate.requireExactMatch !== 'boolean') {
    throw new Error('edit_file input.requireExactMatch must be a boolean')
  }

  return {
    path: candidate.path,
    replacements,
    encoding: candidate.encoding,
    requireExactMatch: candidate.requireExactMatch ?? true,
  }
}

function parseReplacement(replacement: unknown, index: number): EditFileReplacement {
  if (!replacement || typeof replacement !== 'object' || Array.isArray(replacement)) {
    throw new Error(`edit_file input.replacements[${index}] must be an object`)
  }

  const candidate = replacement as Partial<EditFileReplacement>

  if (typeof candidate.oldText !== 'string' || candidate.oldText.length === 0) {
    throw new Error(`edit_file input.replacements[${index}].oldText must be a non-empty string`)
  }

  if (typeof candidate.newText !== 'string') {
    throw new Error(`edit_file input.replacements[${index}].newText must be a string`)
  }

  if (candidate.replaceAll !== undefined && typeof candidate.replaceAll !== 'boolean') {
    throw new Error(`edit_file input.replacements[${index}].replaceAll must be a boolean`)
  }

  return {
    oldText: candidate.oldText,
    newText: candidate.newText,
    replaceAll: candidate.replaceAll ?? false,
  }
}

async function assertExistingFile(absolutePath: string): Promise<void> {
  const existing = await stat(absolutePath)
  if (!existing.isFile()) {
    throw new Error('edit_file target exists but is not a file')
  }
}

function applyReplacements(
  content: string,
  replacements: EditFileReplacement[],
  requireExactMatch: boolean,
): {content: string; replacementsApplied: number; changed: boolean} {
  let nextContent = content
  let replacementsApplied = 0

  replacements.forEach((replacement, index) => {
    const matchCount = countOccurrences(nextContent, replacement.oldText)

    if (matchCount === 0) {
      if (requireExactMatch) {
        throw new Error(`edit_file conflict: replacement ${index + 1} oldText was not found`)
      }

      return
    }

    if (!replacement.replaceAll && matchCount > 1) {
      throw new Error(
        `edit_file conflict: replacement ${index + 1} matched ${matchCount} times; set replaceAll=true to replace all matches`,
      )
    }

    if (replacement.replaceAll) {
      nextContent = nextContent.split(replacement.oldText).join(replacement.newText)
      replacementsApplied += matchCount
      return
    }

    nextContent = nextContent.replace(replacement.oldText, replacement.newText)
    replacementsApplied += 1
  })

  return {
    content: nextContent,
    replacementsApplied,
    changed: nextContent !== content,
  }
}

function countOccurrences(content: string, search: string): number {
  let count = 0
  let index = 0

  while (index < content.length) {
    const foundAt = content.indexOf(search, index)
    if (foundAt === -1) {
      break
    }

    count += 1
    index = foundAt + search.length
  }

  return count
}

function resolveWorkspacePath(candidatePath: string, workspaceRoot: string): string {
  const root = path.resolve(workspaceRoot)
  if (path.isAbsolute(candidatePath)) {
    return path.resolve(candidatePath)
  }

  return path.resolve(root, candidatePath)
}
