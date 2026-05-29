export type Tier = "t1" | "t2" | "t3"

export interface ToolBudget {
  maxTools: number
  maxArgs: number
  timeoutMs: number
  allowedTools: string[]
}

export const TIER_BUDGETS: Record<Tier, ToolBudget> = {
  t1: {
    maxTools: 20,
    maxArgs: 10,
    timeoutMs: 60_000,
    allowedTools: [],
  },
  t2: {
    maxTools: 8,
    maxArgs: 5,
    timeoutMs: 30_000,
    allowedTools: ["read", "write", "edit", "glob", "grep", "bash", "shell", "list"],
  },
  t3: {
    maxTools: 4,
    maxArgs: 3,
    timeoutMs: 15_000,
    allowedTools: ["read", "edit", "bash", "glob"],
  },
}

export const TOOL_COST: Record<string, number> = {
  read: 1,
  write: 3,
  edit: 3,
  glob: 1,
  grep: 2,
  bash: 5,
  shell: 5,
  lsp: 2,
  plan: 4,
  task: 3,
  websearch: 3,
  webfetch: 2,
  question: 1,
}

export class ToolRouter {
  private callCounts: Map<string, number> = new Map()
  private totalCalls: number = 0

  reset(): void {
    this.callCounts.clear()
    this.totalCalls = 0
  }

  route(toolId: string, tier: Tier): { allowed: boolean; reason?: string } {
    const budget = TIER_BUDGETS[tier]
    this.totalCalls++

    const callCount = (this.callCounts.get(toolId) ?? 0) + 1
    this.callCounts.set(toolId, callCount)

    if (budget.allowedTools.length > 0 && !budget.allowedTools.includes(toolId)) {
      return {
        allowed: false,
        reason: `工具 "${toolId}" 在当前模型等级 (${tier}) 下不可用。允许的工具: ${budget.allowedTools.join(", ")}`,
      }
    }

    if (this.totalCalls > budget.maxTools * 2) {
      return {
        allowed: false,
        reason: `工具调用次数已达上限 (${budget.maxTools * 2})`,
      }
    }

    return { allowed: true }
  }

  getCallSummary(): string {
    const entries = [...this.callCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => `${id}: ${count}次`)
    return entries.length ? entries.join(", ") : "无"
  }
}
