export interface EditBlock {
  path: string
  original: string
  updated: string
}

export interface EditResult {
  success: boolean
  path: string
  error?: string
}

const SEARCH_HEAD = /^<{5,9}\s*SEARCH>?\s*$/
const DIVIDER = /^={5,9}\s*$/
const REPLACE_HEAD = /^>{5,9}\s*REPLACE>?\s*$/

export function parseEditBlocks(content: string): EditBlock[] {
  const lines = content.split("\n")
  const blocks: EditBlock[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (SEARCH_HEAD.test(line.trimStart())) {
      const block = parseOneBlock(lines, i)
      if (block) {
        blocks.push(block)
        i = block.endLine + 1
        continue
      }
    }

    i++
  }

  return blocks
}

interface ParsedBlock extends EditBlock {
  endLine: number
}

function parseOneBlock(lines: string[], startIdx: number): ParsedBlock | null {
  const headLine = lines[startIdx]
  const filename = extractFilename(lines, startIdx)
  let i = startIdx + 1

  const originalLines: string[] = []
  while (i < lines.length && !DIVIDER.test(lines[i].trimStart())) {
    originalLines.push(lines[i])
    i++
  }

  if (i >= lines.length) return null

  i++

  const updatedLines: string[] = []
  while (i < lines.length && !REPLACE_HEAD.test(lines[i].trimStart())) {
    updatedLines.push(lines[i])
    i++
  }

  if (i >= lines.length) return null

  const original = originalLines.join("\n")
  const updated = updatedLines.join("\n")

  return {
    path: filename || "unknown",
    original: original.endsWith("\n") ? original : original + "\n",
    updated: updated.endsWith("\n") ? updated : updated + "\n",
    endLine: i,
  }
}

function extractFilename(lines: string[], headIdx: number): string | null {
  for (let j = Math.max(0, headIdx - 3); j < headIdx; j++) {
    const trimmed = lines[j].trim()
    if (trimmed.startsWith("```") || trimmed.startsWith("``")) {
      const candidate = trimmed.replace(/^`+/, "").trim()
      if (candidate && (candidate.includes(".") || candidate.includes("/"))) {
        return candidate
      }
    }
    if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("`")) {
      const candidate = trimmed.replace(/:$/, "").replace(/^\#\s*/, "").trim()
      if (candidate && (candidate.includes(".") || candidate.includes("/"))) {
        return candidate
      }
    }
  }
  return null
}

export function doReplace(
  content: string,
  original: string,
  updated: string,
): string | null {
  const strippedOriginal = stripQuotedWrapping(original)
  const strippedUpdated = stripQuotedWrapping(updated)

  if (strippedOriginal === null) {
    return (content.endsWith("\n") ? content : content + "\n") + strippedUpdated
  }

  if (strippedUpdated === null) {
    return content + updated
  }

  if (!strippedOriginal.trim()) {
    return content + strippedUpdated
  }

  return replaceMostSimilar(content, strippedOriginal, strippedUpdated)
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n")
}

function replaceMostSimilar(
  content: string,
  beforeText: string,
  afterText: string,
): string | null {
  const cleanContent = normalizeLineEndings(content)

  const exactIdx = cleanContent.indexOf(normalizeLineEndings(beforeText))
  if (exactIdx !== -1) {
    return cleanContent.slice(0, exactIdx) + normalizeLineEndings(afterText) + cleanContent.slice(exactIdx + beforeText.length)
  }

  const contentLines = normalizeLineEndings(content).split("\n")
  let beforeLines = normalizeLineEndings(beforeText).split("\n")

  while (beforeLines.length > 0 && beforeLines[beforeLines.length - 1] === "") {
    beforeLines = beforeLines.slice(0, -1)
  }

  if (beforeLines.length === 0) return content + afterText

  let maxSim = -1
  let bestStart = -1
  let bestEnd = -1

  for (let i = 0; i <= contentLines.length - beforeLines.length; i++) {
    let matches = 0
    for (let j = 0; j < beforeLines.length; j++) {
      if (contentLines[i + j] === beforeLines[j]) matches++
    }
    const similarity = beforeLines.length > 0 ? matches / beforeLines.length : 0
    if (similarity > maxSim) {
      maxSim = similarity
      bestStart = i
      bestEnd = i + beforeLines.length
    }
  }

  if (maxSim <= 0.5) return null

  const before = contentLines.slice(0, bestStart).join("\n")
  const after = contentLines.slice(bestEnd).join("\n")
  return before + (before ? "\n" : "") + normalizeLineEndings(afterText) + (after ? "\n" : after)
}

function stripQuotedWrapping(text: string): string | null {
  const lines = text.split("\n")
  if (lines.length >= 2 && lines[0].trimStart().startsWith("```")) {
    const endIdx = lines.findIndex((l, i) => i > 0 && l.trim().startsWith("```"))
    if (endIdx !== -1) {
      return lines.slice(1, endIdx).join("\n")
    }
    return lines.slice(1).join("\n")
  }
  return text
}

export function applyEditBlocks(
  content: string,
  blocks: EditBlock[],
): EditResult[] {
  const results: EditResult[] = []
  let currentContent = content

  for (const block of blocks) {
    const newContent = doReplace(currentContent, block.original, block.updated)
    if (newContent !== null) {
      currentContent = newContent
      results.push({ success: true, path: block.path })
    } else {
      results.push({
        success: false,
        path: block.path,
        error: `找不到匹配内容:\n${block.original.slice(0, 100)}...`,
      })
    }
  }

  return results
}
