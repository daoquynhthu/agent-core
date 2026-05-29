export type ClaimType = "factual" | "judgment" | "recommendation"

export interface Claim {
  content: string
  type: ClaimType
  hasEvidence: boolean
  evidenceIds: string[]
  confidence: number
}

export interface DetectionResult {
  score: number
  isHallucination: boolean
  reasons: string[]
  claims?: Claim[]
}

export class Detector {
  analyze(response: string, toolCalls: number): DetectionResult {
    const reasons: string[] = []
    let score = 1.0

    const repetitionScore = this.detectRepetition(response)
    if (repetitionScore < 0.8) {
      reasons.push(`Possible repetition detected (score: ${repetitionScore.toFixed(2)})`)
      score *= repetitionScore
    }

    const placeholderScore = this.detectPlaceholders(response)
    if (placeholderScore < 1.0) {
      reasons.push(`Placeholder content detected`)
      score *= placeholderScore
    }

    const hedgingScore = this.detectHedging(response)
    if (hedgingScore < 1.0) {
      reasons.push(`Excessive hedging language detected`)
      score *= hedgingScore
    }

    if (toolCalls === 0 && response.length > 500) {
      const toolKeywords = ["search", "look up", "check", "find", "look at", "read"]
      const hasToolMentions = toolKeywords.some((kw) => response.toLowerCase().includes(kw))
      if (hasToolMentions) {
        reasons.push("Mentions tool actions but made no actual tool calls")
        score *= 0.5
      }
    }

    if (response.length > 2000 && toolCalls === 0) {
      reasons.push(`Long response (${response.length} chars) with no tool usage`)
      score *= 0.9
    }

    const claims = this.extractClaims(response)

    return {
      score,
      isHallucination: score < 0.5,
      reasons,
      claims,
    }
  }

  extractClaims(text: string): Claim[] {
    const claims: Claim[] = []
    const sentences = text.split(/[.?!\n]+/).filter((s) => s.trim().length > 20)

    for (const sentence of sentences) {
      const lower = sentence.toLowerCase().trim()
      const hasEvidence = /(?:according to|from|in file|see|refer to|based on|as shown|as documented)/i.test(lower)
      let type: ClaimType = "judgment"

      if (hasEvidence || /(?:is|was|are|were|has|have|contains|returns|implements)/i.test(lower)) {
        type = "factual"
      }
      if (/\b(?:should|could|recommend|consider|suggest|try using)\b/i.test(lower)) {
        type = "recommendation"
      }

      claims.push({
        content: sentence.trim(),
        type,
        hasEvidence,
        evidenceIds: hasEvidence ? ["unknown_source"] : [],
        confidence: hasEvidence ? 0.8 : 0.4,
      })
    }

    return claims
  }

  checkEvidenceBinding(claims: Claim[]): { score: number; unboundedClaims: Claim[] } {
    const factualClaims = claims.filter((c) => c.type === "factual")
    const unbounded = factualClaims.filter((c) => !c.hasEvidence)
    const ratio = factualClaims.length > 0 ? unbounded.length / factualClaims.length : 0
    const score = Math.max(0, 1 - ratio)
    return { score, unboundedClaims: unbounded }
  }

  detectRepetition(text: string): number {
    const lines = text.split("\n").filter((l) => l.trim()).map((l) => l.trim())
    if (lines.length < 4) return 1.0

    let duplicateCount = 0
    const seen = new Set<string>()
    for (const line of lines) {
      const normalized = line.toLowerCase().replace(/\s+/g, " ").slice(0, 40)
      if (seen.has(normalized)) duplicateCount++
      seen.add(normalized)
    }

    const ratio = duplicateCount / lines.length
    if (ratio > 0.3) return Math.max(0, 1 - ratio)
    return 1.0
  }

  detectPlaceholders(text: string): number {
    const placeholderPatterns = [
      /TODO/i,
      /FIXME/i,
      /your code here/i,
      /place.?holder/i,
      /need to implement/i,
      /tbd/i,
      /something like/i,
    ]
    let hits = 0
    for (const pattern of placeholderPatterns) {
      if (pattern.test(text)) hits++
    }
    if (hits >= 2) return 0.6
    if (hits === 1) return 0.9
    return 1.0
  }

  detectHedging(text: string): number {
    const hedgingPhrases = [
      "i think", "maybe", "perhaps", "might be", "could be",
      "i believe", "it seems", "probably", "possibly", "i assume",
      "as far as i know", "to the best of my knowledge",
    ]
    const lowerText = text.toLowerCase()
    let count = 0
    for (const phrase of hedgingPhrases) {
      const regex = new RegExp(phrase, "gi")
      const matches = lowerText.match(regex)
      if (matches) count += matches.length
    }

    if (count >= 5) return 0.4
    if (count >= 3) return 0.7
    if (count >= 1) return 0.9
    return 1.0
  }
}
