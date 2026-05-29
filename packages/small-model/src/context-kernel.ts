import type { TierLevel } from "./tier"
import { determineTier, getModelProfile } from "./tier"
import { StateLedger } from "./state-ledger"
import { resolveTaskMode, TASK_MODE_CONFIGS } from "./task-mode"
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

export interface TokenReport {
  availableInput: number
  availableOutput: number
  usedInput: number
  usedForContext: number
  usedForEvidence: number
  budgetSource: string
}

export interface CompileReport {
  mode: TaskMode
  tier: TierLevel
  modelProfile: ReturnType<typeof getModelProfile>
  packet: PromptPacket
  renderedPrompt: string
  selectedContext: ContextItem[]
  droppedContext: Array<{ item: ContextItem; reason: string }>
  tokenReport: TokenReport
  lintWarnings: DriftIssue[]
}

export interface CompileResult {
  success: boolean
  escalationRequired?: boolean
  escalationReason?: string
  report?: CompileReport
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

  async compile(input: KernelInput): Promise<CompileResult> {
    const tier = determineTier(input.modelId)
    const mode = resolveTaskMode(input.taskGoal)
    const profile = getModelProfile(input.modelId)
    const modeConfig = TASK_MODE_CONFIGS[mode]
    const lintWarnings: DriftIssue[] = []

    // P0: check mode allowed tiers
    if (!modeConfig.allowedTiers.includes(tier)) {
      return {
        success: false,
        escalationRequired: true,
        escalationReason: `Mode ${mode} requires tier ${modeConfig.allowedTiers.join(" or ")}, but model "${input.modelId}" is classified as ${tier}`,
      }
    }

    // load ledger context
    const ledgerItems = this.ledger.toContextItems()
    const filtered = removeConflicts(ledgerItems)
    const ranked = rankByUtility(filtered, input.taskScope)

    // filter by model profile preferred/forbidden context
    const profileFiltered = profile?.allowedModes
      ? ranked.filter((item) => {
          if (item.status === "hypothesis" && profile?.allowedModes) {
            if (!profile.allowedModes.includes(mode)) {
              return false
            }
          }
          return true
        })
      : ranked

    // resolve token budget: min(tier, mode budgetHint, profile contextWindow)
    const tokenBudget = this.resolveTokenBudget(tier, mode, profile?.contextWindow)

    // select context items by utility/token under budget
    const selected: ContextItem[] = []
    const droppedContext: CompileReport["droppedContext"] = []
    let currentTokens = 0
    for (const item of profileFiltered) {
      const cost = item.tokenCost
      if (currentTokens + cost <= tokenBudget.inputMax * 0.7) {
        selected.push(item)
        currentTokens += cost
      } else {
        droppedContext.push({
          item,
          reason: `Token budget limit (${tokenBudget.inputMax} input max), exceeded ${tokenBudget.inputMax * 0.7 - currentTokens} remaining`,
        })
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
    const renderedPrompt = compiled.userPrompt

    const tokenReport: TokenReport = {
      availableInput: tokenBudget.inputMax,
      availableOutput: tokenBudget.outputMax,
      usedInput: currentTokens,
      usedForContext: currentTokens,
      usedForEvidence: 0,
      budgetSource: tokenBudget.budgetSource,
    }

    const report: CompileReport = {
      mode,
      tier,
      modelProfile: profile,
      packet,
      renderedPrompt,
      selectedContext: selected,
      droppedContext,
      tokenReport,
      lintWarnings,
    }

    return { success: true, report }
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
    parsed: unknown | null
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
      parsed: driftResult.parsed,
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
    const status = params.source === "verified_fact" || params.source === "human_decision"
      ? "active" as const
      : "unverified" as const
    this.ledger.addEntry({
      id: params.id,
      kind: params.kind,
      content: params.content,
      source: params.source,
      status,
      scope: params.scope,
      confidence: params.confidence,
      evidenceIds: [],
      conflictsWith: params.conflictsWith,
    })
    await this.ledger.save()
  }

  private resolveTokenBudget(tier: TierLevel, mode: TaskMode, contextWindow?: number): { inputMax: number; outputMax: number; budgetSource: string } {
    const modeConfig = TASK_MODE_CONFIGS[mode]
    const safetyRatio = 0.8

    const tierBudgetMap: Record<TierLevel, { input: number; output: number }> = {
      t1: { input: 12000, output: 1500 },
      t2: { input: 2500, output: 300 },
      t3: { input: 900, output: 120 },
    }

    const tierInput = tierBudgetMap[tier].input
    const tierOutput = tierBudgetMap[tier].output
    const modeInput = modeConfig?.budgetHint.input ?? tierInput
    const modeOutput = modeConfig?.budgetHint.output ?? tierOutput
    const windowInput = contextWindow ? Math.floor(contextWindow * safetyRatio) : Infinity

    const inputMax = Math.min(tierInput, modeInput, windowInput)
    const outputMax = Math.min(tierOutput, modeOutput)

    let budgetSource = `tier:${tier}(${tierInput})`
    if (modeInput < tierInput) budgetSource += ` mode:${mode}(${modeInput})`
    if (contextWindow && windowInput < modeInput) budgetSource += ` contextWindow:${windowInput}`

    return { inputMax, outputMax, budgetSource }
  }
}
