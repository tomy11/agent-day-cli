import type {AgentInvalidToolCall, AgentToolCall, ParsedToolCallMessage} from './types'

export function parseToolCallMessage(content: string): ParsedToolCallMessage {
  const trimmed = content.trim()
  if (!trimmed.startsWith('{')) {
    return {content, toolCalls: []}
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        content: '',
        toolCalls: [],
        invalidToolCalls: [
          createInvalidToolCall(0, parsed, 'Tool-call response must be a JSON object.'),
        ],
      }
    }

    const candidate = parsed as {content?: unknown; toolCalls?: unknown}
    if (!Array.isArray(candidate.toolCalls)) {
      return {content, toolCalls: []}
    }

    const toolCalls: AgentToolCall[] = []
    const invalidToolCalls: AgentInvalidToolCall[] = []

    candidate.toolCalls.forEach((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        invalidToolCalls.push(createInvalidToolCall(index, item, 'Tool call must be a JSON object.'))
        return
      }

      const call = item as {id?: unknown; name?: unknown; input?: unknown}
      if (typeof call.name !== 'string' || call.name.length === 0) {
        invalidToolCalls.push(createInvalidToolCall(index, item, 'Tool call name must be a non-empty string.'))
        return
      }

      toolCalls.push({
        id: typeof call.id === 'string' && call.id.length > 0 ? call.id : `call-${index + 1}`,
        name: call.name,
        ...(call.input !== undefined ? {input: call.input} : {}),
      })
    })

    return {
      content: typeof candidate.content === 'string' ? candidate.content : '',
      toolCalls,
      ...(invalidToolCalls.length > 0 ? {invalidToolCalls} : {}),
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return {
      content: '',
      toolCalls: [],
      invalidToolCalls: [
        createInvalidToolCall(0, content, `Tool-call response must be valid JSON: ${detail}`),
      ],
    }
  }
}

function createInvalidToolCall(index: number, raw: unknown, message: string): AgentInvalidToolCall {
  return {
    id: `invalid-call-${index + 1}`,
    raw,
    error: {
      code: 'TOOL_CALL_MALFORMED',
      message,
    },
  }
}
