import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BATCH_MODE_CLI_CONTRACT,
  resolveBatchMode,
} from '../../core/batch'
import {AppError} from '../../core/errors'

test('batch mode contract defines non-interactive run behavior', () => {
  assert.equal(BATCH_MODE_CLI_CONTRACT.command, 'run')
  assert.equal(BATCH_MODE_CLI_CONTRACT.flag, '--batch')
  assert.deepEqual(BATCH_MODE_CLI_CONTRACT.supportedOutputModes, ['plain'])
  assert.equal(BATCH_MODE_CLI_CONTRACT.nonInteractiveBehavior.promptForApproval, false)
  assert.equal(BATCH_MODE_CLI_CONTRACT.nonInteractiveBehavior.highRiskToolDefault, 'deny_without_policy')
  assert.equal(BATCH_MODE_CLI_CONTRACT.nonInteractiveBehavior.richUi, false)
  assert.equal(BATCH_MODE_CLI_CONTRACT.nonInteractiveBehavior.sessionPersistence, true)
})

test('resolveBatchMode preserves interactive output when batch is disabled', () => {
  assert.deepEqual(resolveBatchMode({batch: false, output: 'rich'}), {
    enabled: false,
    nonInteractive: false,
    output: 'rich',
    approvalMode: 'interactive',
    useRichOutput: true,
  })
})

test('resolveBatchMode forces non-interactive plain output for batch mode', () => {
  assert.deepEqual(resolveBatchMode({batch: true, output: 'plain'}), {
    enabled: true,
    nonInteractive: true,
    output: 'plain',
    approvalMode: 'deny_high_risk_without_policy',
    useRichOutput: false,
  })
})

test('resolveBatchMode rejects rich output in batch mode', () => {
  assert.throws(
    () => resolveBatchMode({batch: true, output: 'rich'}),
    (error: unknown) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.code, 'CONFIG_INVALID')
      assert.match(error.message, /supports only --output plain/)
      return true
    },
  )
})
