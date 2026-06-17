import {Args, Command} from '@oclif/core'
import {DAYCLI_CONFIG_FILE, loadDaycliConfig, saveDaycliConfig} from '../core/config'
import type {ProviderConfig, DaycliConfig} from '../core/config'
import {formatProviderTypes, isProviderType, type ProviderType} from '../core/providers'

export default class Config extends Command {
  static override description = 'Manage daycli configuration'

  static override args = {
    action: Args.string({
      description: 'Config action',
      required: true,
      options: ['set'],
    }),
    key: Args.string({
      description: 'Config key (provider.type | <provider>.model | <provider>.baseUrl | <provider>.timeoutMs)',
      required: true,
    }),
    value: Args.string({
      description: 'Value to set',
      required: true,
    }),
  }

  public async run(): Promise<void> {
    const {args} = await this.parse(Config)

    if (args.action !== 'set') {
      this.error(`Unsupported action: ${args.action}`, {exit: 1})
    }

    const workspaceRoot = process.cwd()
    const config = await loadDaycliConfig(workspaceRoot)

    switch (args.key) {
      case 'provider.type': {
        if (!isProviderType(args.value)) {
          this.error(`provider.type must be one of: ${formatProviderTypes()}`, {exit: 1})
        }

        config.provider = {
          ...config.provider,
          type: args.value,
        }
        break
      }
      case 'ollama.model': {
        setProviderValue(config, 'ollama', 'model', args.value)
        break
      }
      case 'ollama.baseUrl': {
        setProviderValue(config, 'ollama', 'baseUrl', args.value)
        break
      }
      case 'ollama.timeoutMs': {
        setProviderTimeout(config, 'ollama', args.value, this)
        break
      }
      case 'openai.model': {
        setProviderValue(config, 'openai', 'model', args.value)
        break
      }
      case 'openai.baseUrl': {
        setProviderValue(config, 'openai', 'baseUrl', args.value)
        break
      }
      case 'openai.timeoutMs': {
        setProviderTimeout(config, 'openai', args.value, this)
        break
      }
      case 'anthropic.model': {
        setProviderValue(config, 'anthropic', 'model', args.value)
        break
      }
      case 'anthropic.baseUrl': {
        setProviderValue(config, 'anthropic', 'baseUrl', args.value)
        break
      }
      case 'anthropic.timeoutMs': {
        setProviderTimeout(config, 'anthropic', args.value, this)
        break
      }
      case 'openrouter.model': {
        setProviderValue(config, 'openrouter', 'model', args.value)
        break
      }
      case 'openrouter.baseUrl': {
        setProviderValue(config, 'openrouter', 'baseUrl', args.value)
        break
      }
      case 'openrouter.timeoutMs': {
        setProviderTimeout(config, 'openrouter', args.value, this)
        break
      }
      case 'gemini.model': {
        setProviderValue(config, 'gemini', 'model', args.value)
        break
      }
      case 'gemini.baseUrl': {
        setProviderValue(config, 'gemini', 'baseUrl', args.value)
        break
      }
      case 'gemini.timeoutMs': {
        setProviderTimeout(config, 'gemini', args.value, this)
        break
      }
      case 'mistral.model': {
        setProviderValue(config, 'mistral', 'model', args.value)
        break
      }
      case 'mistral.baseUrl': {
        setProviderValue(config, 'mistral', 'baseUrl', args.value)
        break
      }
      case 'mistral.timeoutMs': {
        setProviderTimeout(config, 'mistral', args.value, this)
        break
      }
      default: {
        this.error(`Unsupported key: ${args.key}`, {exit: 1})
      }
    }

    await saveDaycliConfig(workspaceRoot, config)
    this.log(`Updated ${DAYCLI_CONFIG_FILE}: ${args.key}=${args.value}`)
  }
}

function setProviderValue(
  config: DaycliConfig,
  provider: ProviderType,
  key: 'model' | 'baseUrl',
  value: string,
): void {
  config[provider] = {
    ...config[provider],
    [key]: value,
  } as ProviderConfig
}

function setProviderTimeout(
  config: DaycliConfig,
  provider: ProviderType,
  value: string,
  command: Command,
): void {
  const timeoutMs = Number(value)
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    command.error(`${provider}.timeoutMs must be a non-negative number`, {exit: 1})
  }

  config[provider] = {
    ...config[provider],
    timeoutMs,
  }
}
