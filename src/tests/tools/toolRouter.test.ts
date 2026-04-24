import test from 'node:test'
import assert from 'node:assert/strict'
import {ToolRouter} from '../../core/tools'
import {AppError} from '../../core/errors'
import type {ToolDefinition} from '../../core/tools'

test('ToolRouter registers and resolves tool', () => {
  const router = new ToolRouter()
  const tool: ToolDefinition = {
    name: 'echo',
    description: 'echo tool',
    riskLevel: 'low',
    async execute(input) {
      return input
    },
  }

  router.register(tool)

  const resolved = router.resolve({name: 'echo'})
  assert.equal(resolved.name, 'echo')
})

test('ToolRouter rejects duplicate registration', () => {
  const router = new ToolRouter()
  const tool: ToolDefinition = {
    name: 'echo',
    description: 'echo tool',
    riskLevel: 'low',
    async execute() {
      return 'ok'
    },
  }

  router.register(tool)

  assert.throws(() => router.register(tool), /Tool already registered: echo/)
})

test('ToolRouter returns coded error for unknown tool', () => {
  const router = new ToolRouter()

  assert.throws(
    () => router.resolve({name: 'missing'}),
    (error: unknown) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.code, 'TOOL_UNKNOWN')
      return true
    },
  )
})
