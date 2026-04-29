import {spawn} from 'node:child_process'
import path from 'node:path'
import type {RunCommandToolInput, RunCommandToolOutput} from '../contracts'
import type {ToolContext, ToolDefinition} from '../types'

const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_MAX_OUTPUT_BYTES = 64_000

export function createRunCommandTool(): ToolDefinition {
  return {
    name: 'run_command',
    description: 'Run a command in a guarded workspace directory',
    riskLevel: 'high',
    extractPaths(input: unknown): string[] {
      const payload = parseRunCommandInput(input)
      return [payload.cwd ?? '.']
    },
    extractCommands(input: unknown): string[] {
      const payload = parseRunCommandInput(input)
      return [payload.command]
    },
    async execute(input: unknown, context: ToolContext): Promise<RunCommandToolOutput> {
      const payload = parseRunCommandInput(input)
      const cwd = resolveWorkspacePath(payload.cwd ?? '.', context.workspaceRoot)
      const args = payload.args ?? []
      const timeoutMs = payload.timeoutMs ?? DEFAULT_TIMEOUT_MS
      const maxOutputBytes = payload.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES
      const startedAt = Date.now()

      return runProcess({
        command: payload.command,
        args,
        cwd,
        env: payload.env,
        timeoutMs,
        maxOutputBytes,
        startedAt,
      })
    },
  }
}

function parseRunCommandInput(input: unknown): RunCommandToolInput {
  if (!input || typeof input !== 'object') {
    throw new Error('run_command input must be an object')
  }

  const candidate = input as Partial<RunCommandToolInput>

  if (!candidate.command || typeof candidate.command !== 'string') {
    throw new Error('run_command input.command must be a string')
  }

  if (candidate.args !== undefined) {
    if (!Array.isArray(candidate.args) || candidate.args.some(argument => typeof argument !== 'string')) {
      throw new Error('run_command input.args must be an array of strings')
    }
  }

  if (candidate.cwd !== undefined && typeof candidate.cwd !== 'string') {
    throw new Error('run_command input.cwd must be a string')
  }

  if (
    candidate.timeoutMs !== undefined &&
    (typeof candidate.timeoutMs !== 'number' || !Number.isFinite(candidate.timeoutMs) || candidate.timeoutMs <= 0)
  ) {
    throw new Error('run_command input.timeoutMs must be a positive number')
  }

  if (
    candidate.maxOutputBytes !== undefined &&
    (
      typeof candidate.maxOutputBytes !== 'number' ||
      !Number.isFinite(candidate.maxOutputBytes) ||
      candidate.maxOutputBytes <= 0
    )
  ) {
    throw new Error('run_command input.maxOutputBytes must be a positive number')
  }

  if (candidate.env !== undefined) {
    if (!candidate.env || typeof candidate.env !== 'object' || Array.isArray(candidate.env)) {
      throw new Error('run_command input.env must be an object')
    }

    for (const [key, value] of Object.entries(candidate.env)) {
      if (typeof value !== 'string') {
        throw new Error(`run_command input.env.${key} must be a string`)
      }
    }
  }

  return {
    command: candidate.command,
    args: candidate.args ?? [],
    cwd: candidate.cwd ?? '.',
    timeoutMs: candidate.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    env: candidate.env,
    maxOutputBytes: candidate.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
  }
}

function runProcess(input: {
  command: string
  args: string[]
  cwd: string
  env?: Record<string, string>
  timeoutMs: number
  maxOutputBytes: number
  startedAt: number
}): Promise<RunCommandToolOutput> {
  return new Promise((resolve, reject) => {
    let timedOut = false
    const stdout = createOutputCollector(input.maxOutputBytes)
    const stderr = createOutputCollector(input.maxOutputBytes)
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: {
        ...process.env,
        ...(input.env ?? {}),
      },
      shell: false,
      windowsHide: true,
    })

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, input.timeoutMs)

    child.stdout.on('data', chunk => stdout.push(Buffer.from(chunk)))
    child.stderr.on('data', chunk => stderr.push(Buffer.from(chunk)))
    child.once('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', exitCode => {
      clearTimeout(timer)
      resolve({
        command: input.command,
        args: input.args,
        cwd: input.cwd,
        exitCode,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
        timedOut,
        durationMs: Date.now() - input.startedAt,
      })
    })
  })
}

function createOutputCollector(maxBytes: number): {push(chunk: Buffer): void; toString(): string} {
  const chunks: Buffer[] = []
  let size = 0
  let truncated = false

  return {
    push(chunk: Buffer): void {
      if (size >= maxBytes) {
        truncated = true
        return
      }

      const remaining = maxBytes - size
      const next = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk
      chunks.push(next)
      size += next.length

      if (chunk.length > remaining) {
        truncated = true
      }
    },
    toString(): string {
      const content = Buffer.concat(chunks).toString('utf8')
      return truncated ? `${content}\n[output truncated]` : content
    },
  }
}

function resolveWorkspacePath(candidatePath: string, workspaceRoot: string): string {
  const root = path.resolve(workspaceRoot)
  if (path.isAbsolute(candidatePath)) {
    return path.resolve(candidatePath)
  }

  return path.resolve(root, candidatePath)
}
