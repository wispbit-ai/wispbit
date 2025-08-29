/**
 * Helper functions to parse git diff patches.
 */

import { LineReference } from "@wispbit/sdk/types"

/**
 * Represents a line in a git diff patch with line numbers and content.
 */
export type PatchLine = [oldLine: number | null, newLine: number | null, content: string]

/**
 * Parse the patch and return list of [old_line, new_line, content] for each line.
 *
 * @param patch - The git diff patch content
 * @returns Array of tuples containing:
 *   - old_line number (or null for additions)
 *   - new_line number (or null for deletions)
 *   - content of the line without prefix
 */
export function parsePatch(patch: string): PatchLine[] {
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
export function parseLines(patch: string): [Set<number>, Set<number>] {
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
export function getPatchLineRanges(
  patch: string
): [Array<[number, number]>, Array<[number, number]>] {
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

  // First, check if the line reference is completely outside all patch ranges
  // This is a more strict check that can provide early return for better performance
  let isCompletelyOutside = true
  for (const [rangeStart, rangeEnd] of ranges) {
    // Check if this range completely contains the line reference
    // Line reference is contained if: rangeStart <= lineReference.start AND lineReference.end <= rangeEnd
    if (rangeStart <= lineReference.start && lineReference.end <= rangeEnd) {
      isCompletelyOutside = false
      break
    }
  }

  if (isCompletelyOutside) {
    return false // Line reference is completely outside all patch ranges
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
  const hunkInfo = calculateHunkLineNumbers(lines, extractedLineIndices, targetHunkStart)
  const { extractedOldStart, extractedOldCount, extractedNewStart, extractedNewCount } = hunkInfo

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
      result.push(line)
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

/**
 * Helper function to calculate line numbers for an extracted hunk.
 * This is the "second pass" logic used in both extractDiffHunk and splitHunks.
 *
 * @param lines - Array of all lines from the patch
 * @param extractedLineIndices - Indices of lines to include in the extracted hunk
 * @param targetHunkStart - Index of the hunk header line to start from (optional, -1 to scan all)
 * @returns Object containing line number information for the extracted hunk
 */
function calculateHunkLineNumbers(
  lines: string[],
  extractedLineIndices: number[],
  targetHunkStart: number = -1
): {
  extractedOldStart: number
  extractedOldCount: number
  extractedNewStart: number
  extractedNewCount: number
} {
  let currentOldLine = 0
  let currentNewLine = 0
  let inHunk = false
  let extractedOldStart = -1
  let extractedOldCount = 0
  let extractedNewStart = -1
  let extractedNewCount = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (
      (targetHunkStart === -1 && line.startsWith("@@")) ||
      (i === targetHunkStart && line.startsWith("@@"))
    ) {
      const oldStart = parseInt(line.split(" ")[1].split(",")[0].replace("-", ""))
      const newStart = parseInt(line.split(" ")[2].split(",")[0].replace("+", ""))
      currentOldLine = oldStart
      currentNewLine = newStart
      inHunk = true
    } else if (!inHunk || (targetHunkStart !== -1 && i < targetHunkStart)) {
      continue
    } else if (extractedLineIndices.includes(i)) {
      // This line is included in our extracted hunk
      if (line.startsWith("+")) {
        if (extractedNewStart === -1) {
          extractedNewStart = currentNewLine
        }
        if (extractedOldStart === -1) {
          // For additions, the old line position should be the insertion point (current old line)
          extractedOldStart = currentOldLine
        }
        extractedNewCount++
        currentNewLine++
      } else if (line.startsWith("-")) {
        if (extractedOldStart === -1) {
          extractedOldStart = currentOldLine
        }
        if (extractedNewStart === -1) {
          // For deletions, the new line position should be the deletion point (current new line)
          extractedNewStart = currentNewLine
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
    } else if (targetHunkStart !== -1 && i > targetHunkStart && line.startsWith("@@")) {
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

  return {
    extractedOldStart: extractedOldStart === -1 ? 1 : extractedOldStart,
    extractedOldCount,
    extractedNewStart: extractedNewStart === -1 ? 1 : extractedNewStart,
    extractedNewCount,
  }
}

/**
 * Helper function to add context lines around target indices.
 * This collects indices of lines that should be included based on the target lines and context size.
 *
 * @param targetIndices - Array of line indices that are the primary targets
 * @param lines - Array of all lines from the patch
 * @param contextLines - Number of context lines to include before and after each target
 * @returns Array of indices to include (target + context), sorted in order
 */
function _addContextAroundIndices(
  targetIndices: number[],
  lines: string[],
  contextLines: number
): number[] {
  const extractedLineIndices: number[] = []
  const processedIndices = new Set<number>()

  for (const targetIdx of targetIndices) {
    // Add the target line itself
    if (!processedIndices.has(targetIdx)) {
      extractedLineIndices.push(targetIdx)
      processedIndices.add(targetIdx)
    }

    // Add context before
    for (let i = targetIdx - 1; i >= Math.max(0, targetIdx - contextLines); i--) {
      // Skip hunk headers and already processed lines
      if (!lines[i].startsWith("@@") && !processedIndices.has(i)) {
        extractedLineIndices.push(i)
        processedIndices.add(i)
      }
    }

    // Add context after
    for (let i = targetIdx + 1; i <= Math.min(lines.length - 1, targetIdx + contextLines); i++) {
      // Skip hunk headers and already processed lines
      if (!lines[i].startsWith("@@") && !processedIndices.has(i)) {
        extractedLineIndices.push(i)
        processedIndices.add(i)
      }
    }
  }

  // Sort indices to maintain order
  return extractedLineIndices.sort((a, b) => a - b)
}

type Line =
  | { kind: "ctx"; text: string } // ' ' (no prefix in raw, see note)
  | { kind: "add"; text: string } // '+' line (kept in --add)
  | { kind: "del"; text: string } // '-' line (kept in --remove)
  | { kind: "meta"; text: string } // '\ No newline at end of file'

type Hunk = {
  rawHeader: string // the entire "@@ -a,b +c,d @@" line (we'll rewrite counts)
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  headerSuffix: string // trailing function name after @@, if any
  lines: Line[]
}

type FileDiff = {
  headers: string[] // lines before first hunk (diff --git, index, ---/+++ etc.)
  hunks: Hunk[]
}

type ParsedDiff = FileDiff[]

// 2) More forgiving hunk header (allow leading spaces)
const HUNK_RE = /^\s*@@\s*-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s*@@(.*)$/

function parseUnifiedDiff(input: string): ParsedDiff {
  const lines = input.replace(/\r\n/g, "\n").split("\n")
  const files: ParsedDiff = []

  let current: FileDiff | null = null
  let inHunk = false
  let currentHunk: Hunk | null = null

  const startFile = (firstHeaderLine: string) => {
    if (current && currentHunk) {
      current.hunks.push(currentHunk)
      currentHunk = null
      inHunk = false
    }
    current = { headers: [firstHeaderLine], hunks: [] }
    files.push(current)
  }

  const flushHunk = () => {
    if (current && currentHunk) {
      current.hunks.push(currentHunk)
      currentHunk = null
      inHunk = false
    }
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Start of a new file block?
    if (line.startsWith("diff --git ")) {
      startFile(line)
      continue
    }

    // If we haven't started a file yet and see a hunk or ---/+++,
    // start a file BUT DO NOT consume the current line.
    if (!current) {
      if (line.startsWith("--- ") || line.startsWith("+++ ") || HUNK_RE.test(line)) {
        startFile("") // note: no header line pushed here
        // fall-through intentionally, so we can process this same line as header/hunk below
      } else {
        startFile(line || "")
        continue
      }
    }

    // Hunk header?
    const m = line.match(HUNK_RE)
    if (m) {
      flushHunk()

      const oldStart = parseInt(m[1]!, 10)
      const oldCount = m[2] ? parseInt(m[2], 10) : 1
      const newStart = parseInt(m[3]!, 10)
      const newCount = m[4] ? parseInt(m[4], 10) : 1
      const suffix = m[5] ?? ""

      currentHunk = {
        rawHeader: `@@ -${oldStart}${m[2] ? "," + oldCount : ""} +${newStart}${m[4] ? "," + newCount : ""} @@${suffix}`,
        oldStart,
        oldCount,
        newStart,
        newCount,
        headerSuffix: suffix,
        lines: [],
      }
      inHunk = true
      continue
    }

    // Collect file headers until first hunk
    if (!inHunk) {
      current!.headers.push(line)
      continue
    }

    // Inside hunk
    if (line.startsWith("+")) {
      currentHunk!.lines.push({ kind: "add", text: line })
    } else if (line.startsWith("-")) {
      currentHunk!.lines.push({ kind: "del", text: line })
    } else if (line.startsWith("\\ No newline at end of file")) {
      currentHunk!.lines.push({ kind: "meta", text: line })
    } else {
      // treat everything else as context (git uses leading space)
      currentHunk!.lines.push({ kind: "ctx", text: line })
    }
  }

  flushHunk()
  return files
}

type Mode = "additions" | "deletions"

/**
 * Filter a parsed diff to additions-only or deletions-only.
 * Recomputes hunk counts and drops empty hunks/files.
 */
function filterParsedDiff(files: ParsedDiff, mode: Mode): ParsedDiff {
  const keepAdds = mode === "additions"
  const result: ParsedDiff = []

  files.forEach((file) => {
    const newFile: FileDiff = { headers: [...file.headers], hunks: [] }

    file.hunks.forEach((h) => {
      const keptLines: Line[] = []
      // We keep all context lines; we keep add/del according to mode.
      for (let i = 0; i < h.lines.length; i++) {
        const ln = h.lines[i]
        if (ln.kind === "meta") {
          // Keep meta only if previous kept line exists (it qualifies the previous)
          if (keptLines.length > 0) {
            keptLines.push(ln)
          }
          continue
        }
        if (ln.kind === "ctx") {
          keptLines.push(ln)
          continue
        }
        if (ln.kind === "add" && keepAdds) {
          keptLines.push(ln)
          continue
        }
        if (ln.kind === "del" && !keepAdds) {
          keptLines.push(ln)
          continue
        }
        // else drop it
      }

      // Recompute counts: in unified diff counts, old = ctx + del, new = ctx + add
      let oldCount = 0
      let newCount = 0
      keptLines.forEach((ln) => {
        if (ln.kind === "ctx") {
          oldCount++
          newCount++
        } else if (ln.kind === "del") {
          oldCount++
        } else if (ln.kind === "add") {
          newCount++
        } else {
          // meta line does not contribute
        }
      })

      // Drop hunks that end up empty (both sides 0, or only meta)
      const hasMaterial =
        keptLines.some((ln) => ln.kind === "ctx" || ln.kind === "add" || ln.kind === "del") &&
        (oldCount > 0 || newCount > 0)

      if (!hasMaterial) return

      // Rebuild header with recomputed counts; keep original starts and suffix
      const oldCountPart = `,${Math.max(oldCount, 0)}`
      const newCountPart = `,${Math.max(newCount, 0)}`
      const hdr =
        `@@ -${h.oldStart}${oldCountPart} +${h.newStart}${newCountPart} @@` + (h.headerSuffix ?? "")

      newFile.hunks.push({
        ...h,
        rawHeader: hdr,
        oldCount,
        newCount,
        lines: keptLines,
      })
    })

    // Keep file only if it has at least one hunk after filtering
    if (newFile.hunks.length > 0) {
      result.push(newFile)
    }
  })

  return result
}

function renderUnifiedDiff(files: ParsedDiff): string {
  const out: string[] = []

  files.forEach((f, idx) => {
    // Between files, separate with a single blank line (like git does).
    if (idx > 0 && out[out.length - 1] !== "") {
      out.push("")
    }

    // Clean headers: drop leading/trailing empty lines
    const headers = [...f.headers]
    while (headers.length && headers[0] === "") headers.shift()
    while (headers.length && headers[headers.length - 1] === "") headers.pop()

    out.push(...headers)

    f.hunks.forEach((h) => {
      out.push(h.rawHeader)
      h.lines.forEach((ln) => out.push(ln.text))
    })
  })

  let s = out.join("\n")
  // Ensure exactly one trailing newline
  if (!s.endsWith("\n")) s += "\n"
  return s.trim()
}

export function filterDiff(diffText: string, mode: "additions" | "deletions"): string {
  return renderUnifiedDiff(filterParsedDiff(parseUnifiedDiff(diffText), mode))
}
