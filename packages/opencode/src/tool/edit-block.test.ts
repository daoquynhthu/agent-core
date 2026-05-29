import { describe, it, expect } from "bun:test"
import {
  parseEditBlocks,
  doReplace,
  applyEditBlocks,
} from "./edit-block"

describe("EditBlock", () => {
  it("should parse SEARCH/REPLACE blocks", () => {
    const input = `
\`\`\`test.ts
<<<<<<< SEARCH
const a = 1
=======
const a = 2
>>>>>>> REPLACE
\`\`\`
`
    const blocks = parseEditBlocks(input)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].path).toBe("test.ts")
    expect(blocks[0].original.trim()).toBe("const a = 1")
    expect(blocks[0].updated.trim()).toBe("const a = 2")
  })

  it("should do exact replace", () => {
    const content = "line1\nline2\nline3\n"
    const result = doReplace(content, "line2\n", "modified\n")
    expect(result).toBe("line1\nmodified\nline3\n")
  })

  it("should append when original is empty", () => {
    const content = "existing\n"
    const result = doReplace(content, "", "new content\n")
    expect(result).toBe("existing\nnew content\n")
  })

  it("should return null when original not found", () => {
    const content = "hello world\n"
    const result = doReplace(content, "not found\n", "replacement\n")
    expect(result).toBeNull()
  })

  it("should apply multiple blocks", () => {
    const blocks = [
      { path: "file.ts", original: "a\n", updated: "x\n" },
      { path: "file.ts", original: "b\n", updated: "y\n" },
    ]
    const results = applyEditBlocks("a\nb\nc\n", blocks)
    expect(results).toHaveLength(2)
    expect(results[0].success).toBe(true)
    expect(results[1].success).toBe(true)
  })
})
