import path from 'node:path'
import type {PathGuard} from '../execution'
import type {ToolDefinition, ToolContext} from '../tools'
import {AppError} from '../errors'
import {
  DEFAULT_SAFETY_POLICY,
  SafetyPolicyViolation,
  assertPathAllowedByPolicy,
  resolveToolPathAccess,
  type SafetyPolicy,
} from './safetyPolicy'

export class WorkspacePathGuard implements PathGuard {
  private readonly policy: SafetyPolicy

  public constructor(policy: SafetyPolicy = DEFAULT_SAFETY_POLICY) {
    this.policy = policy
  }

  public assertAllowed(tool: ToolDefinition, input: unknown, context: ToolContext): void {
    const requestedPaths = tool.extractPaths?.(input) ?? []
    const workspaceRoot = path.resolve(context.workspaceRoot)
    const access = resolveToolPathAccess(tool.name)

    for (const candidate of requestedPaths) {
      if (!candidate || typeof candidate !== 'string') {
        throw new AppError('TOOL_PATH_BLOCKED', `Invalid path payload for tool: ${tool.name}`, {
          meta: {toolName: tool.name, access},
        })
      }

      const resolved = path.isAbsolute(candidate)
        ? path.resolve(candidate)
        : path.resolve(workspaceRoot, candidate)

      if (!isWithinWorkspace(resolved, workspaceRoot)) {
        throw new AppError('TOOL_PATH_BLOCKED', `Path is outside workspace and blocked: ${candidate}`, {
          meta: {toolName: tool.name, candidate, access},
        })
      }

      try {
        assertPathAllowedByPolicy({
          candidatePath: resolved,
          workspaceRoot,
          access,
          policy: this.policy,
        })
      } catch (error) {
        if (error instanceof SafetyPolicyViolation) {
          throw new AppError('TOOL_PATH_BLOCKED', error.message, {
            meta: {
              toolName: tool.name,
              candidate,
              access,
              ...error.meta,
            },
          })
        }

        throw error
      }
    }
  }
}

function isWithinWorkspace(candidate: string, workspaceRoot: string): boolean {
  const relative = path.relative(workspaceRoot, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}
