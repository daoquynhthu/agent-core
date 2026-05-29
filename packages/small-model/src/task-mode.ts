export type TaskMode =
  | "ROUTE"
  | "RANK_FILES"
  | "EXTRACT_FACTS"
  | "SUMMARIZE_STRUCTURED"
  | "CHECK_CONSTRAINTS"
  | "CLASSIFY_ERROR"
  | "SELECT_TESTS"
  | "DETECT_UNCERTAINTY"
  | "ARCHITECTURE_DESIGN"
  | "COMPLEX_REVIEW"
  | "CONSTRAINT_CHECK"
  | "DIFF_REVIEW"

export interface TaskModeConfig {
  mode: TaskMode
  description: string
  allowedTiers: Array<"t1" | "t2" | "t3">
  budgetHint: {
    input: number
    output: number
  }
  outputSchema: Record<string, unknown>
  systemInstruction: string
}

export const TASK_MODE_CONFIGS: Record<TaskMode, TaskModeConfig> = {
  ROUTE: {
    mode: "ROUTE",
    description: "Classify task type and recommend executor",
    allowedTiers: ["t1", "t2", "t3"],
    budgetHint: { input: 300, output: 60 },
    outputSchema: {
      type: "object",
      fields: { taskType: "string", recommendedExecutor: "string" },
    },
    systemInstruction: "Classify the task and recommend who should handle it. Be concise.",
  },

  RANK_FILES: {
    mode: "RANK_FILES",
    description: "Rank top-k relevant files for a task",
    allowedTiers: ["t1", "t2", "t3"],
    budgetHint: { input: 900, output: 160 },
    outputSchema: {
      type: "object",
      fields: { rankedFiles: "string[]", reasoning: "string" },
    },
    systemInstruction: "Rank the most relevant files for the given task. List files by importance.",
  },

  EXTRACT_FACTS: {
    mode: "EXTRACT_FACTS",
    description: "Extract factual claims from text without interpretation",
    allowedTiers: ["t2", "t3"],
    budgetHint: { input: 1200, output: 200 },
    outputSchema: {
      type: "object",
      fields: { facts: "string[]", confidence: "number" },
    },
    systemInstruction: "Extract only factual statements. Do not interpret, summarize, or explain. Output facts as short atomic claims.",
  },

  SUMMARIZE_STRUCTURED: {
    mode: "SUMMARIZE_STRUCTURED",
    description: "Produce structured summary of code/diff/log",
    allowedTiers: ["t1", "t2"],
    budgetHint: { input: 2500, output: 220 },
    outputSchema: {
      type: "object",
      fields: {
        intent: "string",
        changedFiles: "string[]",
        apiChanges: "string[]",
        risk: "string[]",
        tests: "string[]",
      },
    },
    systemInstruction: "Produce a structured summary. Identify intent, changed files, API changes, risks, and relevant tests.",
  },

  CHECK_CONSTRAINTS: {
    mode: "CHECK_CONSTRAINTS",
    description: "Check if a patch or plan violates active constraints",
    allowedTiers: ["t1", "t2", "t3"],
    budgetHint: { input: 1000, output: 120 },
    outputSchema: {
      type: "object",
      fields: {
        status: "pass | violation | unknown",
        violations: "string[]",
        confidence: "number",
      },
    },
    systemInstruction: "Check if the proposed changes violate any active constraints. If uncertain, return status=unknown.",
  },

  CLASSIFY_ERROR: {
    mode: "CLASSIFY_ERROR",
    description: "Classify error type from log tail",
    allowedTiers: ["t2", "t3"],
    budgetHint: { input: 1200, output: 120 },
    outputSchema: {
      type: "object",
      fields: { errorType: "string", severity: "low | medium | high", suggestedAction: "string" },
    },
    systemInstruction: "Classify the error from the log output. Be specific about the error type.",
  },

  SELECT_TESTS: {
    mode: "SELECT_TESTS",
    description: "Select which tests to run based on changed files",
    allowedTiers: ["t1", "t2", "t3"],
    budgetHint: { input: 900, output: 160 },
    outputSchema: {
      type: "object",
      fields: { testFiles: "string[]", priority: "high | medium | low" },
    },
    systemInstruction: "Select the most relevant tests for the given file changes. Prioritize tests that directly cover the changed code.",
  },

  DETECT_UNCERTAINTY: {
    mode: "DETECT_UNCERTAINTY",
    description: "Detect unsupported claims in model output",
    allowedTiers: ["t2", "t3"],
    budgetHint: { input: 1500, output: 100 },
    outputSchema: {
      type: "object",
      fields: {
        hasUnsupportedClaims: "boolean",
        unsupportedClaims: "string[]",
        confidence: "number",
      },
    },
    systemInstruction: "Check if the model output contains claims not supported by the provided evidence. Flag any unsupported assertions.",
  },

  ARCHITECTURE_DESIGN: {
    mode: "ARCHITECTURE_DESIGN",
    description: "High-level architecture design and planning",
    allowedTiers: ["t1"],
    budgetHint: { input: 12000, output: 1500 },
    outputSchema: {
      type: "object",
      fields: {
        proposal: "string",
        alternatives: "string[]",
        risks: "string[]",
        openQuestions: "string[]",
      },
    },
    systemInstruction: "Design architecture within the given constraints. Consider alternatives, identify risks, and note open questions.",
  },

  COMPLEX_REVIEW: {
    mode: "COMPLEX_REVIEW",
    description: "In-depth code review with correctness and risk assessment",
    allowedTiers: ["t1", "t2"],
    budgetHint: { input: 12000, output: 1000 },
    outputSchema: {
      type: "object",
      fields: {
        correctness: "string",
        architectureFit: "string",
        risk: "string[]",
        missingTests: "string[]",
        requiredChanges: "string[]",
        acceptOrReject: "accept | reject | changes_requested",
      },
    },
    systemInstruction: "Review the patch thoroughly. Assess correctness, architecture fit, risk, and test coverage.",
  },

  CONSTRAINT_CHECK: {
    mode: "CONSTRAINT_CHECK",
    description: "Quick constraint violation check",
    allowedTiers: ["t1", "t2", "t3"],
    budgetHint: { input: 1000, output: 120 },
    outputSchema: {
      type: "object",
      fields: { status: "pass | violation | unknown", violations: "string[]", confidence: "number" },
    },
    systemInstruction: "Check constraints only. Do not suggest implementation. Return unknown if uncertain.",
  },

  DIFF_REVIEW: {
    mode: "DIFF_REVIEW",
    description: "Review a diff for issues",
    allowedTiers: ["t1", "t2"],
    budgetHint: { input: 2500, output: 300 },
    outputSchema: {
      type: "object",
      fields: {
        status: "pass | violation | unknown",
        violations: "string[]",
        confidence: "number",
      },
    },
    systemInstruction: "Review the diff for any issues or violations. Be concise.",
  },
}

export function getTaskMode(mode: string): TaskModeConfig | undefined {
  return TASK_MODE_CONFIGS[mode as TaskMode]
}

export function resolveTaskMode(taskGoal: string): TaskMode {
  const lower = taskGoal.toLowerCase()
  if (lower.includes("route") || lower.includes("classif")) return "ROUTE"
  if (lower.includes("rank") || lower.includes("relevant file") || lower.includes("which file")) return "RANK_FILES"
  if (lower.includes("extract fact") || lower.includes("extract claim")) return "EXTRACT_FACTS"
  if (lower.includes("summariz") || lower.includes("summary")) return "SUMMARIZE_STRUCTURED"
  if (lower.includes("constraint") || lower.includes("violat")) return "CHECK_CONSTRAINTS"
  if (lower.includes("error") || lower.includes("fail") || lower.includes("crash")) return "CLASSIFY_ERROR"
  if (lower.includes("test") || lower.includes("which test")) return "SELECT_TESTS"
  if (lower.includes("uncertain") || lower.includes("hallucinat")) return "DETECT_UNCERTAINTY"
  if (lower.includes("architect") || lower.includes("design") || lower.includes("plan")) return "ARCHITECTURE_DESIGN"
  if (lower.includes("review") && (lower.includes("patch") || lower.includes("diff") || lower.includes("pr"))) return "COMPLEX_REVIEW"
  if (lower.includes("diff") || lower.includes("change")) return "DIFF_REVIEW"
  return "ROUTE"
}

export function getAllowedModes(tier: "t1" | "t2" | "t3"): TaskMode[] {
  return (Object.entries(TASK_MODE_CONFIGS) as [TaskMode, TaskModeConfig][])
    .filter(([_, config]) => config.allowedTiers.includes(tier))
    .map(([mode]) => mode)
}
