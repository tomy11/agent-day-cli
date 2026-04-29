import {AppError} from '../errors'

export type BatchApprovalMode = 'interactive' | 'deny_high_risk_without_policy'
export type BatchOutputMode = 'plain' | 'rich'

export interface BatchModeContract {
  command: 'run'
  flag: '--batch'
  description: string
  supportedOutputModes: readonly ['plain']
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
}

export const BATCH_MODE_CLI_CONTRACT: BatchModeContract = {
  command: 'run',
  flag: '--batch',
  description: 'Run one task in non-interactive mode for scripts and CI.',
  supportedOutputModes: ['plain'],
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
    }
  }

  if (input.output !== 'plain') {
    throw new AppError(
      'CONFIG_INVALID',
      'Batch mode currently supports only --output plain. JSON and CI output modes are planned for M10.',
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
    output: 'plain',
    approvalMode: 'deny_high_risk_without_policy',
    useRichOutput: false,
  }
}
