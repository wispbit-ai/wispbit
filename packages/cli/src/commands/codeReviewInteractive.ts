import { runCodeReview } from "@wispbit/cli/codeReview"
import { CodeReviewOptions, FileWithStatus } from "@wispbit/cli/types"
import { createCodeReviewUI } from "@wispbit/cli/ui/codeReviewUI"

let ui: ReturnType<typeof createCodeReviewUI> | null = null

/**
 * Run a code review on the repository using the Ink UI
 */
export async function runCodeReviewInteractive(options: CodeReviewOptions): Promise<void> {
  await runCodeReview({
    options,
    hooks: {
      onStart: ({ files, currentBranch, diffBranch, diffCommit, rules }) => {
        ui = createCodeReviewUI(files, {
          model: options.model,
          currentBranch,
          diffBranch,
          diffCommit,
          localRulesCount: rules.length,
        })
      },
      onAbort: () => {
        ui?.cleanup()
      },
      onUpdateFile: (file: FileWithStatus) => {
        ui?.updateFileStatus(file)
      },
      onComplete: () => {
        ui?.finishReview()
        ui?.cleanup()
      },
    },
  })
}
