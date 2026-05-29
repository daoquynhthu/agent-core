import { describe, it, expect } from "bun:test"
import { ToolOrchestrator } from "./orchestrator"
import type { ToolCall } from "./orchestrator"

describe("ToolOrchestrator", () => {
  it("should execute tools in parallel", async () => {
    const executor = async (toolId: string) => `executed ${toolId}`
    const orch = new ToolOrchestrator(executor)

    const calls: ToolCall[] = [
      { id: "1", toolId: "read", args: { path: "a.ts" } },
      { id: "2", toolId: "glob", args: { pattern: "*.ts" } },
    ]

    const results = await orch.executeAll(calls)
    expect(results).toHaveLength(2)
    expect(results[0].success).toBe(true)
    expect(results[1].success).toBe(true)
  })

  it("should execute dependent tools in order", async () => {
    const order: string[] = []
    const executor = async (toolId: string) => {
      order.push(toolId)
      return `done ${toolId}`
    }
    const orch = new ToolOrchestrator(executor)

    const calls: ToolCall[] = [
      { id: "1", toolId: "search", args: {} },
      { id: "2", toolId: "edit", args: {}, dependsOn: ["1"] },
      { id: "3", toolId: "test", args: {}, dependsOn: ["2"] },
    ]

    await orch.executeAll(calls)
    expect(order).toEqual(["search", "edit", "test"])
  })

  it("should detect parallelizable calls", () => {
    const orch = new ToolOrchestrator(async () => "")
    const parallelCalls: ToolCall[] = [
      { id: "1", toolId: "read", args: {} },
      { id: "2", toolId: "glob", args: {} },
    ]
    expect(orch.canParallelize(parallelCalls)).toBe(true)

    const sequentialCalls: ToolCall[] = [
      { id: "1", toolId: "search", args: {} },
      { id: "2", toolId: "edit", args: {}, dependsOn: ["1"] },
    ]
    expect(orch.canParallelize(sequentialCalls)).toBe(false)
  })

  it("should handle executor errors gracefully", async () => {
    const executor = async (toolId: string) => {
      throw new Error(`fail: ${toolId}`)
    }
    const orch = new ToolOrchestrator(executor)

    const calls: ToolCall[] = [
      { id: "1", toolId: "read", args: {} },
    ]

    const results = await orch.executeAll(calls)
    expect(results[0].success).toBe(false)
    expect(results[0].error).toContain("fail")
  })
})
