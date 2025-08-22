import { z } from "zod"

import { createWispbitApi, McpViolation, McpOtherComment } from "../apiClient.js"

import { McpTool, ToolContext } from "./types.js"

const GetViolationsSchema = z.object({
  repository_url: z
    .string()
    .describe(
      "GitHub repository URL (e.g., https://github.com/owner/repo or https://github.com/owner/repo/tree/branch). This is required."
    ),
  pull_request_number: z
    .number()
    .describe("The pull request number to get violations for. This is required."),
  show_other_comments: z
    .boolean()
    .describe(
      "Whether to include other non-Wispbit comments from the pull request. This is optional."
    )
    .optional(),
})

export const getViolationsTool: McpTool = {
  name: "get-violations",
  description:
    "Get all violations for a specific pull request. Returns file names, line numbers, violation text and IDs. If a violation is marked as Is Resolved, it means that the violation has been fixed in the pull request and you do not need to address it unless the user specifically asks you to. Optionally includes other non-Wispbit comments from the pull request.",
  inputSchema: {
    type: "object",
    properties: {
      repository_url: {
        type: "string",
        description:
          "GitHub repository URL (e.g., https://github.com/owner/repo or https://github.com/owner/repo/tree/branch). This is required.",
      },
      pull_request_number: {
        type: "number",
        description: "The pull request number to get violations for. This is required.",
      },
      show_other_comments: {
        type: "boolean",
        description:
          "Whether to include other non-Wispbit comments from the pull request. This is optional.",
      },
    },
    required: ["repository_url", "pull_request_number"],
  },
  handler: async (args: unknown, context: ToolContext) => {
    try {
      const { repository_url, pull_request_number, show_other_comments } =
        GetViolationsSchema.parse(args)

      // Create API client with the token from context
      const api = createWispbitApi(context.token, context.host)

      // Make API call to get violations
      const response = await api.getViolations({
        repository_url,
        pull_request_number,
        show_other_comments,
      })

      if (!response.success) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Failed to get violations. ${response.message || response.error || "Unknown error"}`,
            },
          ],
        }
      }

      const { violations = [], other_comments = [] } = response.data || {}

      if (violations.length === 0 && (!show_other_comments || other_comments.length === 0)) {
        return {
          content: [
            {
              type: "text",
              text: `No violations found for pull request #${pull_request_number} in repository ${repository_url}.`,
            },
          ],
        }
      }

      // Group violations by file for better readability
      const violationsByFile = new Map<string, McpViolation[]>()
      for (const violation of violations) {
        const fileName = violation.fileName || "Unknown file"
        if (!violationsByFile.has(fileName)) {
          violationsByFile.set(fileName, [])
        }
        violationsByFile.get(fileName)!.push(violation)
      }

      // Format the response
      const totalViolations = violations.length
      let responseText = `Found ${totalViolations} wispbit violation(s) for pull request #${pull_request_number}:\n\n`

      for (const [fileName, fileViolations] of violationsByFile) {
        responseText += `**${fileName}**\n`
        for (const violation of fileViolations) {
          responseText += `- **ID:** ${violation.id || "unknown"}\n`
          responseText += `  **Lines:** ${violation.lineNumbers || "Unknown"}\n`
          responseText += `  **Is Resolved:** ${violation.isResolved ? "Yes" : "No"}\n`
          responseText += `  **Rule:** ${violation.ruleName || "Unknown Rule"} (${violation.ruleId || "unknown"})\n`
          responseText += `  **Description:** ${violation.description || "No message"}\n\n`
        }
        responseText += "---\n\n"
      }

      // Add other comments section if requested and available
      if (show_other_comments && other_comments.length > 0) {
        responseText += `## Other Comments (non-wispbit) (${other_comments.length})\n\n`

        // Group comments by file for better readability
        const commentsByFile = new Map<string, McpOtherComment[]>()
        for (const comment of other_comments) {
          const fileName = comment.path || "General Comments"
          if (!commentsByFile.has(fileName)) {
            commentsByFile.set(fileName, [])
          }
          commentsByFile.get(fileName)!.push(comment)
        }

        for (const [fileName, fileComments] of commentsByFile) {
          responseText += `**${fileName}**\n`
          for (const comment of fileComments) {
            responseText += `- **ID:** ${comment.id || "unknown"}\n`
            if (comment.lineReferences && comment.lineReferences.length > 0) {
              const lineRefs = comment.lineReferences
                .map((ref) => `${ref.start}-${ref.end} (${ref.side})`)
                .join(", ")
              responseText += `  **Lines:** ${lineRefs}\n`
            }
            responseText += `  **Is Resolved:** ${comment.isResolved ? "Yes" : "No"}\n`
            responseText += `  **Author:** ${comment.author || "Unknown user"}\n`
            responseText += `  **Description:** ${comment.body || "No content"}\n\n`
          }
          responseText += "---\n\n"
        }
      }

      return {
        content: [
          {
            type: "text",
            text: responseText,
          },
        ],
      }
    } catch (error) {
      console.error("Error in get-violations tool:", error)
      return {
        content: [
          {
            type: "text",
            text: "Error: An error occurred while getting violations. Please try again later.",
          },
        ],
      }
    }
  },
}
