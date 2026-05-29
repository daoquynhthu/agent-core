export type ContextStatus =
  | "active"
  | "deprecated"
  | "rejected"
  | "hypothesis"
  | "verified"
  | "unverified"
  | "stale"

export interface ContextItem {
  id: string
  kind: string
  content: string
  source: string
  status: ContextStatus
  scope: string[]
  version: string
  confidence: number
  tokenCost: number
  priority: number
  evidenceIds: string[]
  conflictsWith: string[]
}

export interface Evidence {
  id: string
  type: "file_excerpt" | "test_output" | "diff" | "human_acceptance" | "tool_output"
  source: string
  content: string
  contentHash?: string
}

const STATUS_WEIGHT: Record<ContextStatus, number> = {
  active: 1.0,
  verified: 0.95,
  hypothesis: 0.35,
  unverified: 0.25,
  stale: 0.1,
  deprecated: -0.5,
  rejected: -0.8,
}

export function getStatusWeight(status: ContextStatus): number {
  return STATUS_WEIGHT[status]
}

const STATUS_PREFIX: Record<ContextStatus, string> = {
  active: "",
  verified: "[VERIFIED] ",
  hypothesis: "[HYPOTHESIS] ",
  unverified: "[UNVERIFIED] ",
  stale: "[STALE] ",
  deprecated: "[DEPRECATED] ",
  rejected: "[REJECTED] ",
}

export function formatContextItem(item: ContextItem): string {
  const prefix = STATUS_PREFIX[item.status]
  if (item.status === "active" || item.status === "verified") {
    return item.content
  }
  return `${prefix}${item.content}`
}

const CONFLICT_PENALTY = 1.0
const TOKEN_COST_PENALTY_FACTOR = 0.3

export interface ScoreParams {
  taskRelevance: number
  scopeMatch: number
  confidence: number
  priority: number
  recency: number
  tokenCost: number
  statusWeight: number
  hasConflict: boolean
}

export function scoreContextItem(params: ScoreParams): number {
  const score =
    params.taskRelevance * 0.40 +
    params.priority * 0.25 +
    params.confidence * 0.20 +
    params.recency * 0.10 +
    params.scopeMatch * 0.05 -
    (params.tokenCost / 1000) * TOKEN_COST_PENALTY_FACTOR -
    (params.hasConflict ? CONFLICT_PENALTY : 0)

  return Math.max(-1, Math.min(2, score))
}

export function removeConflicts(items: ContextItem[]): ContextItem[] {
  const conflictIds = new Set<string>()
  for (const item of items) {
    for (const conflictId of item.conflictsWith) {
      conflictIds.add(conflictId)
    }
  }
  return items.filter((item) => !conflictIds.has(item.id))
}

export function rankByUtility(items: ContextItem[], taskScope: string[]): ContextItem[] {
  const scored = items.map((item) => {
    const scopeMatch = taskScope.some((s) => item.scope.includes(s)) ? 1.0 : 0.0
    const tokenCostNorm = Math.min(1, item.tokenCost / 2000)
    const utilityPerToken =
      (scopeMatch * 0.4 + getStatusWeight(item.status) * 0.3 + item.confidence * 0.2 + item.priority * 0.1) /
      Math.max(1, tokenCostNorm)
    return { item, utilityPerToken, scopeMatch }
  })

  return scored
    .sort((a, b) => {
      const scopeDiff = b.scopeMatch - a.scopeMatch
      if (scopeDiff !== 0) return scopeDiff
      return b.utilityPerToken - a.utilityPerToken
    })
    .map((s) => s.item)
}
