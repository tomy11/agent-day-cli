import test from 'node:test'
import assert from 'node:assert/strict'
import {DEFAULT_AGENT_LIMITS, type AgentRequest, type AgentToolCall} from '../../core/agent'

test('agent type contract supports messages with model-requested tool calls', () => {
  const toolCall: AgentToolCall = {
    id: 'call-1',
    name: 'read_file',
    input: {
      path: 'README.md',
    },
  }

  const request: AgentRequest = {
    messages: [
      {
        role: 'system',
        content: 'Use tools when useful.',
      },
      {
        role: 'user',
        content: 'Summarize README.md',
      },
      {
        role: 'assistant',
        content: 'I will inspect the file.',
        metadata: {
          toolCalls: [toolCall],
        },
      },
    ],
    limits: {
      maxToolCalls: 1,
    },
  }

  const metadata = request.messages[2]?.metadata as {toolCalls?: AgentToolCall[]} | undefined
  assert.deepEqual(metadata?.toolCalls, [toolCall])
  assert.equal(toolCall.name, 'read_file')
  assert.deepEqual(toolCall.input, {path: 'README.md'})
})

test('default agent limits are conservative', () => {
  assert.equal(DEFAULT_AGENT_LIMITS.maxSteps, 8)
  assert.equal(DEFAULT_AGENT_LIMITS.maxToolCalls, 4)
  assert.equal(DEFAULT_AGENT_LIMITS.timeoutMs, 180_000)
})
