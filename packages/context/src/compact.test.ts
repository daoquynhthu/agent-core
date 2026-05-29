import { describe, it, expect } from "bun:test"
import { Compactor } from "./compact"

describe("Compactor", () => {
  it("should not compact when under threshold", async () => {
    const compactor = new Compactor({ maxHistoryTokens: 10000 })
    const history = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ]
    const result = await compactor.compact(history)
    expect(result.compressed).toBe(false)
    expect(result.history.length).toBe(2)
  })

  it("should detect when compaction is needed", () => {
    const compactor = new Compactor({ maxHistoryTokens: 100 })
    const longContent = "x".repeat(400)
    const history = [
      { role: "user", content: longContent },
      { role: "assistant", content: longContent },
    ]
    expect(compactor.shouldCompact(history)).toBe(true)
  })

  it("should preserve essential messages", async () => {
    const compactor = new Compactor({ maxHistoryTokens: 1000 })
    const history = Array.from({ length: 50 }, (_, i) => ({
      role: i === 0 ? "system" : "user",
      content: `message ${i}` + "x".repeat(100),
    }))
    const result = await compactor.compact(history)
    expect(result.compressed).toBe(true)
    expect(result.history.some((m) => m.role === "system")).toBe(true)
  })

  it("should handle mid-turn compaction", () => {
    const compactor = new Compactor()
    const short = "hello"
    expect(compactor.midTurnCompact(short).shouldCompact).toBe(false)

    const long = Array.from({ length: 500 }, (_, i) => `line ${i} ${"x".repeat(50)}`).join("\n")
    const result = compactor.midTurnCompact(long)
    expect(result.shouldCompact).toBe(true)
    expect(result.compacted.length).toBeLessThan(long.length)
  })
})
