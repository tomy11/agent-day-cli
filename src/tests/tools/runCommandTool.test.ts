import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdir, mkdtemp, readFile, rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {SafeExecutor} from '../../core/execution'
import {AppError} from '../../core/errors'
import {WorkspacePathGuard} from '../../core/security'
import {ToolRouter, createRunCommandTool, type RunCommandToolOutput} from '../../core/tools'

test('run_command tool runs a command in the workspace and captures output', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'daycli-run-command-'))

  try {
    const tool = createRunCommandTool()
    const output = (await tool.execute(
      {
        command: process.execPath,
        args: ['-e', 'console.log(process.cwd())'],
        cwd: '.',
      },
      {workspaceRoot},
    )) as RunCommandToolOutput

    assert.equal(output.command, process.execPath)
    assert.deepEqual(output.args, ['-e', 'console.log(process.cwd())'])
    assert.equal(output.cwd, workspaceRoot)
    assert.equal(output.exitCode, 0)
    assert.match(output.stdout, new RegExp(escapeRegExp(workspaceRoot)))
    assert.equal(output.stderr, '')
    assert.equal(output.timedOut, false)
    assert.equal(typeof output.durationMs, 'number')
  } finally {
    await rm(workspaceRoot, {recursive: true, force: true})
  }
})

test('run_command tool reports non-zero exit code with stderr', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'daycli-run-command-'))

  try {
    const tool = createRunCommandTool()
    const output = (await tool.execute(
      {
        command: process.execPath,
        args: ['-e', 'console.error("bad news"); process.exit(7)'],
      },
      {workspaceRoot},
    )) as RunCommandToolOutput

    assert.equal(output.exitCode, 7)
    assert.match(output.stderr, /bad news/)
    assert.equal(output.timedOut, false)
  } finally {
    await rm(workspaceRoot, {recursive: true, force: true})
  }
})

test('run_command tool enforces timeout', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'daycli-run-command-'))

  try {
    const tool = createRunCommandTool()
    const output = (await tool.execute(
      {
        command: process.execPath,
        args: ['-e', 'setTimeout(() => {}, 5000)'],
        timeoutMs: 25,
      },
      {workspaceRoot},
    )) as RunCommandToolOutput

    assert.equal(output.timedOut, true)
    assert.equal(output.exitCode, null)
  } finally {
    await rm(workspaceRoot, {recursive: true, force: true})
  }
})

test('run_command tool truncates captured output', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'daycli-run-command-'))

  try {
    const tool = createRunCommandTool()
    const output = (await tool.execute(
      {
        command: process.execPath,
        args: ['-e', 'process.stdout.write("abcdef")'],
        maxOutputBytes: 3,
      },
      {workspaceRoot},
    )) as RunCommandToolOutput

    assert.equal(output.stdout, 'abc\n[output truncated]')
  } finally {
    await rm(workspaceRoot, {recursive: true, force: true})
  }
})

test('run_command tool validates input', async () => {
  const tool = createRunCommandTool()

  await assert.rejects(
    () => tool.execute({command: 123}, {workspaceRoot: process.cwd()}),
    /run_command input.command must be a string/,
  )
  await assert.rejects(
    () => tool.execute({command: 'node', args: 'nope'}, {workspaceRoot: process.cwd()}),
    /run_command input.args must be an array of strings/,
  )
  await assert.rejects(
    () => tool.execute({command: 'node', timeoutMs: 0}, {workspaceRoot: process.cwd()}),
    /run_command input.timeoutMs must be a positive number/,
  )
  await assert.rejects(
    () => tool.execute({command: 'node', env: {BAD: 123}}, {workspaceRoot: process.cwd()}),
    /run_command input.env.BAD must be a string/,
  )
})

test('run_command runs through cwd guard and approval in SafeExecutor', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'daycli-run-command-'))
  await mkdir(path.join(workspaceRoot, 'scripts'))
  const router = new ToolRouter()
  router.register(createRunCommandTool())
  const approvals: Array<{toolName: string; payload: unknown}> = []

  try {
    const executor = new SafeExecutor({
      toolRouter: router,
      pathGuard: new WorkspacePathGuard(),
      approvalManager: {
        async requestToolApproval(input) {
          approvals.push({
            toolName: input.tool.name,
            payload: input.payload,
          })
          return true
        },
      },
    })

    const result = await executor.execute(
      {
        name: 'run_command',
        input: {
          command: process.execPath,
          args: ['-e', 'console.log("approved")'],
          cwd: 'scripts',
        },
      },
      {workspaceRoot},
    )
    const output = result.output as RunCommandToolOutput

    assert.equal(result.toolName, 'run_command')
    assert.equal(output.cwd, path.join(workspaceRoot, 'scripts'))
    assert.match(output.stdout, /approved/)
    assert.equal(approvals.length, 1)
    assert.equal(approvals[0]?.toolName, 'run_command')
  } finally {
    await rm(workspaceRoot, {recursive: true, force: true})
  }
})

test('run_command is blocked by cwd guard before approval', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'daycli-run-command-'))
  const router = new ToolRouter()
  router.register(createRunCommandTool())
  let approvalCount = 0

  try {
    const executor = new SafeExecutor({
      toolRouter: router,
      pathGuard: new WorkspacePathGuard(),
      approvalManager: {
        async requestToolApproval() {
          approvalCount += 1
          return true
        },
      },
    })

    await assert.rejects(
      () =>
        executor.execute(
          {
            name: 'run_command',
            input: {
              command: process.execPath,
              args: ['-e', 'console.log("blocked")'],
              cwd: '../outside',
            },
          },
          {workspaceRoot},
        ),
      (error: unknown) => {
        assert.ok(error instanceof AppError)
        assert.equal(error.code, 'TOOL_PATH_BLOCKED')
        assert.equal(error.meta?.access, 'execute')
        return true
      },
    )
    assert.equal(approvalCount, 0)
  } finally {
    await rm(workspaceRoot, {recursive: true, force: true})
  }
})

test('run_command is blocked by command policy before approval', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'daycli-run-command-'))
  const router = new ToolRouter()
  router.register(createRunCommandTool())
  let approvalCount = 0

  try {
    const executor = new SafeExecutor({
      toolRouter: router,
      pathGuard: new WorkspacePathGuard(),
      approvalManager: {
        async requestToolApproval() {
          approvalCount += 1
          return true
        },
      },
    })

    await assert.rejects(
      () =>
        executor.execute(
          {
            name: 'run_command',
            input: {
              command: 'rm',
              args: ['-rf', 'anything'],
            },
          },
          {workspaceRoot},
        ),
      (error: unknown) => {
        assert.ok(error instanceof AppError)
        assert.equal(error.code, 'TOOL_EXECUTION_FAILED')
        assert.equal(error.meta?.command, 'rm')
        return true
      },
    )
    assert.equal(approvalCount, 0)
  } finally {
    await rm(workspaceRoot, {recursive: true, force: true})
  }
})

test('run_command does not execute when approval is rejected', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'daycli-run-command-'))
  const markerPath = path.join(workspaceRoot, 'marker.txt')
  const router = new ToolRouter()
  router.register(createRunCommandTool())

  try {
    const executor = new SafeExecutor({
      toolRouter: router,
      pathGuard: new WorkspacePathGuard(),
      approvalManager: {
        async requestToolApproval() {
          return false
        },
      },
    })

    await assert.rejects(
      () =>
        executor.execute(
          {
            name: 'run_command',
            input: {
              command: process.execPath,
              args: ['-e', `require("fs").writeFileSync(${JSON.stringify(markerPath)}, "ran")`],
            },
          },
          {workspaceRoot},
        ),
      (error: unknown) => {
        assert.ok(error instanceof AppError)
        assert.equal(error.code, 'TOOL_APPROVAL_REJECTED')
        return true
      },
    )

    await assert.rejects(() => readFile(markerPath, 'utf8'), /ENOENT/)
  } finally {
    await rm(workspaceRoot, {recursive: true, force: true})
  }
})

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
