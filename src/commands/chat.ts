import React from 'react'
import {Command, Flags} from '@oclif/core'
import {render} from 'ink'
import {loadDaycliConfig, resolveRunSettings} from '../core/config'
import {toAppError} from '../core/errors'
import {createLogger} from '../core/observability'
import {OllamaProvider} from '../core/providers'
import {SessionStore, type SessionMessageRole} from '../core/storage'
import {buildWorkspaceSummary} from '../core/workspace'
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
      const sessionStore = new SessionStore(workspaceRoot)
      const session = await sessionStore.create({
        kind: 'chat',
        title: 'Interactive chat',
        workspaceRoot,
        model: settings.model,
        metadata: {
          command: 'chat',
          hasCustomSystemPrompt: flags.system !== undefined,
        },
      })
      logger.info('session.created', 'chat session created', {
        sessionId: session.id,
      })

      const systemPromptParts: string[] = []
      if (flags.system) {
        systemPromptParts.push(flags.system)
      }

      try {
        const snapshot = await buildWorkspaceSummary(workspaceRoot)
        systemPromptParts.push(
          [
            'You are an interactive coding assistant running inside the current workspace.',
            'Use this workspace snapshot to answer project-structure questions directly without asking users to paste file trees again.',
            'If information is not visible in this snapshot, state that limitation clearly and ask a focused follow-up question.',
            `Workspace snapshot (entries=${snapshot.entryCount}, truncated=${snapshot.truncated ? 'yes' : 'no'}):`,
            snapshot.summary,
          ].join('\n'),
        )
        logger.info('workspace.snapshot.ready', 'workspace summary prepared for chat', {
          entries: snapshot.entryCount,
          truncated: snapshot.truncated,
        })
      } catch (error) {
        logger.warn('workspace.snapshot.failed', 'workspace summary unavailable; continuing without snapshot', {
          error: error instanceof Error ? error.message : String(error),
        })
      }

      const app = render(
        React.createElement(ChatApp, {
          model: settings.model,
          provider,
          systemPrompt: systemPromptParts.length > 0 ? systemPromptParts.join('\n\n') : undefined,
          sessionId: session.id,
          persistMessage: async message => {
            try {
              await sessionStore.appendMessage(session.id, {
                role: toSessionMessageRole(message.role),
                content: message.content,
              })
              logger.debug('session.message.persisted', 'chat message persisted', {
                sessionId: session.id,
                role: message.role,
              })
            } catch (error) {
              logger.warn('session.message.failed', 'failed to persist chat message', {
                sessionId: session.id,
                role: message.role,
                error: error instanceof Error ? error.message : String(error),
              })
            }
          },
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

function toSessionMessageRole(role: 'system' | 'user' | 'assistant'): SessionMessageRole {
  return role
}
