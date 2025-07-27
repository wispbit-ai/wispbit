// Define the ChatCompletionTool type locally to avoid needing the OpenAI SDK

import { complaint, grepSearch, listDir, readFile, globSearch } from "@wispbit/sdk/tools"
import { CodebaseRule } from "@wispbit/sdk/types"

// This matches the structure of the OpenAI type
interface ChatCompletionTool {
  type: "function"
  function: {
    name: string
    description: string
    parameters: {
      type: string
      properties: Record<string, any>
      required: string[]
    }
  }
}

/**
 * Parameters for the OpenAI API complaint tool.
 */
export interface ComplaintParameters {
  /** Path to the file containing the violation. */
  file_path: string
  /** Line number range where the violation occurs */
  line_start: number
  line_end: number
  line_side: "right" | "left"
  /** Description of why this violates the rule */
  description: string
  /** The rule that was violated */
  rule_id: string
}

/**
 * Parameters for reading a file.
 */
export interface ReadFileParameters {
  /** Path to the file to read */
  target_file: string
  /** 1-indexed line number to start reading from */
  start_line_one_indexed: number
  /** 1-indexed line number to end reading at (inclusive) */
  end_line_one_indexed_inclusive: number
  /** Whether to read the entire file */
  should_read_entire_file: boolean
}

/**
 * Parameters for grep search.
 */
export interface GrepSearchParameters {
  /** Regex pattern to search for */
  query: string
  /** Glob pattern for files to include */
  include_pattern?: string
  /** Glob pattern for files to exclude */
  exclude_pattern?: string
  /** Whether the search should be case sensitive */
  case_sensitive?: boolean
}

/**
 * Parameters for listing a directory.
 */
export interface ListDirParameters {
  /** Path to list contents of, relative to the workspace root */
  relative_workspace_path: string
  /** Explanation of why this tool is being used */
  explanation?: string
}

/**
 * Parameters for glob search.
 */
export interface GlobSearchParameters {
  /** The glob pattern to match files against */
  pattern: string
  /** The directory to search in. Defaults to the current working directory. */
  path?: string
}

/**
 * Result of a grep search.
 */
export interface GrepSearchMatch {
  /** Path to the file containing the match */
  file: string
  /** Line number where the match was found */
  line_number: number
  /** Content of the line containing the match */
  content: string
}

/**
 * Result of a directory listing.
 */
export interface ListDirResult {
  /** List of files in the directory */
  files: string[]
  /** List of subdirectories in the directory */
  directories: string[]
  /** Full path that was listed */
  path: string
}

/**
 * Result of a glob search.
 */
export interface GlobSearchResult {
  /** List of file paths that match the glob pattern, sorted by modification time */
  files: string[]
}

export type GrepSearchResult =
  | {
      matches: GrepSearchMatch[]
    }
  | {
      error: string
    }

export type GlobSearchToolResult =
  | GlobSearchResult
  | {
      error: string
    }

export type ReadFileToolResult =
  | {
      content: string
    }
  | {
      error: string
    }

/**
 * Represents a tool result.
 */
export type CodeReviewToolResult =
  | ReadFileToolResult
  | GrepSearchResult
  | GlobSearchToolResult
  | ListDirResult
  | ComplaintParameters
  | {
      error: string
    }

export class CodeReviewerExecutor {
  private executor: CodeReviewToolExecutor
  private cwd: string
  private ripGrepPath: string

  constructor({ ripGrepPath, cwd }: { ripGrepPath: string; cwd: string }) {
    this.executor = {
      readFile,
      grepSearch,
      listDir,
      globSearch,
      complaint,
    }
    this.cwd = cwd
    this.ripGrepPath = ripGrepPath
  }
  /**
   * Execute a tool by name with parameters.
   *
   * @param toolName - Name of the tool to execute
   * @param parameters - Parameters for the tool
   * @returns Tool result
   */
  async executeCodeReviewTool(
    file: {
      filename: string
      patch: string
    },
    rules: CodebaseRule[],
    toolName: string,
    parameters:
      | ReadFileParameters
      | GrepSearchParameters
      | GlobSearchParameters
      | ListDirParameters
      | ComplaintParameters
  ): Promise<CodeReviewToolResult> {
    switch (toolName) {
      case "read_file":
        return await this.executor.readFile(parameters as ReadFileParameters, this.cwd)
      case "grep_search":
        return await this.executor.grepSearch(
          parameters as GrepSearchParameters,
          this.ripGrepPath,
          this.cwd
        )
      case "glob_search":
        return await this.executor.globSearch(parameters as GlobSearchParameters, this.cwd)
      case "list_dir":
        return await this.executor.listDir(parameters as ListDirParameters, this.cwd)
      case "complaint":
        return await this.executor.complaint(
          parameters as ComplaintParameters,
          this.cwd,
          file,
          rules
        )
      default:
        return {
          error: `Unknown tool: ${toolName}`,
        }
    }
  }
}

/**
 * Execute a tool by name with parameters.
 * This is an interface only - the implementation is provided in the server and CLI packages.
 */
export interface CodeReviewToolExecutor {
  /**
   * Read a file with the given parameters
   */
  readFile(parameters: ReadFileParameters, cwd: string): Promise<ReadFileToolResult>

  /**
   * Search for a pattern using grep
   */
  grepSearch(
    parameters: GrepSearchParameters,
    ripGrepPath: string,
    cwd: string
  ): Promise<GrepSearchResult>

  /**
   * Search for files using glob patterns
   */
  globSearch(parameters: GlobSearchParameters, cwd: string): Promise<GlobSearchToolResult>

  /**
   * List the contents of a directory
   */
  listDir(parameters: ListDirParameters, cwd: string): Promise<ListDirResult | { error: string }>

  /**
   * Report a code violation
   */
  complaint(
    parameters: ComplaintParameters,
    cwd: string,
    file: {
      filename: string
      patch: string
    },
    rules: CodebaseRule[]
  ): Promise<ComplaintParameters | { error: string }>
}

export const readFileTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "read_file",
    description:
      "Read the contents of a file. the output of this tool call will be the 1-indexed file contents from start_line_one_indexed to end_line_one_indexed_inclusive, together with a summary of the lines outside start_line_one_indexed and end_line_one_indexed_inclusive.\\nNote that this call can view at most 250 lines at a time.\\n\\nWhen using this tool to gather information, it's your responsibility to ensure you have the COMPLETE context. Specifically, each time you call this command you should:\\n1) Assess if the contents you viewed are sufficient to proceed with your task.\\n2) Take note of where there are lines not shown.\\n3) If the file contents you have viewed are insufficient, and you suspect they may be in lines not shown, proactively call the tool again to view those lines.\\n4) When in doubt, call this tool again to gather more information. Remember that partial file views may miss critical dependencies, imports, or functionality.\\n\\nIn some cases, if reading a range of lines is not enough, you may choose to read the entire file.\\nReading entire files is often wasteful and slow, especially for large files (i.e. more than a few hundred lines). So you should use this option sparingly.\\nReading the entire file is not allowed in most cases. If the file was added during the PR review, it may not exist when you run this tool. If you aren't sure about the path of the file, use list_dir tool to figure it out first.",
    parameters: {
      type: "object",
      properties: {
        target_file: {
          type: "string",
          description: "The path of the file to read. Can be relative or absolute path.",
        },
        start_line_one_indexed: {
          type: "integer",
          description: "The one-indexed line number to start reading from (inclusive).",
        },
        end_line_one_indexed_inclusive: {
          type: "integer",
          description: "The one-indexed line number to end reading at (inclusive).",
        },
        should_read_entire_file: {
          type: "boolean",
          description: "Whether to read the entire file. Defaults to false.",
        },
      },
      required: [
        "target_file",
        "should_read_entire_file",
        "start_line_one_indexed",
        "end_line_one_indexed_inclusive",
      ],
    },
  },
}

export const grepSearchTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "grep_search",
    description:
      "Fast text-based regex search that finds exact pattern matches within files or directories, utilizing the ripgrep command for efficient searching.\\nResults will be formatted in the style of ripgrep and can be configured to include line numbers and content.\\nTo avoid overwhelming output, the results are capped at 50 matches.\\nUse the include or exclude patterns to filter the search scope by file type or specific paths.\\n\\nThis is best for finding exact text matches or regex patterns.\\nMore precise than semantic search for finding specific strings or patterns.\\nThis is preferred over semantic search when we know the exact symbol/function name/etc. to search in some set of directories/file types.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The regex pattern to search for",
        },
        include_pattern: {
          type: "string",
          description: "Glob pattern for files to include (e.g. '*.ts' for TypeScript files)",
        },
        exclude_pattern: {
          type: "string",
          description: "Glob pattern for files to exclude",
        },
        case_sensitive: {
          type: "boolean",
          description: "Whether the search should be case sensitive",
        },
      },
      required: ["query"],
    },
  },
}

export const listDirTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "list_dir",
    description:
      "Lists files and directories in a given path. The relative_workspace_path parameter must be relative to the workspace root. You should generally prefer the Glob and Grep tools, if you know which directories to search.",
    parameters: {
      type: "object",
      properties: {
        relative_workspace_path: {
          type: "string",
          description: "Path to list contents of, relative to the workspace root.",
        },
        explanation: {
          type: "string",
          description:
            "One sentence explanation as to why this tool is being used, and how it contributes to the goal.",
        },
      },
      required: ["relative_workspace_path"],
    },
  },
}

export const globSearchTool: ChatCompletionTool = {
  type: "function",
  function: {
    name: "glob_search",
    description:
      'Fast file pattern matching tool that works with any codebase size. Supports glob patterns like "**/*.js" or "src/**/*.ts". Returns matching file paths sorted by modification time. Use this tool when you need to find files by name patterns. If you already know the path of the file, use the read_file tool instead.',
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "The glob pattern to match files against",
        },
        path: {
          type: "string",
          description: "The directory to search in. Defaults to the current working directory.",
        },
      },
      required: ["pattern"],
    },
  },
}

/**
 * Definition of the code review tools available
 */
export const codeReviewTools: Array<ChatCompletionTool> = [
  readFileTool,
  grepSearchTool,
  globSearchTool,
  listDirTool,
  {
    type: "function",
    function: {
      name: "complaint",
      description:
        "Report a rule violation found in the code being reviewed. Use this tool to report each violation of the rule being checked. Only report violations for files that are being reviewed. This provides structured data about violations instead of relying on text parsing. Remember, you can only report a single set of line numbers for a single violation, so you should combine line numbers if the violation spans multiple lines as needed",
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "The path of the file containing the violation.",
          },
          line_start: {
            type: "integer",
            description: "The start line number where the violation occurs.",
          },
          line_end: {
            type: "integer",
            description: "The end line number where the violation occurs.",
          },
          line_side: {
            type: "string",
            description:
              "Which side of the diff the line numbers refer to: 'right' (after changes) or 'left' (before changes).",
            enum: ["right", "left"],
          },
          description: {
            type: "string",
            description:
              "Short sentence about what the violation is. You are going to be commenting on the PR as if you are a software engineer, so keep the following in mind when reporting a violation: 1. You can exclude line numbers from the description since we are passing them separately 2. You don't need to include the rule itself in the description, since we are passing it separately. 3. Humans prefer short sentences, so keep it concise with only the most important information about what action needs to be taken. 4. Use backticks `` when referring to code.",
          },
          rule_id: {
            type: "string",
            description:
              "The name of the rule that is being violated. Use the `id` of the rule to report the violation.",
          },
        },
        required: ["file_path", "line_start", "line_end", "line_side", "description", "rule"],
      },
    },
  },
]
