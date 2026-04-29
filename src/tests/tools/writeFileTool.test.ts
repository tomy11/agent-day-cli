import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {SafeExecutor} from '../../core/execution'
import {AppError} from '../../core/errors'
import {WorkspacePathGuard} from '../../core/security'
import {ToolRouter, createWriteFileTool, type WriteFileToolOutput} from '../../core/tools'

test('write_file tool creates a new file and returns write metadata', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'daycli-write-file-'))

  try {
    const tool = createWriteFileTool()
    const output = await tool.execute(
      {
        path: 'notes/hello.txt',
        content: 'hello world',
        createDirs: true,
      },
      {workspaceRoot},
    )

    assert.deepEqual(output, {
      path: 'notes/hello.txt',
      absolutePath: path.join(workspaceRoot, 'notes', 'hello.txt'),
      bytesWritten: Buffer.byteLength('hello world', 'utf8'),
      created: true,
      overwritten: false,
    })
    assert.equal(await readFile(path.join(workspaceRoot, 'notes', 'hello.txt'), 'utf8'), 'hello world')
  } finally {
    await rm(workspaceRoot, {recursive: true, force: true})
  }
})

test('write_file tool refuses to overwrite unless overwrite is true', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'daycli-write-file-'))
  const filePath = path.join(workspaceRoot, 'note.txt')

  try {
    await writeFile(filePath, 'old', 'utf8')

    const tool = createWriteFileTool()
    await assert.rejects(
      () => tool.execute({path: 'note.txt', content: 'new'}, {workspaceRoot}),
      /write_file target exists; set overwrite=true to replace it/,
    )

    const output = (await tool.execute(
      {
        path: 'note.txt',
        content: 'new',
        overwrite: true,
      },
      {workspaceRoot},
    )) as WriteFileToolOutput

    assert.equal(output.created, false)
    assert.equal(output.overwritten, true)
    assert.equal(await readFile(filePath, 'utf8'), 'new')
  } finally {
    await rm(workspaceRoot, {recursive: true, force: true})
  }
})

test('write_file tool validates input', async () => {
  const tool = createWriteFileTool()

  await assert.rejects(
    () => tool.execute({path: 123, content: 'hello'}, {workspaceRoot: process.cwd()}),
    /write_file input.path must be a string/,
  )
  await assert.rejects(
    () => tool.execute({path: 'note.txt'}, {workspaceRoot: process.cwd()}),
    /write_file input.content must be a string/,
  )
  await assert.rejects(
    () => tool.execute({path: 'note.txt', content: 'hello', overwrite: 'yes'}, {workspaceRoot: process.cwd()}),
    /write_file input.overwrite must be a boolean/,
  )
})

test('write_file runs through path guard and approval in SafeExecutor', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'daycli-write-file-'))
  const router = new ToolRouter()
  router.register(createWriteFileTool())
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
        name: 'write_file',
        input: {
          path: 'approved.txt',
          content: 'approved write',
        },
      },
      {workspaceRoot},
    )

    assert.equal(result.toolName, 'write_file')
    assert.equal(approvals.length, 1)
    assert.equal(approvals[0]?.toolName, 'write_file')
    assert.equal(await readFile(path.join(workspaceRoot, 'approved.txt'), 'utf8'), 'approved write')
  } finally {
    await rm(workspaceRoot, {recursive: true, force: true})
  }
})

test('write_file is blocked by path guard before approval', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'daycli-write-file-'))
  const router = new ToolRouter()
  router.register(createWriteFileTool())
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
            name: 'write_file',
            input: {
              path: 'dist/generated.txt',
              content: 'blocked',
            },
          },
          {workspaceRoot},
        ),
      (error: unknown) => {
        assert.ok(error instanceof AppError)
        assert.equal(error.code, 'TOOL_PATH_BLOCKED')
        assert.equal(error.meta?.access, 'write')
        return true
      },
    )
    assert.equal(approvalCount, 0)
  } finally {
    await rm(workspaceRoot, {recursive: true, force: true})
  }
})

test('write_file does not execute when approval is rejected', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'daycli-write-file-'))
  const router = new ToolRouter()
  router.register(createWriteFileTool())

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
            name: 'write_file',
            input: {
              path: 'rejected.txt',
              content: 'nope',
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

    await assert.rejects(
      () => readFile(path.join(workspaceRoot, 'rejected.txt'), 'utf8'),
      /ENOENT/,
    )
  } finally {
    await rm(workspaceRoot, {recursive: true, force: true})
  }
})
