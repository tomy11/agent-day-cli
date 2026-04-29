import type {ToolDefinition} from './types'

export function buildToolSystemPrompt(tools: ToolDefinition[]): string {
  const toolLines = tools.map(tool => {
    switch (tool.name) {
      case 'read_file':
        return [
          '- `read_file` (low risk): read a workspace file.',
          '  Input: `{ "path": "README.md", "maxChars": 20000 }`',
        ].join('\n')
      case 'write_file':
        return [
          '- `write_file` (high risk, approval required): create or replace a workspace file.',
          '  Input: `{ "path": "src/example.ts", "content": "...", "createDirs": false, "overwrite": false }`',
          '  Use `overwrite: true` only when replacing the full existing file is intended.',
        ].join('\n')
      case 'edit_file':
        return [
          '- `edit_file` (high risk, approval required): apply ordered exact text replacements to an existing workspace file.',
          '  Input: `{ "path": "src/example.ts", "replacements": [{ "oldText": "...", "newText": "...", "replaceAll": false }], "requireExactMatch": true }`',
          '  Prefer this over `write_file` for small edits; exact-match conflicts are reported instead of guessed.',
        ].join('\n')
      case 'run_command':
        return [
          '- `run_command` (high risk, approval required): run a command in a guarded workspace cwd.',
          '  Input: `{ "command": "npm", "args": ["run", "test"], "cwd": ".", "timeoutMs": 120000, "maxOutputBytes": 64000 }`',
          '  Commands run without shell interpolation; use `args` instead of combining shell text.',
        ].join('\n')
      default:
        return `- \`${tool.name}\` (${tool.riskLevel} risk): ${tool.description}`
    }
  })

  return [
    'Available tools:',
    ...toolLines,
    '',
    'Tool-call format:',
    'Return strict JSON only when you need tools:',
    '{"content":"short reason","toolCalls":[{"id":"call-1","name":"tool_name","input":{}}]}',
    '',
    'Safety rules:',
    '- Use tools only when they materially help the user request.',
    '- High-risk tools require explicit approval and may be rejected.',
    '- All paths must stay inside the current workspace and obey safety policy.',
    '- If a tool returns a recoverable error, adjust the request or explain the limitation instead of retrying blindly.',
  ].join('\n')
}
