export type TierLevel = "t1" | "t2" | "t3"

export const Tier = {
  T1: "t1" as TierLevel,
  T2: "t2" as TierLevel,
  T3: "t3" as TierLevel,
} as const

import type { TaskMode } from "./task-mode"
import { getAllowedModes } from "./task-mode"

export type InstructionLevel = "strong" | "medium" | "weak"

export interface ModelProfile {
  tier: TierLevel
  contextWindow: number
  reliableToolCall: boolean
  instructionFollowing: InstructionLevel
  allowedModes?: TaskMode[]
  preferredContext?: string[]
  forbiddenContext?: string[]
}

function buildProfile(
  tier: TierLevel,
  contextWindow: number,
  reliableToolCall: boolean,
  instructionFollowing: InstructionLevel,
): ModelProfile {
  return {
    tier,
    contextWindow,
    reliableToolCall,
    instructionFollowing,
    allowedModes: getAllowedModes(tier),
  }
}

const DEFAULT_REGISTRY: Record<string, ModelProfile> = {
  "claude-3-opus-20240229": buildProfile("t1", 200_000, true, "strong"),
  "claude-opus-4-20250514": buildProfile("t1", 200_000, true, "strong"),
  "claude-sonnet-4-20250514": buildProfile("t1", 200_000, true, "strong"),
  "gpt-4o-2024-08-06": buildProfile("t1", 128_000, true, "strong"),
  "gpt-4.1-2025-04-14": buildProfile("t1", 128_000, true, "strong"),
  "gemini-2.5-pro-exp-03-25": buildProfile("t1", 1_000_000, true, "strong"),

  "claude-sonnet-4": buildProfile("t1", 200_000, true, "strong"),
  "claude-3-opus": buildProfile("t1", 200_000, true, "strong"),
  "gpt-4o": buildProfile("t1", 128_000, true, "strong"),
  "gpt-4.1": buildProfile("t1", 128_000, true, "strong"),
  "gemini-2.5-pro": buildProfile("t1", 1_000_000, true, "strong"),

  "claude-sonnet": buildProfile("t2", 200_000, true, "medium"),
  "gpt-4o-mini": buildProfile("t2", 128_000, true, "medium"),
  "gpt-4o-mini-2024-07-18": buildProfile("t2", 128_000, true, "medium"),
  "deepseek-chat": buildProfile("t2", 64_000, true, "medium"),
  "deepseek-v3": buildProfile("t2", 64_000, true, "medium"),
  "gemini-2.0-flash": buildProfile("t2", 1_000_000, true, "medium"),
  "mistral-large": buildProfile("t2", 128_000, true, "medium"),
  "qwen-max": buildProfile("t2", 32_000, true, "medium"),

  "llama-3.1-8b": { tier: "t3", contextWindow: 8_000, reliableToolCall: false, instructionFollowing: "weak" },
  "llama-3.2-3b": { tier: "t3", contextWindow: 8_000, reliableToolCall: false, instructionFollowing: "weak" },
  "llama-3.2-1b": { tier: "t3", contextWindow: 8_000, reliableToolCall: false, instructionFollowing: "weak" },
  "phi-3": { tier: "t3", contextWindow: 4_000, reliableToolCall: false, instructionFollowing: "weak" },
  "phi-3-mini": { tier: "t3", contextWindow: 4_000, reliableToolCall: false, instructionFollowing: "weak" },
  "gemma-2b": { tier: "t3", contextWindow: 8_000, reliableToolCall: false, instructionFollowing: "weak" },
  "qwen-2.5-7b": { tier: "t3", contextWindow: 32_000, reliableToolCall: false, instructionFollowing: "weak" },
}

let registry = { ...DEFAULT_REGISTRY }

function getSortedKeys(): string[] {
  return Object.keys(registry).sort((a, b) => b.length - a.length)
}

function normalizeModelId(modelId: string): { id: string; final: boolean } | null {
  const id = modelId.toLowerCase()

  if (registry[id]) return { id, final: true }

  const exactPrefix = getSortedKeys().find((key) => id.startsWith(key + "/") || id.startsWith(key + ":"))
  if (exactPrefix) return { id: exactPrefix, final: true }

  const sorted = getSortedKeys()
  for (const key of sorted) {
    if (id.startsWith(key)) return { id: key, final: false }
  }

  return null
}

export function registerModel(modelId: string, profile: ModelProfile): void {
  registry[modelId.toLowerCase()] = profile
}

export function registerModelsFromConfig(models: Record<string, ModelProfile>): void {
  for (const [id, profile] of Object.entries(models)) {
    registry[id.toLowerCase()] = profile
  }
}

export function resetRegistry(): void {
  registry = { ...DEFAULT_REGISTRY }
}

export function determineTier(modelId: string): TierLevel {
  const match = normalizeModelId(modelId)
  if (match && !match.final && modelId.toLowerCase() === match.id) {
    return registry[match.id].tier
  }
  if (match) {
    const profile = registry[match.id]
    if (profile) return profile.tier
  }

  const fallbacks: Array<[RegExp, TierLevel]> = [
    [/[\d.]+b$/, "t3"],
    [/mini|nano|pico|tiny|small|lite/, "t3"],
    [/flash|sonnet|medium/, "t2"],
    [/haiku/, "t2"],
  ]

  const id = modelId.toLowerCase()
  for (const [pattern, tier] of fallbacks) {
    if (pattern.test(id)) return tier
  }

  return "t1"
}

export function getContextWindow(modelId: string): number {
  const match = normalizeModelId(modelId)
  if (match) {
    const profile = registry[match.id]
    if (profile) return profile.contextWindow
  }

  const tier = determineTier(modelId)
  if (tier === "t3") return 8_000
  if (tier === "t2") return 64_000
  return 128_000
}

export function isToolCallReliable(modelId: string): boolean {
  const match = normalizeModelId(modelId)
  if (match) {
    const profile = registry[match.id]
    if (profile) return profile.reliableToolCall
  }
  return determineTier(modelId) === "t1"
}

export function getModelProfile(modelId: string): ModelProfile | null {
  const match = normalizeModelId(modelId)
  if (match) {
    const profile = registry[match.id]
    if (profile) return { ...profile }
  }
  return null
}

export function listRegisteredModels(): string[] {
  return Object.keys(registry).sort()
}
