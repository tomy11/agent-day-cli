import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {SafeExecutor} from '../../core/execution'
import {AppError} from '../../core/errors'
import {WorkspacePathGuard} from '../../core/security'
import {ToolRouter, createEditFileTool, type EditFileToolOutput} from '../../core/tools'

test('edit_file tool applies ordered exact replacements and returns edit metadata', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'daycli-edit-file-'))
  const filePath = path.join(workspaceRoot, 'note.txt')

  try {
    await writeFile(filePath, 'hello old world\n', 'utf8')

    const tool = createEditFileTool()
    const output = (await tool.execute(
      {
        path: 'note.txt',
        replacements: [
          {
            oldText: 'old',
            newText: 'new',
          },
          {
            oldText: 'hello',
            newText: 'hi',
          },
        ],
      },
      {workspaceRoot},
    )) as EditFileToolOutput

    assert.deepEqual(output, {
      path: 'note.txt',
      absolutePath: filePath,
      replacementsApplied: 2,
      changed: true,
    })
    assert.equal(await readFile(filePath, 'utf8'), 'hi new world\n')
  } finally {
    await rm(workspaceRoot, {recursive: true, force: true})
  }
})

test('edit_file tool supports replaceAll for repeated exact matches', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'daycli-edit-file-'))
  const filePath = path.join(workspaceRoot, 'note.txt')

  try {
    await writeFile(filePath, 'one fish, one fish\n', 'utf8')

    const tool = createEditFileTool()
    const output = (await tool.execute(
      {
        path: 'note.txt',
        replacements: [
          {
            oldText: 'one',
            newText: 'two',
            replaceAll: true,
          },
        ],
      },
      {workspaceRoot},
    )) as EditFileToolOutput

    assert.equal(output.replacementsApplied, 2)
    assert.equal(output.changed, true)
    assert.equal(await readFile(filePath, 'utf8'), 'two fish, two fish\n')
  } finally {
    await rm(workspaceRoot, {recursive: true, force: true})
  }
})

test('edit_file tool reports conflicts when oldText is missing', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'daycli-edit-file-'))
  const filePath = path.join(workspaceRoot, 'note.txt')

  try {
    await writeFile(filePath, 'hello world\n', 'utf8')

    const tool = createEditFileTool()
    await assert.rejects(
      () =>
        tool.execute(
          {
            path: 'note.txt',
            replacements: [
              {
                oldText: 'missing',
                newText: 'replacement',
              },
            ],
          },
          {workspaceRoot},
        ),
      /edit_file conflict: replacement 1 oldText was not found/,
    )
    assert.equal(await readFile(filePath, 'utf8'), 'hello world\n')
  } finally {
    await rm(workspaceRoot, {recursive: true, force: true})
  }
})

test('edit_file tool reports conflicts when exact replacement matches multiple times', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'daycli-edit-file-'))
  const filePath = path.join(workspaceRoot, 'note.txt')

  try {
    await writeFile(filePath, 'same same\n', 'utf8')

    const tool = createEditFileTool()
    await assert.rejects(
      () =>
        tool.execute(
          {
            path: 'note.txt',
            replacements: [
              {
                oldText: 'same',
                newText: 'changed',
              },
            ],
          },
          {workspaceRoot},
        ),
      /edit_file conflict: replacement 1 matched 2 times; set replaceAll=true to replace all matches/,
    )
    assert.equal(await readFile(filePath, 'utf8'), 'same same\n')
  } finally {
    await rm(workspaceRoot, {recursive: true, force: true})
  }
})

test('edit_file tool can skip missing replacements when requireExactMatch is false', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'daycli-edit-file-'))
  const filePath = path.join(workspaceRoot, 'note.txt')

  try {
    await writeFile(filePath, 'hello world\n', 'utf8')

    const tool = createEditFileTool()
    const output = (await tool.execute(
      {
        path: 'note.txt',
        requireExactMatch: false,
        replacements: [
          {
            oldText: 'missing',
            newText: 'replacement',
          },
        ],
      },
      {workspaceRoot},
    )) as EditFileToolOutput

    assert.equal(output.replacementsApplied, 0)
    assert.equal(output.changed, false)
    assert.equal(await readFile(filePath, 'utf8'), 'hello world\n')
  } finally {
    await rm(workspaceRoot, {recursive: true, force: true})
  }
})

test('edit_file tool validates input', async () => {
  const tool = createEditFileTool()

  await assert.rejects(
    () => tool.execute({path: 123, replacements: []}, {workspaceRoot: process.cwd()}),
    /edit_file input.path must be a string/,
  )
  await assert.rejects(
    () => tool.execute({path: 'note.txt', replacements: []}, {workspaceRoot: process.cwd()}),
    /edit_file input.replacements must be a non-empty array/,
  )
  await assert.rejects(
    () =>
      tool.execute(
        {
          path: 'note.txt',
          replacements: [
            {
              oldText: '',
              newText: 'replacement',
            },
          ],
        },
        {workspaceRoot: process.cwd()},
      ),
    /edit_file input.replacements\[0\].oldText must be a non-empty string/,
  )
})

test('edit_file runs through path guard and approval in SafeExecutor', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'daycli-edit-file-'))
  const filePath = path.join(workspaceRoot, 'approved.txt')
  const router = new ToolRouter()
  router.register(createEditFileTool())
  const approvals: Array<{toolName: string; payload: unknown}> = []

  try {
    await writeFile(filePath, 'before approval\n', 'utf8')
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
        name: 'edit_file',
        input: {
          path: 'approved.txt',
          replacements: [
            {
              oldText: 'before',
              newText: 'after',
            },
          ],
        },
      },
      {workspaceRoot},
    )

    assert.equal(result.toolName, 'edit_file')
    assert.equal(approvals.length, 1)
    assert.equal(approvals[0]?.toolName, 'edit_file')
    assert.equal(await readFile(filePath, 'utf8'), 'after approval\n')
  } finally {
    await rm(workspaceRoot, {recursive: true, force: true})
  }
})

test('edit_file is blocked by path guard before approval', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'daycli-edit-file-'))
  const router = new ToolRouter()
  router.register(createEditFileTool())
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
            name: 'edit_file',
            input: {
              path: 'dist/generated.txt',
              replacements: [
                {
                  oldText: 'old',
                  newText: 'new',
                },
              ],
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

test('edit_file does not execute when approval is rejected', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'daycli-edit-file-'))
  const filePath = path.join(workspaceRoot, 'rejected.txt')
  const router = new ToolRouter()
  router.register(createEditFileTool())

  try {
    await writeFile(filePath, 'do not change\n', 'utf8')
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
            name: 'edit_file',
            input: {
              path: 'rejected.txt',
              replacements: [
                {
                  oldText: 'do not',
                  newText: 'please',
                },
              ],
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

    assert.equal(await readFile(filePath, 'utf8'), 'do not change\n')
  } finally {
    await rm(workspaceRoot, {recursive: true, force: true})
  }
})
