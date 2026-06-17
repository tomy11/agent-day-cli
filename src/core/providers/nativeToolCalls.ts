export interface NativeToolCall {
  id: string
  name: string
  input: unknown
}

export function formatNativeToolCallResponse(content: string, toolCalls: NativeToolCall[]): string {
  return JSON.stringify({
    content,
    toolCalls: toolCalls.map((toolCall, index) => ({
      id: toolCall.id || `call-${index + 1}`,
      name: toolCall.name,
      input: toolCall.input,
    })),
  })
}

export function parseToolArguments(raw: string | undefined): unknown {
  if (!raw || raw.trim().length === 0) {
    return {}
  }

  try {
    return JSON.parse(raw) as unknown
  } catch {
    return {raw}
  }
}

