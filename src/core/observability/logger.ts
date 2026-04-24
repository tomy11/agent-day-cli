import process from 'node:process'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  ts: string
  level: LogLevel
  event: string
  message: string
  context?: Record<string, unknown>
}

export interface Logger {
  debug(event: string, message: string, context?: Record<string, unknown>): void
  info(event: string, message: string, context?: Record<string, unknown>): void
  warn(event: string, message: string, context?: Record<string, unknown>): void
  error(event: string, message: string, context?: Record<string, unknown>): void
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

export function createLogger(baseContext: Record<string, unknown> = {}): Logger {
  const minLevel = parseLogLevel(process.env.DAYCLI_LOG_LEVEL)

  const write = (level: LogLevel, event: string, message: string, context?: Record<string, unknown>): void => {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[minLevel]) {
      return
    }

    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      event,
      message,
      context: {
        ...baseContext,
        ...(context ?? {}),
      },
    }

    process.stderr.write(`${JSON.stringify(entry)}\n`)
  }

  return {
    debug: (event, message, context) => write('debug', event, message, context),
    info: (event, message, context) => write('info', event, message, context),
    warn: (event, message, context) => write('warn', event, message, context),
    error: (event, message, context) => write('error', event, message, context),
  }
}

function parseLogLevel(value: string | undefined): LogLevel {
  switch ((value ?? '').toLowerCase()) {
    case 'debug':
    case 'info':
    case 'warn':
    case 'error':
      return value!.toLowerCase() as LogLevel
    default:
      return 'info'
  }
}

