import type { TaskMode } from "./task-mode"
import { TASK_MODE_CONFIGS } from "./task-mode"
import { parseModelOutput, formatOutputSchema } from "./schemas"
import { Detector } from "./detector"
import type { Claim } from "./detector"

export type DriftIssueType =
  | "schema_drift"
  | "scope_drift"
  | "unsupported_claim"
  | "instruction_conflict"
  | "confidence_mismatch"
  | "version_drift"
  | "tier_violation"

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

interface HardValidation {
  issues: DriftIssue[]
  parsed: unknown | null
}

interface RuleValidation {
  issues: DriftIssue[]
}

interface ModelValidation {
  issues: DriftIssue[]
  claims: Claim[]
}

export class DriftGuard {
  private detector = new Detector()

  validate(
    output: string,
    config: DriftGuardConfig,
    toolCalls: number,
  ): { passed: boolean; issues: DriftIssue[]; score: number; parsed: unknown | null } {
    const issues: DriftIssue[] = []

    const hard = this.hardValidate(output, config)
    issues.push(...hard.issues)

    const rule = this.ruleValidate(output, config)
    issues.push(...rule.issues)

    const detectionResult = this.detector.analyze(output, toolCalls)
    const modelVal = this.modelValidate(output, detectionResult.claims ?? [], config)
    issues.push(...modelVal.issues)

    const errorCount = issues.filter((i) => i.severity === "error").length
    const warningCount = issues.filter((i) => i.severity === "warning").length
    const score = Math.max(0, 1.0 - errorCount * 0.35 - warningCount * 0.1)

    return {
      passed: errorCount === 0,
      issues,
      score,
      parsed: hard.parsed,
    }
  }

  private hardValidate(output: string, config: DriftGuardConfig): HardValidation {
    const issues: DriftIssue[] = []
    let parsed: unknown = null

    // Layer 1: JSON parse
    try {
      parsed = JSON.parse(output)
    } catch {
      issues.push({
        type: "schema_drift",
        severity: "error",
        message: "Output is not valid JSON. Models must return structured JSON output.",
      })
      return { issues, parsed: null }
    }

    // Layer 2: Zod schema
    const result = parseModelOutput(config.mode, output)
    if (!result.success) {
      const schemaStr = formatOutputSchema(config.mode)
      issues.push({
        type: "schema_drift",
        severity: "error",
        message: `Output does not match schema: ${result.error}. Expected format:\n${schemaStr}`,
      })
      return { issues, parsed }
    }

    return { issues, parsed }
  }

  private ruleValidate(output: string, config: DriftGuardConfig): RuleValidation {
    const issues: DriftIssue[] = []

    // Scope drift: forbidden actions
    if (config.forbiddenActions.length > 0) {
      const lower = output.toLowerCase()
      for (const action of config.forbiddenActions) {
        if (lower.includes(action.toLowerCase())) {
          issues.push({
            type: "scope_drift",
            severity: "error",
            message: `Output mentions forbidden action: "${action}"`,
          })
        }
      }
    }

    // Version drift
    if (config.activeVersion) {
      const versionPatterns = [
        ...config.allowedVersions.map((v) => v.toLowerCase()),
        config.activeVersion.toLowerCase(),
      ]
      const versionRegex = /v?\d+[.-][a-z0-9]+/gi
      const matches = output.match(versionRegex)
      if (matches) {
        for (const match of matches) {
          if (!versionPatterns.some((vp) => match.toLowerCase().includes(vp))) {
            issues.push({
              type: "version_drift",
              severity: "warning",
              message: `References unknown version "${match}". Active version is ${config.activeVersion}.`,
            })
          }
        }
      }
    }

    return { issues }
  }

  private modelValidate(output: string, claims: Claim[], config: DriftGuardConfig): ModelValidation {
    const issues: DriftIssue[] = []

    // Unsupported factual claims
    if (config.evidenceRequired) {
      for (const claim of claims) {
        if (claim.type === "factual" && !claim.hasEvidence) {
          issues.push({
            type: "unsupported_claim",
            severity: "warning",
            message: `Factual claim without evidence: "${claim.content.slice(0, 80)}..."`,
          })
        }
      }
    }

    // Confidence mismatch
    if (claims.length > 0) {
      const highConfidenceClaims = claims.filter((c) => c.confidence > 0.8 && !c.hasEvidence)
      if (highConfidenceClaims.length > 0) {
        issues.push({
          type: "confidence_mismatch",
          severity: "warning",
          message: `${highConfidenceClaims.length} claim(s) have high confidence but no evidence.`,
        })
      }
    }

    // Instruction conflict: allowUnknown
    if (config.allowUnknown) {
      const parsed = this.tryParseJson(output)
      if (parsed && typeof parsed === "object" && parsed !== null && !("status" in parsed)) {
        issues.push({
          type: "instruction_conflict",
          severity: "warning",
          message: "Output does not include 'status' field. Model may not be following structured output mode.",
        })
      }
    }

    return { issues, claims }
  }

  private tryParseJson(text: string): unknown {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }
}
