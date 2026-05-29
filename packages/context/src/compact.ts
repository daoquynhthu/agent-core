import type { CompactOptions, CompactionResult } from "./types"

interface HistoryMessage {
  role: string
  content: string
  tokenCount?: number
}

export class Compactor {
  private options: Required<CompactOptions>
  private static DEFAULT_OPTIONS: Required<CompactOptions> = {
    maxHistoryTokens: 16_000,
    compressionRatio: 0.5,
    summarizer: async (text: string) => {
      return `[摘要] ${text.slice(0, 200)}...`
    },
  }

  constructor(options: CompactOptions = {}) {
    this.options = { ...Compactor.DEFAULT_OPTIONS, ...options }
  }

  shouldCompact(history: HistoryMessage[]): boolean {
    const totalTokens = this.estimateTokens(history)
    return totalTokens > this.options.maxHistoryTokens * 0.8
  }

  async compact(history: HistoryMessage[]): Promise<CompactionResult> {
    const totalTokens = this.estimateTokens(history)
    if (totalTokens <= this.options.maxHistoryTokens) {
      return { compressed: false, history }
    }

    const targetTokens = Math.floor(this.options.maxHistoryTokens * this.options.compressionRatio)
    const compressed = await this.compressHistory(history, targetTokens)

    return {
      compressed: true,
      history: compressed,
    }
  }

  private estimateTokens(messages: HistoryMessage[]): number {
    return messages.reduce((sum, msg) => {
      if (msg.tokenCount !== undefined) return sum + msg.tokenCount
      const textLen = msg.content.length
      return sum + Math.ceil(textLen / 4)
    }, 0)
  }

  private async compressHistory(
    history: HistoryMessage[],
    targetTokens: number,
  ): Promise<HistoryMessage[]> {
    const kept: HistoryMessage[] = []
    let keptTokens = 0
    let summaryBuffer: string[] = []
    let summaryTokenCount = 0
    const summaryTokenBudget = Math.floor(targetTokens * 0.15)

    for (let i = 0; i < history.length; i++) {
      const msg = history[i]
      const msgTokens = this.estimateTokens([msg])

      if (this.isEssential(msg)) {
        kept.push(msg)
        keptTokens += msgTokens
        continue
      }

      if (summaryTokenCount + msgTokens <= summaryTokenBudget) {
        summaryBuffer.push(`${msg.role}: ${msg.content.slice(0, 100)}`)
        summaryTokenCount += msgTokens
      }
    }

    if (summaryBuffer.length > 0) {
      const summary = summaryBuffer.join("\n")
      let summaryText: string
      try {
        summaryText = await this.options.summarizer(summary)
      } catch {
        summaryText = summary.slice(0, 500)
      }

      const summaryEntry: HistoryMessage = {
        role: "system",
        content: `以下是之前对话的摘要：\n${summaryText}`,
      }
      kept.unshift(summaryEntry)
      keptTokens += this.estimateTokens([summaryEntry])
    }

    if (keptTokens > this.options.maxHistoryTokens) {
      return this.truncateOldest(kept, this.options.maxHistoryTokens)
    }

    return kept
  }

  private isEssential(msg: HistoryMessage): boolean {
    const essentialRoles = new Set(["system", "tool"])
    if (essentialRoles.has(msg.role)) return true

    const essentialPatterns = [
      "repo-map",
      "repository map",
      "文件结构",
      "代码库",
    ]
    for (const pattern of essentialPatterns) {
      if (msg.content.toLowerCase().includes(pattern)) return true
    }

    return false
  }

  private truncateOldest(
    messages: HistoryMessage[],
    maxTokens: number,
  ): HistoryMessage[] {
    const systemMessages = messages.filter((m) => m.role === "system")
    const toolMessages = messages.filter((m) => m.role === "tool")
    const otherMessages = messages.filter(
      (m) => m.role !== "system" && m.role !== "tool",
    )

    const result = [...systemMessages, ...toolMessages]
    let resultTokens = this.estimateTokens(result)

    for (const msg of otherMessages.reverse()) {
      const msgTokens = this.estimateTokens([msg])
      if (resultTokens + msgTokens <= maxTokens) {
        result.push(msg)
        resultTokens += msgTokens
      } else {
        break
      }
    }

    return result
  }

  midTurnCompact(currentResponse: string): { shouldCompact: boolean; compacted: string } {
    const MAX_RESPONSE_LENGTH = 8_000
    if (currentResponse.length <= MAX_RESPONSE_LENGTH) {
      return { shouldCompact: false, compacted: currentResponse }
    }

    const lines = currentResponse.split("\n")
    const header = lines.slice(0, 3).join("\n")
    const footer = lines.slice(-5).join("\n")
    const middleTruncated = `\n...[中间 ${lines.length - 8} 行已压缩]...\n`

    return {
      shouldCompact: true,
      compacted: `${header}${middleTruncated}${footer}`,
    }
  }
}
