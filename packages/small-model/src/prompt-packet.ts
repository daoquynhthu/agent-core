import type { ContextItem, Evidence } from "./context-item"
import type { TaskMode } from "./task-mode"
import { TASK_MODE_CONFIGS } from "./task-mode"
import { formatOutputSchema } from "./schemas"

export type PromptStyle = "minimal" | "structured" | "rich"

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

export interface PacketRendererOptions {
  style?: PromptStyle
  includeToolList?: string[]
  includeRepomap?: string
}

export class PromptPacketCompiler {
  compile(packet: PromptPacket, options?: PacketRendererOptions): CompiledPrompt {
    const style = options?.style ?? this.resolveStyle(packet.modelTier)
    const modeConfig = TASK_MODE_CONFIGS[packet.mode]

    switch (style) {
      case "minimal":
        return this.renderMinimal(packet)
      case "structured":
        return this.renderStructured(packet, modeConfig)
      case "rich":
        return this.renderRich(packet, modeConfig, options)
    }
  }

  private resolveStyle(tier: string): PromptStyle {
    switch (tier) {
      case "t3": return "minimal"
      case "t2": return "structured"
      default: return "rich"
    }
  }

  renderMinimal(packet: PromptPacket): CompiledPrompt {
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
    lines.push(formatOutputSchema(packet.mode))
    if (packet.allowUnknown) {
      lines.push("UNKNOWN_ALLOWED=true")
    }
    lines.push("RETURN_JSON_ONLY")

    const userPrompt = lines.join("\n")
    return { systemPrompt: "", userPrompt, packet }
  }

  private renderStructured(
    packet: PromptPacket,
    modeConfig?: { systemInstruction: string; outputSchema: Record<string, unknown> },
  ): CompiledPrompt {
    const sections: string[] = []

    sections.push(`MODE=${packet.mode}`)
    sections.push(`TIER=${packet.modelTier}`)
    sections.push("")
    sections.push(`TASK=${packet.task.goal}`)

    if (packet.constraints.length > 0) {
      sections.push("")
      sections.push("CONSTRAINTS:")
      for (const c of packet.constraints) sections.push(`- ${c}`)
    }
    if (packet.negativeConstraints.length > 0) {
      sections.push("")
      sections.push("DO NOT:")
      for (const nc of packet.negativeConstraints) sections.push(`- ${nc}`)
    }

    const activeItems = packet.context.filter((c) => c.status === "active" || c.status === "verified")
    if (activeItems.length > 0) {
      sections.push("")
      sections.push("CONTEXT:")
      for (const item of activeItems) sections.push(`- ${item.content}`)
    }

    const hypothesisItems = packet.context.filter((c) => c.status === "hypothesis" || c.status === "unverified")
    if (hypothesisItems.length > 0) {
      sections.push("")
      sections.push("UNVERIFIED (handle with caution):")
      for (const item of hypothesisItems) sections.push(`- ${item.content} (confidence: ${item.confidence})`)
    }

    if (packet.evidence.length > 0) {
      sections.push("")
      sections.push("EVIDENCE:")
      for (const ev of packet.evidence) {
        sections.push(`- [${ev.id}] ${ev.type}: ${ev.content.slice(0, 200)}`)
      }
    }

    sections.push("")
    sections.push(formatOutputSchema(packet.mode))

    if (packet.allowUnknown) {
      sections.push("")
      sections.push("If uncertain, return status=unknown. Do not fabricate.")
    }

    const deprecatedItems = packet.context.filter((c) => c.status === "deprecated" || c.status === "rejected")
    if (deprecatedItems.length > 0) {
      sections.push("")
      sections.push("REJECTED/DEPRECATED (do not use):")
      for (const item of deprecatedItems) sections.push(`- ${item.content}`)
    }

    sections.push("")
    sections.push(`TOKEN_BUDGET: input_max=${packet.tokenBudget.inputMax}, output_max=${packet.tokenBudget.outputMax}`)

    const systemParts: string[] = []
    if (modeConfig?.systemInstruction) {
      systemParts.push(modeConfig.systemInstruction)
    }
    if (packet.allowUnknown) {
      systemParts.push("UNKNOWN is always a valid response. Do not fabricate information.")
    }
    systemParts.push("Output must conform to the specified schema.")
    const systemPrompt = systemParts.join("\n")
    const userPrompt = sections.join("\n")

    return { systemPrompt, userPrompt, packet }
  }

  private renderRich(
    packet: PromptPacket,
    modeConfig?: { systemInstruction: string; outputSchema: Record<string, unknown> },
    options?: PacketRendererOptions,
  ): CompiledPrompt {
    const structured = this.renderStructured(packet, modeConfig)
    const parts: string[] = [structured.userPrompt]

    if (options?.includeRepomap) {
      const maxLines = packet.modelTier === "t1" ? 100 : packet.modelTier === "t2" ? 40 : 10
      const lines = options.includeRepomap.split("\n").slice(0, maxLines)
      parts.push("")
      parts.push("REPOSITORY:")
      parts.push(lines.join("\n"))
    }

    if (options?.includeToolList && options.includeToolList.length > 0) {
      parts.push("")
      parts.push(`AVAILABLE_TOOLS: ${options.includeToolList.join(", ")}`)
    }

    return { systemPrompt: structured.systemPrompt, userPrompt: parts.join("\n"), packet }
  }
}
