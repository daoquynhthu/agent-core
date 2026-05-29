import { describe, it, expect } from "bun:test"
import { determineTier, getContextWindow, registerModel, resetRegistry, registerModelsFromConfig, getModelProfile, listRegisteredModels } from "./tier"
import { BudgetController } from "./budget"
import { ToolBudgetController } from "./tool-budget"
import { PromptBuilder } from "./prompt-builder"
import { Detector } from "./detector"
import { DisclosureController } from "./disclosure"
import { createAdapter } from "./index"

describe("Tier System", () => {
  it("should classify strong models as t1", () => {
    expect(determineTier("claude-sonnet-4")).toBe("t1")
    expect(determineTier("gpt-4o")).toBe("t1")
  })

  it("should classify medium models as t2", () => {
    expect(determineTier("deepseek-chat")).toBe("t2")
    expect(determineTier("gpt-4o-mini")).toBe("t2")
    expect(determineTier("claude-sonnet")).toBe("t2")
  })

  it("should classify small models as t3", () => {
    expect(determineTier("llama-3.2-3b")).toBe("t3")
    expect(determineTier("phi-3")).toBe("t3")
  })

  it("should match exact model IDs before prefix", () => {
    expect(determineTier("gpt-4o-mini-2024-07-18")).toBe("t2")
    expect(determineTier("claude-sonnet-4-20250514")).toBe("t1")
    expect(determineTier("claude-sonnet")).toBe("t2")
  })

  it("should not confuse gpt-4o-mini with gpt-4o", () => {
    expect(determineTier("gpt-4o-mini")).toBe("t2")
    expect(determineTier("gpt-4o")).toBe("t1")
  })

  it("should fallback based on naming patterns", () => {
    expect(determineTier("unknown-mini-model")).toBe("t3")
    expect(determineTier("unknown-flash-model")).toBe("t2")
    expect(determineTier("completely-unknown-model")).toBe("t1")
  })

  it("should return correct context windows", () => {
    expect(getContextWindow("gpt-4o")).toBe(128_000)
    expect(getContextWindow("phi-3")).toBe(4_000)
  })

  it("should support registerModel at runtime", () => {
    resetRegistry()
    registerModel("my-custom-v2", { tier: "t2", contextWindow: 32_000, reliableToolCall: true, instructionFollowing: "medium" })
    expect(determineTier("my-custom-v2")).toBe("t2")
    expect(determineTier("my-custom-v2-beta")).toBe("t2")
  })

  it("should support registerModelsFromConfig", () => {
    resetRegistry()
    registerModelsFromConfig({ "my-t1-model": { tier: "t1", contextWindow: 128_000, reliableToolCall: true, instructionFollowing: "strong" } })
    expect(determineTier("my-t1-model")).toBe("t1")
  })

  it("should list registered models", () => {
    const list = listRegisteredModels()
    expect(list.length).toBeGreaterThan(20)
    expect(list).toContain("gpt-4o")
  })

  it("should get model profile", () => {
    const profile = getModelProfile("gpt-4o")
    expect(profile).not.toBeNull()
    expect(profile!.tier).toBe("t1")
  })
})

describe("BudgetController", () => {
  it("should track usage correctly", () => {
    const ctrl = new BudgetController("t1")
    ctrl.trackSystemPrompt(500)
    ctrl.trackRepomap(1000)
    expect(ctrl.getUsage().systemPrompt).toBe(500)
    expect(ctrl.getUsage().repomap).toBe(1000)
  })

  it("should detect when compaction is needed", () => {
    const ctrl = new BudgetController("t3")
    ctrl.trackSystemPrompt(1500)
    ctrl.trackRepomap(512)
    ctrl.trackHistory(6000)
    ctrl.trackToolResponse(1500)
    expect(ctrl.shouldCompact()).toBe(true)
  })

  it("should truncate text to budget", () => {
    const ctrl = new BudgetController("t3")
    const long = "x".repeat(2000)
    const result = ctrl.truncateToBudget(long, 10)
    expect(result.length).toBeLessThan(long.length)
    expect(result).toContain("truncated")
  })

  it("should estimate tokens with byte-level precision", () => {
    const ctrl = new BudgetController("t1")
    expect(ctrl.estimateTokens("hello world")).toBe(3)
    expect(ctrl.estimateTokens("hi")).toBe(1)
  })

  it("should reset properly", () => {
    const ctrl = new BudgetController("t1")
    ctrl.trackSystemPrompt(5000)
    ctrl.reset()
    expect(ctrl.getUsage().total).toBe(0)
  })
})

describe("ToolBudgetController", () => {
  it("should allow t1 any tool", () => {
    const ctrl = new ToolBudgetController("t1")
    expect(ctrl.isToolAllowed("any-tool")).toBe(true)
  })

  it("should restrict t3 tools", () => {
    const ctrl = new ToolBudgetController("t3")
    expect(ctrl.isToolAllowed("read")).toBe(true)
    expect(ctrl.isToolAllowed("lsp")).toBe(false)
  })

  it("should escalate on consecutive failures", () => {
    const ctrl = new ToolBudgetController("t3")
    ctrl.recordFailure()
    ctrl.recordFailure()
    ctrl.recordFailure()
    expect(ctrl.isEscalated()).toBe(true)
    expect(ctrl.isToolAllowed("bash")).toBe(false)
    expect(ctrl.isToolAllowed("read")).toBe(true)
  })

  it("should track remaining calls", () => {
    const ctrl = new ToolBudgetController("t2")
    expect(ctrl.getRemainingCalls()).toBe(15)
    ctrl.recordCall("read")
    expect(ctrl.getRemainingCalls()).toBe(14)
  })

  it("should reset", () => {
    const ctrl = new ToolBudgetController("t2")
    ctrl.recordCall("read")
    ctrl.recordFailure()
    ctrl.recordFailure()
    ctrl.recordFailure()
    ctrl.reset()
    expect(ctrl.getRemainingCalls()).toBe(15)
    expect(ctrl.isEscalated()).toBe(false)
  })
})

describe("PromptBuilder", () => {
  it("should build tiered prompts", () => {
    const builder = new PromptBuilder()
    const result = builder.build("t1", "You are a coding assistant.")
    expect(result).toContain("SYSTEM CONFIG")
    expect(result).toContain("coding assistant")
  })

  it("should truncate long prompts for t3", () => {
    const builder = new PromptBuilder()
    const long = "x".repeat(10000)
    const result = builder.build("t3", long)
    expect(result.length).toBeLessThan(long.length + 2000)
  })
})

describe("Detector", () => {
  it("should pass clean responses", () => {
    const detector = new Detector()
    const r = detector.analyze("function add(a, b) { return a + b }", 2)
    expect(r.isHallucination).toBe(false)
  })

  it("should flag placeholders", () => {
    const detector = new Detector()
    const r = detector.analyze("TODO: implement. FIXME: add your code here", 0)
    expect(r.score).toBeLessThan(1)
  })

  it("should flag hedging", () => {
    const detector = new Detector()
    const r = detector.analyze("I think this might work. Maybe. I believe it could be correct.", 0)
    expect(r.score).toBeLessThan(0.8)
  })

  it("should detect repetition", () => {
    const detector = new Detector()
    const s = detector.detectRepetition("a\na\na\na\na\n")
    expect(s).toBeLessThan(1)
  })
})

describe("DisclosureController", () => {
  it("should start at round 1 and advance", () => {
    const dc = new DisclosureController("t3")
    expect(dc.getCurrentRound()).toBe(1)
    expect(dc.advanceRound()).toBe(2)
    expect(dc.advanceRound()).toBe(3)
    expect(dc.advanceRound()).toBeNull()
  })

  it("should build different prompts per round", () => {
    const dc = new DisclosureController("t3")
    expect(dc.buildRound1Prompt("add login")).toContain("NEED_CONTEXT")
    dc.advanceRound()
    expect(dc.buildRound2Prompt("add login", "src/", ["auth.ts"])).toContain("Repository structure")
    dc.advanceRound()
    expect(dc.buildRound3Prompt("add login", "file content")).toContain("Implementation")
  })

  it("should detect context needs", () => {
    const dc = new DisclosureController("t2")
    expect(dc.shouldAdvance("NEED_CONTEXT: src/auth.ts")).toBe(true)
    expect(dc.shouldAdvance("Let me code it")).toBe(false)
  })

  it("should parse needed files", () => {
    const dc = new DisclosureController("t3")
    expect(dc.parseNeededFiles("NEED_CONTEXT: a.ts, b.ts")).toContain("a.ts")
  })

  it("should give t1 fewer rounds than t3", () => {
    expect(new DisclosureController("t1").getPlan().rounds).toEqual([1, 3])
    expect(new DisclosureController("t3").getPlan().rounds).toEqual([1, 2, 3])
  })
})

describe("Adapter", () => {
  it("should classify tiers correctly", () => {
    const a = createAdapter()
    expect(a.determineTier("gpt-4o")).toBe("t1")
    expect(a.determineTier("phi-3")).toBe("t3")
  })

  it("should filter tools by tier", () => {
    const a = createAdapter()
    const all = ["read", "write", "edit", "bash", "lsp", "mcp"]
    expect(a.filterTools("t1", all).length).toBe(6)
    expect(a.filterTools("t3", all).length).toBeLessThan(6)
  })
})
