import path from "path"

import { rgPath } from "@vscode/ripgrep"
import { filterRules, getRulesFromDirectory, getRulesFromRoot } from "@wispbit/sdk/codebaseRules"
import { CodeReviewer } from "@wispbit/sdk/CodeReviewer"
import { hashString } from "@wispbit/sdk/hash"
import { FileChange, Violation } from "@wispbit/sdk/types"
import chalk from "chalk"
import { AbortError } from "p-retry"

import { getViolationsForFile, hasReviewedFileWithSameHash, saveFileReview } from "@wispbit/cli/db"
import { findGitRoot, getChangedFiles } from "@wispbit/cli/git"
import { CodeReviewHooks, CodeReviewOptions } from "@wispbit/cli/types"

/**
 * Run a code review on the repository using the Ink UI
 */
export async function runCodeReview({
  options,
  hooks,
}: {
  options: CodeReviewOptions
  hooks: CodeReviewHooks
}): Promise<{ fileName: string; violations: Violation[] }[] | undefined> {
  const { endpoint, model, customRulesDir, debug, apiKey } = options
  const { onStart, onAbort, onUpdateFile, onComplete } = hooks
  const repoRoot = await findGitRoot()
  const abortController = new AbortController()

  const returnViolations: { fileName: string; violations: Violation[] }[] = []

  try {
    // Get the list of changed files
    const { files, currentBranch, currentCommit, diffBranch, diffCommit } = await getChangedFiles(
      repoRoot,
      options.base
    )

    // Get local rules from directory
    const rules = customRulesDir
      ? await getRulesFromDirectory(path.resolve(process.cwd(), customRulesDir))
      : await getRulesFromRoot(repoRoot)

    onStart?.({
      files,
      rules,
      currentBranch,
      currentCommit,
      diffBranch,
      diffCommit,
      abortController,
    })

    // Check if aborted
    if (abortController.signal.aborted) {
      onAbort?.()
      throw new AbortError("Code review aborted")
    }

    // Process files with a more dynamic approach
    const MAX_CONCURRENT = 10
    const fileQueue = [...files]
    let _completedCount = 0
    const processingPromises: Promise<void>[] = []

    // Function to process a single file
    const processFile = async (file: FileChange): Promise<void> => {
      try {
        // Check if aborted before processing each file
        if (abortController.signal.aborted) {
          onAbort?.()
          return
        }

        onUpdateFile?.({ fileName: file.filename, status: "processing" })

        // Find rules that apply to this file
        const allowedRules = filterRules(rules, file.filename)

        // Update UI to show processing state with rules being evaluated
        if (allowedRules.length > 0) {
          onUpdateFile?.({
            fileName: file.filename,
            status: "processing",
            rules: allowedRules,
          })
        }

        if (allowedRules.length === 0) {
          onUpdateFile?.({
            fileName: file.filename,
            status: "skipped",
            skippedReason: "no matching rules",
            rules: allowedRules,
          })

          _completedCount++
          return
        }

        // Calculate file hash from content or patch
        const fileContent = file.patch || ""
        const fileHash = hashString(fileContent)

        // Check if file has already been reviewed with current rules
        const hasBeenReviewed = await hasReviewedFileWithSameHash(
          repoRoot,
          file.filename,
          fileHash,
          allowedRules
        )

        if (hasBeenReviewed) {
          // Get cached violations for this file
          const cachedViolations = await getViolationsForFile(file.filename, fileHash)

          onUpdateFile?.({
            fileName: file.filename,
            status: "skipped",
            skippedReason: "cached",
            violations: cachedViolations.length > 0 ? cachedViolations : undefined,
            rules: allowedRules,
          })

          // Convert cached violations to expected format
          const violations: Violation[] = cachedViolations.map((v) => ({
            description: v.description,
            line: v.line,
            rule: allowedRules.find((r) => r.id === v.description) || allowedRules[0], // This might need adjustment based on how rule mapping works
            isCached: true,
            optional: v.optional,
            reason: "",
          }))

          returnViolations.push({
            fileName: file.filename,
            violations,
          })

          _completedCount++
          return
        }

        // Use custom model if provided, otherwise use default
        const reviewer = new CodeReviewer(
          {
            cwd: repoRoot,
            // ripgrep is a dependency of vscode-ripgrep
            ripGrepPath: rgPath,
            debug: debug || false,
          },
          {
            baseURL: endpoint,
            apiKey,
            model,
            validationModel: model,
          },
          files
        )

        const analysis = await reviewer.codeReviewFile(file, rules)

        onUpdateFile?.({
          fileName: file.filename,
          status: "completed",
          violations: analysis.violations.length > 0 ? analysis.violations : undefined,
          rules: allowedRules,
        })

        await saveFileReview(
          repoRoot,
          file,
          analysis.violations,
          analysis.visitedFiles,
          allowedRules
        )

        returnViolations.push({
          fileName: file.filename,
          violations: analysis.violations,
        })

        _completedCount++
      } catch (error) {
        // If we hit an error for a single file, mark it as completed with an error
        // but don't fail the entire process
        if (!abortController.signal.aborted) {
          onUpdateFile?.({
            fileName: file.filename,
            status: "skipped",
            skippedReason: "error",
          })
          console.error(`Error processing ${file.filename}:`, error)
        }

        _completedCount++
      } finally {
        // When a file is done processing, immediately start processing the next one
        if (fileQueue.length > 0 && !abortController.signal.aborted) {
          const nextFile = fileQueue.shift()
          if (nextFile) {
            const promise = processFile(nextFile)
            processingPromises.push(promise)
          }
        }
      }
    }

    // Start initial batch of files
    const initialBatchSize = Math.min(MAX_CONCURRENT, fileQueue.length)
    for (let i = 0; i < initialBatchSize; i++) {
      const file = fileQueue.shift()
      if (file) {
        const promise = processFile(file)
        processingPromises.push(promise)
      }
    }

    // Wait for all processing to complete
    await Promise.all(processingPromises)

    // Only finish the review if we weren't aborted
    if (!abortController.signal.aborted) {
      onComplete?.()
    } else {
      onAbort?.()
    }

    return returnViolations
  } catch (error) {
    if (error instanceof AbortError) {
      console.log(chalk.yellow("Code review was aborted."))
    } else {
      console.error(chalk.red("Error during code review:"), error)
    }
  } finally {
    onAbort?.()
  }
}
