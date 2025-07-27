/**
 * Helper functions to parse git diff patches.
 */

import { LineReference } from "@wispbit/sdk/types"

/**
 * Represents a line in a git diff patch with line numbers and content.
 */
type PatchLine = [oldLine: number | null, newLine: number | null, content: string]

/**
 * Parse the patch and return list of [old_line, new_line, content] for each line.
 *
 * @param patch - The git diff patch content
 * @returns Array of tuples containing:
 *   - old_line number (or null for additions)
 *   - new_line number (or null for deletions)
 *   - content of the line without prefix
 */
function parsePatch(patch: string): PatchLine[] {
  const lines = patch ? patch.split("\n") : []
  const result: PatchLine[] = []
  let currentNewLine = 0
  let currentOldLine = 0
  let inHunk = false

  for (const line of lines) {
    if (line.startsWith("@@")) {
      const oldStart = parseInt(line.split(" ")[1].split(",")[0].replace("-", ""))
      const newStart = parseInt(line.split(" ")[2].split(",")[0].replace("+", ""))
      currentOldLine = oldStart
      currentNewLine = newStart
      inHunk = true
    } else if (!inHunk) {
      continue
    } else if (line.startsWith("+")) {
      result.push([null, currentNewLine, line.substring(1)])
      currentNewLine += 1
    } else if (line.startsWith("-")) {
      result.push([currentOldLine, null, line.substring(1)])
      currentOldLine += 1
    } else if (!line.startsWith("\\")) {
      // Ignore "\ No newline at end of file"
      result.push([currentOldLine, currentNewLine, line])
      currentNewLine += 1
      currentOldLine += 1
    }
  }

  return result
}

/**
 * Extract line numbers that were actually modified in the patch.
 *
 * @param patch - The git diff patch content
 * @returns Tuple of [addedLines, removedLines] where each is a Set of line numbers
 */
function parseLines(patch: string): [Set<number>, Set<number>] {
  const addedLines = new Set<number>()
  const removedLines = new Set<number>()
  const parsedLines = parsePatch(patch)

  for (const [oldLine, newLine] of parsedLines) {
    if (oldLine === null && newLine !== null) {
      addedLines.add(newLine)
    } else if (oldLine !== null && newLine === null) {
      removedLines.add(oldLine)
    }
  }

  return [addedLines, removedLines]
}

/**
 * Get the line ranges covered by the patch (including context lines).
 * Returns all individual hunk ranges for accurate multi-patch support.
 *
 * @param patch - The git diff patch content
 * @returns Tuple of [oldRanges, newRanges] where each is an array of [start, end] ranges
 */
function getPatchLineRanges(patch: string): [Array<[number, number]>, Array<[number, number]>] {
  const lines = patch.split("\n")
  const oldRanges: Array<[number, number]> = []
  const newRanges: Array<[number, number]> = []

  for (const line of lines) {
    if (line.trim().startsWith("@@")) {
      const parts = line.split(" ")
      const oldPart = parts[1] // e.g., "-1,5"
      const newPart = parts[2] // e.g., "+1,6"

      const oldStart = parseInt(oldPart.split(",")[0].replace("-", ""))
      const oldCount = parseInt(oldPart.split(",")[1] || "1")
      const oldEnd = oldStart + oldCount - 1

      const newStart = parseInt(newPart.split(",")[0].replace("+", ""))
      const newCount = parseInt(newPart.split(",")[1] || "1")
      const newEnd = newStart + newCount - 1

      oldRanges.push([oldStart, oldEnd])
      newRanges.push([newStart, newEnd])
    }
  }

  return [oldRanges, newRanges]
}

/**
 * Filter violations to only include those that affect lines in the patch.
 *
 * @param violations - List of violations
 * @param patch - The git diff patch content
 * @returns Filtered list of violations
 */
export function isLineReferenceValidForPatch(lineReference: LineReference, patch: string): boolean {
  // Get the line ranges covered by the patch
  const [oldRanges, newRanges] = getPatchLineRanges(patch)

  if (!oldRanges.length || !newRanges.length) {
    return false // No valid hunk found
  }

  // Check if start and end are within any of the patch's context ranges
  const ranges = lineReference.side === "left" ? oldRanges : newRanges
  let overlapsWithAnyRange = false

  for (const [rangeStart, rangeEnd] of ranges) {
    // Check if there's any overlap between the line reference and this range
    if (lineReference.start <= rangeEnd && lineReference.end >= rangeStart) {
      overlapsWithAnyRange = true
      break
    }
  }

  if (!overlapsWithAnyRange) {
    return false // Line reference doesn't overlap with any patch contexts
  }

  // Check if any line in the range is in the changed lines
  const patchLines = parseLines(patch)
  const [newLines, oldLines] = patchLines

  for (let line = lineReference.start; line <= lineReference.end; line++) {
    if (lineReference.side === "left" ? oldLines.has(line) : newLines.has(line)) {
      return true
    }
  }

  return false
}

/**
 * Extract a diff_hunk for a specific line range from a patch.
 * This provides context around the violation by showing the surrounding diff.
 *
 * @param patch - The git diff patch content
 * @param startLine - Start line number of the violation
 * @param endLine - End line number of the violation
 * @param side - Which side of the diff ("left" for before changes, "right" for after changes)
 * @param contextLines - Number of context lines to include before and after (default: 3)
 * @returns The extracted diff hunk as a string
 */
export function extractDiffHunk(
  patch: string,
  startLine: number,
  endLine: number,
  side: "left" | "right",
  contextLines: number = 3
): string {
  const lines = patch.split("\n")
  const result: string[] = []
  let currentNewLine = 0
  let currentOldLine = 0
  let inHunk = false
  let currentHunkStart = -1
  let targetHunkStart = -1
  let violationStart = -1
  let violationEnd = -1

  // Track line numbers for the extracted hunk
  let extractedOldStart = -1
  let extractedOldCount = 0
  let extractedNewStart = -1
  let extractedNewCount = 0
  const extractedLineIndices: number[] = []

  // First pass: find the hunk and violation boundaries
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith("@@")) {
      const oldStart = parseInt(line.split(" ")[1].split(",")[0].replace("-", ""))
      const newStart = parseInt(line.split(" ")[2].split(",")[0].replace("+", ""))
      currentOldLine = oldStart
      currentNewLine = newStart
      inHunk = true
      currentHunkStart = i
    } else if (!inHunk) {
      continue
    } else if (line.startsWith("+")) {
      if (side === "right" && currentNewLine >= startLine && currentNewLine <= endLine) {
        if (violationStart === -1) {
          violationStart = i
          targetHunkStart = currentHunkStart
        }
        violationEnd = i
      }
      currentNewLine += 1
    } else if (line.startsWith("-")) {
      if (side === "left" && currentOldLine >= startLine && currentOldLine <= endLine) {
        if (violationStart === -1) {
          violationStart = i
          targetHunkStart = currentHunkStart
        }
        violationEnd = i
      }
      currentOldLine += 1
    } else if (!line.startsWith("\\")) {
      // Context line
      if (side === "right" && currentNewLine >= startLine && currentNewLine <= endLine) {
        if (violationStart === -1) {
          violationStart = i
          targetHunkStart = currentHunkStart
        }
        violationEnd = i
      }
      if (side === "left" && currentOldLine >= startLine && currentOldLine <= endLine) {
        if (violationStart === -1) {
          violationStart = i
          targetHunkStart = currentHunkStart
        }
        violationEnd = i
      }
      currentNewLine += 1
      currentOldLine += 1
    }
  }

  // If no violation lines found, return empty string
  if (violationStart === -1 || violationEnd === -1 || targetHunkStart === -1) {
    return ""
  }

  // Calculate the range to include with context
  const contextStart = Math.max(targetHunkStart + 1, violationStart - contextLines)
  const contextEnd = Math.min(lines.length - 1, violationEnd + contextLines)

  // Collect the lines to include
  for (let i = contextStart; i <= contextEnd; i++) {
    if (i < lines.length && !lines[i].startsWith("@@")) {
      extractedLineIndices.push(i)
    }
  }

  // Second pass: calculate line numbers for the extracted portion
  // Reset counters and parse from the target hunk start
  currentOldLine = 0
  currentNewLine = 0
  inHunk = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (i === targetHunkStart && line.startsWith("@@")) {
      const oldStart = parseInt(line.split(" ")[1].split(",")[0].replace("-", ""))
      const newStart = parseInt(line.split(" ")[2].split(",")[0].replace("+", ""))
      currentOldLine = oldStart
      currentNewLine = newStart
      inHunk = true
    } else if (!inHunk || i < targetHunkStart) {
      continue
    } else if (extractedLineIndices.includes(i)) {
      // This line is included in our extracted hunk
      if (line.startsWith("+")) {
        if (extractedNewStart === -1) {
          extractedNewStart = currentNewLine
          // For additions, the old line position is where it would be inserted
          if (extractedOldStart === -1) {
            extractedOldStart = currentOldLine
          }
        }
        extractedNewCount++
        currentNewLine++
      } else if (line.startsWith("-")) {
        if (extractedOldStart === -1) {
          extractedOldStart = currentOldLine
          // For deletions, the new line position is where it was removed from
          if (extractedNewStart === -1) {
            extractedNewStart = currentNewLine
          }
        }
        extractedOldCount++
        currentOldLine++
      } else if (!line.startsWith("\\")) {
        // Context line
        if (extractedOldStart === -1) {
          extractedOldStart = currentOldLine
        }
        if (extractedNewStart === -1) {
          extractedNewStart = currentNewLine
        }
        extractedOldCount++
        extractedNewCount++
        currentOldLine++
        currentNewLine++
      }
    } else if (i > targetHunkStart && line.startsWith("@@")) {
      // We've reached another hunk, stop
      break
    } else {
      // Update line numbers for lines we're not including
      if (line.startsWith("+")) {
        currentNewLine++
      } else if (line.startsWith("-")) {
        currentOldLine++
      } else if (!line.startsWith("\\") && !line.startsWith("@@")) {
        currentOldLine++
        currentNewLine++
      }
    }
  }

  // Generate the new hunk header
  const oldSpec =
    extractedOldCount === 0
      ? `${extractedOldStart},0`
      : extractedOldCount === 1
        ? `${extractedOldStart}`
        : `${extractedOldStart},${extractedOldCount}`
  const newSpec =
    extractedNewCount === 0
      ? `${extractedNewStart},0`
      : extractedNewCount === 1
        ? `${extractedNewStart}`
        : `${extractedNewStart},${extractedNewCount}`

  result.push(`@@ -${oldSpec} +${newSpec} @@`)

  // Add the extracted lines
  for (const i of extractedLineIndices) {
    result.push(lines[i])
  }

  return result.join("\n")
}

/**
 * Convert GitHub API comment line references to LineReference objects.
 * Handles both single-side and cross-side comments properly.
 *
 * @param diffHunk - The diff hunk content where the comment was made
 * @param startLine - GitHub start_line (undefined for single-line comments)
 * @param endLine - GitHub line
 * @param startSide - GitHub start_side (null for single-line comments)
 * @param endSide - GitHub side
 * @returns Array of LineReference objects representing the comment range
 */
export function parseGithubCommentLineReferences(
  diffHunk: string,
  startLine: number | undefined,
  endLine: number,
  startSide: "LEFT" | "RIGHT" | null,
  endSide: "LEFT" | "RIGHT"
): LineReference[] {
  const references: LineReference[] = []

  // Convert GitHub sides to our format
  const normalizedStartSide = startSide === "LEFT" ? "left" : "right"
  const normalizedEndSide = endSide === "LEFT" ? "left" : "right"

  // If same side or no start side (single line), create simple reference
  if (!startSide || !startLine || normalizedStartSide === normalizedEndSide) {
    references.push({
      start: startLine ?? endLine,
      end: endLine,
      side: normalizedEndSide,
    })
    return references
  }

  // Cross-side comment: need to find where left side ends and right side begins
  const parsedLines = parsePatch(diffHunk)

  // Find the last line number on the start side that's <= startLine + range
  let leftEndLine = startLine
  let rightStartLine = endLine

  // Walk through the parsed diff to understand the structure
  for (const [oldLine, newLine] of parsedLines) {
    if (normalizedStartSide === "left" && oldLine !== null) {
      // For left side, find lines from startLine onwards
      if (oldLine >= startLine) {
        leftEndLine = Math.max(leftEndLine, oldLine)
      }
    }

    if (normalizedEndSide === "right" && newLine !== null) {
      // For right side, find lines up to endLine
      if (newLine <= endLine) {
        rightStartLine = Math.min(rightStartLine, newLine)
      }
    }
  }

  // Create reference for the left side (deletions)
  if (normalizedStartSide === "left") {
    references.push({
      start: startLine,
      end: leftEndLine,
      side: "left",
    })
  }

  // Create reference for the right side (additions)
  if (normalizedEndSide === "right") {
    references.push({
      start: rightStartLine,
      end: endLine,
      side: "right",
    })
  }

  return references
}

/**
 * Add line numbers to a patch for better readability.
 * Shows actual file line numbers with L/R indicators based on the diff headers.
 *
 * @param patch - The git diff patch content
 * @returns The patch formatted with line numbers
 */
export function addLineNumbersToPatch(patch: string): string {
  if (!patch) return ""

  const lines = patch.split("\n")
  const result: string[] = []
  let oldLineNum = 0
  let newLineNum = 0

  for (const line of lines) {
    if (line.startsWith("@@")) {
      // Parse diff header to get starting line numbers
      // Format: @@ -oldStart,oldCount +newStart,newCount @@
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (match) {
        oldLineNum = parseInt(match[1], 10)
        newLineNum = parseInt(match[2], 10)
      }
      result.push(`       ${line}`)
    } else if (line.startsWith("-")) {
      // Deletion - only in old file
      result.push(`L${oldLineNum} ${line}`)
      oldLineNum++
    } else if (line.startsWith("+")) {
      // Addition - only in new file
      result.push(`    R${newLineNum} ${line}`)
      newLineNum++
    } else if (line.startsWith("\\")) {
      // Special lines like "\ No newline at end of file"
      result.push(`       ${line}`)
    } else {
      // Context line - in both files (including empty lines)
      result.push(`L${oldLineNum} R${newLineNum} ${line}`)
      oldLineNum++
      newLineNum++
    }
  }

  return result.join("\n")
}
