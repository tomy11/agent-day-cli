import test from 'node:test'
import assert from 'node:assert/strict'
import {createAgentBackedProvider, type AgentEvent} from '../../core/agent'
import type {ChatRequest, ChatResponse, LlmProvider} from '../../core/providers'
import type {ToolCall, ToolContext, ToolExecutionResult} from '../../core/tools'

class FakeProvider implements LlmProvider {
  public requests: ChatRequest[] = []
  private index = 0

  public constructor(private readonly responses: ChatResponse[]) {}

  public async chat(request: ChatRequest): Promise<ChatResponse> {
    this.requests.push(request)
    return this.responses[Math.min(this.index++, this.responses.length - 1)]!
  }
}

class FakeToolExecutor {
  public calls: Array<{call: ToolCall; context: ToolContext}> = []

  public async execute(call: ToolCall, context: ToolContext): Promise<ToolExecutionResult> {
    this.calls.push({call, context})
    return {
      toolName: call.name,
      output: 'adapter tool result',
    }
  }
}

test('createAgentBackedProvider exposes the agent loop through the LlmProvider interface', async () => {
  const provider = new FakeProvider([
    {
      model: 'fake-model',
      content: JSON.stringify({
        toolCalls: [
          {
            id: 'call-1',
            name: 'read_file',
            input: {
              path: 'README.md',
            },
          },
        ],
      }),
    },
    {
      model: 'fake-model',
      content: 'final from adapter',
    },
  ])
  const toolExecutor = new FakeToolExecutor()
  const events: AgentEvent[] = []
  const agentProvider = createAgentBackedProvider({
    provider,
    toolExecutor,
    toolContext: {
      workspaceRoot: '/tmp/workspace',
    },
    onEvent: event => events.push(event),
  })

  const response = await agentProvider.chat({
    messages: [{role: 'user', content: 'Use read_file'}],
  })

  assert.equal(response.content, 'final from adapter')
  assert.equal(response.model, 'fake-model')
  assert.equal(toolExecutor.calls.length, 1)
  assert.deepEqual(provider.requests[1]?.messages.at(-1), {
    role: 'user',
    content: 'Tool result from read_file (call-1):\nadapter tool result',
  })
  assert.deepEqual(
    events.map(event => event.kind),
    ['model_response', 'tool_call', 'tool_result', 'model_response', 'final_answer', 'stopped'],
  )
})
