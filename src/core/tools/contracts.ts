import type {ToolRiskLevel} from './types'

export type ToolContractName = 'write_file' | 'edit_file' | 'run_command'

export type JsonPrimitiveType = 'string' | 'number' | 'boolean' | 'object' | 'array'

export interface ToolJsonSchema {
  type: JsonPrimitiveType
  description: string
  required?: string[]
  properties?: Record<string, ToolJsonSchema>
  items?: ToolJsonSchema
  enum?: string[]
  default?: unknown
}

export interface ToolContract {
  name: ToolContractName
  description: string
  riskLevel: ToolRiskLevel
  inputSchema: ToolJsonSchema
  outputSchema: ToolJsonSchema
  safetyNotes: string[]
}

export interface WriteFileToolInput {
  path: string
  content: string
  encoding?: BufferEncoding
  createDirs?: boolean
  overwrite?: boolean
}

export interface WriteFileToolOutput {
  path: string
  absolutePath: string
  bytesWritten: number
  created: boolean
  overwritten: boolean
}

export interface EditFileReplacement {
  oldText: string
  newText: string
  replaceAll?: boolean
}

export interface EditFileToolInput {
  path: string
  replacements: EditFileReplacement[]
  encoding?: BufferEncoding
  requireExactMatch?: boolean
}

export interface EditFileToolOutput {
  path: string
  absolutePath: string
  replacementsApplied: number
  changed: boolean
}

export interface RunCommandToolInput {
  command: string
  args?: string[]
  cwd?: string
  timeoutMs?: number
  env?: Record<string, string>
  maxOutputBytes?: number
}

export interface RunCommandToolOutput {
  command: string
  args: string[]
  cwd: string
  exitCode: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  durationMs: number
}

export const WRITE_FILE_TOOL_CONTRACT: ToolContract = {
  name: 'write_file',
  description: 'Write text content to a file inside the workspace.',
  riskLevel: 'high',
  inputSchema: {
    type: 'object',
    description: 'Payload for writing a workspace file.',
    required: ['path', 'content'],
    properties: {
      path: {
        type: 'string',
        description: 'Workspace-relative or in-workspace absolute path to write.',
      },
      content: {
        type: 'string',
        description: 'Complete file content to write.',
      },
      encoding: {
        type: 'string',
        description: 'Text encoding used for the write.',
        default: 'utf8',
      },
      createDirs: {
        type: 'boolean',
        description: 'Create parent directories when they do not exist.',
        default: false,
      },
      overwrite: {
        type: 'boolean',
        description: 'Allow replacing an existing file.',
        default: false,
      },
    },
  },
  outputSchema: {
    type: 'object',
    description: 'Result metadata for a file write.',
    required: ['path', 'absolutePath', 'bytesWritten', 'created', 'overwritten'],
    properties: {
      path: {
        type: 'string',
        description: 'Original path from the tool input.',
      },
      absolutePath: {
        type: 'string',
        description: 'Resolved absolute path inside the workspace.',
      },
      bytesWritten: {
        type: 'number',
        description: 'Number of bytes written.',
      },
      created: {
        type: 'boolean',
        description: 'Whether the tool created a new file.',
      },
      overwritten: {
        type: 'boolean',
        description: 'Whether the tool replaced an existing file.',
      },
    },
  },
  safetyNotes: [
    'Must pass workspace path guard before writing.',
    'Requires approval because it can create or overwrite files.',
    'Must fail rather than overwrite unless overwrite is explicitly true.',
  ],
}

export const EDIT_FILE_TOOL_CONTRACT: ToolContract = {
  name: 'edit_file',
  description: 'Apply exact text replacements to an existing file inside the workspace.',
  riskLevel: 'high',
  inputSchema: {
    type: 'object',
    description: 'Payload for exact-match file edits.',
    required: ['path', 'replacements'],
    properties: {
      path: {
        type: 'string',
        description: 'Workspace-relative or in-workspace absolute path to edit.',
      },
      replacements: {
        type: 'array',
        description: 'Ordered exact text replacements to apply.',
        items: {
          type: 'object',
          description: 'One exact text replacement.',
          required: ['oldText', 'newText'],
          properties: {
            oldText: {
              type: 'string',
              description: 'Exact text that must be found before replacement.',
            },
            newText: {
              type: 'string',
              description: 'Replacement text.',
            },
            replaceAll: {
              type: 'boolean',
              description: 'Replace every occurrence instead of exactly one occurrence.',
              default: false,
            },
          },
        },
      },
      encoding: {
        type: 'string',
        description: 'Text encoding used for read and write.',
        default: 'utf8',
      },
      requireExactMatch: {
        type: 'boolean',
        description: 'Fail when any replacement cannot be matched exactly.',
        default: true,
      },
    },
  },
  outputSchema: {
    type: 'object',
    description: 'Result metadata for file edits.',
    required: ['path', 'absolutePath', 'replacementsApplied', 'changed'],
    properties: {
      path: {
        type: 'string',
        description: 'Original path from the tool input.',
      },
      absolutePath: {
        type: 'string',
        description: 'Resolved absolute path inside the workspace.',
      },
      replacementsApplied: {
        type: 'number',
        description: 'Number of replacements applied.',
      },
      changed: {
        type: 'boolean',
        description: 'Whether the file content changed.',
      },
    },
  },
  safetyNotes: [
    'Must pass workspace path guard before editing.',
    'Requires approval because it mutates existing files.',
    'Must use exact-match replacements and report conflicts instead of guessing.',
  ],
}

export const RUN_COMMAND_TOOL_CONTRACT: ToolContract = {
  name: 'run_command',
  description: 'Run a shell command in a guarded workspace directory with captured output.',
  riskLevel: 'high',
  inputSchema: {
    type: 'object',
    description: 'Payload for a guarded command execution.',
    required: ['command'],
    properties: {
      command: {
        type: 'string',
        description: 'Executable or command name to run.',
      },
      args: {
        type: 'array',
        description: 'Arguments passed without shell interpolation.',
        items: {
          type: 'string',
          description: 'One command argument.',
        },
      },
      cwd: {
        type: 'string',
        description: 'Workspace-relative or in-workspace absolute working directory.',
        default: '.',
      },
      timeoutMs: {
        type: 'number',
        description: 'Maximum execution time before terminating the command.',
      },
      env: {
        type: 'object',
        description: 'Explicit environment variables to add or override.',
      },
      maxOutputBytes: {
        type: 'number',
        description: 'Maximum captured stdout/stderr bytes before truncation.',
      },
    },
  },
  outputSchema: {
    type: 'object',
    description: 'Result metadata and captured output for a command run.',
    required: ['command', 'args', 'cwd', 'exitCode', 'stdout', 'stderr', 'timedOut', 'durationMs'],
    properties: {
      command: {
        type: 'string',
        description: 'Command that was run.',
      },
      args: {
        type: 'array',
        description: 'Arguments that were passed.',
        items: {
          type: 'string',
          description: 'One command argument.',
        },
      },
      cwd: {
        type: 'string',
        description: 'Resolved working directory.',
      },
      exitCode: {
        type: 'number',
        description: 'Process exit code, or null when unavailable.',
      },
      stdout: {
        type: 'string',
        description: 'Captured standard output.',
      },
      stderr: {
        type: 'string',
        description: 'Captured standard error.',
      },
      timedOut: {
        type: 'boolean',
        description: 'Whether the command exceeded timeoutMs.',
      },
      durationMs: {
        type: 'number',
        description: 'Wall-clock runtime in milliseconds.',
      },
    },
  },
  safetyNotes: [
    'Must pass cwd through workspace path guard before running.',
    'Requires approval because commands can mutate files or access the system.',
    'Must run without shell interpolation unless a later policy explicitly allows shell mode.',
    'Must enforce timeout and output limits.',
  ],
}

export const MUTATION_TOOL_CONTRACTS = [
  WRITE_FILE_TOOL_CONTRACT,
  EDIT_FILE_TOOL_CONTRACT,
  RUN_COMMAND_TOOL_CONTRACT,
] as const
