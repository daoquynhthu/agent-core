import type { TaskMode } from "./task-mode"
import type { StateLedger } from "./state-ledger"
import {
  RouteSchema,
  CheckConstraintsSchema,
  DiffReviewSchema,
  RankFilesSchema,
  ExtractFactsSchema,
  SummarizeStructuredSchema,
  ClassifyErrorSchema,
  SelectTestsSchema,
  DetectUncertaintySchema,
  ArchitectureDesignSchema,
  ComplexReviewSchema,
  ConstraintCheckSchema,
} from "./schemas"
import type { z } from "zod"

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

const ARTIFACT_TO_SCHEMA: Record<string, z.ZodTypeAny> = {
  TaskSpec: RouteSchema,
  PatchPlan: RouteSchema,
  DiffSummary: DiffReviewSchema,
  RiskReview: ComplexReviewSchema,
  TestReport: RouteSchema,
  DecisionProposal: RouteSchema,
  ConstraintViolation: CheckConstraintsSchema,
  ExplorationResult: RouteSchema,
  ArchitectureDecision: RouteSchema,
  MemoryUpdateProposal: RouteSchema,
}

export interface ArtifactValidationResult {
  valid: boolean
  errors: string[]
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

export class ArtifactRegistry {
  private ledger: StateLedger
  private serializer: ArtifactSerializer
  private artifacts: AgentArtifact[] = []

  constructor(ledger: StateLedger) {
    this.ledger = ledger
    this.serializer = new ArtifactSerializer()
  }

  validate(artifact: AgentArtifact): ArtifactValidationResult {
    const schema = ARTIFACT_TO_SCHEMA[artifact.type]
    if (!schema) {
      return { valid: true, errors: [] }
    }

    const result = schema.safeParse(artifact)
    if (result.success) {
      return { valid: true, errors: [] }
    }

    return {
      valid: false,
      errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    }
  }

  async propose(artifact: AgentArtifact): Promise<ArtifactValidationResult> {
    const validation = this.validate(artifact)
    if (!validation.valid) {
      return validation
    }

    this.artifacts.push(artifact)

    await this.ledger.addArtifact({
      id: artifact.id,
      type: artifact.type,
      producedBy: artifact.producedBy,
      summary: JSON.stringify(artifact).slice(0, 200),
      status: "pending_review",
    })

    return { valid: true, errors: [] }
  }

  async accept(id: string): Promise<ArchitectureDecision | null> {
    const artifact = this.artifacts.find((a) => a.id === id)
    if (!artifact) return null

    await this.ledger.acceptArtifact(id)

    if (artifact.type === "DecisionProposal") {
      const proposal = artifact as DecisionProposal
      const decision: ArchitectureDecision = {
        id: `D-${id}`,
        type: "ArchitectureDecision",
        producedBy: artifact.producedBy,
        status: "accepted",
        evidenceIds: artifact.evidenceIds,
        createdAt: new Date().toISOString(),
        content: proposal.content,
        scope: [],
        supersedes: [],
      }

      this.artifacts.push(decision)

      await this.ledger.addEntry({
        id: decision.id,
        kind: "architecture_decision",
        content: decision.content,
        source: "human_decision",
        status: "active",
        scope: decision.scope,
        confidence: 0.95,
        evidenceIds: decision.evidenceIds,
        conflictsWith: [],
      })

      return decision
    }

    return null
  }

  async reject(id: string): Promise<void> {
    await this.ledger.rejectArtifact(id)
    const artifact = this.artifacts.find((a) => a.id === id)
    if (artifact) {
      artifact.status = "rejected"
    }
  }

  getPendingByType(type: ArtifactType): AgentArtifact[] {
    return this.artifacts.filter((a) => a.type === type && a.status === "pending_review")
  }

  getAll(): AgentArtifact[] {
    return [...this.artifacts]
  }
}
