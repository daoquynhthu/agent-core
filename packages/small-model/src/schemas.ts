import { z } from "zod"
import type { TaskMode } from "./task-mode"

export const RouteSchema = z.object({
  taskType: z.string().min(1),
  recommendedExecutor: z.string().min(1),
})

export const RankFilesSchema = z.object({
  rankedFiles: z.array(z.string().min(1)),
  reasoning: z.string(),
})

export const ExtractFactsSchema = z.object({
  facts: z.array(z.string().min(1)),
  confidence: z.number().min(0).max(1),
})

export const SummarizeStructuredSchema = z.object({
  intent: z.string(),
  changedFiles: z.array(z.string()),
  apiChanges: z.array(z.string()),
  risk: z.array(z.string()),
  tests: z.array(z.string()),
})

export const CheckConstraintsSchema = z.object({
  status: z.enum(["pass", "violation", "unknown"]),
  violations: z.array(z.string()),
  confidence: z.number().min(0).max(1),
})

export const ClassifyErrorSchema = z.object({
  errorType: z.string().min(1),
  severity: z.enum(["low", "medium", "high"]),
  suggestedAction: z.string(),
})

export const SelectTestsSchema = z.object({
  testFiles: z.array(z.string().min(1)),
  priority: z.enum(["high", "medium", "low"]),
})

export const DetectUncertaintySchema = z.object({
  hasUnsupportedClaims: z.boolean(),
  unsupportedClaims: z.array(z.string()),
  confidence: z.number().min(0).max(1),
})

export const ArchitectureDesignSchema = z.object({
  proposal: z.string().min(1),
  alternatives: z.array(z.string()),
  risks: z.array(z.string()),
  openQuestions: z.array(z.string()),
})

export const ComplexReviewSchema = z.object({
  correctness: z.string(),
  architectureFit: z.string(),
  risk: z.array(z.string()),
  missingTests: z.array(z.string()),
  requiredChanges: z.array(z.string()),
  acceptOrReject: z.enum(["accept", "reject", "changes_requested"]),
})

export const ConstraintCheckSchema = z.object({
  status: z.enum(["pass", "violation", "unknown"]),
  violations: z.array(z.string()),
  confidence: z.number().min(0).max(1),
})

export const DiffReviewSchema = z.object({
  status: z.enum(["pass", "violation", "unknown"]),
  violations: z.array(z.string()),
  confidence: z.number().min(0).max(1),
})

export type ParsedMode =
  | z.infer<typeof RouteSchema>
  | z.infer<typeof RankFilesSchema>
  | z.infer<typeof ExtractFactsSchema>
  | z.infer<typeof SummarizeStructuredSchema>
  | z.infer<typeof CheckConstraintsSchema>
  | z.infer<typeof ClassifyErrorSchema>
  | z.infer<typeof SelectTestsSchema>
  | z.infer<typeof DetectUncertaintySchema>
  | z.infer<typeof ArchitectureDesignSchema>
  | z.infer<typeof ComplexReviewSchema>
  | z.infer<typeof ConstraintCheckSchema>
  | z.infer<typeof DiffReviewSchema>

const SCHEMA_MAP: Record<string, z.ZodTypeAny> = {
  ROUTE: RouteSchema,
  RANK_FILES: RankFilesSchema,
  EXTRACT_FACTS: ExtractFactsSchema,
  SUMMARIZE_STRUCTURED: SummarizeStructuredSchema,
  CHECK_CONSTRAINTS: CheckConstraintsSchema,
  CLASSIFY_ERROR: ClassifyErrorSchema,
  SELECT_TESTS: SelectTestsSchema,
  DETECT_UNCERTAINTY: DetectUncertaintySchema,
  ARCHITECTURE_DESIGN: ArchitectureDesignSchema,
  COMPLEX_REVIEW: ComplexReviewSchema,
  CONSTRAINT_CHECK: ConstraintCheckSchema,
  DIFF_REVIEW: DiffReviewSchema,
}

export interface ParseResult {
  success: boolean
  data: ParsedMode | null
  error: string | null
}

export function parseModelOutput(mode: TaskMode, output: string): ParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(output)
  } catch {
    return { success: false, data: null, error: "Output is not valid JSON" }
  }

  const schema = SCHEMA_MAP[mode]
  if (!schema) {
    return { success: false, data: null, error: `No schema defined for mode: ${mode}` }
  }

  const result = schema.safeParse(parsed)
  if (result.success) {
    return { success: true, data: result.data as ParsedMode, error: null }
  }

  const issues = result.error.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("; ")
  return { success: false, data: null, error: `Schema validation failed: ${issues}` }
}

export function getSchemaForMode(mode: TaskMode): z.ZodTypeAny {
  return SCHEMA_MAP[mode] ?? z.unknown()
}

export function formatOutputSchema(mode: TaskMode): string {
  const schema = getSchemaForMode(mode)
  if (!schema || schema instanceof z.ZodUnknown) return "{}"

  try {
    const shape = (schema as z.ZodObject<any>).shape
    if (!shape) return "{}"

    const lines: string[] = ["{"]
    const entries = Object.entries(shape)
    for (let i = 0; i < entries.length; i++) {
      const [key, field] = entries[i]
      const desc = describeZodType(field)
      const comma = i < entries.length - 1 ? "," : ""
      lines.push(`  "${key}": ${desc}${comma}`)
    }
    lines.push("}")
    return lines.join("\n")
  } catch {
    return "{}"
  }
}

function describeZodType(type: unknown): string {
  if (type instanceof z.ZodString) return "string"
  if (type instanceof z.ZodNumber) return "number"
  if (type instanceof z.ZodBoolean) return "boolean"
  if (type instanceof z.ZodArray) return `${describeZodType(type.element)}[]`
  if (type instanceof z.ZodEnum) {
    return (type.options as string[]).map(String).join(" | ")
  }
  return "unknown"
}
