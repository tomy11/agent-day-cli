import React from 'react'
import {Args, Command, Flags} from '@oclif/core'
import {render} from 'ink'
import {createAgentBackedProvider, persistAgentToolResults, type AgentEvent} from '../../core/agent'
import {loadDaycliConfig, resolveRunSettings} from '../../core/config'
import {SafeExecutor} from '../../core/execution'
import {toAppError} from '../../core/errors'
import {createLogger} from '../../core/observability'
import {createProvider} from '../../core/providers'
import {InteractiveApprovalManager, WorkspacePathGuard} from '../../core/security'
import {SessionStore, type SessionMessageRole, type SessionRecord} from '../../core/storage'
import {buildToolSystemPrompt, createDefaultToolRouter} from '../../core/tools'
import {buildWorkspaceSummary} from '../../core/workspace'
import {ChatApp} from '../../ui'

export default class SessionResume extends Command {
  static override description = 'Resume a session by id'

  static override args = {
    id: Args.string({
      description: 'Session id',
      required: true,
    }),
  }

  static override flags = {
    model: Flags.string({
      description: 'Provider model name (overrides stored session and daycli.config.json)',
    }),
    'base-url': Flags.string({
      description: 'Provider base URL (overrides daycli.config.json)',
    }),
    'timeout-ms': Flags.integer({
      description: 'Provider request timeout in milliseconds (0 to disable timeout, overrides config)',
      min: 0,
    }),
    system: Flags.string({
      description: 'Optional extra system prompt for the resumed chat',
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(SessionResume)
    const logger = createLogger({command: 'session resume'})
    const workspaceRoot = process.cwd()
    const sessionStore = new SessionStore(workspaceRoot)

    try {
      const session = await sessionStore.get(args.id)

      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        this.log(formatResumeSummary(session))
        return
      }

      const config = await loadDaycliConfig(workspaceRoot)
      const settings = resolveRunSettings(config, {
        model: flags.model ?? session.model,
        baseUrl: flags['base-url'],
        timeoutMs: flags['timeout-ms'],
      })

      const router = createDefaultToolRouter()
      const provider = createProvider(settings, {
        tools: router.list(),
      })
      const executor = new SafeExecutor({
        toolRouter: router,
        pathGuard: new WorkspacePathGuard(),
        approvalManager: new InteractiveApprovalManager(),
      })
      const chatProvider = createAgentBackedProvider({
        provider,
        toolExecutor: executor,
        toolContext: {
          workspaceRoot,
        },
        limits: {
          timeoutMs: settings.timeoutMs,
        },
        onEvent: event => {
          logAgentEvent(logger, event, {sessionId: session.id})
        },
        onResult: result => {
          logger.info('agent.chat.done', 'resumed chat agent turn completed', {
            sessionId: session.id,
            stoppedReason: result.stoppedReason,
            stepCount: result.steps.length,
            toolResultCount: result.toolResults.length,
          })
          void persistAgentToolResults({
            sessionStore,
            sessionId: session.id,
            result,
          }).catch(error => {
            logger.warn('session.agent_tools.failed', 'failed to persist resumed chat agent tool results', {
              sessionId: session.id,
              error: error instanceof Error ? error.message : String(error),
            })
          })
        },
      })

      if (session.status !== 'active') {
        await sessionStore.updateStatus(session.id, 'active')
      }

      const systemPromptParts: string[] = [
        buildToolSystemPrompt(router.list()),
      ]
      if (flags.system) {
        systemPromptParts.push(flags.system)
      }

      try {
        const snapshot = await buildWorkspaceSummary(workspaceRoot)
        systemPromptParts.push(
          [
            'You are an interactive coding assistant resuming an existing daycli session.',
            'Use the visible session history and this workspace snapshot to continue naturally.',
            'If information is not visible, state that limitation clearly and ask a focused follow-up question.',
            `Workspace snapshot (entries=${snapshot.entryCount}, truncated=${snapshot.truncated ? 'yes' : 'no'}):`,
            snapshot.summary,
          ].join('\n'),
        )
        logger.info('workspace.snapshot.ready', 'workspace summary prepared for resumed chat', {
          entries: snapshot.entryCount,
          truncated: snapshot.truncated,
        })
      } catch (error) {
        logger.warn('workspace.snapshot.failed', 'workspace summary unavailable; continuing without snapshot', {
          error: error instanceof Error ? error.message : String(error),
        })
      }

      logger.info('session.resumed', 'session resumed', {
        sessionId: session.id,
        kind: session.kind,
        messageCount: session.messages.length,
      })

      const app = render(
        React.createElement(ChatApp, {
          model: settings.model,
          provider: chatProvider,
          systemPrompt: systemPromptParts.length > 0 ? systemPromptParts.join('\n\n') : undefined,
          sessionId: session.id,
          initialMessages: session.messages
            .filter(message => message.role !== 'tool')
            .map(message => ({
              role: toUiMessageRole(message.role),
              content: message.content,
            })),
          persistMessage: async message => {
            try {
              await sessionStore.appendMessage(session.id, {
                role: toSessionMessageRole(message.role),
                content: message.content,
                ...(message.metadata !== undefined ? {metadata: message.metadata} : {}),
              })
              logger.debug('session.message.persisted', 'resumed chat message persisted', {
                sessionId: session.id,
                role: message.role,
              })
            } catch (error) {
              logger.warn('session.message.failed', 'failed to persist resumed chat message', {
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

function formatResumeSummary(session: SessionRecord): string {
  return [
    `Session: ${session.id}`,
    `Kind: ${session.kind}`,
    `Status: ${session.status}`,
    `Title: ${session.title}`,
    `Workspace: ${session.workspaceRoot}`,
    `Model: ${session.model ?? '(none)'}`,
    `Messages: ${session.messages.length}`,
    'Run this command in an interactive terminal to continue the session.',
  ].join('\n')
}

function toUiMessageRole(role: SessionMessageRole): 'system' | 'user' | 'assistant' {
  if (role === 'tool') {
    return 'system'
  }

  return role
}

function toSessionMessageRole(role: 'system' | 'user' | 'assistant'): SessionMessageRole {
  return role
}

function logAgentEvent(
  logger: ReturnType<typeof createLogger>,
  event: AgentEvent,
  context: Record<string, unknown>,
): void {
  logger.info(`agent.${event.kind}`, `agent event: ${event.kind}`, {
    ...context,
    ...summarizeAgentEvent(event),
  })
}

function summarizeAgentEvent(event: AgentEvent): Record<string, unknown> {
  if (event.kind === 'stopped') {
    return {
      stoppedReason: event.stoppedReason,
    }
  }

  const step = event.step
  if (!step) {
    return {}
  }

  if (step.kind === 'tool_call') {
    return {
      stepIndex: step.index,
      toolCallId: step.toolCall.id,
      toolName: step.toolCall.name,
    }
  }

  if (step.kind === 'tool_result') {
    return {
      stepIndex: step.index,
      toolCallId: step.toolCall.id,
      toolName: step.result.toolName,
    }
  }

  return {
    stepIndex: step.index,
  }
}
