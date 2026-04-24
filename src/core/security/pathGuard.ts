import path from 'node:path'
import type {PathGuard} from '../execution'
import type {ToolDefinition, ToolContext} from '../tools'
import {AppError} from '../errors'

export class WorkspacePathGuard implements PathGuard {
  public assertAllowed(tool: ToolDefinition, input: unknown, context: ToolContext): void {
    const requestedPaths = tool.extractPaths?.(input) ?? []
    const workspaceRoot = path.resolve(context.workspaceRoot)

    for (const candidate of requestedPaths) {
      if (!candidate || typeof candidate !== 'string') {
        throw new AppError('TOOL_PATH_BLOCKED', `Invalid path payload for tool: ${tool.name}`, {
          meta: {toolName: tool.name},
        })
      }

      const resolved = path.isAbsolute(candidate)
        ? path.resolve(candidate)
        : path.resolve(workspaceRoot, candidate)

      if (!isWithinWorkspace(resolved, workspaceRoot)) {
        throw new AppError('TOOL_PATH_BLOCKED', `Path is outside workspace and blocked: ${candidate}`, {
          meta: {toolName: tool.name, candidate},
        })
      }
    }
  }
}

function isWithinWorkspace(candidate: string, workspaceRoot: string): boolean {
  const relative = path.relative(workspaceRoot, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}
