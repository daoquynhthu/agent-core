import type { TierLevel } from "./tier"

export type DisclosureRound = 1 | 2 | 3

export interface DisclosurePlan {
  rounds: DisclosureRound[]
  currentRound: DisclosureRound
  needsMoreContext: boolean
}

export class DisclosureController {
  private tier: TierLevel
  private round: DisclosureRound = 1
  private round2Triggered = false
  private round3Triggered = false

  constructor(tier: TierLevel) {
    this.tier = tier
  }

  getCurrentRound(): DisclosureRound {
    return this.round
  }

  getPlan(): DisclosurePlan {
    const rounds: DisclosureRound[] = this.tier === "t1" ? [1, 3] : [1, 2, 3]
    return {
      rounds,
      currentRound: this.round,
      needsMoreContext: this.round < rounds[rounds.length - 1],
    }
  }

  buildRound1Prompt(userMessage: string): string {
    return `[Round 1/3 - Understanding]\n${userMessage}\n\nIf you need to see repository files to answer, respond with:\nNEED_CONTEXT: <file-paths>\n\nIf you can proceed without more context, respond with:\nREADY`
  }

  buildRound2Prompt(userMessage: string, repomap: string, relevantFiles: string[]): string {
    return `[Round 2/3 - Analysis]\nRequest: ${userMessage}\n\nRepository structure:\n${repomap}\n\nRelevant files: ${relevantFiles.join(", ")}\n\nAnalyze the above and propose a solution. If you need full file contents to make changes, respond with:\nNEED_FILES: <file-paths>\n\nOtherwise provide your solution.`
  }

  buildRound3Prompt(userMessage: string, fileContents: string): string {
    return `[Round 3/3 - Implementation]\nRequest: ${userMessage}\n\nFull file contents:\n${fileContents}\n\nImplement the changes now.`
  }

  advanceRound(): DisclosureRound | null {
    if (this.round >= 3) return null
    this.round = (this.round + 1) as DisclosureRound
    return this.round
  }

  shouldAdvance(response: string): boolean {
    if (this.round === 1) return response.includes("NEED_CONTEXT:") || response.includes("NEED_CONTEXT")
    if (this.round === 2) return response.includes("NEED_FILES:") || response.includes("NEED_FILES")
    return false
  }

  parseNeededFiles(response: string): string[] {
    const patterns = [
      /NEED_CONTEXT:\s*([^\n]+)/i,
      /NEED_FILES:\s*([^\n]+)/i,
    ]
    for (const pattern of patterns) {
      const match = response.match(pattern)
      if (match) {
        return match[1].split(/[,;\s]+/).filter((f) => f.trim())
      }
    }
    return []
  }

  reset(): void {
    this.round = 1
    this.round2Triggered = false
    this.round3Triggered = false
  }
}
