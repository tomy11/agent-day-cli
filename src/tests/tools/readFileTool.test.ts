import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {createReadFileTool} from '../../core/tools'

test('read_file tool returns file content', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'daycli-read-file-'))
  const filePath = path.join(workspaceRoot, 'note.txt')

  try {
    await writeFile(filePath, 'hello world', 'utf8')

    const tool = createReadFileTool()
    const output = (await tool.execute(
      {path: 'note.txt'},
      {workspaceRoot},
    )) as {content: string; truncated: boolean}

    assert.equal(output.content, 'hello world')
    assert.equal(output.truncated, false)
  } finally {
    await rm(workspaceRoot, {recursive: true, force: true})
  }
})

test('read_file tool truncates when maxChars is set', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'daycli-read-file-'))
  const filePath = path.join(workspaceRoot, 'long.txt')

  try {
    await writeFile(filePath, 'abcdef', 'utf8')

    const tool = createReadFileTool()
    const output = (await tool.execute(
      {path: 'long.txt', maxChars: 3},
      {workspaceRoot},
    )) as {content: string; truncated: boolean}

    assert.equal(output.content, 'abc')
    assert.equal(output.truncated, true)
  } finally {
    await rm(workspaceRoot, {recursive: true, force: true})
  }
})

test('read_file tool validates input', async () => {
  const tool = createReadFileTool()

  await assert.rejects(
    () => tool.execute({path: 123}, {workspaceRoot: process.cwd()}),
    /read_file input.path must be a string/,
  )
})
