import {Command} from '@oclif/core'

export default class SessionList extends Command {
  static override description = 'List sessions'

  public async run(): Promise<void> {
    await this.parse(SessionList)
    this.log('daycli session list: scaffold ready')
  }
}
