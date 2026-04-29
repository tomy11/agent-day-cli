import type {ToolCall, ToolExecutionResult} from '../tools'
import type {ToolContext} from '../tools'

export type AgentMessageRole = 'system' | 'user' | 'assistant' | 'tool'

export interface AgentMessage {
  role: AgentMessageRole
  content: string
  toolCallId?: string
  toolName?: string
  metadata?: Record<string, unknown>
}

export interface AgentToolCall extends ToolCall {
  id: string
  name: string
  input?: unknown
}

export interface AgentToolResult {
  id: string
  toolName: string
  output: unknown
  content: string
}

export type AgentStepKind = 'model_response' | 'tool_call' | 'tool_result' | 'final_answer'

export interface AgentStepBase {
  kind: AgentStepKind
  index: number
  createdAt: string
}

export interface AgentModelResponseStep extends AgentStepBase {
  kind: 'model_response'
  message: AgentMessage
  toolCalls: AgentToolCall[]
}

export interface AgentToolCallStep extends AgentStepBase {
  kind: 'tool_call'
  toolCall: AgentToolCall
}

export interface AgentToolResultStep extends AgentStepBase {
  kind: 'tool_result'
  toolCall: AgentToolCall
  result: AgentToolResult
}

export interface AgentFinalAnswerStep extends AgentStepBase {
  kind: 'final_answer'
  message: AgentMessage
}

export type AgentStep =
  | AgentModelResponseStep
  | AgentToolCallStep
  | AgentToolResultStep
  | AgentFinalAnswerStep

export type AgentEventKind =
  | 'model_response'
  | 'tool_call'
  | 'tool_result'
  | 'final_answer'
  | 'stopped'

export interface AgentEvent {
  kind: AgentEventKind
  step?: AgentStep
  stoppedReason?: AgentResult['stoppedReason']
}

export interface AgentLimits {
  maxSteps: number
  maxToolCalls: number
  timeoutMs: number
}

export interface AgentRequest {
  messages: AgentMessage[]
  toolContext?: ToolContext
  limits?: Partial<AgentLimits>
  metadata?: Record<string, unknown>
}

export interface AgentResult {
  finalMessage: AgentMessage
  steps: AgentStep[]
  toolResults: ToolExecutionResult[]
  stoppedReason: 'final_answer' | 'step_limit' | 'tool_call_limit' | 'timeout'
}

export interface ParsedToolCallMessage {
  content: string
  toolCalls: AgentToolCall[]
}

export const DEFAULT_AGENT_LIMITS: AgentLimits = {
  maxSteps: 8,
  maxToolCalls: 4,
  timeoutMs: 180_000,
}
