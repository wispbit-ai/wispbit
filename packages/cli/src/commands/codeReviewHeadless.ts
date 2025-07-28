import chalk from "chalk"

import { runCodeReview } from "@wispbit/cli/codeReview"
import {
  formatAsGithubPullRequestReview,
  formatAsMarkdown,
  formatAsPlaintext,
} from "@wispbit/cli/headless"
import { ModeOptions, CodeReviewOptions, FileWithStatus } from "@wispbit/cli/types"

/**
 * Run a code review on the repository using the Ink UI
 */
export async function runCodeReviewHeadless(
  options: CodeReviewOptions,
  ciOptions: ModeOptions
): Promise<void> {
  const results = await runCodeReview({
    options,
    hooks: {
      onStart: ({ files, currentBranch, diffBranch, diffCommit }) => {
        if (ciOptions.mode === "github") {
          console.log(
            chalk.green(
              `[wispbit] found ${files.length} files to review, comparing ${currentBranch} with ${diffBranch} ${diffCommit && diffBranch !== diffCommit ? `(${diffCommit})` : ""}`
            )
          )
        }
      },
      onAbort: () => {},
      onUpdateFile: (file: FileWithStatus) => {
        switch (file.status) {
          case "skipped":
          case "completed":
            {
              // Only show basic progress in CI mode, detailed output comes from formatters
              const violationCount = file.violations?.length ?? 0
              const ruleCount = file.rules?.length ?? 0
              if (ciOptions.mode === "github") {
                if (violationCount === 0) {
                  console.log(
                    chalk.green(
                      `[wispbit] ✓ ${file.fileName} (${ruleCount} rules, no violations) ${file.skippedReason ? `(${file.skippedReason})` : ""}`
                    )
                  )
                } else {
                  console.log(
                    chalk.yellow(
                      `[wispbit] ⚠ ${file.fileName} (${violationCount} violations) ${file.skippedReason ? `(${file.skippedReason})` : ""}`
                    )
                  )
                }
              }
            }

            break
        }
      },
      onComplete: () => {},
    },
  })

  // Handle different CI providers
  if (ciOptions.mode === "github") {
    await formatAsGithubPullRequestReview(results ?? [], ciOptions)
  } else if (ciOptions.mode === "markdown") {
    // Output formatted markdown for other CI providers
    const markdown = formatAsMarkdown(results ?? [])
    console.log(markdown)
  } else if (ciOptions.mode === "plaintext") {
    // Output formatted plaintext for other CI providers
    const plaintext = formatAsPlaintext(results ?? [])
    console.log(plaintext)
  }
}
