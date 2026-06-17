import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EDIT_FILE_TOOL_CONTRACT,
  FIND_FILES_TOOL_CONTRACT,
  MUTATION_TOOL_CONTRACTS,
  NAVIGATION_TOOL_CONTRACTS,
  LIST_DIR_TOOL_CONTRACT,
  RUN_COMMAND_TOOL_CONTRACT,
  SEARCH_FILES_TOOL_CONTRACT,
  WRITE_FILE_TOOL_CONTRACT,
  createDefaultToolRouter,
  type EditFileToolInput,
  type FindFilesToolInput,
  type ListDirToolInput,
  type RunCommandToolInput,
  type SearchFilesToolInput,
  type WriteFileToolInput,
} from '../../core/tools'

test('mutation tool contracts define stable tool names and high risk levels', () => {
  assert.deepEqual(
    MUTATION_TOOL_CONTRACTS.map(contract => contract.name),
    ['write_file', 'edit_file', 'run_command'],
  )
  assert.deepEqual(
    MUTATION_TOOL_CONTRACTS.map(contract => contract.riskLevel),
    ['high', 'high', 'high'],
  )
})

test('write_file contract requires path and content', () => {
  const input: WriteFileToolInput = {
    path: 'src/example.ts',
    content: 'export {}\n',
    overwrite: false,
  }

  assert.equal(WRITE_FILE_TOOL_CONTRACT.inputSchema.required?.includes('path'), true)
  assert.equal(WRITE_FILE_TOOL_CONTRACT.inputSchema.required?.includes('content'), true)
  assert.equal(WRITE_FILE_TOOL_CONTRACT.inputSchema.properties?.overwrite?.default, false)
  assert.equal(input.path, 'src/example.ts')
})

test('navigation tool contracts define stable low-risk tool names', () => {
  assert.deepEqual(
    NAVIGATION_TOOL_CONTRACTS.map(contract => contract.name),
    ['search_files', 'find_files', 'list_dir'],
  )
  assert.deepEqual(
    NAVIGATION_TOOL_CONTRACTS.map(contract => contract.riskLevel),
    ['low', 'low', 'low'],
  )
})

test('search_files contract requires a query and bounded output fields', () => {
  const input: SearchFilesToolInput = {
    query: 'ToolRouter',
    path: 'src',
    maxResults: 10,
  }

  assert.deepEqual(SEARCH_FILES_TOOL_CONTRACT.inputSchema.required, ['query'])
  assert.equal(SEARCH_FILES_TOOL_CONTRACT.inputSchema.properties?.maxResults?.default, 50)
  assert.equal(SEARCH_FILES_TOOL_CONTRACT.outputSchema.required?.includes('matches'), true)
  assert.equal(input.query, 'ToolRouter')
})

test('find_files contract searches bounded path results', () => {
  const input: FindFilesToolInput = {
    query: 'router',
    path: 'src',
  }

  assert.deepEqual(FIND_FILES_TOOL_CONTRACT.inputSchema.required, ['query'])
  assert.equal(FIND_FILES_TOOL_CONTRACT.outputSchema.required?.includes('paths'), true)
  assert.equal(input.path, 'src')
})

test('list_dir contract supports bounded recursive directory listings', () => {
  const input: ListDirToolInput = {
    path: 'src/core',
    recursive: true,
    maxEntries: 5,
  }

  assert.equal(LIST_DIR_TOOL_CONTRACT.inputSchema.properties?.recursive?.default, false)
  assert.equal(LIST_DIR_TOOL_CONTRACT.inputSchema.properties?.maxEntries?.default, 200)
  assert.equal(LIST_DIR_TOOL_CONTRACT.outputSchema.required?.includes('entries'), true)
  assert.equal(input.recursive, true)
})

test('edit_file contract uses ordered exact replacements', () => {
  const input: EditFileToolInput = {
    path: 'src/example.ts',
    replacements: [
      {
        oldText: 'const oldValue = true',
        newText: 'const newValue = true',
      },
    ],
  }

  const replacements = EDIT_FILE_TOOL_CONTRACT.inputSchema.properties?.replacements
  assert.equal(replacements?.type, 'array')
  assert.deepEqual(replacements?.items?.required, ['oldText', 'newText'])
  assert.equal(input.replacements[0]?.replaceAll, undefined)
})

test('run_command contract separates command from args and requires guarded execution metadata', () => {
  const input: RunCommandToolInput = {
    command: 'npm',
    args: ['run', 'test'],
    cwd: '.',
    timeoutMs: 120_000,
  }

  assert.deepEqual(RUN_COMMAND_TOOL_CONTRACT.inputSchema.required, ['command'])
  assert.equal(RUN_COMMAND_TOOL_CONTRACT.inputSchema.properties?.args?.type, 'array')
  assert.equal(RUN_COMMAND_TOOL_CONTRACT.outputSchema.required?.includes('exitCode'), true)
  assert.equal(RUN_COMMAND_TOOL_CONTRACT.outputSchema.required?.includes('timedOut'), true)
  assert.deepEqual(input.args, ['run', 'test'])
})

test('default router registers read and mutation tools', () => {
  const router = createDefaultToolRouter()
  assert.deepEqual(
    router.list().map(tool => tool.name),
    ['read_file', 'search_files', 'find_files', 'list_dir', 'write_file', 'edit_file', 'run_command'],
  )
})
