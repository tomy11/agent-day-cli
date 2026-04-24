import test from 'node:test'
import assert from 'node:assert/strict'
import {SafeExecutor} from '../../core/execution'
import {ToolRouter} from '../../core/tools'
import {AppError} from '../../core/errors'
import type {ToolDefinition} from '../../core/tools'

function createHighRiskTool(): ToolDefinition {
  return {
    name: 'danger',
    description: 'high risk tool',
    riskLevel: 'high',
    async execute() {
      return 'done'
    },
  }
}

test('SafeExecutor requires approval manager for high risk tools', async () => {
  const router = new ToolRouter()
  router.register(createHighRiskTool())

  const executor = new SafeExecutor({toolRouter: router})

  await assert.rejects(
    () => executor.execute({name: 'danger'}, {workspaceRoot: process.cwd()}),
    (error: unknown) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.code, 'TOOL_APPROVAL_REQUIRED')
      return true
    },
  )
})

test('SafeExecutor returns approval rejected error', async () => {
  const router = new ToolRouter()
  router.register(createHighRiskTool())

  const executor = new SafeExecutor({
    toolRouter: router,
    approvalManager: {
      async requestToolApproval() {
        return false
      },
    },
  })

  await assert.rejects(
    () => executor.execute({name: 'danger'}, {workspaceRoot: process.cwd()}),
    (error: unknown) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.code, 'TOOL_APPROVAL_REJECTED')
      return true
    },
  )
})

test('SafeExecutor executes low-risk tool without approval', async () => {
  const router = new ToolRouter()
  router.register({
    name: 'ping',
    description: 'low risk tool',
    riskLevel: 'low',
    async execute() {
      return 'pong'
    },
  })

  const executor = new SafeExecutor({toolRouter: router})
  const result = await executor.execute({name: 'ping'}, {workspaceRoot: process.cwd()})

  assert.equal(result.toolName, 'ping')
  assert.equal(result.output, 'pong')
})
