export interface Tag {
  relFname: string
  fname: string
  name: string
  kind: "def" | "ref"
  line: number
}

export interface RepoMapOptions {
  mapTokens?: number
  root?: string
  verbose?: boolean
  maxContextWindow?: number
  mapMulNoFiles?: number
}

export interface CompactOptions {
  maxHistoryTokens?: number
  compressionRatio?: number
  summarizer?: (text: string) => Promise<string>
}

export interface CompactionResult {
  compressed: boolean
  history: Array<{ role: string; content: string }>
  summary?: string
}
