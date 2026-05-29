import { describe, it, expect } from "bun:test"
import { ArchitectAgent } from "./architect"
import type { UserInput, AgentEvent } from "./types"

describe("ArchitectAgent", () => {
  it("should generate a plan from user input", async () => {
    const agent = new ArchitectAgent({ id: "test-architect" })
    const provider = async (_prompt: string) => {
      return "1. Modify src/index.ts\n2. Add new function"
    }
    agent.setEditorProvider(async (plan: string) => `Execute: ${plan}`)

    const input: UserInput = {
      message: "Add a login feature",
      provider,
    }

    const events: AgentEvent[] = []
    for await (const event of agent.process(input)) {
      events.push(event)
    }

    expect(events.length).toBeGreaterThan(0)
    expect(events.some((e) => e.type === "plan")).toBe(true)
  })

  it("should have correct capabilities", () => {
    const agent = new ArchitectAgent({ id: "arch" })
    expect(agent.capabilities).toContain("architect")
    expect(agent.tier).toBe("t1")
  })

  it("should stop at confirm when autoAccept is false", async () => {
    const agent = new ArchitectAgent({ id: "arch", autoAccept: false })
    const provider = async (_p: string) => "Some plan"

    const input: UserInput = { message: "test", provider }
    const events: AgentEvent[] = []
    for await (const event of agent.process(input)) {
      events.push(event)
    }

    expect(events.some((e) => e.type === "confirm")).toBe(true)
    expect(events.some((e) => e.type === "result")).toBe(false)
  })
})
