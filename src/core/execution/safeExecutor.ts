import type {ToolRouter} from '../tools/toolRouter'
import type {ToolCall, ToolContext, ToolDefinition, ToolExecutionResult} from '../tools/types'
import {AppError} from '../errors'

export interface PathGuard {
  assertAllowed(tool: ToolDefinition, input: unknown, context: ToolContext): void
}

export interface ApprovalManager {
  requestToolApproval(input: {
    tool: ToolDefinition
    payload: unknown
    context: ToolContext
  }): Promise<boolean>
}

interface SafeExecutorOptions {
  toolRouter: ToolRouter
  pathGuard?: PathGuard
  approvalManager?: ApprovalManager
}

export class SafeExecutor {
  private readonly toolRouter: ToolRouter
  private readonly pathGuard?: PathGuard
  private readonly approvalManager?: ApprovalManager

  public constructor(options: SafeExecutorOptions) {
    this.toolRouter = options.toolRouter
    this.pathGuard = options.pathGuard
    this.approvalManager = options.approvalManager
  }

  public async execute(call: ToolCall, context: ToolContext): Promise<ToolExecutionResult> {
    const tool = this.toolRouter.resolve(call)

    this.pathGuard?.assertAllowed(tool, call.input, context)
    await this.ensureApproved(tool, call.input, context)

    try {
      const output = await tool.execute(call.input, context)
      return {
        toolName: tool.name,
        output,
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }

      const message = error instanceof Error ? error.message : String(error)
      throw new AppError('TOOL_EXECUTION_FAILED', `Tool execution failed (${tool.name}): ${message}`, {
        cause: error,
        meta: {toolName: tool.name},
      })
    }
  }

  private async ensureApproved(
    tool: ToolDefinition,
    payload: unknown,
    context: ToolContext,
  ): Promise<void> {
    if (tool.riskLevel === 'low') {
      return
    }

    if (!this.approvalManager) {
      throw new AppError(
        'TOOL_APPROVAL_REQUIRED',
        `Approval manager is required for high-risk tool: ${tool.name}`,
        {
          meta: {toolName: tool.name},
        },
      )
    }

    const approved = await this.approvalManager.requestToolApproval({
      tool,
      payload,
      context,
    })

    if (!approved) {
      throw new AppError('TOOL_APPROVAL_REJECTED', `Tool execution rejected by user: ${tool.name}`, {
        meta: {toolName: tool.name},
      })
    }
  }
}
