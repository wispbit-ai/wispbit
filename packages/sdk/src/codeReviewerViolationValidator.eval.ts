import { currentSpan, Eval, initDataset } from "braintrust"
import dotenv from "dotenv"

import { CodeReviewerViolationValidator } from "./CodeReviewerViolationValidator"
import { ExactMatch } from "./evals"
import { FileChange, Violation } from "./types"

dotenv.config()

Eval("AI Code Review", {
  experimentName: "Code Reviewer Violation Validator",
  trialCount: 1,
  data: initDataset("AI Code Review", { dataset: "Code Reviewer Violation Validator" }),
  task: async (input: { file: FileChange; violation: Violation }) => {
    const validator = new CodeReviewerViolationValidator({ debug: true }, undefined)

    const result = await validator.validateViolation(input.violation, input.file)

    currentSpan().log({
      metadata: { isValid: result.isValid, reasoning: result.reasoning, cost: result.cost },
    })

    return result.isValid
  },
  scores: [ExactMatch],
})
