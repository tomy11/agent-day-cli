import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import {tmpdir} from 'node:os'
import {mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises'
import {spawn, spawnSync} from 'node:child_process'
import {createServer, type Server} from 'node:http'

interface CliResult {
  status: number | null
  stdout: string
  stderr: string
}

function runCli(args: string[], cwd: string): CliResult {
  const repoRoot = path.resolve(__dirname, '../../..')
  const entrypoint = path.join(repoRoot, 'bin', 'run.js')
  const result = spawnSync(process.execPath, [entrypoint, ...args], {
    cwd,
    encoding: 'utf8',
  })

  if (result.error) {
    throw result.error
  }

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}

function runCliAsync(args: string[], cwd: string, stdin = ''): Promise<CliResult> {
  const repoRoot = path.resolve(__dirname, '../../..')
  const entrypoint = path.join(repoRoot, 'bin', 'run.js')

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entrypoint, ...args], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []

    child.stdin.end(stdin)
    child.stdout.on('data', chunk => stdout.push(Buffer.from(chunk)))
    child.stderr.on('data', chunk => stderr.push(Buffer.from(chunk)))
    child.once('error', reject)
    child.once('close', status => {
      resolve({
        status,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      })
    })
  })
}

interface MockChatRequest {
  messages?: Array<{role?: string; content?: string}>
}

function createToolLoopServer(input: {
  requests: MockChatRequest[]
  firstContent: string
  finalContent: string
}): Server {
  return createServer((request, response) => {
    if (request.method !== 'POST' || request.url !== '/api/chat') {
      response.writeHead(404)
      response.end()
      return
    }

    const chunks: Buffer[] = []
    request.on('data', chunk => chunks.push(Buffer.from(chunk)))
    request.on('end', () => {
      input.requests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')) as MockChatRequest)
      response.writeHead(200, {'content-type': 'application/json'})
      response.end(
        JSON.stringify({
          model: 'mock-model',
          message: {
            role: 'assistant',
            content: input.requests.length === 1 ? input.firstContent : input.finalContent,
          },
        }),
      )
    })
  })
}

test('CLI smoke flow works for core commands', async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'daycli-e2e-'))
  t.after(async () => {
    await rm(workspace, {recursive: true, force: true})
  })

  const chatResult = runCli(['chat'], workspace)
  assert.equal(chatResult.status, 0)
  assert.match(chatResult.stdout, /daycli chat: scaffold ready/)

  const listResult = runCli(['session', 'list'], workspace)
  assert.equal(listResult.status, 0)
  assert.match(listResult.stdout, /No sessions found\./)

  const resumeResult = runCli(['session', 'resume', 'smoke-session'], workspace)
  assert.notEqual(resumeResult.status, 0)
  assert.match(resumeResult.stderr, /SESSION_NOT_FOUND/)

  const configResult = runCli(['config', 'set', 'ollama.model', 'llama3.2'], workspace)
  assert.equal(configResult.status, 0)
  assert.match(configResult.stdout, /Updated daycli\.config\.json: ollama\.model=llama3\.2/)

  const configRaw = await readFile(path.join(workspace, 'daycli.config.json'), 'utf8')
  const config = JSON.parse(configRaw) as {ollama?: {model?: string}}
  assert.equal(config.ollama?.model, 'llama3.2')

  const runResult = runCli(['run', 'smoke prompt', '--timeout-ms', '-1'], workspace)
  assert.notEqual(runResult.status, 0)
  assert.ok(runResult.stderr.length > 0)
})

test('run command persists a completed run session', async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'daycli-run-session-'))
  const server = createServer((request, response) => {
    if (request.method !== 'POST' || request.url !== '/api/chat') {
      response.writeHead(404)
      response.end()
      return
    }

    response.writeHead(200, {'content-type': 'application/json'})
    response.end(
      JSON.stringify({
        model: 'mock-model',
        message: {
          role: 'assistant',
          content: 'persisted response',
        },
      }),
    )
  })

  await listen(server)

  t.after(async () => {
    await close(server)
    await rm(workspace, {recursive: true, force: true})
  })

  const address = server.address()
  assert.ok(address && typeof address === 'object')

  const runResult = await runCliAsync(
    [
      'run',
      'remember this task',
      '--model',
      'mock-model',
      '--base-url',
      `http://127.0.0.1:${address.port}`,
      '--timeout-ms',
      '1000',
    ],
    workspace,
  )

  assert.equal(runResult.status, 0)
  assert.match(runResult.stdout, /persisted response/)

  const sessionDir = path.join(workspace, '.daycli', 'sessions')
  const sessionFiles = (await readdir(sessionDir)).filter(file => file.endsWith('.json'))
  assert.equal(sessionFiles.length, 1)
  const sessionId = path.basename(sessionFiles[0] ?? '', '.json')
  assert.match(runResult.stdout, new RegExp(`Session: ${sessionId}`))
  assert.match(runResult.stdout, new RegExp(`Resume: daycli session resume ${sessionId}`))

  const sessionRaw = await readFile(path.join(sessionDir, sessionFiles[0] ?? ''), 'utf8')
  const session = JSON.parse(sessionRaw) as {
    kind?: string
    status?: string
    title?: string
    model?: string
    messages?: Array<{role?: string; content?: string}>
  }

  assert.equal(session.kind, 'run')
  assert.equal(session.status, 'completed')
  assert.equal(session.title, 'remember this task')
  assert.equal(session.model, 'mock-model')
  assert.equal(session.messages?.length, 2)
  assert.deepEqual(
    session.messages?.map(message => [message.role, message.content]),
    [
      ['user', 'remember this task'],
      ['assistant', 'persisted response'],
    ],
  )

  const listResult = runCli(['session', 'list'], workspace)
  assert.equal(listResult.status, 0)
  assert.match(listResult.stdout, /ID\s+KIND\s+STATUS\s+UPDATED\s+MSGS\s+WORKSPACE\s+TITLE/)
  assert.match(listResult.stdout, new RegExp(`${sessionId}\\s+run\\s+completed`))
  assert.match(listResult.stdout, /remember this task/)
  assert.match(listResult.stdout, new RegExp(escapeRegExp(workspace)))

  const resumeResult = runCli(['session', 'resume', sessionId], workspace)
  assert.equal(resumeResult.status, 0)
  assert.match(resumeResult.stdout, new RegExp(`Session: ${sessionId}`))
  assert.match(resumeResult.stdout, /Kind: run/)
  assert.match(resumeResult.stdout, /Status: completed/)
  assert.match(resumeResult.stdout, /Title: remember this task/)
  assert.match(resumeResult.stdout, /Messages: 2/)
  assert.match(resumeResult.stdout, /Run this command in an interactive terminal to continue the session\./)
})

test('run command routes model-requested read_file tool calls through the agent loop', async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'daycli-run-tool-'))
  await writeFile(path.join(workspace, 'README.md'), 'daycli tool loop works\n', 'utf8')

  const requests: Array<{messages?: Array<{role?: string; content?: string}>}> = []
  const server = createServer((request, response) => {
    if (request.method !== 'POST' || request.url !== '/api/chat') {
      response.writeHead(404)
      response.end()
      return
    }

    const chunks: Buffer[] = []
    request.on('data', chunk => chunks.push(Buffer.from(chunk)))
    request.on('end', () => {
      requests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')) as {messages?: Array<{role?: string; content?: string}>})

      response.writeHead(200, {'content-type': 'application/json'})
      if (requests.length === 1) {
        response.end(
          JSON.stringify({
            model: 'mock-model',
            message: {
              role: 'assistant',
              content: JSON.stringify({
                content: 'Reading README.md',
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
          }),
        )
        return
      }

      response.end(
        JSON.stringify({
          model: 'mock-model',
          message: {
            role: 'assistant',
            content: 'The README confirms the tool loop works.',
          },
        }),
      )
    })
  })

  await listen(server)

  t.after(async () => {
    await close(server)
    await rm(workspace, {recursive: true, force: true})
  })

  const address = server.address()
  assert.ok(address && typeof address === 'object')

  const runResult = await runCliAsync(
    [
      'run',
      'Use read_file to inspect README.md',
      '--model',
      'mock-model',
      '--base-url',
      `http://127.0.0.1:${address.port}`,
      '--timeout-ms',
      '1000',
    ],
    workspace,
  )

  assert.equal(runResult.status, 0)
  assert.match(runResult.stdout, /The README confirms the tool loop works\./)
  assert.equal(requests.length, 2)
  assert.match(
    requests[0]?.messages?.find(message => message.role === 'system')?.content ?? '',
    /`search_files`/,
  )
  assert.match(
    requests[0]?.messages?.find(message => message.role === 'system')?.content ?? '',
    /`find_files`/,
  )
  assert.match(
    requests[0]?.messages?.find(message => message.role === 'system')?.content ?? '',
    /`list_dir`/,
  )
  assert.match(
    requests[0]?.messages?.find(message => message.role === 'system')?.content ?? '',
    /`write_file`/,
  )
  assert.match(
    requests[0]?.messages?.find(message => message.role === 'system')?.content ?? '',
    /`edit_file`/,
  )
  assert.match(
    requests[0]?.messages?.find(message => message.role === 'system')?.content ?? '',
    /`run_command`/,
  )
  assert.match(
    requests[1]?.messages?.at(-1)?.content ?? '',
    /Tool result from read_file \(call-1\):/,
  )
  assert.match(requests[1]?.messages?.at(-1)?.content ?? '', /daycli tool loop works/)

  const sessionDir = path.join(workspace, '.daycli', 'sessions')
  const sessionFiles = (await readdir(sessionDir)).filter(file => file.endsWith('.json'))
  assert.equal(sessionFiles.length, 1)
  const sessionRaw = await readFile(path.join(sessionDir, sessionFiles[0] ?? ''), 'utf8')
  const session = JSON.parse(sessionRaw) as {
    messages?: Array<{
      role?: string
      content?: string
      toolName?: string
      metadata?: {
        agent?: {
          stoppedReason?: string
          stepCount?: number
          toolResultCount?: number
        }
      }
    }>
  }
  const toolMessage = session.messages?.find(message => message.role === 'tool')
  assert.equal(toolMessage?.toolName, 'read_file')
  assert.match(toolMessage?.content ?? '', /daycli tool loop works/)

  const assistantMessage = session.messages?.find(message => message.role === 'assistant')
  assert.equal(assistantMessage?.metadata?.agent?.stoppedReason, 'final_answer')
  assert.equal(assistantMessage?.metadata?.agent?.toolResultCount, 1)
  assert.equal(assistantMessage?.metadata?.agent?.stepCount, 5)
})

test('run command routes model-requested search_files tool calls through the agent loop', async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'daycli-run-search-tool-'))
  await mkdir(path.join(workspace, 'src'), {recursive: true})
  await writeFile(path.join(workspace, 'src', 'index.ts'), 'export const searchNeedle = true\n', 'utf8')

  const requests: MockChatRequest[] = []
  const server = createToolLoopServer({
    requests,
    firstContent: JSON.stringify({
      content: 'Searching for the symbol.',
      toolCalls: [
        {
          id: 'call-search',
          name: 'search_files',
          input: {
            query: 'searchNeedle',
            path: 'src',
            maxResults: 5,
          },
        },
      ],
    }),
    finalContent: 'The symbol appears in src/index.ts.',
  })

  await listen(server)

  t.after(async () => {
    await close(server)
    await rm(workspace, {recursive: true, force: true})
  })

  const address = server.address()
  assert.ok(address && typeof address === 'object')

  const runResult = await runCliAsync(
    createMockRunArgs('Find searchNeedle', address.port),
    workspace,
  )

  assert.equal(runResult.status, 0)
  assert.match(runResult.stdout, /The symbol appears in src\/index\.ts\./)
  assert.match(requests[1]?.messages?.at(-1)?.content ?? '', /Tool result from search_files \(call-search\):/)
  assert.match(requests[1]?.messages?.at(-1)?.content ?? '', /src\/index\.ts/)

  const toolMessage = await readOnlyToolMessage(workspace, 'search_files')
  const toolResult = toolMessage?.metadata?.toolResult as {
    ok?: boolean
    query?: string
    matchCount?: number
    paths?: string[]
  } | undefined
  assert.equal(toolResult?.ok, true)
  assert.equal(toolResult?.query, 'searchNeedle')
  assert.equal(toolResult?.matchCount, 1)
  assert.deepEqual(toolResult?.paths, ['src/index.ts'])
})

test('run command executes approved write_file tool and persists metadata', async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'daycli-run-write-tool-'))
  const requests: MockChatRequest[] = []
  const server = createToolLoopServer({
    requests,
    firstContent: JSON.stringify({
      content: 'Writing a file.',
      toolCalls: [
        {
          id: 'call-write',
          name: 'write_file',
          input: {
            path: 'created.txt',
            content: 'created by write_file\n',
          },
        },
      ],
    }),
    finalContent: 'The file was created.',
  })

  await listen(server)

  t.after(async () => {
    await close(server)
    await rm(workspace, {recursive: true, force: true})
  })

  const address = server.address()
  assert.ok(address && typeof address === 'object')

  const runResult = await runCliAsync(
    createMockRunArgs('Create a file', address.port),
    workspace,
    'y\n',
  )

  assert.equal(runResult.status, 0)
  assert.match(runResult.stdout, /The file was created\./)
  assert.equal(await readFile(path.join(workspace, 'created.txt'), 'utf8'), 'created by write_file\n')
  assert.match(requests[1]?.messages?.at(-1)?.content ?? '', /"created":true/)

  const toolMessage = await readOnlyToolMessage(workspace, 'write_file')
  const toolResult = toolMessage?.metadata?.toolResult as {
    ok?: boolean
    path?: string
    absolutePath?: string
    bytesWritten?: number
    created?: boolean
    overwritten?: boolean
  } | undefined
  assert.equal(toolResult?.ok, true)
  assert.equal(toolResult?.path, 'created.txt')
  assert.equal(toolResult?.absolutePath?.endsWith('/created.txt'), true)
  assert.equal(toolResult?.bytesWritten, Buffer.byteLength('created by write_file\n', 'utf8'))
  assert.equal(toolResult?.created, true)
  assert.equal(toolResult?.overwritten, false)
})

test('run command feeds rejected approval back as recoverable tool error', async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'daycli-run-rejected-tool-'))
  const requests: MockChatRequest[] = []
  const server = createToolLoopServer({
    requests,
    firstContent: JSON.stringify({
      toolCalls: [
        {
          id: 'call-reject',
          name: 'write_file',
          input: {
            path: 'rejected.txt',
            content: 'should not exist\n',
          },
        },
      ],
    }),
    finalContent: 'The write was rejected.',
  })

  await listen(server)

  t.after(async () => {
    await close(server)
    await rm(workspace, {recursive: true, force: true})
  })

  const address = server.address()
  assert.ok(address && typeof address === 'object')

  const runResult = await runCliAsync(
    createMockRunArgs('Try to write a rejected file', address.port),
    workspace,
    'n\n',
  )

  assert.equal(runResult.status, 0)
  assert.match(runResult.stdout, /The write was rejected\./)
  await assert.rejects(() => readFile(path.join(workspace, 'rejected.txt'), 'utf8'), /ENOENT/)
  assert.match(requests[1]?.messages?.at(-1)?.content ?? '', /"code":"TOOL_APPROVAL_REJECTED"/)

  const toolMessage = await readOnlyToolMessage(workspace, 'write_file')
  assert.equal((toolMessage?.metadata?.toolResult as {ok?: boolean} | undefined)?.ok, false)
})

test('run command feeds blocked path back as recoverable tool error', async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'daycli-run-blocked-tool-'))
  const requests: MockChatRequest[] = []
  const server = createToolLoopServer({
    requests,
    firstContent: JSON.stringify({
      toolCalls: [
        {
          id: 'call-blocked',
          name: 'write_file',
          input: {
            path: 'dist/generated.txt',
            content: 'blocked\n',
          },
        },
      ],
    }),
    finalContent: 'The path was blocked.',
  })

  await listen(server)

  t.after(async () => {
    await close(server)
    await rm(workspace, {recursive: true, force: true})
  })

  const address = server.address()
  assert.ok(address && typeof address === 'object')

  const runResult = await runCliAsync(
    createMockRunArgs('Try to write a blocked path', address.port),
    workspace,
  )

  assert.equal(runResult.status, 0)
  assert.match(runResult.stdout, /The path was blocked\./)
  assert.match(requests[1]?.messages?.at(-1)?.content ?? '', /"code":"TOOL_PATH_BLOCKED"/)

  const toolMessage = await readOnlyToolMessage(workspace, 'write_file')
  const error = (toolMessage?.metadata?.toolResult as {
    error?: {
      code?: string
      message?: string
      recoverable?: boolean
      meta?: {
        toolName?: string
        candidate?: string
        access?: string
        relativePath?: string
      }
    }
  } | undefined)?.error
  assert.equal(error?.code, 'TOOL_PATH_BLOCKED')
  assert.equal(error?.message, 'Path is denied for write: dist/generated.txt')
  assert.equal(error?.recoverable, true)
  assert.equal(error?.meta?.toolName, 'write_file')
  assert.equal(error?.meta?.candidate?.endsWith('/dist/generated.txt'), true)
  assert.equal(error?.meta?.access, 'write')
  assert.equal(error?.meta?.relativePath, 'dist/generated.txt')
})

test('run command persists timed out run_command metadata', async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'daycli-run-timeout-tool-'))
  const requests: MockChatRequest[] = []
  const server = createToolLoopServer({
    requests,
    firstContent: JSON.stringify({
      toolCalls: [
        {
          id: 'call-timeout',
          name: 'run_command',
          input: {
            command: process.execPath,
            args: ['-e', 'setTimeout(() => {}, 5000)'],
            timeoutMs: 25,
          },
        },
      ],
    }),
    finalContent: 'The command timed out.',
  })

  await listen(server)

  t.after(async () => {
    await close(server)
    await rm(workspace, {recursive: true, force: true})
  })

  const address = server.address()
  assert.ok(address && typeof address === 'object')

  const runResult = await runCliAsync(
    createMockRunArgs('Run a timed out command', address.port),
    workspace,
    'y\n',
  )

  assert.equal(runResult.status, 0)
  assert.match(runResult.stdout, /The command timed out\./)
  assert.match(requests[1]?.messages?.at(-1)?.content ?? '', /"timedOut":true/)

  const toolMessage = await readOnlyToolMessage(workspace, 'run_command')
  const toolResult = toolMessage?.metadata?.toolResult as {timedOut?: boolean; exitCode?: unknown} | undefined
  assert.equal(toolResult?.timedOut, true)
  assert.equal(toolResult?.exitCode, null)
})

test('run command feeds edit_file conflict back as recoverable failure', async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'daycli-run-failure-tool-'))
  await writeFile(path.join(workspace, 'note.txt'), 'hello world\n', 'utf8')
  const requests: MockChatRequest[] = []
  const server = createToolLoopServer({
    requests,
    firstContent: JSON.stringify({
      toolCalls: [
        {
          id: 'call-failure',
          name: 'edit_file',
          input: {
            path: 'note.txt',
            replacements: [
              {
                oldText: 'missing',
                newText: 'replacement',
              },
            ],
          },
        },
      ],
    }),
    finalContent: 'The edit failed safely.',
  })

  await listen(server)

  t.after(async () => {
    await close(server)
    await rm(workspace, {recursive: true, force: true})
  })

  const address = server.address()
  assert.ok(address && typeof address === 'object')

  const runResult = await runCliAsync(
    createMockRunArgs('Try a conflicting edit', address.port),
    workspace,
    'y\n',
  )

  assert.equal(runResult.status, 0)
  assert.match(runResult.stdout, /The edit failed safely\./)
  assert.equal(await readFile(path.join(workspace, 'note.txt'), 'utf8'), 'hello world\n')
  assert.match(requests[1]?.messages?.at(-1)?.content ?? '', /"code":"TOOL_EXECUTION_FAILED"/)
})

test('run command batch mode denies high-risk tools without prompting', async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'daycli-run-batch-deny-'))
  const requests: MockChatRequest[] = []
  const server = createToolLoopServer({
    requests,
    firstContent: JSON.stringify({
      content: 'Writing in batch mode',
      toolCalls: [
        {
          id: 'call-1',
          name: 'write_file',
          input: {
            path: 'batch.txt',
            content: 'should not write\n',
          },
        },
      ],
    }),
    finalContent: 'Batch mode denied the write because approval is unavailable.',
  })

  await listen(server)

  t.after(async () => {
    await close(server)
    await rm(workspace, {recursive: true, force: true})
  })

  const address = server.address()
  assert.ok(address && typeof address === 'object')

  const runResult = await runCliAsync(
    [...createMockRunArgs('Try a batch write', address.port), '--batch'],
    workspace,
  )

  assert.equal(runResult.status, 0)
  assert.match(runResult.stdout, /Batch mode denied the write/)
  assert.doesNotMatch(runResult.stdout, /Approve execution/)

  await assert.rejects(
    () => readFile(path.join(workspace, 'batch.txt'), 'utf8'),
    (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT',
  )

  const toolMessage = await readOnlyToolMessage(workspace, 'write_file')
  assert.ok(toolMessage)
  const toolResult = toolMessage.metadata?.toolResult as {
    ok: boolean
    error: {code: string; message: string; recoverable: boolean; meta: Record<string, unknown>}
  }
  assert.equal(toolResult.ok, false)
  assert.equal(toolResult.error.code, 'TOOL_PATH_BLOCKED')
  assert.match(toolResult.error.message, /Path is not allowed for write/)
  assert.equal(toolResult.error.recoverable, true)
  assert.equal(toolResult.error.meta.toolName, 'write_file')

  const session = await readOnlySession(workspace)
  assert.equal(session.metadata?.batch, true)
  assert.equal(session.metadata?.nonInteractive, true)
  assert.equal(session.metadata?.approvalMode, 'policy')
  assert.equal(requests.length, 2)
})

test('run command batch mode produces valid JSON output on success', async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'daycli-batch-json-success-'))
  const requests: MockChatRequest[] = []
  const server = createToolLoopServer({
    requests,
    firstContent: 'Batch run completed successfully.',
    finalContent: 'Batch run completed successfully.',
  })

  await listen(server)
  t.after(async () => {
    await close(server)
    await rm(workspace, {recursive: true, force: true})
  })

  const address = server.address()
  assert.ok(address && typeof address === 'object')

  const runResult = await runCliAsync(
    [...createMockRunArgs('hello batch', address.port), '--batch', '--output', 'json'],
    workspace,
  )

  assert.equal(runResult.status, 0)

  const output = JSON.parse(runResult.stdout) as Record<string, unknown>
  assert.equal(output.status, 'completed')
  assert.equal(output.stoppedReason, 'final_answer')
  assert.match(String(output.response), /Batch run completed successfully/)
  assert.equal(typeof output.sessionId, 'string')
  assert.equal(output.metadata, undefined)
  assert.deepEqual(Object.keys(output).sort(), ['response', 'sessionId', 'status', 'stoppedReason'])
  assert.equal(requests.length, 1)
})

test('run command batch mode denies high-risk tools via policy approval rules', async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'daycli-batch-approval-denial-'))

  await writeFile(
    path.join(workspace, 'daycli.policy.json'),
    JSON.stringify({
      version: 1,
      approvals: {
        default: 'deny',
        riskLevels: {low: 'allow', high: 'deny'},
      },
      paths: {
        write: {allow: ['**']},
      },
    }),
  )

  const requests: MockChatRequest[] = []
  const server = createToolLoopServer({
    requests,
    firstContent: JSON.stringify({
      content: 'Writing a file',
      toolCalls: [{id: 'call-1', name: 'write_file', input: {path: 'output.txt', content: 'data\n'}}],
    }),
    finalContent: 'Write was rejected by policy.',
  })

  await listen(server)
  t.after(async () => {
    await close(server)
    await rm(workspace, {recursive: true, force: true})
  })

  const address = server.address()
  assert.ok(address && typeof address === 'object')

  const runResult = await runCliAsync(
    [...createMockRunArgs('write a file', address.port), '--batch'],
    workspace,
  )

  assert.equal(runResult.status, 0)
  assert.doesNotMatch(runResult.stdout, /Approve execution/)

  await assert.rejects(
    () => readFile(path.join(workspace, 'output.txt'), 'utf8'),
    (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT',
  )

  const toolMessage = await readOnlyToolMessage(workspace, 'write_file')
  assert.ok(toolMessage)
  const toolResult = toolMessage.metadata?.toolResult as {
    ok: boolean
    error: {code: string; recoverable: boolean}
  }
  assert.equal(toolResult.ok, false)
  assert.equal(toolResult.error.code, 'TOOL_APPROVAL_REJECTED')
  assert.equal(toolResult.error.recoverable, true)
  assert.equal(requests.length, 2)
})

test('run command batch mode feeds tool execution failure back to agent', async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'daycli-batch-toolfail-'))
  const requests: MockChatRequest[] = []
  const server = createToolLoopServer({
    requests,
    firstContent: JSON.stringify({
      content: 'Reading a file',
      toolCalls: [{id: 'call-1', name: 'read_file', input: {path: 'does_not_exist.txt'}}],
    }),
    finalContent: 'The file was not found.',
  })

  await listen(server)
  t.after(async () => {
    await close(server)
    await rm(workspace, {recursive: true, force: true})
  })

  const address = server.address()
  assert.ok(address && typeof address === 'object')

  const runResult = await runCliAsync(
    [...createMockRunArgs('read a file', address.port), '--batch'],
    workspace,
  )

  assert.equal(runResult.status, 0)
  assert.match(runResult.stdout, /The file was not found/)

  const toolMessage = await readOnlyToolMessage(workspace, 'read_file')
  assert.ok(toolMessage)
  const toolResult = toolMessage.metadata?.toolResult as {
    ok: boolean
    error: {code: string; recoverable: boolean}
  }
  assert.equal(toolResult.ok, false)
  assert.equal(typeof toolResult.error.code, 'string')
  assert.equal(toolResult.error.recoverable, true)
  assert.equal(requests.length, 2)
})

test('run command batch mode exits with code 2 and JSON stoppedReason when step limit is reached', async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'daycli-batch-steplimit-'))

  await writeFile(
    path.join(workspace, 'daycli.policy.json'),
    JSON.stringify({
      version: 1,
      limits: {maxSteps: 1},
    }),
  )

  const requests: MockChatRequest[] = []
  const toolCallContent = JSON.stringify({
    content: 'Calling a tool',
    toolCalls: [{id: 'call-1', name: 'read_file', input: {path: 'README.md'}}],
  })
  const server = createToolLoopServer({
    requests,
    firstContent: toolCallContent,
    finalContent: toolCallContent,
  })

  await listen(server)
  t.after(async () => {
    await close(server)
    await rm(workspace, {recursive: true, force: true})
  })

  const address = server.address()
  assert.ok(address && typeof address === 'object')

  const runResult = await runCliAsync(
    [...createMockRunArgs('do something', address.port), '--batch', '--output', 'json'],
    workspace,
  )

  assert.equal(runResult.status, 2)

  const output = JSON.parse(runResult.stdout) as Record<string, unknown>
  assert.equal(output.status, 'stopped')
  assert.equal(output.stoppedReason, 'step_limit')
  assert.equal(typeof output.sessionId, 'string')
  assert.equal(requests.length, 1)
})

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

function createMockRunArgs(task: string, port: number): string[] {
  return [
    'run',
    task,
    '--model',
    'mock-model',
    '--base-url',
    `http://127.0.0.1:${port}`,
    '--timeout-ms',
    '1000',
  ]
}

async function readOnlyToolMessage(workspace: string, toolName: string): Promise<{
  toolName?: string
  metadata?: {
    toolResult?: unknown
  }
} | undefined> {
  const sessionDir = path.join(workspace, '.daycli', 'sessions')
  const sessionFiles = (await readdir(sessionDir)).filter(file => file.endsWith('.json'))
  assert.equal(sessionFiles.length, 1)

  const sessionRaw = await readFile(path.join(sessionDir, sessionFiles[0] ?? ''), 'utf8')
  const session = JSON.parse(sessionRaw) as {
    messages?: Array<{
      role?: string
      toolName?: string
      metadata?: {
        toolResult?: unknown
      }
    }>
  }

  return session.messages?.find(message => message.role === 'tool' && message.toolName === toolName)
}

async function readOnlySession(workspace: string): Promise<{
  metadata?: Record<string, unknown>
}> {
  const sessionDir = path.join(workspace, '.daycli', 'sessions')
  const sessionFiles = (await readdir(sessionDir)).filter(file => file.endsWith('.json'))
  assert.equal(sessionFiles.length, 1)

  const sessionRaw = await readFile(path.join(sessionDir, sessionFiles[0] ?? ''), 'utf8')
  return JSON.parse(sessionRaw) as {metadata?: Record<string, unknown>}
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
