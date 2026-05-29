import type { TaskMode } from "./task-mode"

export type ArtifactType =
  | "TaskSpec"
  | "PatchPlan"
  | "DiffSummary"
  | "RiskReview"
  | "TestReport"
  | "DecisionProposal"
  | "ConstraintViolation"
  | "MemoryUpdateProposal"
  | "ExplorationResult"
  | "ArchitectureDecision"

export type ArtifactStatus = "pending_review" | "accepted" | "rejected" | "superseded"

export interface ArtifactBase {
  id: string
  type: ArtifactType
  producedBy: string
  targetAgent?: string
  status: ArtifactStatus
  evidenceIds: string[]
  createdAt: string
}

export interface TaskSpec extends ArtifactBase {
  type: "TaskSpec"
  mode: TaskMode
  goal: string
  scope: string[]
  constraints: string[]
  negativeConstraints: string[]
  inputFiles: string[]
  outputFormat: string
}

export interface PatchPlan extends ArtifactBase {
  type: "PatchPlan"
  filesToModify: Array<{ path: string; changeType: "modify" | "create" | "delete"; summary: string }>
  risks: string[]
  testStrategy: string
}

export interface DiffSummary extends ArtifactBase {
  type: "DiffSummary"
  intent: string
  changedFiles: Array<{ path: string; changeType: string }>
  apiChanges: string[]
  risk: string[]
  tests: string[]
}

export interface RiskReview extends ArtifactBase {
  type: "RiskReview"
  overallRisk: "low" | "medium" | "high"
  correctness: string
  architectureFit: string
  risks: string[]
  missingTests: string[]
  requiredChanges: string[]
  acceptOrReject: "accept" | "reject" | "changes_requested"
}

export interface DecisionProposal extends ArtifactBase {
  type: "DecisionProposal"
  content: string
  alternatives: string[]
  evidence: string[]
  proposedBy: string
}

export interface ConstraintViolation extends ArtifactBase {
  type: "ConstraintViolation"
  violatedConstraint: string
  severity: "warning" | "error"
  location: string
  suggestion: string
}

export interface ExplorationResult extends ArtifactBase {
  type: "ExplorationResult"
  findings: string[]
  relevantFiles: string[]
  symbols: string[]
  openQuestions: string[]
}

export interface ArchitectureDecision extends ArtifactBase {
  type: "ArchitectureDecision"
  content: string
  scope: string[]
  supersedes: string[]
}

export type AgentArtifact =
  | TaskSpec
  | PatchPlan
  | DiffSummary
  | RiskReview
  | DecisionProposal
  | ConstraintViolation
  | ExplorationResult
  | ArchitectureDecision
  | TestReport
  | MemoryUpdateProposal

export interface TestReport extends ArtifactBase {
  type: "TestReport"
  command: string
  passed: number
  failed: number
  failures: Array<{ test: string; error: string }>
  durationMs: number
}

export interface MemoryUpdateProposal extends ArtifactBase {
  type: "MemoryUpdateProposal"
  targetKind: string
  content: string
  reason: string
  confidence: number
}

export class ArtifactSerializer {
  serialize(artifact: AgentArtifact): string {
    const header = `[ARTIFACT:${artifact.type}]`
    const body = JSON.stringify(artifact, null, 2)
    const footer = `[/ARTIFACT]`
    return `${header}\n${body}\n${footer}`
  }

  deserialize(text: string): AgentArtifact | null {
    const match = text.match(/\[ARTIFACT:(\w+)\]\n([\s\S]*?)\n\[\/ARTIFACT\]/)
    if (!match) return null
    try {
      const obj = JSON.parse(match[2])
      return obj as AgentArtifact
    } catch {
      return null
    }
  }

  detectArtifacts(text: string): AgentArtifact[] {
    const artifacts: AgentArtifact[] = []
    const regex = /\[ARTIFACT:(\w+)\]\n([\s\S]*?)\n\[\/ARTIFACT\]/g
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      try {
        const obj = JSON.parse(match[2])
        artifacts.push(obj as AgentArtifact)
      } catch {
        /* skip malformed */
      }
    }
    return artifacts
  }
}
