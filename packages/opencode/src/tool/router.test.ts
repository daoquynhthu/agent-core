import { describe, it, expect } from "bun:test"
import { ToolRouter } from "./router"

describe("ToolRouter", () => {
  it("should allow t1 tools by default", () => {
    const router = new ToolRouter()
    const result = router.route("bash", "t1")
    expect(result.allowed).toBe(true)
  })

  it("should block t3 tools not in allowed list", () => {
    const router = new ToolRouter()
    const result = router.route("lsp", "t3")
    expect(result.allowed).toBe(false)
  })

  it("should allow read for t3", () => {
    const router = new ToolRouter()
    const result = router.route("read", "t3")
    expect(result.allowed).toBe(true)
  })

  it("should track call counts", () => {
    const router = new ToolRouter()
    router.route("bash", "t1")
    router.route("read", "t1")
    const summary = router.getCallSummary()
    expect(summary).toContain("bash")
    expect(summary).toContain("read")
  })

  it("should reset properly", () => {
    const router = new ToolRouter()
    router.route("bash", "t1")
    router.reset()
    expect(router.getCallSummary()).toBe("无")
  })
})
