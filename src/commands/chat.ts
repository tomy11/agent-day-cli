import {Command} from '@oclif/core'

export default class Chat extends Command {
  static override description = 'Start interactive chat session'

  public async run(): Promise<void> {
    await this.parse(Chat)
    this.log('daycli chat: scaffold ready')
  }
}
