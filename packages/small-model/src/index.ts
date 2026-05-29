import { determineTier as detTier } from "./tier"
import type { TierLevel } from "./tier"
import type { ModelProfile } from "./tier"
import { getBudget as getBud } from "./budget"
import type { ModelBudget, BudgetUsage } from "./budget"
import { getToolBudget as getTB } from "./tool-budget"
import type { ToolBudget } from "./tool-budget"
import { PromptBuilder as PB } from "./prompt-builder"
import { Detector as Det } from "./detector"
import type { DetectionResult } from "./detector"
import type { Claim } from "./detector"
import type { ClaimType } from "./detector"
import { DisclosureController } from "./disclosure"
import type { DisclosurePlan, DisclosureRound } from "./disclosure"
import { StatsTracker } from "./stats-tracker"
import type { SessionStats, StatsData } from "./stats-tracker"

export { Tier, determineTier, registerModel, registerModelsFromConfig, resetRegistry, getContextWindow, isToolCallReliable, getModelProfile, listRegisteredModels } from "./tier"
export type { TierLevel, ModelProfile, InstructionLevel } from "./tier"
export { getBudget, BudgetController } from "./budget"
export type { ModelBudget, BudgetUsage } from "./budget"
export { ToolBudgetController, getToolBudget } from "./tool-budget"
export type { ToolBudget } from "./tool-budget"
export { PromptBuilder } from "./prompt-builder"
export { Detector } from "./detector"
export type { DetectionResult, Claim, ClaimType } from "./detector"
export { DisclosureController } from "./disclosure"
export type { DisclosurePlan, DisclosureRound } from "./disclosure"
export { StatsTracker } from "./stats-tracker"
export type { SessionStats, StatsData } from "./stats-tracker"
export { getStatusWeight, formatContextItem, scoreContextItem, removeConflicts, rankByUtility, EvidenceRegistry } from "./context-item"
export type { ContextItem, ContextStatus, Evidence, ScoreParams } from "./context-item"
export { TASK_MODE_CONFIGS, getTaskMode, resolveTaskMode, getAllowedModes } from "./task-mode"
export type { TaskMode, TaskModeConfig } from "./task-mode"
export { PromptPacketCompiler } from "./prompt-packet"
export type { PromptPacket, TokenBudget, CompiledPrompt, PromptStyle, PacketRendererOptions } from "./prompt-packet"
export { StateLedger } from "./state-ledger"
export type { LedgerEntry, LedgerSnapshot, ArtifactRecord, LedgerEvent, LedgerEventType } from "./state-ledger"
export { ArtifactSerializer, ArtifactRegistry } from "./artifact"
export type { AgentArtifact, ArtifactType, ArtifactStatus, TaskSpec, PatchPlan, DiffSummary, RiskReview, DecisionProposal, ConstraintViolation, ExplorationResult, ArchitectureDecision, TestReport, MemoryUpdateProposal } from "./artifact"
export { DriftGuard } from "./drift-guard"
export type { DriftIssue, DriftIssueType, DriftGuardConfig } from "./drift-guard"
export { ContextKernel } from "./context-kernel"
export type { KernelInput, CompileResult, CompileReport, TokenReport } from "./context-kernel"
export { parseModelOutput, getSchemaForMode, formatOutputSchema, RouteSchema, CheckConstraintsSchema, ConstraintCheckSchema, DiffReviewSchema } from "./schemas"
export type { ParsedMode, ParseResult } from "./schemas"

export interface SmallModelAdapter {
  determineTier(modelId: string): TierLevel
  getBudget(tier: TierLevel): ModelBudget
  filterTools(tier: TierLevel, allTools: string[]): string[]
  buildPrompt(tier: TierLevel, systemPrompt: string): string
  detectHallucination(response: string, toolCalls: number): DetectionResult
}

export function createAdapter(): SmallModelAdapter {
  return {
    determineTier: (modelId: string) => detTier(modelId),
    getBudget: (tier: TierLevel) => getBud(tier),
    filterTools: (tier: TierLevel, allTools: string[]) => {
      const tb = getTB(tier)
      if (tier === "t1") return allTools
      if (tb.allowedTools.length === 0) return allTools
      return allTools.filter((t) => tb.allowedTools.includes(t))
    },
    buildPrompt: (tier: TierLevel, systemPrompt: string) => {
      const builder = new PB()
      return builder.build(tier, systemPrompt)
    },
    detectHallucination: (response: string, toolCalls: number) => {
      const detector = new Det()
      return detector.analyze(response, toolCalls)
    },
  }
}
