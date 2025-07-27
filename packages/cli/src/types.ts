import { CodebaseRule, FileChange, LineReference } from "@wispbit/sdk/types"

export interface ViolationDetail {
  description: string
  line: LineReference
}

export interface FileWithStatus {
  fileName: string
  status: "queued" | "processing" | "completed" | "skipped"
  skippedReason?: "no matching rules" | "cached" | "error"
  violations?: ViolationDetail[]
  rules?: { name: string }[]
}

export interface CodeReviewOptions {
  endpoint: string
  model: string
  customRulesDir?: string
  debug?: boolean
  apiKey: string
  base?: string
}

export interface CiOptions {
  ciProvider?: "github" | "none"
}

export interface CodeReviewHooks {
  onStart?: ({
    files,
    currentBranch,
    diffBranch,
    diffCommit,
  }: {
    files: FileChange[]
    rules: CodebaseRule[]
    currentBranch: string
    diffBranch: string
    diffCommit: string
    abortController: AbortController
  }) => void
  onAbort?: () => void
  onUpdateFile?: (file: FileWithStatus) => void
  onComplete?: () => void
}
