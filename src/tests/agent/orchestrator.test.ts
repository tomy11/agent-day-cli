import test from 'node:test'
import assert from 'node:assert/strict'
import {
  type AgentEvent,
  AgentOrchestrator,
  parseToolCallMessage,
  resolveAgentLimits,
  toProviderMessages,
} from '../../core/agent'
import type {ChatRequest, ChatResponse, LlmProvider} from '../../core/providers'
import type {ToolCall, ToolContext, ToolExecutionResult} from '../../core/tools'

class FakeProvider implements LlmProvider {
  public requests: ChatRequest[] = []
  private index = 0

  public constructor(
    private readonly response: ChatResponse | ChatResponse[],
    private readonly delayMs = 0,
  ) {}

  public async chat(request: ChatRequest): Promise<ChatResponse> {
    this.requests.push(request)
    if (this.delayMs > 0) {
      await sleep(this.delayMs)
    }

    if (Array.isArray(this.response)) {
      return this.response[Math.min(this.index++, this.response.length - 1)]!
    }

    return this.response
  }
}

class FakeToolExecutor {
  public calls: Array<{call: ToolCall; context: ToolContext}> = []

  public async execute(call: ToolCall, context: ToolContext): Promise<ToolExecutionResult> {
    this.calls.push({call, context})
    return {
      toolName: call.name,
      output: {
        ok: true,
        input: call.input,
      },
    }
  }
}

test('AgentOrchestrator returns a final answer result from provider response', async () => {
  const provider = new FakeProvider({
    content: 'final response',
    model: 'fake-model',
  })
  const orchestrator = new AgentOrchestrator({
    provider,
    now: () => new Date('2026-04-29T00:00:00.000Z'),
  })

  const result = await orchestrator.run({
    messages: [
      {role: 'system', content: 'Be concise.'},
      {role: 'user', content: 'Hello'},
    ],
  })

  assert.equal(result.stoppedReason, 'final_answer')
  assert.equal(result.finalMessage.role, 'assistant')
  assert.equal(result.finalMessage.content, 'final response')
  assert.deepEqual(result.finalMessage.metadata, {model: 'fake-model'})
  assert.equal(result.toolResults.length, 0)
  assert.deepEqual(
    result.steps.map(step => step.kind),
    ['model_response', 'final_answer'],
  )
  assert.equal(result.steps[0]?.createdAt, '2026-04-29T00:00:00.000Z')
  assert.deepEqual(provider.requests[0]?.messages, [
    {role: 'system', content: 'Be concise.'},
    {role: 'user', content: 'Hello'},
  ])
})

test('AgentOrchestrator stops before provider call when maxSteps is zero', async () => {
  const provider = new FakeProvider({
    content: 'should not be called',
    model: 'fake-model',
  })
  const orchestrator = new AgentOrchestrator({provider})

  const result = await orchestrator.run({
    messages: [{role: 'user', content: 'Hello'}],
    limits: {
      maxSteps: 0,
    },
  })

  assert.equal(provider.requests.length, 0)
  assert.equal(result.stoppedReason, 'step_limit')
  assert.equal(result.finalMessage.content, '')
  assert.equal(result.steps.length, 1)
  assert.equal(result.steps[0]?.kind, 'final_answer')
})

test('AgentOrchestrator returns step_limit when final-answer step would exceed maxSteps', async () => {
  const provider = new FakeProvider({
    content: 'model response without room for final step',
    model: 'fake-model',
  })
  const orchestrator = new AgentOrchestrator({provider})

  const result = await orchestrator.run({
    messages: [{role: 'user', content: 'Hello'}],
    limits: {
      maxSteps: 1,
    },
  })

  assert.equal(provider.requests.length, 1)
  assert.equal(result.stoppedReason, 'step_limit')
  assert.equal(result.finalMessage.content, 'model response without room for final step')
  assert.deepEqual(
    result.steps.map(step => step.kind),
    ['model_response'],
  )
})

test('AgentOrchestrator returns timeout result when provider exceeds timeoutMs', async () => {
  const provider = new FakeProvider(
    {
      content: 'late response',
      model: 'fake-model',
    },
    30,
  )
  const orchestrator = new AgentOrchestrator({
    provider,
    now: () => new Date('2026-04-29T00:00:00.000Z'),
  })

  const result = await orchestrator.run({
    messages: [{role: 'user', content: 'Hello'}],
    limits: {
      timeoutMs: 1,
    },
  })

  assert.equal(result.stoppedReason, 'timeout')
  assert.equal(result.finalMessage.content, '')
  assert.deepEqual(result.finalMessage.metadata, {
    reason: 'Agent timed out after 1ms',
  })
  assert.deepEqual(
    result.steps.map(step => step.kind),
    ['final_answer'],
  )
})

test('AgentOrchestrator routes requested tool calls through executor and feeds result back to provider', async () => {
  const provider = new FakeProvider([
    {
      content: JSON.stringify({
        content: 'I need to inspect a file.',
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
      model: 'fake-model',
    },
    {
      content: 'README says daycli is a CLI agent.',
      model: 'fake-model',
    },
  ])
  const toolExecutor = new FakeToolExecutor()
  const events: AgentEvent[] = []
  const orchestrator = new AgentOrchestrator({
    provider,
    toolExecutor,
    now: () => new Date('2026-04-29T00:00:00.000Z'),
    onEvent: event => events.push(event),
  })

  const result = await orchestrator.run({
    messages: [{role: 'user', content: 'Summarize README.md'}],
    toolContext: {
      workspaceRoot: '/tmp/workspace',
    },
  })

  assert.equal(result.stoppedReason, 'final_answer')
  assert.equal(result.finalMessage.content, 'README says daycli is a CLI agent.')
  assert.deepEqual(
    result.steps.map(step => step.kind),
    ['model_response', 'tool_call', 'tool_result', 'model_response', 'final_answer'],
  )
  assert.deepEqual(toolExecutor.calls, [
    {
      call: {
        name: 'read_file',
        input: {
          path: 'README.md',
        },
      },
      context: {
        workspaceRoot: '/tmp/workspace',
      },
    },
  ])
  assert.equal(result.toolResults.length, 1)
  assert.equal(result.toolResults[0]?.toolName, 'read_file')
  assert.deepEqual(provider.requests[1]?.messages.at(-1), {
    role: 'user',
    content: 'Tool result from read_file (call-1):\n{"ok":true,"input":{"path":"README.md"}}',
  })
  assert.deepEqual(
    events.map(event => event.kind),
    ['model_response', 'tool_call', 'tool_result', 'model_response', 'final_answer', 'stopped'],
  )
  assert.equal(events[1]?.step?.kind, 'tool_call')
  assert.equal(events[2]?.step?.kind, 'tool_result')
  assert.equal(events.at(-1)?.stoppedReason, 'final_answer')
})

test('AgentOrchestrator stops when maxToolCalls is exceeded before execution', async () => {
  const provider = new FakeProvider({
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
    model: 'fake-model',
  })
  const toolExecutor = new FakeToolExecutor()
  const orchestrator = new AgentOrchestrator({provider, toolExecutor})

  const result = await orchestrator.run({
    messages: [{role: 'user', content: 'Summarize README.md'}],
    toolContext: {
      workspaceRoot: '/tmp/workspace',
    },
    limits: {
      maxToolCalls: 0,
    },
  })

  assert.equal(result.stoppedReason, 'tool_call_limit')
  assert.equal(toolExecutor.calls.length, 0)
  assert.deepEqual(
    result.steps.map(step => step.kind),
    ['model_response'],
  )
})

test('toProviderMessages converts tool messages into provider-compatible user messages', () => {
  assert.deepEqual(
    toProviderMessages([
      {role: 'user', content: 'Read package.json'},
      {role: 'tool', content: '{"name":"daycli"}', toolCallId: 'call-1', toolName: 'read_file'},
      {role: 'assistant', content: 'The project is daycli.'},
    ]),
    [
      {role: 'user', content: 'Read package.json'},
      {role: 'user', content: 'Tool result from read_file (call-1):\n{"name":"daycli"}'},
      {role: 'assistant', content: 'The project is daycli.'},
    ],
  )
})

test('parseToolCallMessage extracts strict JSON tool calls', () => {
  assert.deepEqual(
    parseToolCallMessage(
      JSON.stringify({
        content: 'Need file context.',
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
    ),
    {
      content: 'Need file context.',
      toolCalls: [
        {
          id: 'call-1',
          name: 'read_file',
          input: {
            path: 'README.md',
          },
        },
      ],
    },
  )
})

test('resolveAgentLimits clamps invalid values conservatively', () => {
  assert.deepEqual(resolveAgentLimits({maxSteps: 2.8, maxToolCalls: -1, timeoutMs: Number.NaN}), {
    maxSteps: 2,
    maxToolCalls: 0,
    timeoutMs: 180_000,
  })
})

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
