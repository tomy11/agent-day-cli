import type {ApprovalManager} from '../execution'
import type {BatchPolicyFile} from './policyFile'

export class PolicyApprovalManager implements ApprovalManager {
  private readonly policy: BatchPolicyFile

  public constructor(policy: BatchPolicyFile) {
    this.policy = policy
  }

  public async requestToolApproval(input: {
    tool: {name: string; riskLevel: string}
    payload: unknown
    context: unknown
  }): Promise<boolean> {
    const approvals = this.policy.approvals

    const toolDecision = approvals?.tools?.[input.tool.name]
    if (toolDecision !== undefined) {
      return toolDecision === 'allow'
    }

    const riskLevel = input.tool.riskLevel as 'low' | 'high'
    const riskDecision = approvals?.riskLevels?.[riskLevel]
    if (riskDecision !== undefined) {
      return riskDecision === 'allow'
    }

    return (approvals?.default ?? 'deny') === 'allow'
  }
}
