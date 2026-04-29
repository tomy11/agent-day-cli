import {AppError} from '../errors'

export type BatchApprovalMode = 'interactive' | 'policy'
export type BatchOutputMode = 'plain' | 'rich' | 'json'

export interface BatchModeContract {
  command: 'run'
  flag: '--batch'
  description: string
  supportedOutputModes: readonly ['plain', 'json']
  nonInteractiveBehavior: {
    promptForApproval: false
    highRiskToolDefault: 'deny_without_policy'
    richUi: false
    sessionPersistence: true
  }
}

export interface ResolveBatchModeInput {
  batch?: boolean
  output: BatchOutputMode
}

export interface ResolvedBatchMode {
  enabled: boolean
  nonInteractive: boolean
  output: BatchOutputMode
  approvalMode: BatchApprovalMode
  useRichOutput: boolean
  useJsonOutput: boolean
}

export const BATCH_MODE_CLI_CONTRACT: BatchModeContract = {
  command: 'run',
  flag: '--batch',
  description: 'Run one task in non-interactive mode for scripts and CI.',
  supportedOutputModes: ['plain', 'json'],
  nonInteractiveBehavior: {
    promptForApproval: false,
    highRiskToolDefault: 'deny_without_policy',
    richUi: false,
    sessionPersistence: true,
  },
}

export function resolveBatchMode(input: ResolveBatchModeInput): ResolvedBatchMode {
  const enabled = input.batch === true

  if (!enabled) {
    return {
      enabled: false,
      nonInteractive: false,
      output: input.output,
      approvalMode: 'interactive',
      useRichOutput: input.output === 'rich',
      useJsonOutput: false,
    }
  }

  if (input.output === 'rich') {
    throw new AppError(
      'CONFIG_INVALID',
      'Batch mode does not support --output rich. Use plain or json.',
      {
        meta: {
          flag: BATCH_MODE_CLI_CONTRACT.flag,
          output: input.output,
        },
      },
    )
  }

  return {
    enabled: true,
    nonInteractive: true,
    output: input.output,
    approvalMode: 'policy',
    useRichOutput: false,
    useJsonOutput: input.output === 'json',
  }
}
