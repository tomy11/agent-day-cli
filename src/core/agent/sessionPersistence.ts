import type {SessionStore} from '../storage'
import type {AgentResult, AgentStep} from './types'

export interface AgentSessionMetadata {
  stoppedReason: AgentResult['stoppedReason']
  stepCount: number
  toolResultCount: number
  steps: AgentStepSummary[]
}

interface AgentStepSummary {
  kind: AgentStep['kind']
  index: number
  createdAt: string
  toolCallId?: string
  toolName?: string
}

export function summarizeAgentResult(result: AgentResult): AgentSessionMetadata {
  return {
    stoppedReason: result.stoppedReason,
    stepCount: result.steps.length,
    toolResultCount: result.toolResults.length,
    steps: result.steps.map(summarizeAgentStep),
  }
}

export async function persistAgentToolResults(input: {
  sessionStore: SessionStore
  sessionId: string
  result: AgentResult
}): Promise<void> {
  for (const step of input.result.steps) {
    if (step.kind !== 'tool_result') {
      continue
    }

    await input.sessionStore.appendMessage(input.sessionId, {
      role: 'tool',
      content: step.result.content,
      toolName: step.result.toolName,
      metadata: {
        agentStep: summarizeAgentStep(step),
        toolCall: {
          id: step.toolCall.id,
          name: step.toolCall.name,
          input: step.toolCall.input,
        },
        toolResult: summarizeToolResult(step.result.toolName, step.result.output),
      },
    })
  }
}

function summarizeAgentStep(step: AgentStep): AgentStepSummary {
  switch (step.kind) {
    case 'tool_call':
      return {
        kind: step.kind,
        index: step.index,
        createdAt: step.createdAt,
        toolCallId: step.toolCall.id,
        toolName: step.toolCall.name,
      }
    case 'tool_result':
      return {
        kind: step.kind,
        index: step.index,
        createdAt: step.createdAt,
        toolCallId: step.toolCall.id,
        toolName: step.result.toolName,
      }
    default:
      return {
        kind: step.kind,
        index: step.index,
        createdAt: step.createdAt,
      }
  }
}

function summarizeToolResult(toolName: string, output: unknown): Record<string, unknown> {
  if (isRecoverableToolError(output)) {
    return {
      ok: false,
      error: output.error,
    }
  }

  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    return {
      ok: true,
      outputType: typeof output,
    }
  }

  const payload = output as Record<string, unknown>

  switch (toolName) {
    case 'search_files':
      return pickDefined({
        ok: true,
        query: payload.query,
        path: payload.path,
        absolutePath: payload.absolutePath,
        matchCount: Array.isArray(payload.matches) ? payload.matches.length : undefined,
        totalMatches: payload.totalMatches,
        filesSearched: payload.filesSearched,
        filesSkipped: payload.filesSkipped,
        truncated: payload.truncated,
        paths: uniquePathsFromMatches(payload.matches),
      })
    case 'find_files':
      return pickDefined({
        ok: true,
        query: payload.query,
        path: payload.path,
        absolutePath: payload.absolutePath,
        pathCount: Array.isArray(payload.paths) ? payload.paths.length : undefined,
        totalMatches: payload.totalMatches,
        truncated: payload.truncated,
        paths: limitedStringArray(payload.paths),
      })
    case 'list_dir':
      return pickDefined({
        ok: true,
        path: payload.path,
        absolutePath: payload.absolutePath,
        entryCount: Array.isArray(payload.entries) ? payload.entries.length : undefined,
        totalEntries: payload.totalEntries,
        truncated: payload.truncated,
        paths: uniquePathsFromEntries(payload.entries),
      })
    case 'write_file':
      return pickDefined({
        ok: true,
        path: payload.path,
        absolutePath: payload.absolutePath,
        bytesWritten: payload.bytesWritten,
        created: payload.created,
        overwritten: payload.overwritten,
      })
    case 'edit_file':
      return pickDefined({
        ok: true,
        path: payload.path,
        absolutePath: payload.absolutePath,
        replacementsApplied: payload.replacementsApplied,
        changed: payload.changed,
      })
    case 'run_command':
      return pickDefined({
        ok: true,
        command: payload.command,
        args: payload.args,
        cwd: payload.cwd,
        exitCode: payload.exitCode,
        timedOut: payload.timedOut,
        durationMs: payload.durationMs,
        stdoutBytes: byteLength(payload.stdout),
        stderrBytes: byteLength(payload.stderr),
      })
    default:
      return {
        ok: true,
        outputType: 'object',
      }
  }
}

function isRecoverableToolError(output: unknown): output is {error: Record<string, unknown>} {
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    return false
  }

  const candidate = output as {ok?: unknown; error?: unknown}
  return candidate.ok === false && !!candidate.error && typeof candidate.error === 'object' && !Array.isArray(candidate.error)
}

function pickDefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))
}

function byteLength(value: unknown): number | undefined {
  return typeof value === 'string' ? Buffer.byteLength(value, 'utf8') : undefined
}

function uniquePathsFromMatches(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  return limitedStringArray(value.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return undefined
    }

    return (item as {path?: unknown}).path
  }))
}

function uniquePathsFromEntries(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  return limitedStringArray(value.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return undefined
    }

    return (item as {path?: unknown}).path
  }))
}

function limitedStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const paths = value.filter((item): item is string => typeof item === 'string')
  return [...new Set(paths)].slice(0, 20)
}
