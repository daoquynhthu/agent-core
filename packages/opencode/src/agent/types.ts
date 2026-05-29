export interface AgentConfig {
  id?: string
  model?: string
  systemPrompt?: string
}

export interface UserInput {
  message: string
  files?: string[]
  provider?: (prompt: string) => Promise<string>
}

export type AgentEventType = "thinking" | "plan" | "confirm" | "result" | "error" | "tool_call"

export interface AgentEvent {
  type: AgentEventType
  content: string
  metadata?: Record<string, unknown>
}

export interface Agent {
  readonly id: string
  readonly tier: "t1" | "t2" | "t3"
  readonly capabilities: string[]
  initialize(): Promise<void>
  process(input: UserInput): AsyncGenerator<AgentEvent>
  cancel(): void
}
