import { Octokit } from "@octokit/rest"

export async function createGithubPullRequestComment(
  octokit: Octokit,
  {
    owner,
    repo,
    pullNumber,
    body,
    path,
    commitId,
    line,
    side,
    startLine,
    startSide,
  }: {
    owner: string
    repo: string
    pullNumber: number
    body: string
    path: string
    commitId: string
    line: number
    side: "LEFT" | "RIGHT"
    startLine?: number
    startSide?: "LEFT" | "RIGHT"
  }
) {
  const { data: comment } = await octokit.request(
    "POST /repos/{owner}/{repo}/pulls/{pull_number}/comments",
    {
      owner,
      repo,
      pull_number: pullNumber,
      body,
      path,
      commit_id: commitId,
      line,
      side,
      ...(startLine && startSide
        ? {
            start_line: startLine,
            start_side: startSide,
          }
        : {}),
    }
  )

  return comment
}
