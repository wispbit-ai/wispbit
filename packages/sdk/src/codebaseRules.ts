import path from "path"

import fs from "fs-extra"
import { minimatch } from "minimatch"

import { hashString } from "@wispbit/sdk/hash"
import { CodebaseRule } from "@wispbit/sdk/types"

/**
 * Type definition for rule frontmatter metadata
 */
type RuleFrontmatter = {
  include: string[]
}

/**
 * Type definition for parsed rule content
 */
type ParsedRuleContent = {
  frontmatter: RuleFrontmatter
  content: string
}

export function newRuleFromBlocks({
  name,
  description,
  include,
  good_example,
  bad_example,
  directory,
}: {
  name: string
  description: string
  include: string
  reason: string
  good_example: string
  bad_example: string
  directory?: string
}): CodebaseRule {
  const contents = `
${description}

## Bad
${bad_example}

## Good
${good_example}
`

  return newRule({
    directory,
    name,
    contents: contents.trim(),
    include,
  })
}

export function newRule({
  directory,
  name,
  contents,
  include,
}: {
  directory?: string
  name: string
  contents: string
  include: string
}): CodebaseRule {
  // Process the contents
  let processedContents = contents

  // Remove heading if it starts with #, ##, ###
  const lines = processedContents.split("\n")
  const firstNonEmptyLineIndex = lines.findIndex((line) => line.trim() !== "")

  if (firstNonEmptyLineIndex !== -1) {
    const firstNonEmptyLine = lines[firstNonEmptyLineIndex].trim()
    if (/^#{1,3}\s/.test(firstNonEmptyLine)) {
      // Remove the heading line
      lines.splice(firstNonEmptyLineIndex, 1)
      processedContents = lines.join("\n").trim()
    }
  }

  // Strip out checkmark and X emojis
  processedContents = processedContents.replace(/[\u{2705}\u{274C}\u{2713}\u{2717}\u{274E}]/gu, "")

  return {
    id: hashString(directory ? directory + "" + name : name),
    directory: directory ?? "",
    name,
    contents: processedContents,
    include: include.split(","),
  }
}

/**
 * Check if a file path matches any of the include patterns.
 *
 * @param rule - The rule to check against
 * @param filePath - The file path to check
 * @returns True if the file path matches any of the patterns or if no patterns specified
 */
export function matchesInclude(rule: CodebaseRule, filePath: string): boolean {
  // If no include patterns are specified, match all files
  if (!rule.include.length) {
    return true
  }

  // Adjust include patterns based on the rule's directory
  let patternsToCheck = rule.include
  if (rule.directory && rule.directory !== "" && rule.directory !== ".") {
    patternsToCheck = rule.include.map((pattern) => {
      // Handle exclude patterns that start with "!"
      if (pattern.startsWith("!")) {
        const excludePattern = pattern.slice(1) // Remove the "!" prefix

        // If pattern is already absolute or starts with directory, don't modify
        if (excludePattern.startsWith("/") || excludePattern.startsWith(rule.directory ?? "")) {
          return pattern
        }

        // Join the directory path with the pattern and add "!" back
        return "!" + path.posix.join(rule.directory ?? "", excludePattern)
      }

      // Handle regular include patterns
      // If pattern is already absolute or starts with directory, don't modify
      if (pattern.startsWith("/") || pattern.startsWith(rule.directory ?? "")) {
        return pattern
      }

      // Join the directory path with the pattern
      return path.posix.join(rule.directory ?? "", pattern)
    })
  }

  // Separate include and exclude patterns
  const includePatterns: string[] = []
  const excludePatterns: string[] = []

  for (const pattern of patternsToCheck) {
    if (pattern.startsWith("!")) {
      // Remove the ! prefix and add to exclude patterns
      excludePatterns.push(pattern.slice(1))
    } else {
      includePatterns.push(pattern)
    }
  }

  // If only exclude patterns are specified, start with matching all files
  let isIncluded = includePatterns.length === 0

  // Check if file path matches any of the include patterns
  if (includePatterns.length > 0) {
    isIncluded = includePatterns.some((pattern) => {
      // If pattern doesn't contain ** but contains *, expand it to include subdirectories
      const expandedPattern = pattern.includes("**")
        ? pattern
        : pattern.replace(/([^/])\*([^/])/g, "$1**$2")

      const result = minimatch(filePath, expandedPattern, {
        matchBase: true,
        dot: true,
        nocomment: true,
        nocase: true,
      })

      return result
    })
  }

  // If not included by include patterns, return false early
  if (!isIncluded) {
    return false
  }

  // Check if file path matches any of the exclude patterns
  if (excludePatterns.length > 0) {
    const isExcluded = excludePatterns.some((pattern) => {
      // If pattern doesn't contain ** but contains *, expand it to include subdirectories
      const expandedPattern = pattern.includes("**")
        ? pattern
        : pattern.replace(/([^/])\*([^/])/g, "$1**$2")

      const result = minimatch(filePath, expandedPattern, {
        matchBase: true,
        dot: true,
        nocomment: true,
        nocase: true,
      })

      return result
    })

    // If excluded, return false
    if (isExcluded) {
      return false
    }
  }

  return true
}

/**
 * Get all rules that match the given file path.
 *
 * @param rules - The list of all rules
 * @param filePath - The file path to check
 * @returns Array of rules that match the file path
 */
export function filterRules(rules: CodebaseRule[], filePath: string): CodebaseRule[] {
  return rules.filter((rule) => matchesInclude(rule, filePath))
}

/**
 * Parse the frontmatter from markdown content.
 *
 * @param content - The markdown content with optional frontmatter
 * @returns Parsed rule content with frontmatter and actual content
 */
function parseFrontmatter(content: string): ParsedRuleContent {
  if (!content.startsWith("---")) {
    return { frontmatter: { include: [] }, content }
  }

  const parts = content.split("---", 3)
  if (parts.length < 3) {
    return { frontmatter: { include: [] }, content }
  }

  const frontmatterText = parts[1].trim()
  const contentText = parts[2].trim()
  const include: string[] = []

  // Parse frontmatter lines
  for (const line of frontmatterText.split("\n")) {
    const trimmedLine = line.trim()
    if (!trimmedLine || !trimmedLine.includes(":")) {
      continue
    }

    const [key, value] = trimmedLine.split(":", 2).map((part) => part.trim())

    if (key === "include") {
      // Smart parsing that handles quoted strings and brace expansion
      const patterns = parseIncludePatterns(value)
      include.push(...patterns)
    }
  }

  return {
    frontmatter: { include },
    content: contentText,
  }
}

/**
 * Parse include patterns from a string, handling quoted strings and brace expansion
 * @param value - The raw include value from frontmatter
 * @returns Array of parsed patterns
 */
function parseIncludePatterns(value: string): string[] {
  const trimmedValue = value.trim()

  // Check if the entire value is a single quoted string
  if (
    (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
  ) {
    // Remove outer quotes and split on commas, but preserve brace expansion
    const innerValue = trimmedValue.slice(1, -1)
    return splitPreservingBraces(innerValue)
  }

  // Handle mixed quoted/unquoted patterns
  const patterns: string[] = []
  let current = ""
  let inQuotes = false
  let quoteChar = ""
  let braceDepth = 0

  for (let i = 0; i < trimmedValue.length; i++) {
    const char = trimmedValue[i]

    if (!inQuotes && (char === '"' || char === "'")) {
      // Starting a quoted string
      inQuotes = true
      quoteChar = char
      current += char
    } else if (inQuotes && char === quoteChar) {
      // Ending a quoted string
      inQuotes = false
      quoteChar = ""
      current += char
    } else if (!inQuotes && char === "{") {
      // Starting brace expansion
      braceDepth++
      current += char
    } else if (!inQuotes && char === "}") {
      // Ending brace expansion
      braceDepth--
      current += char
    } else if (!inQuotes && braceDepth === 0 && char === ",") {
      // Found a separator comma (not inside quotes or braces)
      const trimmed = current.trim()
      if (trimmed) {
        // Remove outer quotes if present
        const cleaned = trimmed.replace(/^["']|["']$/g, "")
        patterns.push(cleaned)
      }
      current = ""
    } else {
      current += char
    }
  }

  // Add the final pattern
  const trimmed = current.trim()
  if (trimmed) {
    // Remove outer quotes if present
    const cleaned = trimmed.replace(/^["']|["']$/g, "")
    patterns.push(cleaned)
  }

  return patterns
}

/**
 * Split a string on commas while preserving brace expansion syntax
 * @param value - The string to split
 * @returns Array of split patterns
 */
function splitPreservingBraces(value: string): string[] {
  const patterns: string[] = []
  let current = ""
  let braceDepth = 0

  for (let i = 0; i < value.length; i++) {
    const char = value[i]

    if (char === "{") {
      braceDepth++
      current += char
    } else if (char === "}") {
      braceDepth--
      current += char
    } else if (braceDepth === 0 && char === ",") {
      // Found a separator comma (not inside braces)
      const trimmed = current.trim()
      if (trimmed) {
        patterns.push(trimmed)
      }
      current = ""
    } else {
      current += char
    }
  }

  // Add the final pattern
  const trimmed = current.trim()
  if (trimmed) {
    patterns.push(trimmed)
  }

  return patterns
}

export function getRuleFromFile(filePath: string, content: string): CodebaseRule {
  const parsed = parseFrontmatter(content)

  return {
    id: hashString(filePath),
    directory: "",
    name: filePath,
    contents: parsed.content,
    include: parsed.frontmatter.include,
  }
}

/**
 * Create a markdown file with frontmatter from a rule
 */
export function createRuleFile(rule: CodebaseRule): string {
  // Format frontmatter with include patterns
  const frontmatter = `---
include: ${rule.include.join(", ")}
---

${rule.contents}`

  return frontmatter
}

/**
 * Recursively find all .wispbit/rules directories within the root directory
 * @param root - The root directory to search in
 * @returns Array of paths to .wispbit/rules directories
 */
async function findAllRulesDirectories(root: string): Promise<string[]> {
  const rulesDirectories: string[] = []

  async function searchDirectory(currentDir: string): Promise<void> {
    try {
      if (!fs.existsSync(currentDir)) return

      const entries = await fs.readdir(currentDir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name)

        if (entry.isDirectory()) {
          // Check if this is a .wispbit directory
          if (entry.name === ".wispbit") {
            const rulesPath = path.join(fullPath, "rules")
            if (fs.existsSync(rulesPath) && fs.statSync(rulesPath).isDirectory()) {
              rulesDirectories.push(rulesPath)
            }
          } else if (!entry.name.startsWith(".") && !entry.name.includes("node_modules")) {
            // Recursively search subdirectories (skip hidden dirs and node_modules)
            await searchDirectory(fullPath)
          }
        }
      }
    } catch (error) {
      // Silently ignore permission errors or other issues
    }
  }

  await searchDirectory(root)
  return rulesDirectories
}

/**
 * Get all codebase rules from the rules directory.
 *
 * @returns Array of Rule objects
 */
export async function getRulesFromDirectory(
  directory: string,
  subdirectoryPath: string = ""
): Promise<CodebaseRule[]> {
  // Ensure rules directory exists
  if (!fs.existsSync(directory)) return []

  // Get all markdown files
  const ruleFiles = (await fs.readdir(directory)).filter((file) => file.endsWith(".md"))

  // Process each rule file
  const rules: CodebaseRule[] = []
  for (const fileName of ruleFiles) {
    const filePath = path.join(directory, fileName)
    const content = fs.readFileSync(filePath, "utf-8")
    const parsed = parseFrontmatter(content)
    const name = path.basename(fileName, ".md")

    rules.push({
      id: hashString(subdirectoryPath + "/" + name),
      directory: subdirectoryPath,
      name,
      contents: parsed.content,
      include: parsed.frontmatter.include,
    })
  }

  return rules
}

export function getRulesPath(root: string): string {
  return path.join(root, ".wispbit", "rules")
}

export async function getRulesFromRoot(root: string): Promise<CodebaseRule[]> {
  const allRulesDirectories = await findAllRulesDirectories(root)
  const allRules: CodebaseRule[] = []

  for (const rulesDirectory of allRulesDirectories) {
    // Calculate the relative path from root to the directory containing .wispbit
    const wispbitDir = path.dirname(rulesDirectory) // Remove '/rules' to get .wispbit dir
    const parentDir = path.dirname(wispbitDir) // Remove '/.wispbit' to get parent dir
    const subdirectoryPath = path.relative(root, parentDir)

    const rules = await getRulesFromDirectory(rulesDirectory, subdirectoryPath)

    allRules.push(...rules)
  }

  return allRules
}
