import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_SAFETY_POLICY,
  SafetyPolicyViolation,
  assertCommandAllowedByPolicy,
  assertPathAllowedByPolicy,
  resolveToolPathAccess,
  resolveToolRiskLevel,
} from '../../core/security'

test('default safety policy assigns risk levels and path access for tool families', () => {
  assert.equal(resolveToolRiskLevel('read_file', 'high'), 'low')
  assert.equal(resolveToolRiskLevel('write_file', 'low'), 'high')
  assert.equal(resolveToolRiskLevel('edit_file', 'low'), 'high')
  assert.equal(resolveToolRiskLevel('run_command', 'low'), 'high')

  assert.equal(resolveToolPathAccess('read_file'), 'read')
  assert.equal(resolveToolPathAccess('write_file'), 'write')
  assert.equal(resolveToolPathAccess('edit_file'), 'write')
  assert.equal(resolveToolPathAccess('run_command'), 'execute')
})

test('default safety policy denies writes to generated and dependency directories', () => {
  assert.throws(
    () =>
      assertPathAllowedByPolicy({
        candidatePath: 'dist/index.js',
        workspaceRoot: process.cwd(),
        access: 'write',
      }),
    (error: unknown) => {
      assert.ok(error instanceof SafetyPolicyViolation)
      assert.match(error.message, /Path is denied for write/)
      return true
    },
  )
})

test('path policy can restrict writes to explicit workspace subtrees', () => {
  const policy = {
    ...DEFAULT_SAFETY_POLICY,
    paths: {
      ...DEFAULT_SAFETY_POLICY.paths,
      write: {
        allow: ['src/**'],
      },
    },
  }

  assert.doesNotThrow(() => {
    assertPathAllowedByPolicy({
      candidatePath: 'src/index.ts',
      workspaceRoot: process.cwd(),
      access: 'write',
      policy,
    })
  })

  assert.throws(
    () =>
      assertPathAllowedByPolicy({
        candidatePath: 'README.md',
        workspaceRoot: process.cwd(),
        access: 'write',
        policy,
      }),
    (error: unknown) => {
      assert.ok(error instanceof SafetyPolicyViolation)
      assert.match(error.message, /Path is not allowed for write/)
      return true
    },
  )
})

test('command policy denies dangerous commands and supports allow lists', () => {
  assert.throws(
    () => assertCommandAllowedByPolicy({command: '/bin/rm'}),
    (error: unknown) => {
      assert.ok(error instanceof SafetyPolicyViolation)
      assert.match(error.message, /Command is denied: rm/)
      return true
    },
  )

  const policy = {
    ...DEFAULT_SAFETY_POLICY,
    commands: {
      allow: ['npm'],
      deny: ['git'],
    },
  }

  assert.doesNotThrow(() => {
    assertCommandAllowedByPolicy({
      command: 'npm',
      policy,
    })
  })

  assert.throws(
    () =>
      assertCommandAllowedByPolicy({
        command: 'node',
        policy,
      }),
    (error: unknown) => {
      assert.ok(error instanceof SafetyPolicyViolation)
      assert.match(error.message, /Command is not allowed: node/)
      return true
    },
  )

  assert.throws(
    () =>
      assertCommandAllowedByPolicy({
        command: 'git',
        policy,
      }),
    (error: unknown) => {
      assert.ok(error instanceof SafetyPolicyViolation)
      assert.match(error.message, /Command is denied: git/)
      return true
    },
  )
})
