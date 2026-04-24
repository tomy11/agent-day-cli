import {readFile, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {AppError} from '../errors'

export const DAYCLI_CONFIG_FILE = 'daycli.config.json'

export interface DaycliConfig {
  ollama?: {
    model?: string
    baseUrl?: string
    timeoutMs?: number
  }
}

export interface RunSettings {
  model: string
  baseUrl: string
  timeoutMs: number
}

export interface RunFlagOverrides {
  model?: string
  baseUrl?: string
  timeoutMs?: number
}

const DEFAULT_RUN_SETTINGS: RunSettings = {
  model: 'llama3.1',
  baseUrl: 'http://localhost:11434',
  timeoutMs: 180_000,
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
  const timeoutFromConfig = config.ollama?.timeoutMs
  const timeout = overrides.timeoutMs ?? timeoutFromConfig ?? DEFAULT_RUN_SETTINGS.timeoutMs

  if (!Number.isFinite(timeout) || timeout < 0) {
    throw new AppError('CONFIG_INVALID', 'Invalid timeoutMs: must be a non-negative number')
  }

  return {
    model: overrides.model ?? config.ollama?.model ?? DEFAULT_RUN_SETTINGS.model,
    baseUrl: overrides.baseUrl ?? config.ollama?.baseUrl ?? DEFAULT_RUN_SETTINGS.baseUrl,
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

  if (candidate.ollama === undefined) {
    return {}
  }

  if (!candidate.ollama || typeof candidate.ollama !== 'object' || Array.isArray(candidate.ollama)) {
    throw new AppError('CONFIG_INVALID', `Invalid ${DAYCLI_CONFIG_FILE}: "ollama" must be an object`)
  }

  const {model, baseUrl, timeoutMs} = candidate.ollama

  if (model !== undefined && typeof model !== 'string') {
    throw new AppError('CONFIG_INVALID', `Invalid ${DAYCLI_CONFIG_FILE}: "ollama.model" must be a string`)
  }

  if (baseUrl !== undefined && typeof baseUrl !== 'string') {
    throw new AppError('CONFIG_INVALID', `Invalid ${DAYCLI_CONFIG_FILE}: "ollama.baseUrl" must be a string`)
  }

  if (
    timeoutMs !== undefined &&
    (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs < 0)
  ) {
    throw new AppError(
      'CONFIG_INVALID',
      `Invalid ${DAYCLI_CONFIG_FILE}: "ollama.timeoutMs" must be a non-negative number`,
    )
  }

  return {
    ollama: {
      ...(model !== undefined ? {model} : {}),
      ...(baseUrl !== undefined ? {baseUrl} : {}),
      ...(timeoutMs !== undefined ? {timeoutMs} : {}),
    },
  }
}
