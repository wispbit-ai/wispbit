import { Octokit } from "@octokit/rest"

export interface PullRequestComment {
  body: string
  path: string
  line: number
  side: "LEFT" | "RIGHT"
  startLine?: number
  startSide?: "LEFT" | "RIGHT"
}

export async function createGithubPullRequestReview(
  octokit: Octokit,
  {
    owner,
    repo,
    pullNumber,
    commitId,
    comments,
    body,
  }: {
    owner: string
    repo: string
    pullNumber: number
    comments: PullRequestComment[]
    commitId: string
    body?: string
  }
) {
  // First, create a pending review with all comments
  await octokit.request("POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews", {
    owner,
    repo,
    pull_number: pullNumber,
    body,
    event: "COMMENT",
    commit_id: commitId,
    comments: comments.map((comment) => ({
      body: comment.body,
      path: comment.path,
      line: comment.line,
      side: comment.side,
      ...(comment.startLine && comment.startSide
        ? {
            start_line: comment.startLine,
            start_side: comment.startSide,
          }
        : {}),
    })),
  })
}
