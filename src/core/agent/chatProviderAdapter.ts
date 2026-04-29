import type {SafeExecutor} from '../execution'
import type {ChatRequest, ChatResponse, LlmProvider} from '../providers'
import type {ToolContext} from '../tools'
import {AgentOrchestrator} from './orchestrator'
import type {AgentEvent, AgentLimits, AgentMessage} from './types'

interface AgentBackedProviderOptions {
  provider: LlmProvider
  toolExecutor: Pick<SafeExecutor, 'execute'>
  toolContext: ToolContext
  limits?: Partial<AgentLimits>
  onEvent?: (event: AgentEvent) => void
  onResult?: (result: Awaited<ReturnType<AgentOrchestrator['run']>>) => void
}

export function createAgentBackedProvider(options: AgentBackedProviderOptions): LlmProvider {
  return {
    async chat(request: ChatRequest): Promise<ChatResponse> {
      const agent = new AgentOrchestrator({
        provider: options.provider,
        toolExecutor: options.toolExecutor,
        limits: options.limits,
        onEvent: options.onEvent,
      })
      const result = await agent.run({
        messages: request.messages.map(toAgentMessage),
        toolContext: options.toolContext,
      })
      options.onResult?.(result)

      return {
        content: result.finalMessage.content,
        model: getAgentResponseModel(result.finalMessage, 'agent'),
        raw: result,
      }
    },
  }
}

function toAgentMessage(message: ChatRequest['messages'][number]): AgentMessage {
  return {
    role: message.role,
    content: message.content,
  }
}

function getAgentResponseModel(message: AgentMessage, fallback: string): string {
  const model = message.metadata?.model
  return typeof model === 'string' ? model : fallback
}
