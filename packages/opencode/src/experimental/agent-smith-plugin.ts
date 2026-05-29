import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import { determineTier } from "@agent-core/small-model"
import type { TierLevel } from "@agent-core/small-model"

const TIER_SYSTEM_INSTRUCTIONS: Record<TierLevel, string | undefined> = {
  t1: undefined,
  t2: [
    "<agent-smith-tier>",
    "You are operating in T2 (medium-capacity mode). Guidelines:",
    "- Be concise. Prefer focused single-purpose tool calls.",
    "- Use no more than 8 unique tool types per session.",
    "- Keep tool call arguments minimal and necessary.",
    "- Read files before attempting edits.",
    "- If a task is complex, break it into smaller steps.",
    "</agent-smith-tier>",
  ].join("\n"),
  t3: [
    "<agent-smith-tier>",
    "You are operating in T3 (constrained-capacity mode). Strict rules:",
    "- You MUST use ONLY these tools: read, edit (or write), bash, glob, grep.",
    "- Keep responses under 1500 tokens.",
    "- Make at most 6 tool calls per turn.",
    "- Prefer reading small sections of files rather than entire files.",
    "- Use bash for listing directories instead of dedicated ls tools.",
    "- If you don't have enough context, state what you need clearly.",
    "- Never use task or subtask tools - handle everything yourself.",
    "</agent-smith-tier>",
  ].join("\n"),
}

const TIER_BUDGET_REMINDERS: Record<TierLevel, string | undefined> = {
  t1: undefined,
  t2: [
    "<agent-smith-budget>",
    "Token budget: generous. You have ~60K tokens for conversation history.",
    "Tool budget: up to 40 tool calls, any tool type.",
    "</agent-smith-budget>",
  ].join("\n"),
  t3: [
    "<agent-smith-budget>",
    "Token budget: limited. You have ~6K tokens for conversation history.",
    "Be very concise in your responses to conserve context.",
    "Tool budget: 4 tool types max, 6 calls max.",
    "</agent-smith-budget>",
  ].join("\n"),
}

function getModelId(model: { id: string; name?: string }): string {
  return model.id || model.name || ""
}

export async function createAgentSmithPlugin(input: PluginInput): Promise<Hooks> {
  const state = {
    roundCounters: new Map<string, number>(),
  }

  return {
    "experimental.chat.system.transform": async (hookInput, output) => {
      const modelId = getModelId(hookInput.model)
      const tier = determineTier(modelId)
      const instructions = TIER_SYSTEM_INSTRUCTIONS[tier]
      if (instructions) {
        output.system.push(instructions)
      }
      const reminder = TIER_BUDGET_REMINDERS[tier]
      if (reminder) {
        output.system.push(reminder)
      }
    },

    "experimental.chat.messages.transform": async (_hookInput, output) => {
      const sessionId = output.messages[0]?.info?.sessionID
      if (!sessionId) return
      const round = (state.roundCounters.get(sessionId) ?? 0) + 1
      state.roundCounters.set(sessionId, round)

      for (const msg of output.messages) {
        if (msg.info.role !== "user") continue
        const lastPart = msg.parts[msg.parts.length - 1]
        if (!lastPart || lastPart.type !== "text") continue
        if (lastPart.text.startsWith("<agent-smith")) continue

        const modelId =
          (msg.info as any).model?.modelID || (msg.info as any).model?.id || ""
        if (!modelId) continue
        const tier = determineTier(modelId)

        if (tier === "t3" && round > 1) {
          msg.parts.push({
            type: "text",
            text: [
              "",
              "<agent-smith-context>",
              `Round ${round}: You have limited context remaining.`,
              "Focus on the essential parts of the request only.",
              "If you need to see specific file contents, ask which parts to read.",
              "</agent-smith-context>",
              "",
            ].join("\n"),
          } as any)
        }
      }
    },

    "experimental.session.compacting": async (_hookInput, output) => {
      output.context.push(
        "<agent-smith>",
        "Agent Smith integration is active.",
        "Small model tier detection and budget enforcement are enabled.",
        "Compaction preserves token budget for tier-appropriate allocation.",
        "</agent-smith>",
      )
    },
  }
}
