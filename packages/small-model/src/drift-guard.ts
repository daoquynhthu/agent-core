import type { TaskMode } from "./task-mode"
import { TASK_MODE_CONFIGS } from "./task-mode"
import { Detector } from "./detector"
import type { Claim } from "./detector"

export type DriftIssueType =
  | "schema_drift"
  | "scope_drift"
  | "unsupported_claim"
  | "instruction_conflict"
  | "confidence_mismatch"
  | "version_drift"

export interface DriftIssue {
  type: DriftIssueType
  severity: "warning" | "error"
  message: string
  location?: string
}

export interface DriftGuardConfig {
  mode: TaskMode
  taskScope: string[]
  activeVersion: string
  allowedVersions: string[]
  forbiddenActions: string[]
  allowUnknown: boolean
  evidenceRequired: boolean
}

export class DriftGuard {
  private detector = new Detector()

  validate(
    output: string,
    config: DriftGuardConfig,
    toolCalls: number,
  ): { passed: boolean; issues: DriftIssue[]; score: number } {
    const issues: DriftIssue[] = []

    const schemaIssue = this.checkSchemaDrift(output, config)
    if (schemaIssue) issues.push(schemaIssue)

    const scopeIssue = this.checkScopeDrift(output, config)
    if (scopeIssue) issues.push(scopeIssue)

    const versionIssue = this.checkVersionDrift(output, config)
    if (versionIssue) issues.push(versionIssue)

    const claims = this.detector.extractClaims(output)
    const evidenceIssue = this.checkUnsupportedClaims(claims, config)
    issues.push(...evidenceIssue)

    const instructionIssue = this.checkInstructionConflict(output, config)
    if (instructionIssue) issues.push(instructionIssue)

    const confidenceIssue = this.checkConfidenceMismatch(claims, config)
    if (confidenceIssue) issues.push(confidenceIssue)

    const detectionResult = this.detector.analyze(output, toolCalls)
    const score = Math.max(0, detectionResult.score - issues.length * 0.1)

    return {
      passed: issues.filter((i) => i.severity === "error").length === 0,
      issues,
      score,
    }
  }

  private checkSchemaDrift(output: string, config: DriftGuardConfig): DriftIssue | null {
    const modeConfig = TASK_MODE_CONFIGS[config.mode]
    if (!modeConfig) return null

    const schemaFields = (modeConfig.outputSchema as any)?.fields
    if (!schemaFields) return null

    const lowercaseOutput = output.toLowerCase()
    const fieldNames = Object.keys(schemaFields)

    const missingFields = fieldNames.filter((f) => {
      const fieldKey = f.replace(/([A-Z])/g, "_$1").toLowerCase()
      return !lowercaseOutput.includes(f.toLowerCase()) && !lowercaseOutput.includes(fieldKey)
    })

    if (missingFields.length > 0 && missingFields.length === fieldNames.length) {
      return {
        type: "schema_drift",
        severity: "error",
        message: `Output does not match expected schema for mode ${config.mode}. Missing fields: ${missingFields.join(", ")}`,
      }
    }

    return null
  }

  private checkScopeDrift(output: string, config: DriftGuardConfig): DriftIssue | null {
    if (config.forbiddenActions.length === 0) return null
    const lower = output.toLowerCase()
    for (const action of config.forbiddenActions) {
      if (lower.includes(action.toLowerCase())) {
        return {
          type: "scope_drift",
          severity: "error",
          message: `Output mentions forbidden action: "${action}"`,
        }
      }
    }
    return null
  }

  private checkVersionDrift(output: string, config: DriftGuardConfig): DriftIssue | null {
    const versionPatterns = [
      ...config.allowedVersions.map((v) => v.toLowerCase()),
      config.activeVersion.toLowerCase(),
    ]
    const versionRegex = /v?\d+[.-][a-z0-9]+/gi
    const matches = output.match(versionRegex)
    if (!matches) return null

    for (const match of matches) {
      if (!versionPatterns.some((vp) => match.toLowerCase().includes(vp))) {
        return {
          type: "version_drift",
          severity: "warning",
          message: `References unknown version "${match}". Active version is ${config.activeVersion}.`,
        }
      }
    }
    return null
  }

  private checkUnsupportedClaims(claims: Claim[], config: DriftGuardConfig): DriftIssue[] {
    if (!config.evidenceRequired) return []
    const issues: DriftIssue[] = []

    for (const claim of claims) {
      if (claim.type === "factual" && !claim.hasEvidence) {
        issues.push({
          type: "unsupported_claim",
          severity: "warning",
          message: `Factual claim without evidence: "${claim.content.slice(0, 80)}..."`,
        })
      }
    }

    return issues
  }

  private checkInstructionConflict(output: string, config: DriftGuardConfig): DriftIssue | null {
    const unknownPatterns = [
      /if (?:you are|you're) (?:not |un )?sure/i,
      /if uncertain/i,
      /i (?:don't|do not) know/i,
    ]

    const hasUnknownMarkers = unknownPatterns.some((p) => p.test(output))

    if (config.allowUnknown && !hasUnknownMarkers && output.length < 50) {
      return {
        type: "instruction_conflict",
        severity: "warning",
        message: "Model gave very short output without using UNKNOWN. May be overconfident.",
      }
    }

    return null
  }

  private checkConfidenceMismatch(claims: Claim[], config: DriftGuardConfig): DriftIssue | null {
    if (claims.length === 0) return null
    const highConfidenceClaims = claims.filter((c) => c.confidence > 0.8 && !c.hasEvidence)
    if (highConfidenceClaims.length > 0) {
      return {
        type: "confidence_mismatch",
        severity: "warning",
        message: `${highConfidenceClaims.length} claim(s) have high confidence but no evidence.`,
      }
    }
    return null
  }
}
