export type ErrorCode =
  | 'CONFIG_INVALID'
  | 'CONFIG_IO_ERROR'
  | 'POLICY_NOT_FOUND'
  | 'POLICY_INVALID'
  | 'POLICY_IO_ERROR'
  | 'OLLAMA_HTTP_ERROR'
  | 'OLLAMA_TIMEOUT'
  | 'OLLAMA_RESPONSE_ERROR'
  | 'OLLAMA_NETWORK_ERROR'
  | 'OPENAI_API_KEY_MISSING'
  | 'OPENAI_HTTP_ERROR'
  | 'OPENAI_TIMEOUT'
  | 'OPENAI_RESPONSE_ERROR'
  | 'OPENAI_NETWORK_ERROR'
  | 'ANTHROPIC_API_KEY_MISSING'
  | 'ANTHROPIC_HTTP_ERROR'
  | 'ANTHROPIC_TIMEOUT'
  | 'ANTHROPIC_RESPONSE_ERROR'
  | 'ANTHROPIC_NETWORK_ERROR'
  | 'OPENROUTER_API_KEY_MISSING'
  | 'OPENROUTER_HTTP_ERROR'
  | 'OPENROUTER_TIMEOUT'
  | 'OPENROUTER_RESPONSE_ERROR'
  | 'OPENROUTER_NETWORK_ERROR'
  | 'GEMINI_API_KEY_MISSING'
  | 'GEMINI_HTTP_ERROR'
  | 'GEMINI_TIMEOUT'
  | 'GEMINI_RESPONSE_ERROR'
  | 'GEMINI_NETWORK_ERROR'
  | 'MISTRAL_API_KEY_MISSING'
  | 'MISTRAL_HTTP_ERROR'
  | 'MISTRAL_TIMEOUT'
  | 'MISTRAL_RESPONSE_ERROR'
  | 'MISTRAL_NETWORK_ERROR'
  | 'SESSION_INVALID'
  | 'SESSION_IO_ERROR'
  | 'SESSION_NOT_FOUND'
  | 'TOOL_UNKNOWN'
  | 'TOOL_APPROVAL_REQUIRED'
  | 'TOOL_APPROVAL_REJECTED'
  | 'TOOL_PATH_BLOCKED'
  | 'TOOL_EXECUTION_FAILED'
  | 'INTERNAL_ERROR'

interface AppErrorOptions {
  cause?: unknown
  meta?: Record<string, unknown>
}

export class AppError extends Error {
  public readonly code: ErrorCode
  public readonly meta?: Record<string, unknown>

  public constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.meta = options.meta

    if (options.cause !== undefined) {
      ;(this as Error & {cause?: unknown}).cause = options.cause
    }
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error
  }

  if (error instanceof Error) {
    return new AppError('INTERNAL_ERROR', error.message, {cause: error})
  }

  return new AppError('INTERNAL_ERROR', String(error))
}
