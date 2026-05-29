import type { TierLevel } from "./tier"

export interface ToolBudget {
  maxToolCallsPerTurn: number
  allowedTools: string[]
  maxArgs: number
  maxOutputLines: number
  timeoutMs: number
}

export const TIER_TOOL_BUDGETS: Record<TierLevel, ToolBudget> = {
  t1: {
    maxToolCallsPerTurn: 40,
    allowedTools: [],
    maxArgs: 10,
    maxOutputLines: 500,
    timeoutMs: 120_000,
  },
  t2: {
    maxToolCallsPerTurn: 15,
    allowedTools: ["read", "write", "edit", "glob", "grep", "bash", "list"],
    maxArgs: 5,
    maxOutputLines: 200,
    timeoutMs: 60_000,
  },
  t3: {
    maxToolCallsPerTurn: 6,
    allowedTools: ["read", "edit", "bash", "glob"],
    maxArgs: 3,
    maxOutputLines: 80,
    timeoutMs: 30_000,
  },
}

const ESCALATED_T3_BUDGET: ToolBudget = {
  maxToolCallsPerTurn: 3,
  allowedTools: ["read", "edit"],
  maxArgs: 2,
  maxOutputLines: 40,
  timeoutMs: 15_000,
}

export function getToolBudget(tier: TierLevel): ToolBudget {
  return { ...TIER_TOOL_BUDGETS[tier] }
}

export class ToolBudgetController {
  private tier: TierLevel
  private callCount = 0
  private consecutiveFailures = 0
  private escalated = false

  constructor(tier: TierLevel) {
    this.tier = tier
  }

  getBudget(): ToolBudget {
    if (this.escalated && this.tier === "t3") return { ...ESCALATED_T3_BUDGET }
    return { ...TIER_TOOL_BUDGETS[this.tier] }
  }

  isToolAllowed(toolId: string): boolean {
    const budget = this.getBudget()
    if (this.callCount >= budget.maxToolCallsPerTurn) return false
    if (budget.allowedTools.length === 0) return true
    return budget.allowedTools.includes(toolId)
  }

  recordCall(_toolId: string): void {
    this.callCount++
  }

  recordFailure(): void {
    this.consecutiveFailures++
    if (this.consecutiveFailures >= 3 && !this.escalated) {
      this.escalated = true
    }
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0
  }

  getRemainingCalls(): number {
    const budget = this.getBudget()
    return Math.max(0, budget.maxToolCallsPerTurn - this.callCount)
  }

  isExhausted(): boolean {
    return this.getRemainingCalls() <= 0
  }

  isEscalated(): boolean {
    return this.escalated
  }

  reset(): void {
    this.callCount = 0
    this.consecutiveFailures = 0
    this.escalated = false
  }
}
