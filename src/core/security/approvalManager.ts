import {createInterface} from 'node:readline/promises'
import process from 'node:process'
import type {ApprovalManager} from '../execution'

interface InteractiveApprovalManagerOptions {
  input?: NodeJS.ReadStream
  output?: NodeJS.WriteStream
}

export class InteractiveApprovalManager implements ApprovalManager {
  private readonly input: NodeJS.ReadStream
  private readonly output: NodeJS.WriteStream

  public constructor(options: InteractiveApprovalManagerOptions = {}) {
    this.input = options.input ?? process.stdin
    this.output = options.output ?? process.stdout
  }

  public async requestToolApproval(input: {
    tool: {name: string}
    payload: unknown
  }): Promise<boolean> {
    this.output.write(
      `\nTool "${input.tool.name}" requires approval.\nPayload: ${safeSerialize(input.payload)}\n`,
    )

    const rl = createInterface({
      input: this.input,
      output: this.output,
    })

    try {
      const answer = (await rl.question('Approve execution? [y/N]: ')).trim().toLowerCase()
      return answer === 'y' || answer === 'yes'
    } finally {
      rl.close()
    }
  }
}

function safeSerialize(payload: unknown): string {
  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return String(payload)
  }
}
