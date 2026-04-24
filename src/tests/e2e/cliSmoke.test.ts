import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import {tmpdir} from 'node:os'
import {mkdtemp, readFile, rm} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'

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
  assert.match(listResult.stdout, /daycli session list: scaffold ready/)

  const resumeResult = runCli(['session', 'resume', 'smoke-session'], workspace)
  assert.equal(resumeResult.status, 0)
  assert.match(resumeResult.stdout, /daycli session resume: smoke-session/)

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
