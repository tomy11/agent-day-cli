export type ToolRiskLevel = 'low' | 'high'

export interface ToolCall {
  name: string
  input?: unknown
}

export interface ToolContext {
  workspaceRoot: string
}

export interface ToolDefinition {
  name: string
  description: string
  riskLevel: ToolRiskLevel
  extractPaths?(input: unknown): string[]
  execute(input: unknown, context: ToolContext): Promise<unknown>
}

export interface ToolExecutionResult {
  toolName: string
  output: unknown
}
