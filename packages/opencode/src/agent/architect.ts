import type { Agent, AgentConfig, AgentEvent, UserInput } from "./types"

export interface ArchitectConfig extends AgentConfig {
  editFormat?: string
  autoAccept?: boolean
}

export class ArchitectAgent implements Agent {
  readonly id: string
  readonly tier = "t1" as const
  readonly capabilities = ["plan", "architect", "code-review"]
  private config: ArchitectConfig
  private editorProvider: ((input: string) => Promise<string>) | null = null

  constructor(config: ArchitectConfig) {
    this.id = config.id ?? "architect"
    this.config = config
  }

  setEditorProvider(provider: (input: string) => Promise<string>): void {
    this.editorProvider = provider
  }

  async initialize(): Promise<void> {
  }

  async *process(input: UserInput): AsyncGenerator<AgentEvent> {
    yield { type: "thinking", content: "Analyzing codebase..." }

    const plan = await this.generatePlan(input)
    yield { type: "plan", content: plan }

    if (!this.config.autoAccept) {
      yield { type: "confirm", content: "Execute the changes above?", metadata: { plan } }
      return
    }

    yield { type: "thinking", content: "Applying changes..." }
    const result = await this.executePlan(plan, input)
    yield { type: "result", content: result }
  }

  private async generatePlan(input: UserInput): Promise<string> {
    const prompt = `You are an Architect Agent. Your job:
1. Analyze user requirements
2. Design implementation plan
3. List files to modify and specific changes
4. Provide clear steps

Plan must include:
- Files to modify
- Specific changes per file
- Implementation steps

User request: ${input.message}`

    if (input.provider) {
      return await input.provider(prompt)
    }
    return prompt
  }

  private async executePlan(plan: string, input: UserInput): Promise<string> {
    if (this.editorProvider) {
      return await this.editorProvider(plan)
    }
    return "Plan ready, waiting for Editor agent."
  }

  cancel(): void {
  }
}
