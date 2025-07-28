/**
 * Represents a change to a file.
 */
export interface FileChange {
  filename: string
  status: "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged"
  // patch format in git unified diff format
  patch?: string
  additions: number
  deletions: number
  sha: string
}

/**
 * Represents a rule that can be applied to a codebase.
 */
export interface CodebaseRule {
  id: string
  directory?: string
  name: string
  contents: string
  include: string[]
  status?: "pending" | "active" | "inactive"
}

/**
 * Represents a line reference in a file.
 */
export interface LineReference {
  /** Starting line number */
  start: number
  /** Ending line number (inclusive) */
  end: number
  /** Which side of the diff the line numbers refer to: 'right' (after changes) or 'left' (before changes) */
  side: "right" | "left"
}

/**
 * Represents a rule violation.
 */
export interface Violation {
  /** Description of why this violates the rule */
  description: string
  /** Line numbers where the violation occurs */
  line: LineReference
  /** The rule that was violated */
  rule: CodebaseRule
  /** Reasoning for why the violation was validated */
  validationReasoning?: string

  /** Whether the violation was read from the cache */
  isCached?: boolean
}

/**
 * Represents the analysis of a file.
 */
export interface FileAnalysis {
  /** List of violations found */
  violations: Violation[]
  /** Explanation of the analysis */
  explanation: string
  /** List of rules used to analyze the file */
  rules: CodebaseRule[]
  /** List of file paths visited. Useful for generating cache keys. */
  visitedFiles: string[]
  /** List of violations that were rejected by the AI */
  rejectedViolations?: { violation: Violation; reasoning: string }[]
  /** Cost of the analysis in dollars */
  cost: string
}
