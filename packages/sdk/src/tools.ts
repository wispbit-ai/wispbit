import { spawn } from "child_process"
import fs from "fs"
import path from "path"

import { glob } from "glob"

import {
  ComplaintParameters,
  GrepSearchMatch,
  GrepSearchParameters,
  GrepSearchResult,
  GlobSearchParameters,
  GlobSearchResult,
  ListDirParameters,
  ListDirResult,
  ReadFileParameters,
  ReadFileToolResult,
} from "@wispbit/sdk/CodeReviewerExecutor"
import { fileExists } from "@wispbit/sdk/fileExists"
import { isCommandExecutable } from "@wispbit/sdk/isExecutable"
import { isLineReferenceValidForPatch } from "@wispbit/sdk/patchParser"
import { CodebaseRule } from "@wispbit/sdk/types"

interface ExecError extends Error {
  code?: number
  stderr?: string
  signal?: string
}

/**
 * Validates that a user-provided path stays within the allowed base directory.
 *
 * @param baseDir - The base directory that should contain the resolved path
 * @param userPath - The user-provided path
 * @returns The safe absolute path if valid, null if not
 */
function safePath(baseDir: string, userPath: string): string | null {
  try {
    // Resolve both paths to absolute paths
    const resolvedBase = path.resolve(baseDir)
    const resolvedPath = path.resolve(baseDir, userPath)

    // Normalize paths to handle different separators consistently
    const normalizedBase = path.normalize(resolvedBase)
    const normalizedPath = path.normalize(resolvedPath)

    // Check if the resolved path is within the base directory
    // Must either be exactly the base directory or start with base + separator
    if (normalizedPath === normalizedBase) {
      return normalizedPath
    }

    if (normalizedPath.startsWith(normalizedBase + path.sep)) {
      return normalizedPath
    }

    return null
  } catch (error) {
    // Path resolution failed
    return null
  }
}

/**
 * Read a range of lines from a file.
 *
 * @param filePath - Path to the file
 * @param startLine - Start line number (1-indexed)
 * @param endLine - End line number (1-indexed)
 * @returns File content
 * @throws Error if the file cannot be read
 */
export function readFileRange(filePath: string, startLine: number, endLine: number): string {
  try {
    const content = fs.readFileSync(filePath, "utf8")
    const lines = content.split("\n")

    // Adjust for 1-indexed input
    const start = Math.max(0, startLine - 1)
    const end = Math.min(lines.length, endLine)

    const selectedLines = lines.slice(start, end)

    if (start === 0 && end === lines.length) {
      return content
    }

    let result = ""

    if (start > 0) {
      result += `[Lines 1-${start} omitted]\n`
    }

    result += selectedLines.join("\n")

    if (end < lines.length) {
      result += `\n[Lines ${end + 1}-${lines.length} omitted]`
    }

    return result
  } catch (error) {
    throw new Error(
      `Failed to read file ${filePath}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Execute read_file tool.
 *
 * @param parameters - Read file parameters
 * @returns Tool result
 */
export async function readFile(
  parameters: ReadFileParameters,
  cwd: string
): Promise<ReadFileToolResult> {
  const { target_file, start_line_one_indexed, end_line_one_indexed, should_read_entire_file } =
    parameters

  // Validate path
  const absolutePath = safePath(cwd, target_file)
  if (!absolutePath) {
    return {
      error: `Invalid file path: '${target_file}'`,
    }
  }

  if (!(await fileExists(absolutePath))) {
    return {
      error: `File not found or not accessible: ${target_file}. It may have been deleted as part of the PR.`,
    }
  }

  if (should_read_entire_file) {
    try {
      const content = await fs.promises.readFile(absolutePath, "utf8")
      return { content }
    } catch (error: any) {
      return {
        error: `Error reading file: ${error.message || String(error)}`,
      }
    }
  }

  // Make sure the range is valid - check if parameters are provided and are valid numbers
  if (
    Number.isNaN(Number(start_line_one_indexed)) ||
    Number.isNaN(Number(end_line_one_indexed)) ||
    Number(start_line_one_indexed) < 1 ||
    Number(end_line_one_indexed) < Number(start_line_one_indexed)
  ) {
    return {
      error: `Invalid line range: start=${start_line_one_indexed}, end=${end_line_one_indexed}. You must provide a valid line range.`,
    }
  }

  try {
    const content = readFileRange(absolutePath, start_line_one_indexed, end_line_one_indexed)
    return { content }
  } catch (error: any) {
    return {
      error: `Error reading file range: ${error.message || String(error)}`,
    }
  }
}

/**
 * Execute list_dir tool.
 *
 * @param parameters - List directory parameters
 * @returns Tool result
 */
export async function listDir(
  parameters: ListDirParameters,
  cwd: string
): Promise<ListDirResult | { error: string }> {
  const { relative_workspace_path } = parameters

  // Validate path
  const absolutePath = safePath(cwd, relative_workspace_path)
  if (!absolutePath) {
    return {
      error: `Invalid directory path: '${relative_workspace_path}'`,
    }
  }

  if (!(await fileExists(absolutePath))) {
    return {
      error: `Directory not found or not accessible: ${relative_workspace_path}`,
    }
  }

  try {
    const stats = await fs.promises.stat(absolutePath)

    if (!stats.isDirectory()) {
      return {
        error: `Not a directory: ${relative_workspace_path}`,
      }
    }

    const entries = await fs.promises.readdir(absolutePath)
    const files: string[] = []
    const directories: string[] = []

    for (const entry of entries) {
      const fullPath = path.join(absolutePath, entry)

      try {
        const entryStats = await fs.promises.stat(fullPath)
        if (entryStats.isDirectory()) {
          directories.push(entry)
        } else {
          files.push(entry)
        }
      } catch (_error) {
        // Skip files that can't be accessed
      }
    }

    return {
      files,
      directories,
      path: absolutePath,
    }
  } catch (error) {
    return {
      error: `Directory not found or not accessible: ${relative_workspace_path}`,
    }
  }
}

/**
 * Execute complaint tool.
 *
 * @param parameters - Complaint parameters
 * @returns Tool result
 */
export async function complaint(
  parameters: ComplaintParameters,
  cwd: string,
  file: {
    filename: string
    patch: string
  },
  rules: CodebaseRule[]
): Promise<ComplaintParameters | { error: string }> {
  const lineStart = parameters.line_start?.toString().replace("L", "").replace("R", "")
  const lineEnd = parameters.line_end?.toString().replace("L", "").replace("R", "")

  if (parameters.file_path !== file.filename) {
    return {
      error: `File path does not match original file: ${parameters.file_path} !== ${file.filename}. You can only report violations for the file that's in review.`,
    }
  }

  if (!rules.find((rule) => rule.id === parameters.rule_id)) {
    return {
      error: `Rule not found: ${parameters.rule_id}. You can only report violations for the rules that exist. Possible rule IDs: ${rules.map((rule) => rule.id).join(", ")}`,
    }
  }

  if (!lineStart || !lineEnd) {
    return {
      error: `No line numbers provided, or line numbers are invalid. You must provide a line start and end. start: ${lineStart}, end: ${lineEnd}`,
    }
  }

  if (isNaN(parseInt(lineStart, 10)) || isNaN(parseInt(lineEnd, 10))) {
    return {
      error: `Line numbers are not valid integers. start: ${lineStart}, end: ${lineEnd}`,
    }
  }

  if (
    !isLineReferenceValidForPatch(
      {
        start: parseInt(lineStart, 10),
        end: parseInt(lineEnd, 10),
        side: parameters.line_side,
      },
      file.patch
    )
  ) {
    return {
      error: `Line reference is not valid for patch: ${lineStart} - ${lineEnd}. You can only report violations for the lines that are in the patch. If the violation is not in the patch, you can ignore it. Otherwise, re-report the violation with the correct line numbers.`,
    }
  }

  return await Promise.resolve(parameters)
}

/**
 * Execute grep search.
 *
 * @param pattern - Search pattern
 * @param includePattern - Include pattern
 * @param excludePattern - Exclude pattern
 * @param caseSensitive - Whether search is case sensitive
 * @param cwd - Working directory
 * @returns Array of search matches
 */
async function executeGrepSearch(
  ripGrepPath: string,
  pattern: string,
  includePattern?: string,
  excludePattern?: string,
  caseSensitive: boolean = true,
  cwd: string = "."
): Promise<GrepSearchMatch[]> {
  // Build arguments array instead of shell command string to prevent injection
  const args: string[] = [
    "--no-config",
    "--line-number",
    "--color=never",
    "--max-columns=300",
    "--max-filesize=1M",
    "--max-count=50",
  ]

  // Add case sensitivity flag
  if (!caseSensitive) {
    args.push("-i")
  }

  // Add include pattern if provided
  if (includePattern) {
    args.push("-g", includePattern)
  }

  // Add exclude pattern if provided
  if (excludePattern) {
    args.push("-g", `!${excludePattern}`)
  }

  // Add the search pattern
  args.push(pattern)

  // Add the search directory
  args.push(cwd)

  try {
    // Use spawn instead of exec to prevent command injection
    const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(ripGrepPath, args, {
        cwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          LANG: "C",
          RIPGREP_CONFIG_PATH: "",
        },
      })

      let stdout = ""
      let stderr = ""

      child.stdout?.on("data", (data) => {
        stdout += data.toString()
      })

      child.stderr?.on("data", (data) => {
        stderr += data.toString()
      })

      // Add timeout of 30 seconds to prevent hanging
      const timeout = setTimeout(() => {
        child.kill("SIGTERM")
        reject(new Error("rg search operation timed out"))
      }, 30000)

      child.on("close", (code) => {
        clearTimeout(timeout)
        // ripgrep returns exit code 1 when no matches found, which is normal
        if (code === 1 && !stderr) {
          resolve({ stdout: "", stderr: "" })
        } else if (code === 0 || (code === 1 && !stderr)) {
          resolve({ stdout, stderr })
        } else {
          reject(new Error(`ripgrep exited with code ${code}: ${stderr}`))
        }
      })

      child.on("error", (error) => {
        clearTimeout(timeout)
        reject(error)
      })
    })

    if (!result.stdout.trim()) {
      return []
    }

    // Parse the output into matches
    const lines = result.stdout.trim().split("\n")
    const matches: GrepSearchMatch[] = []

    for (const line of lines) {
      const match = line.match(/^([^:]+):(\d+):(.*)$/)

      if (match) {
        const [, file, lineNumber, content] = match

        // Remove cwd prefix from file path to make it relative
        let relativePath = file
        relativePath = path.relative(cwd, file)

        // Check if the relative file exists with cwd
        const fullPath = path.join(cwd, relativePath)
        try {
          if (fs.existsSync(fullPath)) {
            matches.push({
              file: relativePath,
              line_number: parseInt(lineNumber, 10),
              content,
            })
          }
        } catch {
          // Skip files that can't be accessed
        }
      }
    }

    return matches
  } catch (error: unknown) {
    // rg returns non-zero exit code if no matches found
    const execError = error as ExecError
    if (execError.code === 1 && !execError.stderr) {
      return []
    }

    // Handle timeout errors specifically
    if (execError.signal === "SIGTERM") {
      throw new Error("rg search operation timed out")
    }

    throw error
  }
}

/**
 * Execute grep_search tool.
 *
 * @param parameters - Grep search parameters
 * @returns Tool result
 */
export async function grepSearch(
  parameters: GrepSearchParameters,
  ripGrepPath: string,
  cwd: string
): Promise<GrepSearchResult> {
  const { query, include_pattern, exclude_pattern, case_sensitive } = parameters

  try {
    // Check if ripgrep is executable
    const isExecutable = await isCommandExecutable(ripGrepPath)
    if (!isExecutable) {
      throw new Error(`ripgrep is not found or not executable: ${ripGrepPath}`)
    }

    const matches = await executeGrepSearch(
      ripGrepPath,
      query,
      include_pattern,
      exclude_pattern,
      case_sensitive,
      cwd
    )

    return { matches }
  } catch (error: unknown) {
    const errorMessage =
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof error.message === "string"
        ? error.message
        : String(error)

    return {
      error: errorMessage,
    }
  }
}

/**
 * Execute glob_search tool.
 *
 * @param parameters - Glob search parameters
 * @param cwd - Working directory
 * @returns Tool result
 */
export async function globSearch(
  parameters: GlobSearchParameters,
  cwd: string
): Promise<GlobSearchResult | { error: string }> {
  const { pattern, path: searchPath } = parameters

  // Validate path to prevent directory traversal if searchPath is provided
  let targetDir: string
  if (searchPath) {
    const safeDirPath = safePath(cwd, searchPath)
    if (!safeDirPath) {
      return {
        error: `Invalid search path: '${searchPath}'`,
      }
    }
    targetDir = safeDirPath
  } else {
    targetDir = cwd
  }

  if (!(await fileExists(targetDir))) {
    return {
      error: `directory not found or not accessible: ${searchPath || "."}`,
    }
  }

  try {
    const stats = await fs.promises.stat(targetDir)

    if (!stats.isDirectory()) {
      return {
        error: `not a directory: ${searchPath || "."}`,
      }
    }
  } catch (error) {
    return {
      error: `directory not found or not accessible: ${searchPath || "."}`,
    }
  }

  try {
    const matches = await executeGlobSearch(pattern, searchPath, cwd)

    return {
      files: matches,
    }
  } catch (error: unknown) {
    const errorMessage =
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof error.message === "string"
        ? error.message
        : String(error)

    return {
      error: errorMessage,
    }
  }
}

/**
 * Execute glob pattern matching to find files using the glob library.
 *
 * @param pattern - Glob pattern to match
 * @param searchDir - Directory to search in
 * @returns Array of file paths sorted by modification time
 */
async function executeGlobSearch(
  pattern: string,
  dir: string | undefined,
  cwd: string
): Promise<string[]> {
  try {
    // Validate the directory path if provided
    let cwdWithDir: string
    if (dir) {
      const safeDirPath = safePath(cwd, dir)
      if (!safeDirPath) {
        throw new Error(
          `Invalid directory path: potential directory traversal detected in '${dir}'`
        )
      }
      cwdWithDir = safeDirPath
    } else {
      cwdWithDir = cwd
    }

    // Use the glob library to find matching files
    const matchedFiles = await glob(pattern, {
      cwd: cwdWithDir,
      nodir: true, // Only return files, not directories
      ignore: ["node_modules/**", ".git/**", "**/__pycache__/**"], // Ignore common directories for performance
      absolute: false, // Return relative paths
    })

    // Get file stats for sorting by modification time
    const filesWithStats: Array<{ path: string; mtime: Date }> = []

    for (const file of matchedFiles) {
      try {
        const fullPath = path.join(cwdWithDir, file)
        const stats = await fs.promises.stat(fullPath)

        if (stats.isFile()) {
          filesWithStats.push({
            path: dir ? path.join(dir, file) : file,
            mtime: stats.mtime,
          })
        }
      } catch (error) {
        // Skip files that can't be accessed
      }
    }

    // Sort by modification time (newest first)
    filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

    return filesWithStats.map((file) => file.path)
  } catch (error) {
    throw new Error(`Glob search failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}
