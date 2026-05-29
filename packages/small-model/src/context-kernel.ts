import type { TierLevel } from "./tier"
import { determineTier, getModelProfile } from "./tier"
import { StateLedger } from "./state-ledger"
import { resolveTaskMode } from "./task-mode"
import type { TaskMode } from "./task-mode"
import { PromptPacketCompiler } from "./prompt-packet"
import type { PromptPacket } from "./prompt-packet"
import { DriftGuard } from "./drift-guard"
import type { DriftGuardConfig, DriftIssue } from "./drift-guard"
import type { ContextItem } from "./context-item"
import { rankByUtility, removeConflicts } from "./context-item"
import { Detector } from "./detector"
import type { DetectionResult } from "./detector"

export interface KernelInput {
  modelId: string
  taskGoal: string
  taskScope: string[]
  constraints: string[]
  negativeConstraints: string[]
  forbiddenActions: string[]
  allowUnknown: boolean
  evidenceRequired: boolean
  activeVersion: string
  allowedVersions: string[]
}

export interface KernelOutput {
  promptPacket: PromptPacket
  compiledPrompt: string
  tier: TierLevel
  modelProfile: ReturnType<typeof getModelProfile>
  driftCheck: {
    passed: boolean
    issues: DriftIssue[]
    score: number
  }
  detection: DetectionResult
}

export interface ProcessedResult {
  prompt: string
  mode: TaskMode
  tokenBudget: { inputMax: number; outputMax: number }
}

export class ContextKernel {
  readonly ledger: StateLedger
  private compiler: PromptPacketCompiler
  private driftGuard: DriftGuard
  private detector: Detector

  constructor() {
    this.ledger = new StateLedger()
    this.compiler = new PromptPacketCompiler()
    this.driftGuard = new DriftGuard()
    this.detector = new Detector()
  }

  async loadState(baseDir?: string): Promise<void> {
    if (baseDir) this.ledger.setBaseDir(baseDir)
    await this.ledger.load()
  }

  async compile(input: KernelInput): Promise<ProcessedResult> {
    const tier = determineTier(input.modelId)
    const mode = resolveTaskMode(input.taskGoal)
    const profile = getModelProfile(input.modelId)

    const ledgerItems = this.ledger.toContextItems()
    const filtered = removeConflicts(ledgerItems)
    const ranked = rankByUtility(filtered, input.taskScope)

    const tokenBudget = this.resolveTokenBudget(tier, mode)

    const selected: ContextItem[] = []
    let currentTokens = 0
    for (const item of ranked) {
      const cost = item.tokenCost
      if (currentTokens + cost <= tokenBudget.inputMax * 0.7) {
        selected.push(item)
        currentTokens += cost
      }
    }

    const packet: PromptPacket = {
      mode,
      modelId: input.modelId,
      modelTier: tier,
      task: {
        goal: input.taskGoal,
        scope: input.taskScope,
      },
      context: selected,
      evidence: [],
      constraints: input.constraints,
      negativeConstraints: input.negativeConstraints,
      outputSchema: {},
      tokenBudget: {
        inputMax: tokenBudget.inputMax,
        outputMax: tokenBudget.outputMax,
        currentInput: currentTokens,
      },
      allowUnknown: input.allowUnknown,
    }

    const compiled = this.compiler.renderMinimal(packet)

    return {
      prompt: compiled,
      mode,
      tokenBudget: {
        inputMax: tokenBudget.inputMax,
        outputMax: tokenBudget.outputMax,
      },
    }
  }

  validate(
    output: string,
    mode: TaskMode,
    input: KernelInput,
    toolCalls: number,
  ): {
    passed: boolean
    issues: DriftIssue[]
    score: number
    detection: DetectionResult
  } {
    const driftConfig: DriftGuardConfig = {
      mode,
      taskScope: input.taskScope,
      activeVersion: input.activeVersion,
      allowedVersions: input.allowedVersions,
      forbiddenActions: input.forbiddenActions,
      allowUnknown: input.allowUnknown,
      evidenceRequired: input.evidenceRequired,
    }

    const driftResult = this.driftGuard.validate(output, driftConfig, toolCalls)
    const detectionResult = this.detector.analyze(output, toolCalls)

    return {
      passed: driftResult.passed,
      issues: driftResult.issues,
      score: driftResult.score,
      detection: detectionResult,
    }
  }

  async persistDecision(params: {
    id: string
    kind: string
    content: string
    source: "agent_claim" | "verified_fact" | "human_decision" | "test_output" | "tool_output"
    scope: string[]
    confidence: number
    conflictsWith: string[]
  }): Promise<void> {
    this.ledger.addEntry({
      id: params.id,
      kind: params.kind,
      content: params.content,
      source: params.source,
      status: params.source === "verified_fact" || params.source === "human_decision" ? "verified" : "unverified",
      scope: params.scope,
      confidence: params.confidence,
      evidenceIds: [],
      conflictsWith: params.conflictsWith,
    })
    await this.ledger.save()
  }

  private resolveTokenBudget(tier: TierLevel, _mode: TaskMode): { inputMax: number; outputMax: number } {
    switch (tier) {
      case "t1":
        return { inputMax: 12000, outputMax: 1500 }
      case "t2":
        return { inputMax: 2500, outputMax: 300 }
      case "t3":
        return { inputMax: 900, outputMax: 120 }
    }
  }
}
