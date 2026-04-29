import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import {tmpdir} from 'node:os'
import {mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises'
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

function runCliAsync(args: string[], cwd: string): Promise<CliResult> {
  const repoRoot = path.resolve(__dirname, '../../..')
  const entrypoint = path.join(repoRoot, 'bin', 'run.js')

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entrypoint, ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []

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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
