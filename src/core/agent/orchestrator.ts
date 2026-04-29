import type {ChatMessage, ChatRole, LlmProvider} from '../providers'
import type {SafeExecutor} from '../execution'
import type {ToolExecutionResult} from '../tools'
import {
  DEFAULT_AGENT_LIMITS,
  type AgentEvent,
  type AgentLimits,
  type AgentMessage,
  type AgentRequest,
  type AgentResult,
  type AgentStep,
  type AgentToolCall,
  type AgentToolResult,
  type ParsedToolCallMessage,
} from './types'

interface AgentOrchestratorOptions {
  provider: LlmProvider
  toolExecutor?: Pick<SafeExecutor, 'execute'>
  limits?: Partial<AgentLimits>
  onEvent?: (event: AgentEvent) => void
  now?: () => Date
}

export class AgentOrchestrator {
  private readonly provider: LlmProvider
  private readonly toolExecutor?: Pick<SafeExecutor, 'execute'>
  private readonly limits: AgentLimits
  private readonly onEvent?: (event: AgentEvent) => void
  private readonly now: () => Date

  public constructor(options: AgentOrchestratorOptions) {
    this.provider = options.provider
    this.toolExecutor = options.toolExecutor
    this.limits = resolveAgentLimits(options.limits)
    this.onEvent = options.onEvent
    this.now = options.now ?? (() => new Date())
  }

  public async run(request: AgentRequest): Promise<AgentResult> {
    const limits = resolveAgentLimits({
      ...this.limits,
      ...(request.limits ?? {}),
    })

    if (limits.timeoutMs === 0) {
      return this.runLoop(request, limits)
    }

    return withTimeout(this.runLoop(request, limits), limits.timeoutMs, () =>
      this.createTimeoutResult(limits.timeoutMs),
    )
  }

  private async runLoop(request: AgentRequest, limits: AgentLimits): Promise<AgentResult> {
    const steps: AgentStep[] = []
    const messages = [...request.messages]
    const toolResults: ToolExecutionResult[] = []
    let toolCallCount = 0

    if (limits.maxSteps < 1) {
      const finalMessage: AgentMessage = {
        role: 'assistant',
        content: '',
        metadata: {
          reason: 'maxSteps must be at least 1',
        },
      }

      const finalStep: AgentStep = {
        kind: 'final_answer',
        index: steps.length,
        createdAt: this.timestamp(),
        message: finalMessage,
      }
      steps.push(finalStep)
      this.emit({kind: 'final_answer', step: finalStep})
      this.emit({kind: 'stopped', stoppedReason: 'step_limit'})

      return {
        finalMessage,
        steps,
        toolResults: [],
        stoppedReason: 'step_limit',
      }
    }

    while (true) {
      if (!canAppendStep(steps, limits)) {
        return createStoppedResult({
          finalMessage: createEmptyAssistantMessage('maxSteps reached before model response'),
          steps,
          stoppedReason: 'step_limit',
        })
      }

      const response = await this.provider.chat({
        messages: toProviderMessages(messages),
      })
      const parsed = parseToolCallMessage(response.content)
      const modelMessage: AgentMessage = {
        role: 'assistant',
        content: parsed.content,
        metadata: {
          model: response.model,
          ...(parsed.toolCalls.length > 0 ? {toolCalls: parsed.toolCalls} : {}),
        },
      }
      messages.push(modelMessage)

      const modelStep: AgentStep = {
        kind: 'model_response',
        index: steps.length,
        createdAt: this.timestamp(),
        message: modelMessage,
        toolCalls: parsed.toolCalls,
      }
      steps.push(modelStep)
      this.emit({kind: 'model_response', step: modelStep})

      if (parsed.toolCalls.length > 0) {
        if (!this.toolExecutor || !request.toolContext) {
          this.emit({kind: 'stopped', stoppedReason: 'tool_call_limit'})
          return createStoppedResult({
            finalMessage: createEmptyAssistantMessage('Tool call requested but tool executor or context is missing'),
            steps,
            toolResults,
            stoppedReason: 'tool_call_limit',
          })
        }

        for (const toolCall of parsed.toolCalls) {
          if (toolCallCount >= limits.maxToolCalls) {
            this.emit({kind: 'stopped', stoppedReason: 'tool_call_limit'})
            return createStoppedResult({
              finalMessage: modelMessage,
              steps,
              toolResults,
              stoppedReason: 'tool_call_limit',
            })
          }

          if (!canAppendStep(steps, limits)) {
            this.emit({kind: 'stopped', stoppedReason: 'step_limit'})
            return createStoppedResult({
              finalMessage: modelMessage,
              steps,
              toolResults,
              stoppedReason: 'step_limit',
            })
          }

          const toolCallStep: AgentStep = {
            kind: 'tool_call',
            index: steps.length,
            createdAt: this.timestamp(),
            toolCall,
          }
          steps.push(toolCallStep)
          this.emit({kind: 'tool_call', step: toolCallStep})
          toolCallCount += 1

          const executionResult = await this.toolExecutor.execute(
            {
              name: toolCall.name,
              input: toolCall.input,
            },
            request.toolContext,
          )
          toolResults.push(executionResult)
          const result: AgentToolResult = {
            id: toolCall.id,
            toolName: executionResult.toolName,
            output: executionResult.output,
            content: stringifyToolOutput(executionResult.output),
          }

          if (!canAppendStep(steps, limits)) {
            this.emit({kind: 'stopped', stoppedReason: 'step_limit'})
            return createStoppedResult({
              finalMessage: modelMessage,
              steps,
              toolResults,
              stoppedReason: 'step_limit',
            })
          }

          const toolResultStep: AgentStep = {
            kind: 'tool_result',
            index: steps.length,
            createdAt: this.timestamp(),
            toolCall,
            result,
          }
          steps.push(toolResultStep)
          this.emit({kind: 'tool_result', step: toolResultStep})
          messages.push({
            role: 'tool',
            content: result.content,
            toolCallId: toolCall.id,
            toolName: executionResult.toolName,
          })
        }

        continue
      }

      if (!canAppendStep(steps, limits)) {
        this.emit({kind: 'stopped', stoppedReason: 'step_limit'})
        return createStoppedResult({
          finalMessage: modelMessage,
          steps,
          toolResults,
          stoppedReason: 'step_limit',
        })
      }

      const finalStep: AgentStep = {
        kind: 'final_answer',
        index: steps.length,
        createdAt: this.timestamp(),
        message: modelMessage,
      }
      steps.push(finalStep)
      this.emit({kind: 'final_answer', step: finalStep})
      this.emit({kind: 'stopped', stoppedReason: 'final_answer'})

      return {
        finalMessage: modelMessage,
        steps,
        toolResults,
        stoppedReason: 'final_answer',
      }
    }
  }

  private createTimeoutResult(timeoutMs: number): AgentResult {
    const finalMessage = createEmptyAssistantMessage(`Agent timed out after ${timeoutMs}ms`)
    const finalStep: AgentStep = {
      kind: 'final_answer',
      index: 0,
      createdAt: this.timestamp(),
      message: finalMessage,
    }
    this.emit({kind: 'final_answer', step: finalStep})
    this.emit({kind: 'stopped', stoppedReason: 'timeout'})

    return {
      finalMessage,
      steps: [finalStep],
      toolResults: [],
      stoppedReason: 'timeout',
    }
  }

  private emit(event: AgentEvent): void {
    this.onEvent?.(event)
  }

  private timestamp(): string {
    return this.now().toISOString()
  }
}

export function resolveAgentLimits(overrides: Partial<AgentLimits> = {}): AgentLimits {
  return {
    maxSteps: normalizeLimit(overrides.maxSteps, DEFAULT_AGENT_LIMITS.maxSteps),
    maxToolCalls: normalizeLimit(overrides.maxToolCalls, DEFAULT_AGENT_LIMITS.maxToolCalls),
    timeoutMs: normalizeLimit(overrides.timeoutMs, DEFAULT_AGENT_LIMITS.timeoutMs),
  }
}

export function toProviderMessages(messages: AgentMessage[]): ChatMessage[] {
  return messages.flatMap((message): ChatMessage[] => {
    if (message.role === 'tool') {
      return [
        {
          role: 'user',
          content: formatToolMessageForProvider(message),
        },
      ]
    }

    if (!isProviderRole(message.role)) {
      return []
    }

    return [{
      role: message.role,
      content: message.content,
    }]
  })
}

function isProviderRole(role: AgentMessage['role']): role is ChatRole {
  return role === 'system' || role === 'user' || role === 'assistant'
}

function canAppendStep(steps: AgentStep[], limits: AgentLimits): boolean {
  return steps.length < limits.maxSteps
}

function createEmptyAssistantMessage(reason: string): AgentMessage {
  return {
    role: 'assistant',
    content: '',
    metadata: {
      reason,
    },
  }
}

function createStoppedResult(input: {
  finalMessage: AgentMessage
  steps: AgentStep[]
  toolResults?: AgentResult['toolResults']
  stoppedReason: AgentResult['stoppedReason']
}): AgentResult {
  return {
    finalMessage: input.finalMessage,
    steps: input.steps,
    toolResults: input.toolResults ?? [],
    stoppedReason: input.stoppedReason,
  }
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback
  }

  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.max(0, Math.floor(value))
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number, onTimeout: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      resolve(onTimeout())
    }, timeoutMs)

    operation.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      error => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

export function parseToolCallMessage(content: string): ParsedToolCallMessage {
  const trimmed = content.trim()
  if (!trimmed.startsWith('{')) {
    return {content, toolCalls: []}
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {content, toolCalls: []}
    }

    const candidate = parsed as {content?: unknown; toolCalls?: unknown}
    if (!Array.isArray(candidate.toolCalls)) {
      return {content, toolCalls: []}
    }

    const toolCalls = candidate.toolCalls.flatMap((item, index): AgentToolCall[] => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return []
      }

      const call = item as {id?: unknown; name?: unknown; input?: unknown}
      if (typeof call.name !== 'string' || call.name.length === 0) {
        return []
      }

      return [
        {
          id: typeof call.id === 'string' && call.id.length > 0 ? call.id : `call-${index + 1}`,
          name: call.name,
          ...(call.input !== undefined ? {input: call.input} : {}),
        },
      ]
    })

    return {
      content: typeof candidate.content === 'string' ? candidate.content : '',
      toolCalls,
    }
  } catch {
    return {content, toolCalls: []}
  }
}

function stringifyToolOutput(output: unknown): string {
  if (typeof output === 'string') {
    return output
  }

  try {
    return JSON.stringify(output)
  } catch {
    return String(output)
  }
}

function formatToolMessageForProvider(message: AgentMessage): string {
  const label = message.toolName ? `Tool result from ${message.toolName}` : 'Tool result'
  const id = message.toolCallId ? ` (${message.toolCallId})` : ''
  return `${label}${id}:\n${message.content}`
}
