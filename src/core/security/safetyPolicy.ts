import path from 'node:path'
import type {ToolRiskLevel} from '../tools'

export type PathAccessKind = 'read' | 'write' | 'execute'

export interface PathPolicy {
  allow?: string[]
  deny?: string[]
}

export interface CommandPolicy {
  allow?: string[]
  deny?: string[]
}

export interface ToolPolicy {
  riskLevel: ToolRiskLevel
  pathAccess: PathAccessKind
}

export interface SafetyPolicy {
  paths: Record<PathAccessKind, PathPolicy>
  commands: CommandPolicy
  tools: Record<string, ToolPolicy>
}

export const DEFAULT_SAFETY_POLICY: SafetyPolicy = {
  paths: {
    read: {
      allow: ['**'],
    },
    write: {
      allow: ['**'],
      deny: ['.git/**', 'node_modules/**', 'dist/**'],
    },
    execute: {
      allow: ['**'],
      deny: ['.git/**', 'node_modules/**'],
    },
  },
  commands: {
    deny: [
      'rm',
      'rmdir',
      'sudo',
      'su',
      'chmod',
      'chown',
      'mkfs',
      'mount',
      'umount',
      'dd',
      'shutdown',
      'reboot',
    ],
  },
  tools: {
    read_file: {
      riskLevel: 'low',
      pathAccess: 'read',
    },
    write_file: {
      riskLevel: 'high',
      pathAccess: 'write',
    },
    edit_file: {
      riskLevel: 'high',
      pathAccess: 'write',
    },
    run_command: {
      riskLevel: 'high',
      pathAccess: 'execute',
    },
  },
}

export function resolveToolRiskLevel(toolName: string, fallback: ToolRiskLevel): ToolRiskLevel {
  return DEFAULT_SAFETY_POLICY.tools[toolName]?.riskLevel ?? fallback
}

export function resolveToolPathAccess(toolName: string): PathAccessKind {
  return DEFAULT_SAFETY_POLICY.tools[toolName]?.pathAccess ?? 'read'
}

export function assertPathAllowedByPolicy(input: {
  candidatePath: string
  workspaceRoot: string
  access: PathAccessKind
  policy?: SafetyPolicy
}): void {
  const policy = input.policy ?? DEFAULT_SAFETY_POLICY
  const pathPolicy = policy.paths[input.access]
  const relativePath = toWorkspaceRelativePath(input.candidatePath, input.workspaceRoot)

  if (matchesAny(relativePath, pathPolicy.deny ?? [])) {
    throw new SafetyPolicyViolation(`Path is denied for ${input.access}: ${relativePath}`, {
      access: input.access,
      candidate: input.candidatePath,
      relativePath,
    })
  }

  const allowed = pathPolicy.allow ?? ['**']
  if (!matchesAny(relativePath, allowed)) {
    throw new SafetyPolicyViolation(`Path is not allowed for ${input.access}: ${relativePath}`, {
      access: input.access,
      candidate: input.candidatePath,
      relativePath,
    })
  }
}

export function assertCommandAllowedByPolicy(input: {
  command: string
  policy?: SafetyPolicy
}): void {
  const policy = input.policy ?? DEFAULT_SAFETY_POLICY
  const command = normalizeCommand(input.command)

  if (matchesCommand(command, policy.commands.deny ?? [])) {
    throw new SafetyPolicyViolation(`Command is denied: ${command}`, {
      command,
    })
  }

  const allow = policy.commands.allow
  if (allow && allow.length > 0 && !matchesCommand(command, allow)) {
    throw new SafetyPolicyViolation(`Command is not allowed: ${command}`, {
      command,
    })
  }
}

export class SafetyPolicyViolation extends Error {
  public readonly meta: Record<string, unknown>

  public constructor(message: string, meta: Record<string, unknown> = {}) {
    super(message)
    this.name = 'SafetyPolicyViolation'
    this.meta = meta
  }
}

function toWorkspaceRelativePath(candidatePath: string, workspaceRoot: string): string {
  const root = path.resolve(workspaceRoot)
  const absolutePath = path.isAbsolute(candidatePath)
    ? path.resolve(candidatePath)
    : path.resolve(root, candidatePath)
  const relativePath = path.relative(root, absolutePath)

  if (relativePath === '') {
    return '.'
  }

  return normalizePolicyPath(relativePath)
}

function matchesAny(candidate: string, patterns: string[]): boolean {
  return patterns.some(pattern => matchesPathPattern(candidate, pattern))
}

function matchesPathPattern(candidate: string, pattern: string): boolean {
  const normalizedCandidate = normalizePolicyPath(candidate)
  const normalizedPattern = normalizePolicyPath(pattern)

  if (normalizedPattern === '**') {
    return true
  }

  if (normalizedPattern.endsWith('/**')) {
    const prefix = normalizedPattern.slice(0, -3)
    return normalizedCandidate === prefix || normalizedCandidate.startsWith(`${prefix}/`)
  }

  return normalizedCandidate === normalizedPattern
}

function normalizePolicyPath(value: string): string {
  return value.replaceAll(path.sep, '/').replace(/^\.\//, '')
}

function normalizeCommand(command: string): string {
  return path.basename(command.trim())
}

function matchesCommand(command: string, patterns: string[]): boolean {
  return patterns.some(pattern => pattern === command)
}
