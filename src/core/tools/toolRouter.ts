import type {ToolCall, ToolDefinition} from './types'
import {AppError} from '../errors'

export class ToolRouter {
  private readonly tools = new Map<string, ToolDefinition>()

  public register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`)
    }

    this.tools.set(tool.name, tool)
  }

  public resolve(call: ToolCall): ToolDefinition {
    const tool = this.tools.get(call.name)
    if (!tool) {
      throw new AppError('TOOL_UNKNOWN', `Unknown tool: ${call.name}`, {
        meta: {toolName: call.name},
      })
    }

    return tool
  }

  public list(): ToolDefinition[] {
    return [...this.tools.values()]
  }
}
