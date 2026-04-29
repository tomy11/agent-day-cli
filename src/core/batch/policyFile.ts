import {readFile} from 'node:fs/promises'
import path from 'node:path'
import {AppError} from '../errors'
import {DEFAULT_SAFETY_POLICY, type SafetyPolicy} from '../security/safetyPolicy'

export const DEFAULT_BATCH_POLICY_FILE = 'daycli.policy.json'
export const BATCH_POLICY_SCHEMA_VERSION = 1

export type BatchPolicyApprovalDecision = 'allow' | 'deny'
export type BatchPolicyOutputMode = 'plain' | 'json'

export interface BatchPolicyFile {
  version: typeof BATCH_POLICY_SCHEMA_VERSION
  name?: string
  approvals?: BatchPolicyApprovalRules
  paths?: BatchPolicyPathRules
  commands?: BatchPolicyCommandRules
  limits?: BatchPolicyLimits
  output?: BatchPolicyOutput
}

export interface BatchPolicyApprovalRules {
  default?: BatchPolicyApprovalDecision
  riskLevels?: Partial<Record<'low' | 'high', BatchPolicyApprovalDecision>>
  tools?: Record<string, BatchPolicyApprovalDecision>
}

export interface BatchPolicyPathRules {
  read?: BatchPolicyPathAccessRules
  write?: BatchPolicyPathAccessRules
  execute?: BatchPolicyPathAccessRules
}

export interface BatchPolicyPathAccessRules {
  allow?: string[]
  deny?: string[]
}

export interface BatchPolicyCommandRules {
  allow?: string[]
  deny?: string[]
}

export interface BatchPolicyLimits {
  maxSteps?: number
  maxToolCalls?: number
  runTimeoutMs?: number
  commandTimeoutMs?: number
  commandOutputBytes?: number
}

export interface BatchPolicyOutput {
  mode?: BatchPolicyOutputMode
  includeSessionId?: boolean
  includeMetadata?: boolean
}

export interface LoadBatchPolicyOptions {
  policyPath?: string
  required?: boolean
}

export interface LoadedBatchPolicy {
  policy: BatchPolicyFile
  path: string
  source: 'default' | 'file'
}

export const DEFAULT_BATCH_POLICY: BatchPolicyFile = {
  version: BATCH_POLICY_SCHEMA_VERSION,
  approvals: {
    default: 'deny',
    riskLevels: {
      low: 'allow',
      high: 'deny',
    },
  },
  paths: {
    read: {
      allow: ['**'],
    },
    write: {
      allow: [],
      deny: ['.git/**', 'node_modules/**', 'dist/**'],
    },
    execute: {
      allow: [],
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
  limits: {
    maxSteps: 16,
    maxToolCalls: 8,
    runTimeoutMs: 180_000,
    commandTimeoutMs: 60_000,
    commandOutputBytes: 64_000,
  },
  output: {
    mode: 'plain',
    includeSessionId: true,
    includeMetadata: false,
  },
}

export const EXAMPLE_BATCH_POLICY: BatchPolicyFile = {
  version: BATCH_POLICY_SCHEMA_VERSION,
  name: 'safe-ci',
  approvals: {
    default: 'deny',
    riskLevels: {
      low: 'allow',
      high: 'deny',
    },
    tools: {
      read_file: 'allow',
      write_file: 'deny',
      edit_file: 'deny',
      run_command: 'allow',
    },
  },
  paths: {
    read: {
      allow: ['**'],
    },
    write: {
      allow: ['reports/**'],
      deny: ['.git/**', 'node_modules/**', 'dist/**'],
    },
    execute: {
      allow: ['.'],
      deny: ['.git/**', 'node_modules/**'],
    },
  },
  commands: {
    allow: ['npm', 'node'],
    deny: ['rm', 'sudo', 'chmod', 'dd', 'shutdown', 'reboot'],
  },
  limits: {
    maxSteps: 12,
    maxToolCalls: 4,
    runTimeoutMs: 120_000,
    commandTimeoutMs: 30_000,
    commandOutputBytes: 32_000,
  },
  output: {
    mode: 'json',
    includeSessionId: true,
    includeMetadata: true,
  },
}

export const BATCH_POLICY_JSON_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://daycli.local/schemas/daycli-policy.schema.json',
  title: 'daycli batch policy file',
  type: 'object',
  additionalProperties: false,
  required: ['version'],
  properties: {
    version: {
      const: BATCH_POLICY_SCHEMA_VERSION,
      description: 'Policy schema version.',
    },
    name: {
      type: 'string',
      minLength: 1,
      description: 'Optional human-readable policy name.',
    },
    approvals: {
      type: 'object',
      additionalProperties: false,
      properties: {
        default: approvalDecisionSchema('Default approval decision for unspecified tools.'),
        riskLevels: {
          type: 'object',
          additionalProperties: false,
          properties: {
            low: approvalDecisionSchema('Approval decision for low-risk tools.'),
            high: approvalDecisionSchema('Approval decision for high-risk tools.'),
          },
        },
        tools: {
          type: 'object',
          additionalProperties: approvalDecisionSchema('Approval decision for a specific tool.'),
        },
      },
    },
    paths: {
      type: 'object',
      additionalProperties: false,
      properties: {
        read: pathAccessSchema('Workspace paths allowed or denied for reads.'),
        write: pathAccessSchema('Workspace paths allowed or denied for writes.'),
        execute: pathAccessSchema('Workspace paths allowed or denied as command cwd.'),
      },
    },
    commands: {
      type: 'object',
      additionalProperties: false,
      properties: {
        allow: stringArraySchema('Allowed command names. Empty or omitted means no allow-list.'),
        deny: stringArraySchema('Denied command names. Deny rules win over allow rules.'),
      },
    },
    limits: {
      type: 'object',
      additionalProperties: false,
      properties: {
        maxSteps: positiveIntegerSchema('Maximum agent loop steps.'),
        maxToolCalls: positiveIntegerSchema('Maximum tool calls in one run.'),
        runTimeoutMs: nonNegativeIntegerSchema('Maximum full run duration in milliseconds.'),
        commandTimeoutMs: positiveIntegerSchema('Maximum single command duration in milliseconds.'),
        commandOutputBytes: positiveIntegerSchema('Maximum captured command output bytes.'),
      },
    },
    output: {
      type: 'object',
      additionalProperties: false,
      properties: {
        mode: {
          enum: ['plain', 'json'],
          description: 'Batch output mode.',
        },
        includeSessionId: {
          type: 'boolean',
          description: 'Whether output should include the persisted session id.',
        },
        includeMetadata: {
          type: 'boolean',
          description: 'Whether machine-readable output should include run metadata.',
        },
      },
    },
  },
} as const

export function policyToSafetyPolicy(policy: BatchPolicyFile): SafetyPolicy {
  return {
    paths: {
      read: policy.paths?.read ?? {},
      write: policy.paths?.write ?? {},
      execute: policy.paths?.execute ?? {},
    },
    commands: {
      allow: policy.commands?.allow,
      deny: policy.commands?.deny,
    },
    tools: DEFAULT_SAFETY_POLICY.tools,
  }
}

export async function loadBatchPolicy(
  workspaceRoot: string,
  options: LoadBatchPolicyOptions = {},
): Promise<LoadedBatchPolicy> {
  const policyPath = resolveBatchPolicyPath(workspaceRoot, options.policyPath)
  const explicitPath = options.policyPath !== undefined

  try {
    const raw = await readFile(policyPath, 'utf8')
    const parsed = parseBatchPolicyJson(raw, policyPath)
    return {
      policy: normalizeBatchPolicy(parsed, policyPath),
      path: policyPath,
      source: 'file',
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      if (options.required === true || explicitPath) {
        throw new AppError('POLICY_NOT_FOUND', `Policy file not found: ${policyPath}`, {
          cause: error,
          meta: {path: policyPath},
        })
      }

      return {
        policy: clonePolicy(DEFAULT_BATCH_POLICY),
        path: policyPath,
        source: 'default',
      }
    }

    if (error instanceof AppError) {
      throw error
    }

    throw new AppError('POLICY_IO_ERROR', `Failed to load policy file: ${policyPath}`, {
      cause: error,
      meta: {path: policyPath},
    })
  }
}

export function validateBatchPolicy(input: unknown, source = DEFAULT_BATCH_POLICY_FILE): BatchPolicyFile {
  return normalizeBatchPolicy(input, source)
}

export function resolveBatchPolicyPath(workspaceRoot: string, policyPath?: string): string {
  const root = path.resolve(workspaceRoot)
  const candidate = path.resolve(root, policyPath ?? DEFAULT_BATCH_POLICY_FILE)
  const relativePath = path.relative(root, candidate)

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new AppError('POLICY_INVALID', 'Policy file path must stay inside the workspace', {
      meta: {
        path: candidate,
        workspaceRoot: root,
      },
    })
  }

  return candidate
}

function parseBatchPolicyJson(raw: string, source: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch (error) {
    throw new AppError('POLICY_INVALID', `Invalid JSON in policy file: ${source}`, {
      cause: error,
      meta: {path: source},
    })
  }
}

function normalizeBatchPolicy(input: unknown, source: string): BatchPolicyFile {
  assertPlainObject(input, source, 'root')
  assertAllowedKeys(
    input,
    source,
    'root',
    ['version', 'name', 'approvals', 'paths', 'commands', 'limits', 'output'],
  )

  const candidate = input as Partial<BatchPolicyFile>

  if (candidate.version !== BATCH_POLICY_SCHEMA_VERSION) {
    throwPolicyInvalid(source, 'version', `must be ${BATCH_POLICY_SCHEMA_VERSION}`)
  }

  if (candidate.name !== undefined && (typeof candidate.name !== 'string' || candidate.name.length === 0)) {
    throwPolicyInvalid(source, 'name', 'must be a non-empty string')
  }

  return {
    version: BATCH_POLICY_SCHEMA_VERSION,
    ...(candidate.name !== undefined ? {name: candidate.name} : {}),
    approvals: normalizeApprovals(candidate.approvals, source),
    paths: normalizePaths(candidate.paths, source),
    commands: normalizeCommands(candidate.commands, source),
    limits: normalizeLimits(candidate.limits, source),
    output: normalizeOutput(candidate.output, source),
  }
}

function normalizeApprovals(
  input: BatchPolicyApprovalRules | undefined,
  source: string,
): BatchPolicyApprovalRules {
  if (input === undefined) {
    return clonePolicy(DEFAULT_BATCH_POLICY).approvals ?? {}
  }

  assertPlainObject(input, source, 'approvals')
  assertAllowedKeys(input, source, 'approvals', ['default', 'riskLevels', 'tools'])
  const approvalInput = input as BatchPolicyApprovalRules

  if (approvalInput.default !== undefined) {
    assertApprovalDecision(approvalInput.default, source, 'approvals.default')
  }

  if (approvalInput.riskLevels !== undefined) {
    assertPlainObject(approvalInput.riskLevels, source, 'approvals.riskLevels')
    assertAllowedKeys(approvalInput.riskLevels, source, 'approvals.riskLevels', ['low', 'high'])
    const riskLevels = approvalInput.riskLevels as Partial<Record<'low' | 'high', unknown>>
    if (riskLevels.low !== undefined) {
      assertApprovalDecision(riskLevels.low, source, 'approvals.riskLevels.low')
    }

    if (riskLevels.high !== undefined) {
      assertApprovalDecision(riskLevels.high, source, 'approvals.riskLevels.high')
    }
  }

  let tools: Record<string, BatchPolicyApprovalDecision> | undefined
  if (approvalInput.tools !== undefined) {
    assertStringRecord(approvalInput.tools, source, 'approvals.tools')
    tools = {}
    for (const [toolName, decision] of Object.entries(approvalInput.tools)) {
      assertNonEmptyString(toolName, source, 'approvals.tools key')
      assertApprovalDecision(decision, source, `approvals.tools.${toolName}`)
      tools[toolName] = decision
    }
  }

  const defaults = clonePolicy(DEFAULT_BATCH_POLICY).approvals ?? {}
  return {
    ...defaults,
    ...(approvalInput.default !== undefined ? {default: approvalInput.default} : {}),
    riskLevels: {
      ...(defaults.riskLevels ?? {}),
      ...(approvalInput.riskLevels ?? {}),
    },
    tools: {
      ...(defaults.tools ?? {}),
      ...(tools ?? {}),
    },
  }
}

function normalizePaths(input: BatchPolicyPathRules | undefined, source: string): BatchPolicyPathRules {
  if (input === undefined) {
    return clonePolicy(DEFAULT_BATCH_POLICY).paths ?? {}
  }

  assertPlainObject(input, source, 'paths')
  assertAllowedKeys(input, source, 'paths', ['read', 'write', 'execute'])
  const pathInput = input as BatchPolicyPathRules

  const defaults = clonePolicy(DEFAULT_BATCH_POLICY).paths ?? {}
  return {
    read: normalizePathAccess(pathInput.read, defaults.read, source, 'paths.read'),
    write: normalizePathAccess(pathInput.write, defaults.write, source, 'paths.write'),
    execute: normalizePathAccess(pathInput.execute, defaults.execute, source, 'paths.execute'),
  }
}

function normalizePathAccess(
  input: BatchPolicyPathAccessRules | undefined,
  defaults: BatchPolicyPathAccessRules | undefined,
  source: string,
  pointer: string,
): BatchPolicyPathAccessRules {
  if (input === undefined) {
    return {...(defaults ?? {})}
  }

  assertPlainObject(input, source, pointer)
  assertAllowedKeys(input, source, pointer, ['allow', 'deny'])

  if (input.allow !== undefined) {
    assertStringArray(input.allow, source, `${pointer}.allow`)
  }

  if (input.deny !== undefined) {
    assertStringArray(input.deny, source, `${pointer}.deny`)
  }

  return {
    ...(defaults ?? {}),
    ...(input.allow !== undefined ? {allow: [...input.allow]} : {}),
    ...(input.deny !== undefined ? {deny: [...input.deny]} : {}),
  }
}

function normalizeCommands(input: BatchPolicyCommandRules | undefined, source: string): BatchPolicyCommandRules {
  if (input === undefined) {
    return clonePolicy(DEFAULT_BATCH_POLICY).commands ?? {}
  }

  assertPlainObject(input, source, 'commands')
  assertAllowedKeys(input, source, 'commands', ['allow', 'deny'])

  if (input.allow !== undefined) {
    assertStringArray(input.allow, source, 'commands.allow')
  }

  if (input.deny !== undefined) {
    assertStringArray(input.deny, source, 'commands.deny')
  }

  const defaults = clonePolicy(DEFAULT_BATCH_POLICY).commands ?? {}
  return {
    ...(defaults.allow !== undefined ? {allow: [...defaults.allow]} : {}),
    ...(defaults.deny !== undefined ? {deny: [...defaults.deny]} : {}),
    ...(input.allow !== undefined ? {allow: [...input.allow]} : {}),
    ...(input.deny !== undefined ? {deny: [...input.deny]} : {}),
  }
}

function normalizeLimits(input: BatchPolicyLimits | undefined, source: string): BatchPolicyLimits {
  if (input === undefined) {
    return clonePolicy(DEFAULT_BATCH_POLICY).limits ?? {}
  }

  assertPlainObject(input, source, 'limits')
  assertAllowedKeys(input, source, 'limits', [
    'maxSteps',
    'maxToolCalls',
    'runTimeoutMs',
    'commandTimeoutMs',
    'commandOutputBytes',
  ])

  const validators: Array<[keyof BatchPolicyLimits, number]> = [
    ['maxSteps', 1],
    ['maxToolCalls', 1],
    ['runTimeoutMs', 0],
    ['commandTimeoutMs', 1],
    ['commandOutputBytes', 1],
  ]

  for (const [key, minimum] of validators) {
    const value = input[key]
    if (value !== undefined) {
      assertIntegerAtLeast(value, minimum, source, `limits.${key}`)
    }
  }

  return {
    ...(clonePolicy(DEFAULT_BATCH_POLICY).limits ?? {}),
    ...input,
  }
}

function normalizeOutput(input: BatchPolicyOutput | undefined, source: string): BatchPolicyOutput {
  if (input === undefined) {
    return clonePolicy(DEFAULT_BATCH_POLICY).output ?? {}
  }

  assertPlainObject(input, source, 'output')
  assertAllowedKeys(input, source, 'output', ['mode', 'includeSessionId', 'includeMetadata'])

  if (input.mode !== undefined && input.mode !== 'plain' && input.mode !== 'json') {
    throwPolicyInvalid(source, 'output.mode', 'must be "plain" or "json"')
  }

  if (input.includeSessionId !== undefined && typeof input.includeSessionId !== 'boolean') {
    throwPolicyInvalid(source, 'output.includeSessionId', 'must be a boolean')
  }

  if (input.includeMetadata !== undefined && typeof input.includeMetadata !== 'boolean') {
    throwPolicyInvalid(source, 'output.includeMetadata', 'must be a boolean')
  }

  return {
    ...(clonePolicy(DEFAULT_BATCH_POLICY).output ?? {}),
    ...input,
  }
}

function assertApprovalDecision(value: unknown, source: string, pointer: string): asserts value is BatchPolicyApprovalDecision {
  if (value !== 'allow' && value !== 'deny') {
    throwPolicyInvalid(source, pointer, 'must be "allow" or "deny"')
  }
}

function assertPlainObject(value: unknown, source: string, pointer: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throwPolicyInvalid(source, pointer, 'must be an object')
  }
}

function assertAllowedKeys(
  value: Record<string, unknown>,
  source: string,
  pointer: string,
  allowedKeys: string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      throwPolicyInvalid(source, `${pointer}.${key}`, 'is not allowed')
    }
  }
}

function assertStringRecord(value: unknown, source: string, pointer: string): asserts value is Record<string, unknown> {
  assertPlainObject(value, source, pointer)
}

function assertStringArray(value: unknown, source: string, pointer: string): asserts value is string[] {
  if (!Array.isArray(value)) {
    throwPolicyInvalid(source, pointer, 'must be an array of non-empty strings')
  }

  for (const [index, item] of value.entries()) {
    assertNonEmptyString(item, source, `${pointer}[${index}]`)
  }
}

function assertNonEmptyString(value: unknown, source: string, pointer: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throwPolicyInvalid(source, pointer, 'must be a non-empty string')
  }
}

function assertIntegerAtLeast(value: unknown, minimum: number, source: string, pointer: string): void {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    throwPolicyInvalid(source, pointer, `must be an integer >= ${minimum}`)
  }
}

function throwPolicyInvalid(source: string, pointer: string, reason: string): never {
  throw new AppError('POLICY_INVALID', `Invalid policy file (${source}) at ${pointer}: ${reason}`, {
    meta: {
      path: source,
      pointer,
      reason,
    },
  })
}

function clonePolicy<T>(policy: T): T {
  return JSON.parse(JSON.stringify(policy)) as T
}

function approvalDecisionSchema(description: string): object {
  return {
    enum: ['allow', 'deny'],
    description,
  }
}

function pathAccessSchema(description: string): object {
  return {
    type: 'object',
    additionalProperties: false,
    description,
    properties: {
      allow: stringArraySchema('Allowed workspace-relative path patterns.'),
      deny: stringArraySchema('Denied workspace-relative path patterns.'),
    },
  }
}

function stringArraySchema(description: string): object {
  return {
    type: 'array',
    description,
    items: {
      type: 'string',
      minLength: 1,
    },
  }
}

function positiveIntegerSchema(description: string): object {
  return {
    type: 'integer',
    minimum: 1,
    description,
  }
}

function nonNegativeIntegerSchema(description: string): object {
  return {
    type: 'integer',
    minimum: 0,
    description,
  }
}
