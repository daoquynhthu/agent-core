import type { ContextItem, ContextStatus } from "./context-item"

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
  private baseDir: string = ".agent-smith"
  private loaded = false

  setBaseDir(dir: string): void {
    this.baseDir = dir
  }

  private get statePath(): string {
    return `${this.baseDir}/state.json`
  }

  private get artifactsDir(): string {
    return `${this.baseDir}/artifacts`
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
    this.loaded = true
  }

  private async ensureDir(): Promise<void> {
    try {
      const { mkdir } = await import("fs/promises")
      await mkdir(this.baseDir, { recursive: true })
      await mkdir(this.artifactsDir, { recursive: true })
    } catch {
      /* best effort */
    }
  }

  async save(): Promise<void> {
    await this.ensureDir()
    const { writeFile } = await import("fs/promises")
    const snapshot: LedgerSnapshot = {
      version: "CK-v1",
      activePhase: "active",
      entries: this.entries,
      artifacts: this.artifacts,
      updatedAt: new Date().toISOString(),
    }
    await writeFile(this.statePath, JSON.stringify(snapshot, null, 2), "utf-8")
  }

  addEntry(entry: Omit<LedgerEntry, "createdAt" | "updatedAt">): void {
    const now = new Date().toISOString()
    this.entries.push({ ...entry, createdAt: now, updatedAt: now })
  }

  updateEntry(id: string, updates: Partial<LedgerEntry>): void {
    const entry = this.entries.find((e) => e.id === id)
    if (entry) {
      Object.assign(entry, updates, { updatedAt: new Date().toISOString() })
    }
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

  addArtifact(record: Omit<ArtifactRecord, "createdAt">): void {
    this.artifacts.push({ ...record, createdAt: new Date().toISOString() })
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

  clear(): void {
    this.entries = []
    this.artifacts = []
  }
}
