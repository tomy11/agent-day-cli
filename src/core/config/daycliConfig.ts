import {readFile, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {AppError} from '../errors'
import {formatProviderTypes, isProviderType, type ProviderSettings, type ProviderType} from '../providers'

export const DAYCLI_CONFIG_FILE = 'daycli.config.json'

export interface ProviderConfig {
  model?: string
  baseUrl?: string
  timeoutMs?: number
}

export interface DaycliConfig {
  provider?: {
    type?: ProviderType
  }
  ollama?: ProviderConfig
  openai?: ProviderConfig
  anthropic?: ProviderConfig
  openrouter?: ProviderConfig
  gemini?: ProviderConfig
  mistral?: ProviderConfig
}

export type RunSettings = ProviderSettings

export interface RunFlagOverrides {
  providerType?: ProviderType
  model?: string
  baseUrl?: string
  timeoutMs?: number
}

const DEFAULT_PROVIDER_SETTINGS: Record<ProviderType, Omit<ProviderSettings, 'type'>> = {
  ollama: {
    model: 'llama3.1',
    baseUrl: 'http://localhost:11434',
    timeoutMs: 180_000,
  },
  openai: {
    model: 'gpt-4.1-mini',
    baseUrl: 'https://api.openai.com/v1',
    timeoutMs: 180_000,
  },
  anthropic: {
    model: 'claude-3-5-sonnet-latest',
    baseUrl: 'https://api.anthropic.com',
    timeoutMs: 180_000,
  },
  openrouter: {
    model: 'openai/gpt-4.1-mini',
    baseUrl: 'https://openrouter.ai/api/v1',
    timeoutMs: 180_000,
  },
  gemini: {
    model: 'gemini-3.5-flash',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    timeoutMs: 180_000,
  },
  mistral: {
    model: 'mistral-large-latest',
    baseUrl: 'https://api.mistral.ai/v1',
    timeoutMs: 180_000,
  },
}

export async function loadDaycliConfig(workspaceRoot: string): Promise<DaycliConfig> {
  const configPath = getDaycliConfigPath(workspaceRoot)

  try {
    const raw = await readFile(configPath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    return validateConfig(parsed)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {}
    }

    if (error instanceof SyntaxError) {
      throw new AppError('CONFIG_INVALID', `Invalid JSON in ${DAYCLI_CONFIG_FILE}: ${error.message}`, {
        cause: error,
      })
    }

    if (error instanceof AppError) {
      throw error
    }

    throw new AppError('CONFIG_IO_ERROR', `Failed to load ${DAYCLI_CONFIG_FILE}`, {cause: error})
  }
}

export async function saveDaycliConfig(workspaceRoot: string, config: DaycliConfig): Promise<void> {
  const configPath = getDaycliConfigPath(workspaceRoot)
  const normalized = validateConfig(config)
  try {
    await writeFile(configPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
  } catch (error) {
    throw new AppError('CONFIG_IO_ERROR', `Failed to save ${DAYCLI_CONFIG_FILE}`, {cause: error})
  }
}

export function resolveRunSettings(config: DaycliConfig, overrides: RunFlagOverrides): RunSettings {
  const type = overrides.providerType ?? config.provider?.type ?? 'ollama'
  const providerConfig = config[type]
  const defaults = DEFAULT_PROVIDER_SETTINGS[type]
  const timeout = overrides.timeoutMs ?? providerConfig?.timeoutMs ?? defaults.timeoutMs

  if (!Number.isFinite(timeout) || timeout < 0) {
    throw new AppError('CONFIG_INVALID', 'Invalid timeoutMs: must be a non-negative number')
  }

  return {
    type,
    model: overrides.model ?? providerConfig?.model ?? defaults.model,
    baseUrl: overrides.baseUrl ?? providerConfig?.baseUrl ?? defaults.baseUrl,
    timeoutMs: timeout,
  }
}

function getDaycliConfigPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, DAYCLI_CONFIG_FILE)
}

function validateConfig(input: unknown): DaycliConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AppError('CONFIG_INVALID', `Invalid ${DAYCLI_CONFIG_FILE}: root must be an object`)
  }

  const candidate = input as DaycliConfig

  const provider = validateProviderSelector(candidate.provider)
  const ollama = validateProviderConfig(candidate.ollama, 'ollama')
  const openai = validateProviderConfig(candidate.openai, 'openai')
  const anthropic = validateProviderConfig(candidate.anthropic, 'anthropic')
  const openrouter = validateProviderConfig(candidate.openrouter, 'openrouter')
  const gemini = validateProviderConfig(candidate.gemini, 'gemini')
  const mistral = validateProviderConfig(candidate.mistral, 'mistral')

  return {
    ...(provider !== undefined ? {provider} : {}),
    ...(ollama !== undefined ? {ollama} : {}),
    ...(openai !== undefined ? {openai} : {}),
    ...(anthropic !== undefined ? {anthropic} : {}),
    ...(openrouter !== undefined ? {openrouter} : {}),
    ...(gemini !== undefined ? {gemini} : {}),
    ...(mistral !== undefined ? {mistral} : {}),
  }
}

function validateProviderSelector(input: DaycliConfig['provider']): DaycliConfig['provider'] | undefined {
  if (input === undefined) {
    return undefined
  }

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AppError('CONFIG_INVALID', `Invalid ${DAYCLI_CONFIG_FILE}: "provider" must be an object`)
  }

  if (input.type !== undefined && !isProviderType(input.type)) {
    throw new AppError(
      'CONFIG_INVALID',
      `Invalid ${DAYCLI_CONFIG_FILE}: "provider.type" must be one of ${formatProviderTypes()}`,
    )
  }

  return {
    ...(input.type !== undefined ? {type: input.type} : {}),
  }
}

function validateProviderConfig(input: ProviderConfig | undefined, key: ProviderType): ProviderConfig | undefined {
  if (input === undefined) {
    return undefined
  }

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AppError('CONFIG_INVALID', `Invalid ${DAYCLI_CONFIG_FILE}: "${key}" must be an object`)
  }

  const {model, baseUrl, timeoutMs} = input

  if (model !== undefined && typeof model !== 'string') {
    throw new AppError('CONFIG_INVALID', `Invalid ${DAYCLI_CONFIG_FILE}: "${key}.model" must be a string`)
  }

  if (baseUrl !== undefined && typeof baseUrl !== 'string') {
    throw new AppError('CONFIG_INVALID', `Invalid ${DAYCLI_CONFIG_FILE}: "${key}.baseUrl" must be a string`)
  }

  if (
    timeoutMs !== undefined &&
    (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs < 0)
  ) {
    throw new AppError(
      'CONFIG_INVALID',
      `Invalid ${DAYCLI_CONFIG_FILE}: "${key}.timeoutMs" must be a non-negative number`,
    )
  }

  return {
    ...(model !== undefined ? {model} : {}),
    ...(baseUrl !== undefined ? {baseUrl} : {}),
    ...(timeoutMs !== undefined ? {timeoutMs} : {}),
  }
}
