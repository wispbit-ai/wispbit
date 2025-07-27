import { Octokit } from "@octokit/rest"
import chalk from "chalk"

import { runCodeReview } from "@wispbit/cli/codeReview"
import { createGithubPullRequestComment } from "@wispbit/cli/github"
import { CiOptions, CodeReviewOptions, FileWithStatus } from "@wispbit/cli/types"

/**
 * Run a code review on the repository using the Ink UI
 */
export async function runCodeReviewCi(
  options: CodeReviewOptions,
  ciOptions: CiOptions
): Promise<void> {
  let currentCommitId = ""
  const results = await runCodeReview({
    options,
    hooks: {
      onStart: ({ files, currentBranch, diffBranch, diffCommit, currentCommit }) => {
        console.log(
          chalk.green(
            `[wispbit] found ${files.length} files to review, comparing ${currentBranch} with ${diffBranch} ${diffCommit && diffBranch !== diffCommit ? `(${diffCommit})` : ""}`
          )
        )
        currentCommitId = currentCommit
      },
      onAbort: () => {},
      onUpdateFile: (file: FileWithStatus) => {
        switch (file.status) {
          case "skipped":
          case "completed":
            {
              if (!file.violations || file.violations.length === 0) {
                console.log(
                  chalk.green(
                    `[wispbit] reviewed ${file.fileName} and found no violations against ${file.rules?.length ?? 0} rules`
                  )
                )
              } else {
                console.log(
                  chalk.red(
                    `[wispbit] reviewed ${file.fileName} and found ${file.violations?.length} violations`
                  )
                )

                for (const violation of file.violations ?? []) {
                  const lineInfo = `line ${violation.line.start}${
                    violation.line.start !== violation.line.end ? `-${violation.line.end}` : ""
                  }`
                  console.log(chalk.red(` • ${lineInfo} → ${violation.description}`))
                }
              }
            }
            break
        }
      },
      onComplete: () => {},
    },
  })

  for (const file of results ?? []) {
    if (ciOptions.ciProvider === "github" && file.violations && file.violations.length > 0) {
      const octokit = new Octokit({ auth: ciOptions.githubToken })

      for (const violation of file.violations) {
        const split = ciOptions.githubRepository?.split("/")
        await createGithubPullRequestComment(octokit, {
          owner: split?.[0] ?? "",
          repo: split?.[1] ?? "",
          pullNumber: Number(ciOptions.githubPullRequestNumber),
          body: violation.description,
          path: file.fileName,
          commitId: currentCommitId,
          line: violation.line.end,
          side: violation.line.side === "right" ? "RIGHT" : "LEFT",
          startLine: violation.line.start !== violation.line.end ? violation.line.start : undefined,
          startSide:
            violation.line.start !== violation.line.end
              ? violation.line.side === "right"
                ? "RIGHT"
                : "LEFT"
              : undefined,
        })
      }
    }
  }
}
