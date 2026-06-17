import type {ToolDefinition, ToolJsonSchema} from '../tools'
import {
  EDIT_FILE_TOOL_CONTRACT,
  FIND_FILES_TOOL_CONTRACT,
  LIST_DIR_TOOL_CONTRACT,
  RUN_COMMAND_TOOL_CONTRACT,
  SEARCH_FILES_TOOL_CONTRACT,
  WRITE_FILE_TOOL_CONTRACT,
  type ToolContract,
} from '../tools'

const CONTRACTS: Record<string, ToolContract> = {
  [SEARCH_FILES_TOOL_CONTRACT.name]: SEARCH_FILES_TOOL_CONTRACT,
  [FIND_FILES_TOOL_CONTRACT.name]: FIND_FILES_TOOL_CONTRACT,
  [LIST_DIR_TOOL_CONTRACT.name]: LIST_DIR_TOOL_CONTRACT,
  [WRITE_FILE_TOOL_CONTRACT.name]: WRITE_FILE_TOOL_CONTRACT,
  [EDIT_FILE_TOOL_CONTRACT.name]: EDIT_FILE_TOOL_CONTRACT,
  [RUN_COMMAND_TOOL_CONTRACT.name]: RUN_COMMAND_TOOL_CONTRACT,
}

export function getToolInputSchema(tool: ToolDefinition): ToolJsonSchema {
  return CONTRACTS[tool.name]?.inputSchema ?? {
    type: 'object',
    description: tool.description,
  }
}

export function toProviderJsonSchema(schema: ToolJsonSchema): Record<string, unknown> {
  return {
    type: schema.type,
    description: schema.description,
    ...(schema.required !== undefined ? {required: schema.required} : {}),
    ...(schema.enum !== undefined ? {enum: schema.enum} : {}),
    ...(schema.default !== undefined ? {default: schema.default} : {}),
    ...(schema.properties !== undefined
      ? {
          properties: Object.fromEntries(
            Object.entries(schema.properties).map(([key, value]) => [key, toProviderJsonSchema(value)]),
          ),
        }
      : {}),
    ...(schema.items !== undefined ? {items: toProviderJsonSchema(schema.items)} : {}),
  }
}
