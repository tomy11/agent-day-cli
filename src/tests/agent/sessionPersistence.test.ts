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
  assert.deepEqual(loaded.messages[0]?.metadata?.toolResult, {
    ok: true,
    outputType: 'string',
  })
})

test('persistAgentToolResults stores mutation tool result metadata for audit', async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'daycli-agent-session-'))
  t.after(async () => {
    await rm(workspace, {recursive: true, force: true})
  })

  const sessionStore = new SessionStore(workspace)
  const session = await sessionStore.create({
    kind: 'run',
    title: 'Mutation tool run',
    workspaceRoot: workspace,
  })

  await persistAgentToolResults({
    sessionStore,
    sessionId: session.id,
    result: createMutationAgentResult(workspace),
  })

  const loaded = await sessionStore.get(session.id)
  assert.equal(loaded.messages.length, 3)
  assert.deepEqual(loaded.messages.map(message => message.toolName), [
    'write_file',
    'edit_file',
    'run_command',
  ])
  assert.deepEqual(loaded.messages[0]?.metadata?.toolResult, {
    ok: true,
    path: 'notes/new.txt',
    absolutePath: path.join(workspace, 'notes', 'new.txt'),
    bytesWritten: 12,
    created: true,
    overwritten: false,
  })
  assert.deepEqual(loaded.messages[1]?.metadata?.toolResult, {
    ok: true,
    path: 'notes/existing.txt',
    absolutePath: path.join(workspace, 'notes', 'existing.txt'),
    replacementsApplied: 2,
    changed: true,
  })
  assert.deepEqual(loaded.messages[2]?.metadata?.toolResult, {
    ok: true,
    command: process.execPath,
    args: ['-e', 'console.log("ok")'],
    cwd: workspace,
    exitCode: 0,
    timedOut: false,
    durationMs: 42,
    stdoutBytes: Buffer.byteLength('ok\n', 'utf8'),
    stderrBytes: 0,
  })
})

test('persistAgentToolResults stores recoverable tool error metadata', async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'daycli-agent-session-'))
  t.after(async () => {
    await rm(workspace, {recursive: true, force: true})
  })

  const sessionStore = new SessionStore(workspace)
  const session = await sessionStore.create({
    kind: 'run',
    title: 'Tool error run',
    workspaceRoot: workspace,
  })

  await persistAgentToolResults({
    sessionStore,
    sessionId: session.id,
    result: createToolErrorAgentResult(),
  })

  const loaded = await sessionStore.get(session.id)
  assert.deepEqual(loaded.messages[0]?.metadata?.toolResult, {
    ok: false,
    error: {
      code: 'TOOL_PATH_BLOCKED',
      message: 'Path blocked',
      recoverable: true,
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

function createMutationAgentResult(workspace: string): AgentResult {
  const writeOutput = {
    path: 'notes/new.txt',
    absolutePath: path.join(workspace, 'notes', 'new.txt'),
    bytesWritten: 12,
    created: true,
    overwritten: false,
  }
  const editOutput = {
    path: 'notes/existing.txt',
    absolutePath: path.join(workspace, 'notes', 'existing.txt'),
    replacementsApplied: 2,
    changed: true,
  }
  const runOutput = {
    command: process.execPath,
    args: ['-e', 'console.log("ok")'],
    cwd: workspace,
    exitCode: 0,
    stdout: 'ok\n',
    stderr: '',
    timedOut: false,
    durationMs: 42,
  }

  return createToolResultOnlyAgentResult([
    {
      id: 'call-write',
      toolName: 'write_file',
      input: {
        path: 'notes/new.txt',
        content: 'hello world\n',
      },
      output: writeOutput,
    },
    {
      id: 'call-edit',
      toolName: 'edit_file',
      input: {
        path: 'notes/existing.txt',
        replacements: [
          {
            oldText: 'old',
            newText: 'new',
          },
        ],
      },
      output: editOutput,
    },
    {
      id: 'call-run',
      toolName: 'run_command',
      input: {
        command: process.execPath,
        args: ['-e', 'console.log("ok")'],
      },
      output: runOutput,
    },
  ])
}

function createToolErrorAgentResult(): AgentResult {
  return createToolResultOnlyAgentResult([
    {
      id: 'call-error',
      toolName: 'write_file',
      input: {
        path: 'dist/generated.txt',
        content: 'blocked',
      },
      output: {
        ok: false,
        error: {
          code: 'TOOL_PATH_BLOCKED',
          message: 'Path blocked',
          recoverable: true,
        },
      },
    },
  ])
}

function createToolResultOnlyAgentResult(
  tools: Array<{id: string; toolName: string; input: unknown; output: unknown}>,
): AgentResult {
  return {
    stoppedReason: 'final_answer',
    finalMessage: {
      role: 'assistant',
      content: 'done',
    },
    toolResults: tools.map(tool => ({
      toolName: tool.toolName,
      output: tool.output,
    })),
    steps: tools.map((tool, index) => ({
      kind: 'tool_result',
      index,
      createdAt: `2026-04-29T00:00:0${index}.000Z`,
      toolCall: {
        id: tool.id,
        name: tool.toolName,
        input: tool.input,
      },
      result: {
        id: tool.id,
        toolName: tool.toolName,
        output: tool.output,
        content: typeof tool.output === 'string' ? tool.output : JSON.stringify(tool.output),
      },
    })),
  }
}
