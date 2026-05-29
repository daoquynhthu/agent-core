export interface ToolCall {
  id: string
  toolId: string
  args: Record<string, unknown>
  dependsOn?: string[]
}

export interface ToolResult {
  id: string
  success: boolean
  output: string
  error?: string
  durationMs: number
}

export type ToolExecutor = (toolId: string, args: Record<string, unknown>) => Promise<string>

export class ToolOrchestrator {
  private executor: ToolExecutor

  constructor(executor: ToolExecutor) {
    this.executor = executor
  }

  async executeAll(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    const byId = new Map(toolCalls.map((t) => [t.id, t]))
    const results = new Map<string, ToolResult>()
    const executionOrder = this.topologicalSort(toolCalls)

    for (const batch of executionOrder) {
      const batchResults = await Promise.allSettled(
        batch.map((call) => this.executeOne(call)),
      )
      for (let i = 0; i < batch.length; i++) {
        const result = batchResults[i]
        const call = batch[i]
        if (result.status === "fulfilled") {
          results.set(call.id, result.value)
        } else {
          results.set(call.id, {
            id: call.id,
            success: false,
            output: "",
            error: result.reason?.message ?? String(result.reason),
            durationMs: 0,
          })
        }
      }
    }

    return [...results.values()]
  }

  private async executeOne(call: ToolCall): Promise<ToolResult> {
    const start = performance.now()
    try {
      const output = await this.executor(call.toolId, call.args)
      return {
        id: call.id,
        success: true,
        output,
        durationMs: Math.round(performance.now() - start),
      }
    } catch (err) {
      return {
        id: call.id,
        success: false,
        output: "",
        error: err instanceof Error ? err.message : String(err),
        durationMs: Math.round(performance.now() - start),
      }
    }
  }

  private topologicalSort(toolCalls: ToolCall[]): ToolCall[][] {
    const byId = new Map(toolCalls.map((t) => [t.id, t]))
    const visited = new Set<string>()
    const inStack = new Set<string>()
    const order: ToolCall[][] = []

    const allTools = [...toolCalls]

    const inDegree = new Map<string, number>()
    const adj = new Map<string, string[]>()

    for (const tool of allTools) {
      inDegree.set(tool.id, 0)
      adj.set(tool.id, [])
    }

    for (const tool of allTools) {
      if (tool.dependsOn) {
        for (const dep of tool.dependsOn) {
          if (byId.has(dep)) {
            adj.get(dep)!.push(tool.id)
            inDegree.set(tool.id, (inDegree.get(tool.id) ?? 0) + 1)
          }
        }
      }
    }

    const queue: string[] = []
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id)
    }

    while (queue.length > 0) {
      const batch: string[] = [...queue]
      queue.length = 0
      const batchTools: ToolCall[] = []

      for (const id of batch) {
        const tool = allTools.find((t) => t.id === id)
        if (tool) batchTools.push(tool)
        for (const next of adj.get(id) ?? []) {
          inDegree.set(next, (inDegree.get(next) ?? 0) - 1)
          if (inDegree.get(next) === 0) queue.push(next)
        }
      }

      order.push(batchTools)
    }

    return order
  }

  canParallelize(toolCalls: ToolCall[]): boolean {
    const allIds = new Set(toolCalls.map((t) => t.id))
    for (const tool of toolCalls) {
      if (tool.dependsOn?.some((d) => allIds.has(d))) {
        return false
      }
    }
    return true
  }
}
