import type { ContextItem, Evidence } from "./context-item"
import type { TaskMode, TaskModeConfig } from "./task-mode"
import { TASK_MODE_CONFIGS } from "./task-mode"

export interface TokenBudget {
  inputMax: number
  outputMax: number
  currentInput: number
}

export interface PromptPacket {
  mode: TaskMode
  modelId: string
  modelTier: string
  task: {
    goal: string
    scope: string[]
  }
  context: ContextItem[]
  evidence: Evidence[]
  constraints: string[]
  negativeConstraints: string[]
  outputSchema: Record<string, unknown>
  tokenBudget: TokenBudget
  allowUnknown: boolean
}

export interface CompiledPrompt {
  systemPrompt: string
  userPrompt: string
  packet: PromptPacket
}

export class PromptPacketCompiler {
  compile(packet: PromptPacket): CompiledPrompt {
    const modeConfig = TASK_MODE_CONFIGS[packet.mode]
    const sections: string[] = []

    sections.push(`MODE=${packet.mode}`)
    sections.push(`TIER=${packet.modelTier}`)

    sections.push("")
    sections.push(`TASK=${packet.task.goal}`)

    if (packet.constraints.length > 0) {
      sections.push("")
      sections.push("CONSTRAINTS:")
      for (const c of packet.constraints) {
        sections.push(`- ${c}`)
      }
    }

    if (packet.negativeConstraints.length > 0) {
      sections.push("")
      sections.push("DO NOT:")
      for (const nc of packet.negativeConstraints) {
        sections.push(`- ${nc}`)
      }
    }

    const activeItems = packet.context.filter((c) => c.status === "active" || c.status === "verified")
    if (activeItems.length > 0) {
      sections.push("")
      sections.push("CONTEXT:")
      for (const item of activeItems) {
        sections.push(`- ${item.content}`)
      }
    }

    const hypothesisItems = packet.context.filter((c) => c.status === "hypothesis" || c.status === "unverified")
    if (hypothesisItems.length > 0) {
      sections.push("")
      sections.push("UNVERIFIED (handle with caution):")
      for (const item of hypothesisItems) {
        sections.push(`- ${item.content} (confidence: ${item.confidence})`)
      }
    }

    if (packet.evidence.length > 0) {
      sections.push("")
      sections.push("EVIDENCE:")
      for (const ev of packet.evidence) {
        sections.push(`- [${ev.type}] ${ev.source}: ${ev.content.slice(0, 200)}`)
      }
    }

    if (modeConfig) {
      sections.push("")
      sections.push("OUTPUT SCHEMA:")
      sections.push(JSON.stringify(modeConfig.outputSchema, null, 2))
    }

    if (packet.allowUnknown) {
      sections.push("")
      sections.push("If uncertain, return status=unknown. Do not fabricate.")
    }

    const deprecatedItems = packet.context.filter((c) => c.status === "deprecated" || c.status === "rejected")
    if (deprecatedItems.length > 0) {
      sections.push("")
      sections.push("REJECTED/DEPRECATED (do not use):")
      for (const item of deprecatedItems) {
        sections.push(`- ${item.content}`)
      }
    }

    sections.push("")
    sections.push(`TOKEN_BUDGET: input_max=${packet.tokenBudget.inputMax}, output_max=${packet.tokenBudget.outputMax}`)

    const systemPrompt = this.buildSystemPrompt(packet, modeConfig)
    const userPrompt = sections.join("\n")

    return { systemPrompt, userPrompt, packet }
  }

  private buildSystemPrompt(packet: PromptPacket, modeConfig?: TaskModeConfig): string {
    const parts: string[] = []

    if (modeConfig) {
      parts.push(modeConfig.systemInstruction)
    }

    if (packet.allowUnknown) {
      parts.push("UNKNOWN is always a valid response. Do not fabricate information.")
    }

    parts.push("Output must conform to the specified schema.")

    return parts.join("\n")
  }

  renderMinimal(packet: PromptPacket): string {
    const lines: string[] = []
    lines.push(`MODE=${packet.mode}`)
    lines.push(`TASK=${packet.task.goal}`)

    if (packet.constraints.length > 0) {
      lines.push("")
      lines.push("CONSTRAINTS:")
      for (const c of packet.constraints) {
        lines.push(`- ${c}`)
      }
    }
    if (packet.negativeConstraints.length > 0) {
      lines.push("")
      lines.push("DO NOT:")
      for (const nc of packet.negativeConstraints) {
        lines.push(`- ${nc}`)
      }
    }

    const active = packet.context.filter((c) => c.status === "active")
    if (active.length > 0) {
      lines.push("")
      for (const item of active) {
        lines.push(`- ${item.content}`)
      }
    }

    lines.push("")
    lines.push(JSON.stringify(TASK_MODE_CONFIGS[packet.mode]?.outputSchema ?? {}))

    return lines.join("\n")
  }
}
