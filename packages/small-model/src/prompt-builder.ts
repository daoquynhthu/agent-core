import type { TierLevel } from "./tier"

export class PromptBuilder {
  build(tier: TierLevel, systemPrompt: string, negativeConstraints?: string[]): string {
    const prefix = this.getTierPrefix(tier)
    const middle = this.truncateForTier(tier, systemPrompt)
    const constraints = this.renderNegativeConstraints(negativeConstraints)
    const suffix = this.getTierSuffix(tier)
    return `${prefix}\n\n${middle}${constraints}\n\n${suffix}`
  }

  private renderNegativeConstraints(constraints?: string[]): string {
    if (!constraints || constraints.length === 0) return ""
    const lines = constraints.map((c) => `- ${c}`).join("\n")
    return `\n\nDO NOT:\n${lines}`
  }

  private getTierPrefix(tier: TierLevel): string {
    switch (tier) {
      case "t1":
        return `[SYSTEM CONFIG]
You have access to all tools and full context.
Respond with the highest quality solution possible.
Use any tool at your disposal.`
      case "t2":
        return `[SYSTEM CONFIG]
You have access to core tools: read, write, edit, search, and bash.
Keep responses concise and focused.
If a task seems too complex, break it down step by step.`
      case "t3":
        return `[SYSTEM CONFIG - SIMPLIFIED]
You have limited tools: read, edit, bash, and glob.
Keep responses very short.
Make one change at a time.
Do not try to do everything at once.`
    }
  }

  private getTierSuffix(tier: TierLevel): string {
    switch (tier) {
      case "t1":
        return `[RULES]
- Always verify changes before applying
- Run tests after modifications
- Explain your decisions briefly`
      case "t2":
        return `[RULES]
- Make focused, single-purpose changes
- Verify each change works
- If unsure, ask for clarification`
      case "t3":
        return `[RULES - SIMPLIFIED]
- Change only what is requested
- Read before editing
- Ask if something is unclear`
    }
  }

  private truncateForTier(tier: TierLevel, prompt: string): string {
    const maxLengths: Record<TierLevel, number> = {
      t1: 20_000,
      t2: 6_000,
      t3: 2_000,
    }
    const maxLen = maxLengths[tier]
    if (prompt.length <= maxLen) return prompt
    return prompt.slice(0, maxLen - 100) + `\n...[prompt truncated from ${prompt.length} to ${maxLen} chars]`
  }

  buildSystemPrompt(tier: TierLevel, basePrompt: string, repomap: string, tools: string[]): string {
    const prefix = this.getTierPrefix(tier)
    const suffix = this.getTierSuffix(tier)
    const maxLengths: Record<TierLevel, { base: number; repomap: number }> = {
      t1: { base: 8_000, repomap: 4_096 },
      t2: { base: 4_000, repomap: 2_048 },
      t3: { base: 1_500, repomap: 512 },
    }

    const limits = maxLengths[tier]
    const truncatedBase = this.truncateToLength(basePrompt, limits.base)
    const truncatedRepomap = this.truncateToLength(repomap, limits.repomap)
    const toolList = tier === "t1" ? tools.join(", ") : tools.join(", ")

    return `${prefix}

${truncatedBase}

Available tools: ${toolList}

Repository structure:
${truncatedRepomap}

${suffix}`
  }

  private truncateToLength(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text
    const half = Math.floor(maxLen / 2) - 50
    return text.slice(0, half) + `\n...[middle ${text.length - maxLen + 100} chars truncated]...\n` + text.slice(-half)
  }
}
