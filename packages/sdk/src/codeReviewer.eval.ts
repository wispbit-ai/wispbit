import { execSync } from "child_process"
import os from "os"
import path from "path"

import { currentSpan, Eval, initDataset } from "braintrust"
import dotenv from "dotenv"
import fs from "fs-extra"

import { CodeReviewer } from "./CodeReviewer"
import { ExactMatch } from "./evals"
import { CodebaseRule, FileChange } from "./types"

const ripGrepPath = execSync("which rg").toString().trim()

dotenv.config()

Eval("AI Code Review", {
  experimentName: "Code Reviewer",
  trialCount: 1,
  data: initDataset("AI Code Review", { dataset: "Code Reviewer" }),
  task: async (input: {
    files: FileChange[]
    rules: CodebaseRule[]
    fileToReview: string
    existingFiles: { content: string; filename: string }[]
  }) => {
    const testDir = path.join(os.tmpdir(), `test_repo_${Math.random().toString(36).substring(2)}`)
    fs.mkdirSync(testDir)

    for (const file of input.existingFiles) {
      createTestFile(testDir, file.filename, file.content)
    }

    const codeReviewer = new CodeReviewer(
      { debug: true, ripGrepPath, cwd: testDir },
      undefined,
      input.files
    )

    const result = await codeReviewer.codeReviewFile(
      input.files.find((f) => f.filename === input.fileToReview)!,
      input.rules
    )

    currentSpan().log({
      metadata: {
        violations: result.violations,
        explanation: result.explanation,
        visitedFiles: result.visitedFiles,
        rejectedViolations: result.rejectedViolations,
        cost: result.cost,
        rules: result.rules,
      },
    })

    return {
      violations: result.violations.length,
      optionalViolations: result.violations.filter((v) => v.optional).length,
    }
  },
  scores: [ExactMatch],
})

function createTestFile(testDir: string, filePath: string, content: string | null): string {
  const fullPath = path.join(testDir, filePath)
  const dir = path.dirname(fullPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  if (content !== null) {
    fs.writeFileSync(fullPath, content)
  }
  return fullPath
}
