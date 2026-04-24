import {Args, Command} from '@oclif/core'
import {Flags} from '@oclif/core'
import {OllamaProvider} from '../core/providers'
import {SafeExecutor} from '../core/execution'
import {createDefaultToolRouter} from '../core/tools'
import {InteractiveApprovalManager, WorkspacePathGuard} from '../core/security'
import {loadDaycliConfig, resolveRunSettings} from '../core/config'
import {createLogger} from '../core/observability'
import {toAppError} from '../core/errors'
import {buildCodeContext} from '../core/retrieval'

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

    const provider = new OllamaProvider({
      model: settings.model,
      baseUrl: settings.baseUrl,
      timeoutMs: settings.timeoutMs,
    })

    const systemMessages: {role: 'system'; content: string}[] = []

    if (flags.system) {
      systemMessages.push({role: 'system', content: flags.system})
    }

    try {
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

        const router = createDefaultToolRouter()
        const executor = new SafeExecutor({
          toolRouter: router,
          pathGuard: new WorkspacePathGuard(),
          approvalManager: new InteractiveApprovalManager(),
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

      const messages = [...systemMessages, {role: 'user' as const, content: args.task}]
      const response = await provider.chat({messages})
      logger.info('provider.chat.done', 'provider response received', {
        model: response.model,
      })
      this.log(response.content)
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
