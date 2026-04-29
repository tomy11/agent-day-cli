import test from 'node:test'
import assert from 'node:assert/strict'
import {WorkspacePathGuard} from '../../core/security'
import {AppError} from '../../core/errors'
import type {ToolDefinition} from '../../core/tools'

const tool: ToolDefinition = {
  name: 'read_file',
  description: 'read file',
  riskLevel: 'low',
  extractPaths(input) {
    const payload = input as {path: string}
    return [payload.path]
  },
  async execute() {
    return 'ok'
  },
}

test('WorkspacePathGuard allows workspace path', () => {
  const guard = new WorkspacePathGuard()
  const workspaceRoot = process.cwd()

  assert.doesNotThrow(() => {
    guard.assertAllowed(tool, {path: 'TASKS.md'}, {workspaceRoot})
  })
})

test('WorkspacePathGuard blocks path outside workspace', () => {
  const guard = new WorkspacePathGuard()
  const workspaceRoot = process.cwd()

  assert.throws(
    () => guard.assertAllowed(tool, {path: '/etc/hosts'}, {workspaceRoot}),
    (error: unknown) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.code, 'TOOL_PATH_BLOCKED')
      return true
    },
  )
})

test('WorkspacePathGuard applies write path policy for mutation tools', () => {
  const guard = new WorkspacePathGuard()
  const workspaceRoot = process.cwd()
  const writeTool: ToolDefinition = {
    name: 'write_file',
    description: 'write file',
    riskLevel: 'high',
    extractPaths(input) {
      const payload = input as {path: string}
      return [payload.path]
    },
    async execute() {
      return 'ok'
    },
  }

  assert.throws(
    () => guard.assertAllowed(writeTool, {path: 'dist/generated.js'}, {workspaceRoot}),
    (error: unknown) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.code, 'TOOL_PATH_BLOCKED')
      assert.equal(error.meta?.access, 'write')
      return true
    },
  )
})
