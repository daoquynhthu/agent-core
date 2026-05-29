import type { TierLevel } from "./tier"

export interface ModelBudget {
  maxSystemPromptTokens: number
  maxRepomapTokens: number
  maxHistoryTokens: number
  maxToolResponseTokens: number
  timeoutMs: number
}

export const TIER_BUDGETS: Record<TierLevel, ModelBudget> = {
  t1: {
    maxSystemPromptTokens: 8_000,
    maxRepomapTokens: 4_096,
    maxHistoryTokens: 60_000,
    maxToolResponseTokens: 8_000,
    timeoutMs: 120_000,
  },
  t2: {
    maxSystemPromptTokens: 4_000,
    maxRepomapTokens: 2_048,
    maxHistoryTokens: 20_000,
    maxToolResponseTokens: 4_000,
    timeoutMs: 60_000,
  },
  t3: {
    maxSystemPromptTokens: 1_500,
    maxRepomapTokens: 512,
    maxHistoryTokens: 6_000,
    maxToolResponseTokens: 1_500,
    timeoutMs: 30_000,
  },
}

export function getBudget(tier: TierLevel): ModelBudget {
  return { ...TIER_BUDGETS[tier] }
}

export interface BudgetUsage {
  systemPrompt: number
  repomap: number
  history: number
  toolResponses: number
  total: number
}

export class BudgetController {
  private tier: TierLevel
  private budget: ModelBudget
  private usage: BudgetUsage = { systemPrompt: 0, repomap: 0, history: 0, toolResponses: 0, total: 0 }

  constructor(tier: TierLevel) {
    this.tier = tier
    this.budget = getBudget(tier)
  }

  getBudget(): ModelBudget {
    return { ...this.budget }
  }

  getUsage(): BudgetUsage {
    return { ...this.usage }
  }

  getRemaining(): ModelBudget {
    return {
      maxSystemPromptTokens: this.budget.maxSystemPromptTokens - this.usage.systemPrompt,
      maxRepomapTokens: this.budget.maxRepomapTokens - this.usage.repomap,
      maxHistoryTokens: this.budget.maxHistoryTokens - this.usage.history,
      maxToolResponseTokens: this.budget.maxToolResponseTokens - this.usage.toolResponses,
      timeoutMs: this.budget.timeoutMs,
    }
  }

  getUsagePercent(): number {
    return this.usage.total / this.totalBudget()
  }

  totalBudget(): number {
    return this.budget.maxSystemPromptTokens + this.budget.maxRepomapTokens +
           this.budget.maxHistoryTokens + this.budget.maxToolResponseTokens
  }

  trackSystemPrompt(tokens: number): void {
    this.usage.systemPrompt += tokens
    this.usage.total += tokens
  }

  trackRepomap(tokens: number): void {
    this.usage.repomap += tokens
    this.usage.total += tokens
  }

  trackHistory(tokens: number): void {
    this.usage.history += tokens
    this.usage.total += tokens
  }

  trackToolResponse(tokens: number): void {
    this.usage.toolResponses += tokens
    this.usage.total += tokens
  }

  isExceeded(): boolean {
    return this.usage.total >= this.totalBudget()
  }

  shouldCompact(): boolean {
    return this.getUsagePercent() >= 0.8
  }

  estimateTokens(text: string): number {
    let tokens = 0
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i)
      if (code < 128) tokens += 0.25
      else tokens += 0.5
    }
    return Math.max(1, Math.ceil(tokens))
  }

  truncateToBudget(text: string, maxTokens: number): string {
    const estimated = this.estimateTokens(text)
    if (estimated <= maxTokens) return text
    const ratio = maxTokens / estimated
    const maxChars = Math.floor(text.length * ratio)
    return text.slice(0, maxChars) + `\n...[truncated: ${estimated} tokens -> ${maxTokens} tokens]`
  }

  reset(): void {
    this.usage = { systemPrompt: 0, repomap: 0, history: 0, toolResponses: 0, total: 0 }
  }
}
