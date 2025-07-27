import { exec } from "child_process"
import { promisify } from "util"

import { hashString } from "@wispbit/sdk/hash"
import { FileChange } from "@wispbit/sdk/types"

const execPromise = promisify(exec)

/**
 * Find the Git repository root directory by looking for .git
 */
export async function findGitRoot(): Promise<string> {
  const { stdout } = await execPromise("git rev-parse --show-toplevel")
  return stdout.trim()
}

/**
 * Get the remote repository URL from Git config
 * @param repoRoot Path to the Git repository root
 * @param remoteName Name of the remote (default: origin)
 * @returns The remote repository URL or null if not found
 */
export async function getRepositoryUrl(
  repoRoot: string,
  remoteName: string = "origin"
): Promise<string | null> {
  try {
    const { stdout } = await execPromise(`git remote show ${remoteName}`, {
      cwd: repoRoot,
    })

    // Parse the URL from the output
    const fetchUrlLine = stdout.split("\n").find((line) => line.includes("Fetch URL:"))

    if (fetchUrlLine) {
      return fetchUrlLine.split("Fetch URL:").pop()?.trim() || null
    }

    return null
  } catch (error) {
    console.warn(`Could not determine repository URL: ${error}`)
    return null
  }
}

/**
 * Get the default branch from remote (typically main or master)
 * @param repoRoot Path to the Git repository root
 * @param remoteName Name of the remote (default: origin)
 */
export async function getDefaultBranch(
  repoRoot: string,
  remoteName: string = "origin"
): Promise<string | null> {
  try {
    const { stdout } = await execPromise(`git remote show ${remoteName}`, {
      cwd: repoRoot,
    })

    const headBranchLine = stdout.split("\n").find((line) => line.includes("HEAD branch"))

    if (headBranchLine) {
      return headBranchLine.split(":").pop()?.trim() || null
    }

    return null
  } catch (error) {
    console.warn(`Could not determine default branch: ${error}`)
    return null
  }
}

/**
 * Get information about branches with potential open PRs against the default branch
 * @param repoRoot Path to the Git repository root
 * @param defaultBranch The default branch name
 * @param remoteName Name of the remote (default: origin)
 */
export async function getOpenPullRequests(
  repoRoot: string,
  defaultBranch: string | null,
  remoteName: string = "origin"
): Promise<Array<{ sourceBranch: string; targetBranch: string }>> {
  if (!defaultBranch) {
    return []
  }

  try {
    // Get all local branches that are tracking remote branches
    const { stdout: branchesOutput } = await execPromise(
      `git for-each-ref --format="%(refname:short) %(upstream:short) %(upstream:track)" refs/heads/`,
      { cwd: repoRoot }
    )

    const branches = branchesOutput
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [localBranch, remoteBranch, trackInfo] = line.split(" ")
        return { localBranch, remoteBranch, trackInfo }
      })
      .filter((branch) => branch.remoteBranch) // Only branches tracking a remote

    // Check which branches might have active PRs against default branch
    const pullRequests: Array<{ sourceBranch: string; targetBranch: string }> = []

    for (const branch of branches) {
      // Skip the default branch itself
      if (branch.localBranch === defaultBranch) {
        continue
      }

      try {
        // Check if there's a PR from this branch to the default branch
        // This requires platform-specific APIs, but we can check for some indicators

        // 1. Check if branch has commits ahead of default branch (potential PR)
        const { stdout: mergeBaseOutput } = await execPromise(
          `git merge-base ${branch.localBranch} ${remoteName}/${defaultBranch}`,
          { cwd: repoRoot }
        )
        const mergeBase = mergeBaseOutput.trim()

        // 2. Check if there are commits in this branch not in default branch
        const { stdout: revListOutput } = await execPromise(
          `git rev-list --count ${mergeBase}..${branch.localBranch}`,
          { cwd: repoRoot }
        )

        const aheadCount = parseInt(revListOutput.trim(), 10)

        if (aheadCount > 0) {
          // This branch has commits that could be part of a PR to default branch
          pullRequests.push({
            sourceBranch: branch.localBranch,
            targetBranch: defaultBranch,
          })
        }
      } catch (error) {
        // Skip branches with errors
        continue
      }
    }

    return pullRequests
  } catch (error) {
    console.warn(`Error checking for potential pull requests: ${error}`)
    return []
  }
}

/**
 * Get list of changed files in the current Git repository with their changes
 * @param repoRoot Path to the Git repository root
 */
export async function getChangedFiles(
  repoRoot: string,
  base?: string
): Promise<{
  files: FileChange[]
  currentBranch: string
  currentCommit: string
  diffBranch: string
  diffCommit: string
}> {
  // Get current branch name
  const { stdout: currentBranchOutput } = await execPromise("git rev-parse --abbrev-ref HEAD", {
    cwd: repoRoot,
  })
  const currentBranch = currentBranchOutput.trim()

  // Get current commit hash
  const { stdout: currentCommitOutput } = await execPromise("git rev-parse HEAD", {
    cwd: repoRoot,
  })
  const currentCommit = currentCommitOutput.trim()

  // Try to get the default branch from origin
  const defaultBranch = await getDefaultBranch(repoRoot)
  const compareTo = base ?? (defaultBranch ? `origin/${defaultBranch}` : "HEAD^")

  // Find the merge-base (common ancestor) between current branch and comparison branch
  let mergeBase
  try {
    const { stdout: mergeBaseOutput } = await execPromise(
      `git merge-base ${currentBranch} ${compareTo}`,
      {
        cwd: repoRoot,
      }
    )
    mergeBase = mergeBaseOutput.trim()
  } catch (error) {
    mergeBase = compareTo
  }

  // Get status of files in the repository for metadata
  const { stdout: statusOutput } = await execPromise("git status --porcelain", {
    cwd: repoRoot,
  })

  const statusLines = statusOutput.split("\n").filter(Boolean)
  const fileStatuses = new Map<string, string>()

  statusLines.forEach((line) => {
    const statusCode = line.substring(0, 2).trim()
    const filename = line.substring(3)
    fileStatuses.set(filename, statusCode)
  })

  // Get all files changed compared to the merge-base
  const { stdout: diffOutput } = await execPromise(`git diff ${mergeBase} --name-only`, {
    cwd: repoRoot,
  })
  const allFiles = diffOutput.split("\n").filter(Boolean)

  // Get list of deleted files
  const { stdout: deletedFilesOutput } = await execPromise("git ls-files --deleted", {
    cwd: repoRoot,
  })
  const deletedFiles = deletedFilesOutput.split("\n").filter(Boolean)

  // Add deleted files that might not be captured in diff
  allFiles.push(...deletedFiles.filter((file) => !allFiles.includes(file)))

  // Get detailed diff for each file
  const fileChanges: FileChange[] = []
  for (const file of allFiles) {
    const isDeleted =
      deletedFiles.includes(file) ||
      fileStatuses.get(file)?.includes("D") ||
      fileStatuses.get(file)?.includes("R")

    let additions = 0
    let deletions = 0
    let diffOutput = ""

    if (isDeleted) {
      // For deleted files, get the content of the file from the merge-base commit
      try {
        const { stdout: lastContent } = await execPromise(`git show ${mergeBase}:${file}`, {
          cwd: repoRoot,
        })

        // Each line in the deleted file counts as a deletion
        deletions = lastContent.split("\n").length
        diffOutput = lastContent
          .split("\n")
          .map((line) => `-${line}`)
          .join("\n")
      } catch (error) {
        // If the file was newly added and then deleted, it won't be in the merge-base
        console.warn(`Could not retrieve content for deleted file: ${file}`)
      }
    } else {
      // For non-deleted files, get diff with merge-base commit
      try {
        const { stdout: numstatOutput } = await execPromise(
          `git diff ${mergeBase} --numstat -- ${file}`,
          {
            cwd: repoRoot,
          }
        )

        const numstatParts = numstatOutput.split("\t")
        if (numstatParts.length >= 2) {
          ;[additions, deletions] = numstatParts.map(Number)
        }

        const { stdout: rawDiffOutput } = await execPromise(`git diff ${mergeBase} -- ${file}`, {
          cwd: repoRoot,
        })

        diffOutput = rawDiffOutput
          .split("\n")
          .filter((line) => {
            return !(
              line.startsWith("diff --git") ||
              line.startsWith("index ") ||
              line.startsWith("--- ") ||
              line.startsWith("+++ ")
            )
          })
          .join("\n")
      } catch (error) {
        console.warn(`Error getting diff for file: ${file}`, error)
      }
    }

    const status = isDeleted ? "removed" : "modified"

    fileChanges.push({
      filename: file,
      status,
      patch: diffOutput,
      additions,
      deletions,
      sha: hashString(diffOutput),
    })
  }

  return {
    files: fileChanges,
    currentBranch,
    currentCommit,
    diffCommit: mergeBase,
    diffBranch: compareTo,
  }
}
