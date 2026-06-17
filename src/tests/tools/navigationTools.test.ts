import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {SafeExecutor} from '../../core/execution'
import {AppError} from '../../core/errors'
import {WorkspacePathGuard, type SafetyPolicy} from '../../core/security'
import {ToolRouter, createFindFilesTool, createListDirTool, createSearchFilesTool} from '../../core/tools'

test('search_files returns literal text matches with path and line metadata', async t => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'daycli-search-files-'))
  t.after(async () => {
    await rm(workspaceRoot, {recursive: true, force: true})
  })

  await mkdir(path.join(workspaceRoot, 'src'), {recursive: true})
  await writeFile(path.join(workspaceRoot, 'src', 'tool.ts'), 'const ToolRouter = true\nconst other = false\n', 'utf8')

  const tool = createSearchFilesTool()
  const output = await tool.execute(
    {
      query: 'toolrouter',
      path: 'src',
    },
    {workspaceRoot},
  ) as {
    matches: Array<{path: string; line: number; column: number; preview: string}>
    totalMatches: number
    filesSearched: number
    truncated: boolean
  }

  assert.equal(output.totalMatches, 1)
  assert.equal(output.filesSearched, 1)
  assert.equal(output.truncated, false)
  assert.deepEqual(output.matches, [
    {
      path: 'src/tool.ts',
      line: 1,
      column: 7,
      preview: 'const ToolRouter = true',
    },
  ])
})

test('find_files returns an empty result for no matches', async t => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'daycli-find-files-'))
  t.after(async () => {
    await rm(workspaceRoot, {recursive: true, force: true})
  })

  await mkdir(path.join(workspaceRoot, 'src'), {recursive: true})
  await writeFile(path.join(workspaceRoot, 'src', 'index.ts'), 'export {}\n', 'utf8')

  const tool = createFindFilesTool()
  const output = await tool.execute(
    {
      query: 'missing',
      path: 'src',
    },
    {workspaceRoot},
  ) as {paths: string[]; totalMatches: number; truncated: boolean}

  assert.deepEqual(output.paths, [])
  assert.equal(output.totalMatches, 0)
  assert.equal(output.truncated, false)
})

test('list_dir enforces maxEntries output limits', async t => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'daycli-list-dir-'))
  t.after(async () => {
    await rm(workspaceRoot, {recursive: true, force: true})
  })

  await mkdir(path.join(workspaceRoot, 'notes'), {recursive: true})
  await writeFile(path.join(workspaceRoot, 'notes', 'a.txt'), 'a\n', 'utf8')
  await writeFile(path.join(workspaceRoot, 'notes', 'b.txt'), 'b\n', 'utf8')
  await writeFile(path.join(workspaceRoot, 'notes', 'c.txt'), 'c\n', 'utf8')

  const tool = createListDirTool()
  const output = await tool.execute(
    {
      path: 'notes',
      maxEntries: 2,
    },
    {workspaceRoot},
  ) as {entries: Array<{path: string; type: string}>; totalEntries: number; truncated: boolean}

  assert.equal(output.entries.length, 2)
  assert.equal(output.totalEntries, 3)
  assert.equal(output.truncated, true)
  assert.deepEqual(
    output.entries.map(entry => [entry.path, entry.type]),
    [
      ['notes/a.txt', 'file'],
      ['notes/b.txt', 'file'],
    ],
  )
})

test('navigation tools are denied when read path policy rejects the requested path', async t => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'daycli-nav-denied-'))
  t.after(async () => {
    await rm(workspaceRoot, {recursive: true, force: true})
  })

  await mkdir(path.join(workspaceRoot, 'docs'), {recursive: true})
  await writeFile(path.join(workspaceRoot, 'docs', 'note.txt'), 'secret\n', 'utf8')

  const router = new ToolRouter()
  router.register(createSearchFilesTool())
  const policy: SafetyPolicy = {
    paths: {
      read: {
        allow: ['src/**'],
      },
      write: {},
      execute: {},
    },
    commands: {},
    tools: {
      search_files: {
        riskLevel: 'low',
        pathAccess: 'read',
      },
    },
  }
  const executor = new SafeExecutor({
    toolRouter: router,
    pathGuard: new WorkspacePathGuard(policy),
    safetyPolicy: policy,
  })

  await assert.rejects(
    () =>
      executor.execute(
        {
          name: 'search_files',
          input: {
            query: 'secret',
            path: 'docs',
          },
        },
        {workspaceRoot},
      ),
    (error: unknown) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.code, 'TOOL_PATH_BLOCKED')
      assert.equal(error.meta?.access, 'read')
      return true
    },
  )
})
