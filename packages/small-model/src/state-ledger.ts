import type { ContextItem, ContextStatus } from "./context-item"

export type LedgerEventType =
  | "context_item_created"
  | "context_item_verified"
  | "context_item_deprecated"
  | "context_item_rejected"
  | "context_item_updated"
  | "artifact_proposed"
  | "artifact_accepted"
  | "artifact_rejected"

export interface LedgerEvent {
  id: string
  type: LedgerEventType
  timestamp: string
  data: Record<string, unknown>
}

export interface LedgerEntry {
  id: string
  kind: string
  content: string
  source: "agent_claim" | "verified_fact" | "human_decision" | "test_output" | "tool_output"
  status: ContextStatus
  scope: string[]
  confidence: number
  evidenceIds: string[]
  conflictsWith: string[]
  createdAt: string
  updatedAt: string
}

export interface LedgerSnapshot {
  version: string
  activePhase: string
  entries: LedgerEntry[]
  artifacts: ArtifactRecord[]
  updatedAt: string
  eventCount: number
}

export interface ArtifactRecord {
  id: string
  type: string
  producedBy: string
  summary: string
  status: "pending_review" | "accepted" | "rejected"
  createdAt: string
}

export class StateLedger {
  private entries: LedgerEntry[] = []
  private artifacts: ArtifactRecord[] = []
  private events: LedgerEvent[] = []
  private baseDir: string = ".agent-smith"
  private loaded = false

  setBaseDir(dir: string): void {
    this.baseDir = dir
  }

  private get statePath(): string {
    return `${this.baseDir}/state.json`
  }

  private get eventsPath(): string {
    return `${this.baseDir}/events.jsonl`
  }

  async load(): Promise<void> {
    if (this.loaded) return
    try {
      const { readFile } = await import("fs/promises")
      const data = await readFile(this.statePath, "utf-8")
      const snapshot: LedgerSnapshot = JSON.parse(data)
      this.entries = snapshot.entries ?? []
      this.artifacts = snapshot.artifacts ?? []
    } catch {
      this.entries = []
      this.artifacts = []
    }
    try {
      const { readFile } = await import("fs/promises")
      const raw = await readFile(this.eventsPath, "utf-8")
      this.events = raw
        .split("\n")
        .filter((l: string) => l.trim())
        .map((l: string) => JSON.parse(l) as LedgerEvent)
    } catch {
      this.events = []
    }
    this.loaded = true
  }

  private async ensureDir(): Promise<void> {
    try {
      const { mkdir } = await import("fs/promises")
      await mkdir(this.baseDir, { recursive: true })
    } catch {
      /* best effort */
    }
  }

  async save(): Promise<void> {
    await this.ensureDir()
    const { writeFile, appendFile } = await import("fs/promises")
    const snapshot: LedgerSnapshot = {
      version: "CK-v1",
      activePhase: "active",
      entries: this.entries,
      artifacts: this.artifacts,
      updatedAt: new Date().toISOString(),
      eventCount: this.events.length,
    }
    await writeFile(this.statePath, JSON.stringify(snapshot, null, 2), "utf-8")
  }

  private async appendEvent(event: LedgerEvent): Promise<void> {
    this.events.push(event)
    try {
      const { appendFile } = await import("fs/promises")
      await appendFile(this.eventsPath, JSON.stringify(event) + "\n", "utf-8")
    } catch {
    }
  }

  async addEntry(entry: Omit<LedgerEntry, "createdAt" | "updatedAt">): Promise<void> {
    const now = new Date().toISOString()
    const full: LedgerEntry = { ...entry, createdAt: now, updatedAt: now }
    this.entries.push(full)
    await this.appendEvent({
      id: `evt-${now}-${Math.random().toString(36).slice(2, 8)}`,
      type: "context_item_created",
      timestamp: now,
      data: { entryId: entry.id, kind: entry.kind, status: entry.status },
    })
  }

  async updateEntry(id: string, updates: Partial<LedgerEntry>): Promise<void> {
    const entry = this.entries.find((e) => e.id === id)
    if (!entry) return
    Object.assign(entry, updates, { updatedAt: new Date().toISOString() })
    await this.appendEvent({
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: "context_item_updated",
      timestamp: new Date().toISOString(),
      data: { entryId: id, changes: Object.keys(updates) },
    })
  }

  async verifyEntry(id: string): Promise<void> {
    const entry = this.entries.find((e) => e.id === id)
    if (!entry) return
    entry.status = "verified"
    entry.updatedAt = new Date().toISOString()
    await this.appendEvent({
      id: `evt-${Date.now()}`,
      type: "context_item_verified",
      timestamp: entry.updatedAt,
      data: { entryId: id },
    })
  }

  async deprecateEntry(id: string): Promise<void> {
    const entry = this.entries.find((e) => e.id === id)
    if (!entry) return
    entry.status = "deprecated"
    entry.updatedAt = new Date().toISOString()
    await this.appendEvent({
      id: `evt-${Date.now()}`,
      type: "context_item_deprecated",
      timestamp: entry.updatedAt,
      data: { entryId: id },
    })
  }

  async rejectEntry(id: string): Promise<void> {
    const entry = this.entries.find((e) => e.id === id)
    if (!entry) return
    entry.status = "rejected"
    entry.updatedAt = new Date().toISOString()
    await this.appendEvent({
      id: `evt-${Date.now()}`,
      type: "context_item_rejected",
      timestamp: entry.updatedAt,
      data: { entryId: id },
    })
  }

  getActiveDecisions(scope?: string[]): LedgerEntry[] {
    return this.entries.filter((e) => {
      if (e.status !== "active" && e.status !== "verified") return false
      if (scope && !scope.some((s) => e.scope.includes(s))) return false
      return true
    })
  }

  getDeprecatedDecisions(scope?: string[]): LedgerEntry[] {
    return this.entries.filter((e) => {
      if (e.status !== "deprecated" && e.status !== "rejected") return false
      if (scope && !scope.some((s) => e.scope.includes(s))) return false
      return true
    })
  }

  async addArtifact(record: Omit<ArtifactRecord, "createdAt">): Promise<void> {
    this.artifacts.push({ ...record, createdAt: new Date().toISOString() })
    await this.appendEvent({
      id: `evt-${Date.now()}`,
      type: "artifact_proposed",
      timestamp: new Date().toISOString(),
      data: { artifactId: record.id, type: record.type },
    })
  }

  async acceptArtifact(id: string): Promise<void> {
    const art = this.artifacts.find((a) => a.id === id)
    if (!art) return
    art.status = "accepted"
    await this.appendEvent({
      id: `evt-${Date.now()}`,
      type: "artifact_accepted",
      timestamp: new Date().toISOString(),
      data: { artifactId: id },
    })
  }

  async rejectArtifact(id: string): Promise<void> {
    const art = this.artifacts.find((a) => a.id === id)
    if (!art) return
    art.status = "rejected"
    await this.appendEvent({
      id: `evt-${Date.now()}`,
      type: "artifact_rejected",
      timestamp: new Date().toISOString(),
      data: { artifactId: id },
    })
  }

  toContextItems(): ContextItem[] {
    return this.entries.map((e) => ({
      id: e.id,
      kind: e.kind,
      content: e.content,
      source: e.source,
      status: e.status,
      scope: e.scope,
      version: "CK-v1",
      confidence: e.confidence,
      tokenCost: Math.max(1, Math.ceil(e.content.length / 4)),
      priority: e.status === "active" ? 10 : e.status === "verified" ? 8 : 1,
      evidenceIds: e.evidenceIds,
      conflictsWith: e.conflictsWith,
    }))
  }

  getRecentEvents(count: number = 50): LedgerEvent[] {
    return this.events.slice(-count)
  }

  getEventsByType(type: LedgerEventType): LedgerEvent[] {
    return this.events.filter((e) => e.type === type)
  }

  clear(): void {
    this.entries = []
    this.artifacts = []
    this.events = []
  }
}
