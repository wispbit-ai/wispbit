import { currentSpan, Eval, initDataset } from "braintrust"
import dotenv from "dotenv"

import { CodeReviewer } from "./CodeReviewer"
import { ExactMatch } from "./evals"
import { CodebaseRule, FileChange } from "./types"

dotenv.config()

Eval("AI Code Review", {
  experimentName: "Code Reviewer",
  trialCount: 1,
  data: initDataset("AI Code Review", { dataset: "Code Reviewer" }),
  task: async (input: { files: FileChange[]; rules: CodebaseRule[]; fileToReview: string }) => {
    const codeReviewer = new CodeReviewer({ debug: true }, undefined, input.files)

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
