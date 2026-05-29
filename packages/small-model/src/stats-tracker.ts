export interface SessionStats {
  modelId: string
  tier: string
  totalTurns: number
  totalToolCalls: number
  failedToolCalls: number
  hallucinationEvents: number
  totalTokens: number
  startTime: number
  lastActive: number
}

export interface StatsData {
  sessions: SessionStats[]
  modelUsage: Record<string, { calls: number; failures: number; tokens: number }>
  totalSessions: number
  totalTokensProcessed: number
}

function loadJSON(filePath: string): StatsData {
  try {
    const fs = (globalThis as any).require("fs")
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8")
      return JSON.parse(raw)
    }
  } catch {
    /* first run */
  }
  return { sessions: [], modelUsage: {}, totalSessions: 0, totalTokensProcessed: 0 }
}

function saveJSON(filePath: string, data: StatsData): void {
  try {
    const fs = (globalThis as any).require("fs")
    const path = (globalThis as any).require("path")
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8")
  } catch {
    /* best effort */
  }
}

export class StatsTracker {
  private data: StatsData
  private currentSession: SessionStats | null = null
  private filePath: string

  constructor(storageDir?: string) {
    this.filePath = `${storageDir ?? "."}/.agent-core/stats.json`
    this.data = loadJSON(this.filePath)
  }

  startSession(modelId: string, tier: string): void {
    this.currentSession = {
      modelId,
      tier,
      totalTurns: 0,
      totalToolCalls: 0,
      failedToolCalls: 0,
      hallucinationEvents: 0,
      totalTokens: 0,
      startTime: Date.now(),
      lastActive: Date.now(),
    }
  }

  endSession(): void {
    if (this.currentSession) {
      this.data.sessions.push(this.currentSession)
      const key = this.currentSession.modelId
      const usage = this.data.modelUsage[key] ?? { calls: 0, failures: 0, tokens: 0 }
      usage.calls += this.currentSession.totalToolCalls
      usage.failures += this.currentSession.failedToolCalls
      usage.tokens += this.currentSession.totalTokens
      this.data.modelUsage[key] = usage
      this.data.totalSessions++
      this.data.totalTokensProcessed += this.currentSession.totalTokens

      if (this.data.sessions.length > 100) {
        this.data.sessions = this.data.sessions.slice(-100)
      }

      this.currentSession = null
      saveJSON(this.filePath, this.data)
    }
  }

  recordToolCall(success: boolean): void {
    if (this.currentSession) {
      this.currentSession.totalToolCalls++
      if (!success) this.currentSession.failedToolCalls++
      this.currentSession.lastActive = Date.now()
    }
  }

  recordTokens(count: number): void {
    if (this.currentSession) {
      this.currentSession.totalTokens += count
    }
  }

  recordHallucination(): void {
    if (this.currentSession) {
      this.currentSession.hallucinationEvents++
    }
  }

  getData(): StatsData {
    return { ...this.data }
  }

  reset(): void {
    this.data = { sessions: [], modelUsage: {}, totalSessions: 0, totalTokensProcessed: 0 }
  }
}
