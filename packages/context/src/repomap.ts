import { readFileSync, existsSync, statSync } from "fs"
import { readdir, stat } from "fs/promises"
import { join, relative, extname, basename, sep, parse as parsePath } from "path"
import Parser, { Language } from "web-tree-sitter"
import type { Tag, RepoMapOptions } from "./types"

interface RankedDefinition {
  relFname: string
  ident: string
  rank: number
  line: number
}

interface GraphNode {
  id: string
  edges: Map<string, { weight: number; ident: string }>
}

const EXT_TO_LANG: Record<string, string> = {
  ".py": "python",
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "javascript",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".cpp": "cpp",
  ".cxx": "cpp",
  ".cc": "cpp",
  ".c": "c",
  ".h": "c",
  ".hpp": "cpp",
  ".rb": "ruby",
  ".cs": "c_sharp",
  ".bash": "bash",
  ".sh": "bash",
  ".ps1": "powershell",
  ".swift": "swift",
  ".kt": "kotlin",
  ".scala": "scala",
  ".php": "php",
  ".rs": "rust",
}

const TAG_RANK_MULTIPLIERS = {
  snakeCase: 10,
  camelCase: 10,
  kebabCase: 10,
  startsWithUnderscore: 0.1,
  tooManyDefiners: 0.1,
}

function hasSnakeCase(ident: string): boolean {
  return ident.includes("_") && /[a-zA-Z]/.test(ident)
}

function hasCamelCase(ident: string): boolean {
  return /[a-z][A-Z]/.test(ident)
}

function hasKebabCase(ident: string): boolean {
  return ident.includes("-") && /[a-zA-Z]/.test(ident)
}

export class RepoMap {
  private root: string
  private maxMapTokens: number
  private mapMulNoFiles: number
  private maxContextWindow: number
  private verbose: boolean

  private parser: Parser | null = null
  private languages: Map<string, Language> = new Map()
  private queryCache: Map<string, string> = new Map()
  private tagCache: Map<string, { mtime: number; tags: Tag[] }> = new Map()
  private treeCache: Map<string, string> = new Map()
  private initialized = false

  constructor(options: RepoMapOptions = {}) {
    this.root = options.root ?? process.cwd()
    this.maxMapTokens = options.mapTokens ?? 1024
    this.mapMulNoFiles = options.mapMulNoFiles ?? 8
    this.maxContextWindow = options.maxContextWindow ?? 128_000
    this.verbose = options.verbose ?? false
  }

  async initialize(): Promise<void> {
    if (this.initialized) return

    await Parser.init()
    this.parser = new Parser()

    const langNames = [
      "python", "typescript", "javascript", "rust", "go",
      "java", "cpp", "c", "ruby", "c_sharp", "bash",
    ]

    for (const name of langNames) {
      try {
        const lang = await this.loadLanguage(name)
        if (lang) {
          this.languages.set(name, lang)
        }
      } catch {
        // skip unavailable languages
      }
    }

    this.initialized = true
  }

  private async loadLanguage(name: string): Promise<Language | null> {
    const wasmName = name === "c_sharp" ? "c-sharp" : name === "tsx" ? "typescript" : name
    const wasmPath = join(
      process.cwd(),
      "node_modules",
      `tree-sitter-${wasmName}`,
      `tree-sitter-${name === "c_sharp" ? "c_sharp" : wasmName}.wasm`,
    )

    const altPaths = [
      wasmPath,
      join(__dirname, "..", "..", "node_modules", `tree-sitter-${wasmName}`, `tree-sitter-${name === "c_sharp" ? "c_sharp" : wasmName}.wasm`),
    ]

    for (const p of altPaths) {
      try {
        if (existsSync(p)) {
          const wasmBytes = readFileSync(p)
          return await Language.load(wasmBytes)
        }
      } catch {
        continue
      }
    }

    return null
  }

  private loadQuery(lang: string): string | null {
    const cached = this.queryCache.get(lang)
    if (cached) return cached

    const queryPaths = [
      join(__dirname, "..", "queries", `${lang}-tags.scm`),
      join(this.root, "packages", "context", "queries", `${lang}-tags.scm`),
    ]

    for (const p of queryPaths) {
      try {
        if (existsSync(p)) {
          const content = readFileSync(p, "utf-8")
          this.queryCache.set(lang, content)
          return content
        }
      } catch {
        continue
      }
    }

    return null
  }

  private getMtime(fname: string): number | null {
    try {
      return statSync(fname).mtimeMs
    } catch {
      return null
    }
  }

  private getRelFname(fname: string): string {
    try {
      return relative(this.root, fname).replace(/\\/g, "/")
    } catch {
      return fname
    }
  }

  private extToLang(fname: string): string | null {
    const ext = extname(fname).toLowerCase()
    const base = basename(fname).toLowerCase()

    const exactMatch: Record<string, string> = {
      makefile: "python",
      dockerfile: "bash",
    }
    if (exactMatch[base]) return exactMatch[base]

    return EXT_TO_LANG[ext] ?? null
  }

  async getTags(fname: string): Promise<Tag[]> {
    const mtime = this.getMtime(fname)
    if (mtime === null) return []

    const cached = this.tagCache.get(fname)
    if (cached && cached.mtime === mtime) {
      return cached.tags
    }

    const tags = await this.getTagsRaw(fname)
    this.tagCache.set(fname, { mtime, tags })
    return tags
  }

  private async getTagsRaw(fname: string): Promise<Tag[]> {
    const lang = this.extToLang(fname)
    if (!lang) return []

    const language = this.languages.get(lang)
    if (!language) return []

    const queryScm = this.loadQuery(lang)
    if (!queryScm) return []

    let code: string
    try {
      code = readFileSync(fname, "utf-8")
    } catch {
      return []
    }
    if (!code) return []

    this.parser!.setLanguage(language)
    const tree = this.parser!.parse(code)
    if (!tree) return []

    const query = new Parser.Query(language, queryScm)
    const matches = query.matches(tree.rootNode)
    const relFname = this.getRelFname(fname)

    const tags: Tag[] = []
    const seen = new Set<string>()

    for (const match of matches) {
      for (const capture of match.captures) {
        const tagName = capture.name ?? ""
        let kind: "def" | "ref" | null = null

        if (tagName.startsWith("name.definition.")) {
          kind = "def"
        } else if (tagName.startsWith("name.reference.")) {
          kind = "ref"
        } else {
          continue
        }

        const name = code.slice(capture.node.startIndex, capture.node.endIndex)
        if (!name.trim()) continue

        const key = `${kind}:${name}:${capture.node.startPosition.row}`
        if (seen.has(key)) continue
        seen.add(key)

        tags.push({
          relFname,
          fname,
          name: name.trim(),
          kind,
          line: capture.node.startPosition.row,
        })
      }
    }

    return tags
  }

  async getRankedTags(
    chatFnames: string[],
    otherFnames: string[],
    mentionedFnames: Set<string> = new Set(),
    mentionedIdents: Set<string> = new Set(),
  ): Promise<Array<{ relFname: string; ident?: string; line?: number }>> {
    const defines = new Map<string, Set<string>>()
    const references = new Map<string, string[]>()
    const definitions = new Map<string, Tag[]>()
    const chatRelFnames = new Set(chatFnames.map((f) => this.getRelFname(f)))

    const allFnames = [...new Set([...chatFnames, ...otherFnames])].sort()
    const personalize = 100 / Math.max(allFnames.length, 1)

    for (const fname of allFnames) {
      if (!existsSync(fname)) continue
      const tags = await this.getTags(fname)
      if (!tags.length) continue

      for (const tag of tags) {
        if (tag.kind === "def") {
          if (!defines.has(tag.name)) defines.set(tag.name, new Set())
          defines.get(tag.name)!.add(tag.relFname)

          const key = `${tag.relFname}:${tag.name}`
          if (!definitions.has(key)) definitions.set(key, [])
          definitions.get(key)!.push(tag)
        } else if (tag.kind === "ref") {
          if (!references.has(tag.name)) references.set(tag.name, [])
          references.get(tag.name)!.push(tag.relFname)
        }
      }
    }

    if (references.size === 0) {
      for (const [name, defs] of defines) {
        references.set(name, [...defs])
      }
    }

    const idents = new Set(
      [...defines.keys()].filter((k) => references.has(k)),
    )

    const graph = new Map<string, GraphNode>()

    for (const ident of defines.keys()) {
      const defs = defines.get(ident)!
      if (!references.has(ident)) {
        for (const def of defs) {
          if (!graph.has(def)) graph.set(def, { id: def, edges: new Map() })
          const existing = graph.get(def)!.edges.get(def)
          graph.get(def)!.edges.set(def, {
            weight: (existing?.weight ?? 0) + 0.1,
            ident,
          })
        }
      }
    }

    for (const ident of idents) {
      const defs = defines.get(ident)!
      const referrers = references.get(ident) ?? []

      let mul = 1
      if (mentionedIdents.has(ident)) mul *= 10
      if (hasSnakeCase(ident) || hasCamelCase(ident) || hasKebabCase(ident)) {
        if (ident.length >= 8) mul *= 10
      }
      if (ident.startsWith("_")) mul *= 0.1
      if (defs.size > 5) mul *= 0.1

      for (const referrer of referrers) {
        let useMul = mul
        if (chatRelFnames.has(referrer)) useMul *= 50

        for (const def of defs) {
          if (!graph.has(referrer)) graph.set(referrer, { id: referrer, edges: new Map() })
          const existing = graph.get(referrer)!.edges.get(def)
          graph.get(referrer)!.edges.set(def, {
            weight: (existing?.weight ?? 0) + useMul,
            ident,
          })
        }
      }
    }

    const ranked = this.pagerank(graph, chatRelFnames)
    const rankedDefinitions = new Map<string, number>()

    for (const [src, srcRank] of ranked) {
      const node = graph.get(src)
      if (!node) continue

      let totalWeight = 0
      for (const [, data] of node.edges) {
        totalWeight += data.weight
      }
      if (totalWeight === 0) continue

      for (const [dst, data] of node.edges) {
        const edgeRank = srcRank * data.weight / totalWeight
        const key = `${dst}:${data.ident}`
        rankedDefinitions.set(key, (rankedDefinitions.get(key) ?? 0) + edgeRank)
      }
    }

    const sortedDefs = [...rankedDefinitions.entries()]
      .sort((a, b) => b[1] - a[1])

    const result: Array<{ relFname: string; ident?: string; line?: number }> = []
    const seenFnames = new Set<string>()

    for (const [key] of sortedDefs) {
      const colonIdx = key.lastIndexOf(":")
      const fname = key.slice(0, colonIdx)
      const ident = key.slice(colonIdx + 1)

      if (chatRelFnames.has(fname)) continue
      seenFnames.add(fname)

      const defKey = `${fname}:${ident}`
      const defTags = definitions.get(defKey)
      if (defTags) {
        for (const tag of defTags) {
          result.push({ relFname: tag.relFname, ident: tag.name, line: tag.line })
        }
      }
    }

    for (const fname of allFnames) {
      const rel = this.getRelFname(fname)
      if (!seenFnames.has(rel) && !chatRelFnames.has(rel)) {
        result.push({ relFname: rel })
        seenFnames.add(rel)
      }
    }

    return result
  }

  private pagerank(
    graph: Map<string, GraphNode>,
    chatRelFnames: Set<string>,
    iterations = 100,
    damping = 0.85,
  ): Map<string, number> {
    const nodes = [...graph.keys()]
    const N = nodes.length
    if (N === 0) return new Map()

    const nodeToIdx = new Map(nodes.map((n, i) => [n, i]))
    let ranks = new Array(N).fill(1 / N)

    const personalization = new Array(N).fill(1 / N)
    for (const [i, node] of nodes.entries()) {
      if (chatRelFnames.has(node)) {
        personalization[i] = 100 / N
      }
    }
    const persSum = personalization.reduce((a, b) => a + b, 0)
    for (let i = 0; i < N; i++) personalization[i] /= persSum

    for (let iter = 0; iter < iterations; iter++) {
      const newRanks = new Array(N).fill(0)

      for (const [node, data] of graph) {
        const i = nodeToIdx.get(node)!
        const outEdges = [...data.edges.entries()]
        const totalWeight = outEdges.reduce((s, [, e]) => s + e.weight, 0)
        if (totalWeight === 0) {
          for (let j = 0; j < N; j++) newRanks[j] += ranks[i] / N
        } else {
          for (const [dst, edge] of outEdges) {
            const j = nodeToIdx.get(dst)!
            newRanks[j] += ranks[i] * (edge.weight / totalWeight)
          }
        }
      }

      const dangling = newRanks.reduce((s, v) => s + v, 0)
      const danglingSum = (1 - dangling) / N

      for (let i = 0; i < N; i++) {
        ranks[i] = newRanks[i] * damping + danglingSum * damping + personalization[i] * (1 - damping)
      }

      const sum = ranks.reduce((a, b) => a + b, 0)
      for (let i = 0; i < N; i++) ranks[i] /= sum
    }

    return new Map(nodes.map((n, i) => [n, ranks[i]]))
  }

  async getRepoMap(
    chatFiles: string[],
    otherFiles: string[],
    mentionedFnames?: Set<string>,
    mentionedIdents?: Set<string>,
    forceRefresh = false,
  ): Promise<string | null> {
    if (this.maxMapTokens <= 0) return null
    if (!otherFiles.length) return null

    await this.initialize()

    mentionedFnames = mentionedFnames ?? new Set()
    mentionedIdents = mentionedIdents ?? new Set()

    const rankedTags = await this.getRankedTags(
      chatFiles,
      otherFiles,
      mentionedFnames,
      mentionedIdents,
    )

    if (!rankedTags.length) return null

    const chatRelFnames = new Set(chatFiles.map((f) => this.getRelFname(f)))
    const mapStr = this.toTree(rankedTags, chatRelFnames)

    return mapStr
  }

  private toTree(
    tags: Array<{ relFname: string; ident?: string; line?: number }>,
    chatRelFnames: Set<string>,
  ): string {
    const output: string[] = []
    let curFname: string | null = null
    const pendingLines = new Map<string, number[]>()

    const extended = [...tags, { relFname: "" as string }]

    for (const tag of extended) {
      if (chatRelFnames.has(tag.relFname)) continue

      if (tag.relFname !== curFname) {
        if (curFname !== null) {
          const lines = pendingLines.get(curFname)
          if (lines && lines.length > 0) {
            output.push(`${curFname}:`)
            output.push(this.renderTreeLines(curFname, lines))
          } else if (curFname) {
            output.push(curFname)
          }
        }

        if (tag.relFname) {
          if (!pendingLines.has(tag.relFname)) {
            pendingLines.set(tag.relFname, [])
          }
        }
        curFname = tag.relFname || null
      }

      if (tag.line !== undefined && curFname) {
        pendingLines.get(curFname)?.push(tag.line)
      }
    }

    const result = output.join("\n")
    return result
      .split("\n")
      .map((line) => line.length > 100 ? line.slice(0, 100) : line)
      .join("\n") + "\n"
  }

  private renderTreeLines(relFname: string, lines: number[]): string {
    const absFname = join(this.root, relFname)
    const cacheKey = `${relFname}:${lines.join(",")}:${this.getMtime(absFname)}`
    const cached = this.treeCache.get(cacheKey)
    if (cached) return cached

    try {
      if (!existsSync(absFname)) return ""

      const code = readFileSync(absFname, "utf-8")
      const codeLines = code.split("\n")
      const uniqueLines = [...new Set(lines)].sort((a, b) => a - b)

      const result: string[] = []
      const contextRadius = 3
      const shown = new Set<number>()

      for (const line of uniqueLines) {
        for (let i = Math.max(0, line - contextRadius); i <= Math.min(codeLines.length - 1, line + contextRadius); i++) {
          if (!shown.has(i)) {
            const prefix = i === line ? "│ " : "  "
            result.push(`${prefix}${codeLines[i]}`)
            shown.add(i)
          }
        }
      }

      const rendered = result.map((l) => l.length > 100 ? l.slice(0, 100) : l).join("\n")
      this.treeCache.set(cacheKey, rendered)
      return rendered
    } catch {
      return ""
    }
  }

  clearCache(): void {
    this.tagCache.clear()
    this.treeCache.clear()
  }
}
