import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import {tmpdir} from 'node:os'
import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {
  BATCH_POLICY_JSON_SCHEMA,
  BATCH_POLICY_SCHEMA_VERSION,
  DEFAULT_BATCH_POLICY,
  DEFAULT_BATCH_POLICY_FILE,
  EXAMPLE_BATCH_POLICY,
  loadBatchPolicy,
  resolveBatchPolicyPath,
  validateBatchPolicy,
  type BatchPolicyFile,
} from '../../core/batch'
import {AppError} from '../../core/errors'

test('batch policy file schema defines the stable file contract', () => {
  assert.equal(DEFAULT_BATCH_POLICY_FILE, 'daycli.policy.json')
  assert.equal(BATCH_POLICY_SCHEMA_VERSION, 1)
  assert.equal(BATCH_POLICY_JSON_SCHEMA.required.includes('version'), true)
  assert.equal(BATCH_POLICY_JSON_SCHEMA.properties.version.const, 1)
  assert.ok(BATCH_POLICY_JSON_SCHEMA.properties.approvals)
  assert.ok(BATCH_POLICY_JSON_SCHEMA.properties.paths)
  assert.ok(BATCH_POLICY_JSON_SCHEMA.properties.commands)
  assert.ok(BATCH_POLICY_JSON_SCHEMA.properties.limits)
  assert.ok(BATCH_POLICY_JSON_SCHEMA.properties.output)
})

test('default batch policy is deny-by-default for mutation and command execution', () => {
  assert.equal(DEFAULT_BATCH_POLICY.version, 1)
  assert.equal(DEFAULT_BATCH_POLICY.approvals?.default, 'deny')
  assert.equal(DEFAULT_BATCH_POLICY.approvals?.riskLevels?.low, 'allow')
  assert.equal(DEFAULT_BATCH_POLICY.approvals?.riskLevels?.high, 'deny')
  assert.deepEqual(DEFAULT_BATCH_POLICY.paths?.write?.allow, [])
  assert.deepEqual(DEFAULT_BATCH_POLICY.paths?.execute?.allow, [])
  assert.ok(DEFAULT_BATCH_POLICY.paths?.write?.deny?.includes('.git/**'))
  assert.ok(DEFAULT_BATCH_POLICY.commands?.deny?.includes('rm'))
  assert.equal(DEFAULT_BATCH_POLICY.output?.mode, 'plain')
})

test('example batch policy covers approvals, paths, commands, limits, and output', () => {
  const policy: BatchPolicyFile = EXAMPLE_BATCH_POLICY

  assert.equal(policy.name, 'safe-ci')
  assert.equal(policy.approvals?.tools?.read_file, 'allow')
  assert.equal(policy.approvals?.tools?.write_file, 'deny')
  assert.deepEqual(policy.paths?.write?.allow, ['reports/**'])
  assert.deepEqual(policy.commands?.allow, ['npm', 'node'])
  assert.equal(policy.limits?.maxSteps, 12)
  assert.equal(policy.limits?.maxToolCalls, 4)
  assert.equal(policy.limits?.runTimeoutMs, 120_000)
  assert.equal(policy.limits?.commandTimeoutMs, 30_000)
  assert.equal(policy.limits?.commandOutputBytes, 32_000)
  assert.equal(policy.output?.mode, 'json')
  assert.equal(policy.output?.includeMetadata, true)
})

test('loadBatchPolicy returns default policy when default file is absent', async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'daycli-policy-default-'))
  t.after(async () => {
    await rm(workspace, {recursive: true, force: true})
  })

  const loaded = await loadBatchPolicy(workspace)

  assert.equal(loaded.source, 'default')
  assert.equal(loaded.path, path.join(workspace, DEFAULT_BATCH_POLICY_FILE))
  assert.deepEqual(loaded.policy, DEFAULT_BATCH_POLICY)
})

test('loadBatchPolicy loads and normalizes a workspace policy file', async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'daycli-policy-load-'))
  t.after(async () => {
    await rm(workspace, {recursive: true, force: true})
  })

  await writeFile(
    path.join(workspace, DEFAULT_BATCH_POLICY_FILE),
    JSON.stringify({
      version: 1,
      approvals: {
        tools: {
          run_command: 'allow',
        },
      },
      commands: {
        allow: ['npm'],
      },
      output: {
        mode: 'json',
      },
    }),
    'utf8',
  )

  const loaded = await loadBatchPolicy(workspace)

  assert.equal(loaded.source, 'file')
  assert.equal(loaded.policy.approvals?.default, 'deny')
  assert.equal(loaded.policy.approvals?.tools?.run_command, 'allow')
  assert.deepEqual(loaded.policy.commands?.allow, ['npm'])
  assert.ok(loaded.policy.commands?.deny?.includes('rm'))
  assert.equal(loaded.policy.output?.mode, 'json')
  assert.equal(loaded.policy.output?.includeSessionId, true)
})

test('loadBatchPolicy reports explicit missing files with POLICY_NOT_FOUND', async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'daycli-policy-missing-'))
  t.after(async () => {
    await rm(workspace, {recursive: true, force: true})
  })

  await assert.rejects(
    () => loadBatchPolicy(workspace, {policyPath: 'missing-policy.json'}),
    (error: unknown) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.code, 'POLICY_NOT_FOUND')
      assert.match(error.message, /Policy file not found/)
      assert.equal(error.meta?.path, path.join(workspace, 'missing-policy.json'))
      return true
    },
  )
})

test('loadBatchPolicy reports malformed JSON with POLICY_INVALID', async t => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'daycli-policy-json-'))
  t.after(async () => {
    await rm(workspace, {recursive: true, force: true})
  })

  await writeFile(path.join(workspace, DEFAULT_BATCH_POLICY_FILE), '{not-json', 'utf8')

  await assert.rejects(
    () => loadBatchPolicy(workspace),
    (error: unknown) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.code, 'POLICY_INVALID')
      assert.match(error.message, /Invalid JSON in policy file/)
      return true
    },
  )
})

test('validateBatchPolicy reports schema violations with precise pointers', () => {
  assert.throws(
    () => validateBatchPolicy({version: 1, limits: {maxSteps: 0}}, 'inline-policy'),
    (error: unknown) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.code, 'POLICY_INVALID')
      assert.equal(error.meta?.pointer, 'limits.maxSteps')
      assert.match(error.message, /integer >= 1/)
      return true
    },
  )

  assert.throws(
    () => validateBatchPolicy({version: 1, commands: {allow: ['npm', '']}}, 'inline-policy'),
    (error: unknown) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.code, 'POLICY_INVALID')
      assert.equal(error.meta?.pointer, 'commands.allow[1]')
      return true
    },
  )
})

test('resolveBatchPolicyPath rejects paths outside the workspace', () => {
  assert.throws(
    () => resolveBatchPolicyPath('/workspace/project', '../outside.json'),
    (error: unknown) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.code, 'POLICY_INVALID')
      assert.match(error.message, /must stay inside the workspace/)
      return true
    },
  )
})
