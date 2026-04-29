import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import {tmpdir} from 'node:os'
import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises'
import {AppError} from '../../core/errors'
import {SessionStore} from '../../core/storage'

test('SessionStore creates, reads, appends, updates, and lists sessions', async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'daycli-session-'))
  t.after(async () => {
    await rm(workspace, {recursive: true, force: true})
  })

  const store = new SessionStore(workspace)
  const created = await store.create({
    kind: 'chat',
    title: 'Investigate tests',
    workspaceRoot: workspace,
    model: 'llama3.1',
  })

  assert.equal(created.kind, 'chat')
  assert.equal(created.status, 'active')
  assert.equal(created.messages.length, 0)

  const withUserMessage = await store.appendMessage(created.id, {
    role: 'user',
    content: 'What should I test?',
  })
  assert.equal(withUserMessage.messages.length, 1)
  assert.equal(withUserMessage.messages[0]?.role, 'user')

  const completed = await store.updateStatus(created.id, 'completed')
  assert.equal(completed.status, 'completed')

  const loaded = await store.get(created.id)
  assert.equal(loaded.status, 'completed')
  assert.equal(loaded.messages[0]?.content, 'What should I test?')

  const sessions = await store.list()
  assert.equal(sessions.length, 1)
  assert.equal(sessions[0]?.id, created.id)
  assert.equal(sessions[0]?.messageCount, 1)
})

test('SessionStore returns an empty list when storage directory does not exist', async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'daycli-session-empty-'))
  t.after(async () => {
    await rm(workspace, {recursive: true, force: true})
  })

  const store = new SessionStore(workspace)
  assert.deepEqual(await store.list(), [])
})

test('SessionStore rejects unsafe session ids', async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'daycli-session-unsafe-'))
  t.after(async () => {
    await rm(workspace, {recursive: true, force: true})
  })

  const store = new SessionStore(workspace)

  await assert.rejects(
    () => store.get('../escape'),
    (error: unknown) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.code, 'SESSION_INVALID')
      return true
    },
  )
})

test('SessionStore reports corrupted session files as coded errors', async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'daycli-session-corrupt-'))
  t.after(async () => {
    await rm(workspace, {recursive: true, force: true})
  })

  const sessionDir = path.join(workspace, '.daycli', 'sessions')
  await mkdir(sessionDir, {recursive: true})
  await writeFile(path.join(sessionDir, 'broken.json'), '{not-json', 'utf8')

  const store = new SessionStore(workspace)

  await assert.rejects(
    () => store.list(),
    (error: unknown) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.code, 'SESSION_INVALID')
      return true
    },
  )
})
