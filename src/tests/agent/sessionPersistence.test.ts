import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import {tmpdir} from 'node:os'
import {mkdtemp, rm} from 'node:fs/promises'
import {persistAgentToolResults, summarizeAgentResult} from '../../core/agent'
import {SessionStore} from '../../core/storage'
import type {AgentResult} from '../../core/agent'

test('summarizeAgentResult returns compact step metadata', () => {
  const result = createAgentResult()
  assert.deepEqual(summarizeAgentResult(result), {
    stoppedReason: 'final_answer',
    stepCount: 3,
    toolResultCount: 1,
    steps: [
      {
        kind: 'model_response',
        index: 0,
        createdAt: '2026-04-29T00:00:00.000Z',
      },
      {
        kind: 'tool_call',
        index: 1,
        createdAt: '2026-04-29T00:00:01.000Z',
        toolCallId: 'call-1',
        toolName: 'read_file',
      },
      {
        kind: 'tool_result',
        index: 2,
        createdAt: '2026-04-29T00:00:02.000Z',
        toolCallId: 'call-1',
        toolName: 'read_file',
      },
    ],
  })
})

test('persistAgentToolResults appends tool messages to the session', async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'daycli-agent-session-'))
  t.after(async () => {
    await rm(workspace, {recursive: true, force: true})
  })

  const sessionStore = new SessionStore(workspace)
  const session = await sessionStore.create({
    kind: 'run',
    title: 'Tool run',
    workspaceRoot: workspace,
  })

  await persistAgentToolResults({
    sessionStore,
    sessionId: session.id,
    result: createAgentResult(),
  })

  const loaded = await sessionStore.get(session.id)
  assert.equal(loaded.messages.length, 1)
  assert.equal(loaded.messages[0]?.role, 'tool')
  assert.equal(loaded.messages[0]?.toolName, 'read_file')
  assert.equal(loaded.messages[0]?.content, 'file content')
  assert.deepEqual(loaded.messages[0]?.metadata?.toolCall, {
    id: 'call-1',
    name: 'read_file',
    input: {
      path: 'README.md',
    },
  })
})

function createAgentResult(): AgentResult {
  return {
    stoppedReason: 'final_answer',
    finalMessage: {
      role: 'assistant',
      content: 'done',
    },
    toolResults: [
      {
        toolName: 'read_file',
        output: 'file content',
      },
    ],
    steps: [
      {
        kind: 'model_response',
        index: 0,
        createdAt: '2026-04-29T00:00:00.000Z',
        message: {
          role: 'assistant',
          content: 'Need a file.',
        },
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
      {
        kind: 'tool_call',
        index: 1,
        createdAt: '2026-04-29T00:00:01.000Z',
        toolCall: {
          id: 'call-1',
          name: 'read_file',
          input: {
            path: 'README.md',
          },
        },
      },
      {
        kind: 'tool_result',
        index: 2,
        createdAt: '2026-04-29T00:00:02.000Z',
        toolCall: {
          id: 'call-1',
          name: 'read_file',
          input: {
            path: 'README.md',
          },
        },
        result: {
          id: 'call-1',
          toolName: 'read_file',
          output: 'file content',
          content: 'file content',
        },
      },
    ],
  }
}
