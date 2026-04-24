import {Args, Command} from '@oclif/core'
import {DAYCLI_CONFIG_FILE, loadDaycliConfig, saveDaycliConfig} from '../core/config'

export default class Config extends Command {
  static override description = 'Manage daycli configuration'

  static override args = {
    action: Args.string({
      description: 'Config action',
      required: true,
      options: ['set'],
    }),
    key: Args.string({
      description: 'Config key (ollama.model | ollama.baseUrl | ollama.timeoutMs)',
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
      case 'ollama.model': {
        config.ollama = {
          ...config.ollama,
          model: args.value,
        }
        break
      }
      case 'ollama.baseUrl': {
        config.ollama = {
          ...config.ollama,
          baseUrl: args.value,
        }
        break
      }
      case 'ollama.timeoutMs': {
        const timeoutMs = Number(args.value)
        if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
          this.error('ollama.timeoutMs must be a non-negative number', {exit: 1})
        }

        config.ollama = {
          ...config.ollama,
          timeoutMs,
        }
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
