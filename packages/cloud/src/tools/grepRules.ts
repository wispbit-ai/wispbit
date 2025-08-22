import { z } from "zod"

import { createWispbitApi, McpGrepRule } from "../apiClient.js"

import { McpTool, ToolContext } from "./types"

const GrepRulesSchema = z.object({
  pattern: z
    .string()
    .describe(
      "The pattern to search for. This can be names of files, functions, extensions, etc. This is required."
    ),
  case_sensitive: z
    .boolean()
    .describe("Whether to search case-sensitively. This is optional.")
    .optional(),
  repository_url: z
    .string()
    .describe(
      "GitHub repository URL (e.g., https://github.com/owner/repo or https://github.com/owner/repo/tree/branch). This is required."
    ),
})

export const grepRulesTool: McpTool = {
  name: "grep-rules",
  description: `Grep rules. You can use this to search for rules that match a given query. Use javascript regex syntax.

Response Format:
- Return matching rules with their names, contents, and IDs
- If multiple good matches exist, return all relevant ones
- If no good matches exist, clearly state this and suggest query refinements

For ambiguous queries, request clarification before proceeding with a best-guess match.`,
  inputSchema: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description:
          "The pattern to search for. This can be names of files, functions, extensions, etc. This is required.",
      },
      case_sensitive: {
        type: "boolean",
        description: "Whether to search case-sensitively. This is optional.",
      },
      repository_url: {
        type: "string",
        description:
          "GitHub repository URL (e.g., https://github.com/owner/repo or https://github.com/owner/repo/tree/branch). This is required.",
      },
    },
    required: ["pattern", "repository_url"],
  },
  handler: async (args: any, context: ToolContext) => {
    try {
      const { pattern, case_sensitive, repository_url } = GrepRulesSchema.parse(args)

      // Create API client with the token from context
      const api = createWispbitApi(context.token, context.host)

      // Make API call to grep rules
      const response = await api.grepRules({
        pattern,
        case_sensitive,
        repository_url,
      })

      if (!response.success) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Failed to search rules. ${response.error || response.message || "Unknown error"}`,
            },
          ],
        }
      }

      const rules = response.data?.rules || []

      if (rules.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No rules found matching pattern: ${pattern}`,
            },
          ],
        }
      }

      // Format results to match reference implementation
      const results = rules.map((rule) => ({
        id: rule.id,
        name: rule.name,
        content: rule.content,
        directory: rule.directory || "",
        include: Array.isArray(rule.include) ? rule.include : [],
      }))

      return {
        content: [
          {
            type: "text",
            text: `Found ${results.length} matching rule(s):

${results
  .map(
    (rule) => `
**Rule ID:** ${rule.id}
**Name:** ${rule.name}
**Directory:** ${rule.directory}
**Include patterns:** ${rule.include.join(", ") || "None"}
**Content:**
\`\`\`
${rule.content}
\`\`\`
`
  )
  .join("\n---\n")}`,
          },
        ],
      }
    } catch (error) {
      console.error("Error in grep-rules tool:", error)
      return {
        content: [
          {
            type: "text",
            text: "Error: An error occurred while grepping rules. Please try again later.",
          },
        ],
      }
    }
  },
}
