import {Command, Flags} from '@oclif/core'
import {toAppError} from '../../core/errors'
import {SessionStore, type SessionSummary} from '../../core/storage'

export default class SessionList extends Command {
  static override description = 'List sessions'

  static override flags = {
    limit: Flags.integer({
      description: 'Maximum number of sessions to show',
      default: 20,
      min: 1,
    }),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(SessionList)
    const store = new SessionStore(process.cwd())

    try {
      const sessions = (await store.list()).slice(0, flags.limit)

      if (sessions.length === 0) {
        this.log('No sessions found.')
        return
      }

      this.log(formatSessionList(sessions))
    } catch (error) {
      const appError = toAppError(error)
      this.error(`[${appError.code}] ${appError.message}`, {exit: 1})
    }
  }
}

function formatSessionList(sessions: SessionSummary[]): string {
  const rows = sessions.map(session => ({
    id: session.id,
    kind: session.kind,
    status: session.status,
    updated: formatUpdatedAt(session.updatedAt),
    messages: String(session.messageCount),
    workspace: session.workspaceRoot,
    title: session.title,
  }))

  const columns = [
    {key: 'id' as const, label: 'ID'},
    {key: 'kind' as const, label: 'KIND'},
    {key: 'status' as const, label: 'STATUS'},
    {key: 'updated' as const, label: 'UPDATED'},
    {key: 'messages' as const, label: 'MSGS'},
    {key: 'workspace' as const, label: 'WORKSPACE'},
    {key: 'title' as const, label: 'TITLE'},
  ]

  const widths = columns.map(column =>
    Math.max(column.label.length, ...rows.map(row => row[column.key].length)),
  )

  const lines = [
    columns.map((column, index) => column.label.padEnd(widths[index] ?? 0)).join('  '),
    ...rows.map(row =>
      columns.map((column, index) => row[column.key].padEnd(widths[index] ?? 0)).join('  '),
    ),
  ]

  return lines.join('\n')
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toISOString()
}
