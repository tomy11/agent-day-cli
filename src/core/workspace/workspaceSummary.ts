import {readdir} from 'node:fs/promises'
import {join} from 'node:path'

interface WorkspaceSummaryOptions {
  maxDepth?: number
  maxEntries?: number
  maxChars?: number
}

interface WorkspaceSummaryResult {
  summary: string
  entryCount: number
  truncated: boolean
}

const IGNORED_NAMES = new Set([
  '.git',
  '.daycli',
  'node_modules',
  'dist',
  '.DS_Store',
])

export async function buildWorkspaceSummary(
  workspaceRoot: string,
  options: WorkspaceSummaryOptions = {},
): Promise<WorkspaceSummaryResult> {
  const maxDepth = options.maxDepth ?? 2
  const maxEntries = options.maxEntries ?? 160
  const maxChars = options.maxChars ?? 4500

  const lines: string[] = ['.']
  let entryCount = 0
  let truncated = false

  await appendDirectory(workspaceRoot, '', 0)

  const summary = lines.join('\n')
  return {
    summary: summary.length > maxChars ? `${summary.slice(0, maxChars)}\n... (truncated)` : summary,
    entryCount,
    truncated: truncated || summary.length > maxChars,
  }

  async function appendDirectory(dirPath: string, prefix: string, depth: number): Promise<void> {
    if (depth > maxDepth || truncated) {
      return
    }

    const entries = await readdir(dirPath, {withFileTypes: true})
    const visibleEntries = entries
      .filter(entry => !IGNORED_NAMES.has(entry.name))
      .sort((left, right) => {
        if (left.isDirectory() && !right.isDirectory()) {
          return -1
        }
        if (!left.isDirectory() && right.isDirectory()) {
          return 1
        }
        return left.name.localeCompare(right.name)
      })

    for (const [index, entry] of visibleEntries.entries()) {
      if (entryCount >= maxEntries) {
        truncated = true
        lines.push(`${prefix}... (entry limit reached)`)
        return
      }

      const isLast = index === visibleEntries.length - 1
      const branch = isLast ? '└── ' : '├── '
      const nextPrefix = `${prefix}${isLast ? '    ' : '│   '}`
      const label = entry.isDirectory() ? `${entry.name}/` : entry.name

      lines.push(`${prefix}${branch}${label}`)
      entryCount += 1

      if (entry.isDirectory()) {
        await appendDirectory(join(dirPath, entry.name), nextPrefix, depth + 1)
        if (truncated) {
          return
        }
      }
    }
  }
}
