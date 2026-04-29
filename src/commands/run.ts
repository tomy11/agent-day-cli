import React from 'react'
import {Args, Command} from '@oclif/core'
import {Flags} from '@oclif/core'
import {render} from 'ink'
import {
  AgentOrchestrator,
  persistAgentToolResults,
  summarizeAgentResult,
  type AgentEvent,
  type AgentMessage,
} from '../core/agent'
import {OllamaProvider} from '../core/providers'
import {SafeExecutor} from '../core/execution'
import {createDefaultToolRouter} from '../core/tools'
import {InteractiveApprovalManager, WorkspacePathGuard} from '../core/security'
import {loadDaycliConfig, resolveRunSettings} from '../core/config'
import {createLogger} from '../core/observability'
import {toAppError} from '../core/errors'
import {buildCodeContext} from '../core/retrieval'
import {SessionStore} from '../core/storage'
import {RunResultView} from '../ui'

export default class Run extends Command {
  static override description = 'Run a single task prompt'

  static override args = {
    task: Args.string({
      description: 'Task to execute',
      required: true,
    }),
  }

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
    output: Flags.string({
      description: 'Output formatter mode',
      options: ['plain', 'rich'],
      default: 'plain',
    }),
    'read-file': Flags.string({
      description: 'Read a workspace file and inject its content as extra context',
    }),
  }

  public async run(): Promise<void> {
    const {args, flags} = await this.parse(Run)
    const workspaceRoot = process.cwd()
    const logger = createLogger({command: 'run'})
    logger.info('command.start', 'run command started')

    const config = await loadDaycliConfig(workspaceRoot)
    const settings = resolveRunSettings(config, {
      model: flags.model,
      baseUrl: flags['base-url'],
      timeoutMs: flags['timeout-ms'],
    })
    logger.debug('config.resolved', 'run settings resolved', {...settings})

    const sessionStore = new SessionStore(workspaceRoot)
    let sessionId: string | undefined

    const provider = new OllamaProvider({
      model: settings.model,
      baseUrl: settings.baseUrl,
      timeoutMs: settings.timeoutMs,
    })
    const router = createDefaultToolRouter()
    const executor = new SafeExecutor({
      toolRouter: router,
      pathGuard: new WorkspacePathGuard(),
      approvalManager: new InteractiveApprovalManager(),
    })

    const systemMessages: AgentMessage[] = []

    if (flags.system) {
      systemMessages.push({role: 'system', content: flags.system})
    }

    let retrievalSummary: {chunkCount: number; truncated: boolean} | undefined

    try {
      const session = await sessionStore.create({
        kind: 'run',
        title: createRunSessionTitle(args.task),
        workspaceRoot,
        model: settings.model,
        metadata: {
          command: 'run',
          output: flags.output,
        },
      })
      sessionId = session.id
      logger.info('session.created', 'run session created', {
        sessionId,
      })

      await sessionStore.appendMessage(sessionId, {
        role: 'user',
        content: args.task,
      })

      try {
        const codeContext = await buildCodeContext({
          workspaceRoot,
          query: args.task,
        })

        if (codeContext.context.length > 0) {
          systemMessages.push({
            role: 'system',
            content: codeContext.truncated
              ? `Relevant code context (truncated):\n${codeContext.context}`
              : `Relevant code context:\n${codeContext.context}`,
          })
          logger.info('retrieval.context.done', 'retrieval context assembled', {
            chunkCount: codeContext.chunkCount,
            truncated: codeContext.truncated,
          })
          retrievalSummary = {
            chunkCount: codeContext.chunkCount,
            truncated: codeContext.truncated,
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.warn('retrieval.context.failed', 'failed to build retrieval context; continuing without it', {
          error: message,
        })
      }

      if (flags['read-file']) {
        logger.info('tool.read_file.start', 'executing read_file tool', {
          path: flags['read-file'],
        })

        const result = await executor.execute(
          {
            name: 'read_file',
            input: {
              path: flags['read-file'],
            },
          },
          {
            workspaceRoot,
          },
        )

        const payload = result.output as {content: string; truncated: boolean; path: string}
        const contextMessage = payload.truncated
          ? `File context from ${payload.path} (truncated):\n${payload.content}`
          : `File context from ${payload.path}:\n${payload.content}`

        systemMessages.push({
          role: 'system',
          content: contextMessage,
        })
        logger.info('tool.read_file.done', 'read_file tool completed', {
          path: payload.path,
          truncated: payload.truncated,
        })
      }

      const messages: AgentMessage[] = [...systemMessages, {role: 'user', content: args.task}]
      const agent = new AgentOrchestrator({
        provider,
        toolExecutor: executor,
        limits: {
          timeoutMs: settings.timeoutMs,
        },
        onEvent: event => {
          logAgentEvent(logger, event, {sessionId})
        },
      })
      const agentResult = await agent.run({
        messages,
        toolContext: {
          workspaceRoot,
        },
      })
      const responseModel = getAgentResponseModel(agentResult.finalMessage, settings.model)
      logger.info('agent.run.done', 'agent run completed', {
        model: responseModel,
        stoppedReason: agentResult.stoppedReason,
        stepCount: agentResult.steps.length,
        toolResultCount: agentResult.toolResults.length,
      })
      await persistAgentToolResults({
        sessionStore,
        sessionId,
        result: agentResult,
      })

      await sessionStore.appendMessage(sessionId, {
        role: 'assistant',
        content: agentResult.finalMessage.content,
        metadata: {
          model: responseModel,
          agent: summarizeAgentResult(agentResult),
          ...(retrievalSummary !== undefined ? {retrieval: retrievalSummary} : {}),
        },
      })
      await sessionStore.updateStatus(sessionId, 'completed')
      logger.info('session.completed', 'run session completed', {
        sessionId,
      })

      if (flags.output === 'rich') {
        if (!process.stdout.isTTY || !process.stdin.isTTY) {
          logger.warn('output.rich.unavailable', 'rich output requires TTY; falling back to plain')
          this.log(formatPlainRunOutput(agentResult.finalMessage.content, sessionId))
          return
        }

        const app = render(
          React.createElement(RunResultView, {
            task: args.task,
            model: responseModel,
            response: agentResult.finalMessage.content,
            sessionId,
            retrieval: retrievalSummary,
          }),
        )
        await app.waitUntilExit()
        return
      }

      this.log(formatPlainRunOutput(agentResult.finalMessage.content, sessionId))
    } catch (error) {
      if (sessionId) {
        try {
          await sessionStore.updateStatus(sessionId, 'failed')
        } catch (sessionError) {
          logger.warn('session.status.failed', 'failed to mark run session as failed', {
            sessionId,
            error: sessionError instanceof Error ? sessionError.message : String(sessionError),
          })
        }
      }

      const appError = toAppError(error)
      logger.error('command.error', appError.message, {
        code: appError.code,
        ...(appError.meta ?? {}),
      })
      this.error(`[${appError.code}] ${appError.message}`, {exit: 1})
    }
  }
}

function createRunSessionTitle(task: string): string {
  const normalized = task.trim().replaceAll(/\s+/g, ' ')
  if (normalized.length <= 80) {
    return normalized || 'Untitled run'
  }

  return `${normalized.slice(0, 77)}...`
}

function formatPlainRunOutput(response: string, sessionId: string | undefined): string {
  if (!sessionId) {
    return response
  }

  return [
    response,
    '',
    `Session: ${sessionId}`,
    `Resume: daycli session resume ${sessionId}`,
  ].join('\n')
}

function getAgentResponseModel(message: AgentMessage, fallback: string): string {
  const model = message.metadata?.model
  return typeof model === 'string' ? model : fallback
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
