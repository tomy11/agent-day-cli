import {Args, Command} from '@oclif/core'

export default class SessionResume extends Command {
  static override description = 'Resume a session by id'

  static override args = {
    id: Args.string({
      description: 'Session id',
      required: true,
    }),
  }

  public async run(): Promise<void> {
    const {args} = await this.parse(SessionResume)
    this.log(`daycli session resume: ${args.id}`)
  }
}
