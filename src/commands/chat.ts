import React from 'react'
import {Command, Flags} from '@oclif/core'
import {render} from 'ink'
import {loadDaycliConfig, resolveRunSettings} from '../core/config'
import {toAppError} from '../core/errors'
import {createLogger} from '../core/observability'
import {OllamaProvider} from '../core/providers'
import {ChatApp} from '../ui'

export default class Chat extends Command {
  static override description = 'Start interactive chat session'

  static override flags = {
    model: Flags.string({
      description: 'Ollama model name (overrides daycli.config.json)',
    }),
    'base-url': Flags.string({
      description: 'Ollama base URL (overrides daycli.config.json)',
    }),
    'timeout-ms': Flags.integer({
      description: 'Ollama request timeout in milliseconds (0 to disable timeout, overrides config)',
      min: 0,
    }),
    system: Flags.string({
      description: 'Optional system prompt',
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(Chat)
    const logger = createLogger({command: 'chat'})

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      this.log('daycli chat: scaffold ready')
      return
    }

    try {
      const workspaceRoot = process.cwd()
      const config = await loadDaycliConfig(workspaceRoot)
      const settings = resolveRunSettings(config, {
        model: flags.model,
        baseUrl: flags['base-url'],
        timeoutMs: flags['timeout-ms'],
      })

      const provider = new OllamaProvider({
        model: settings.model,
        baseUrl: settings.baseUrl,
        timeoutMs: settings.timeoutMs,
      })

      const app = render(
        React.createElement(ChatApp, {
          model: settings.model,
          provider,
          systemPrompt: flags.system,
        }),
      )
      await app.waitUntilExit()
    } catch (error) {
      const appError = toAppError(error)
      logger.error('command.error', appError.message, {
        code: appError.code,
        ...(appError.meta ?? {}),
      })
      this.error(`[${appError.code}] ${appError.message}`, {exit: 1})
    }
  }
}
