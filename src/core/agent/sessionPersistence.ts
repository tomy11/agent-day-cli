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
