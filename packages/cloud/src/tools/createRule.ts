import { z } from "zod"

import { createWispbitApi } from "../apiClient.js"

import { McpTool, ToolContext } from "./types.js"

const CreateRuleSchema = z.object({
  repository_url: z
    .string()
    .describe(
      "GitHub repository URL (e.g., https://github.com/owner/repo or https://github.com/owner/repo/tree/branch)"
    ),
  prompt: z.string().describe("What the user wants to create a rule for."),
})

export const createRuleTool: McpTool = {
  name: "create-rule",
  description:
    "Create a rule for a given repository. Use this to create new code quality rules. Do not call this unless explicitly asked to by the user.",
  inputSchema: {
    type: "object",
    properties: {
      repository_url: {
        type: "string",
        description:
          "GitHub repository URL (e.g., https://github.com/owner/repo or https://github.com/owner/repo/tree/branch)",
      },
      prompt: {
        type: "string",
        description: "What the user wants to create a rule for.",
      },
    },
    required: ["repository_url", "prompt"],
  },
  handler: async (args: any, context: ToolContext) => {
    try {
      const { repository_url, prompt } = CreateRuleSchema.parse(args)

      // Create API client with the token from context
      const api = createWispbitApi(context.token, context.host)

      // Make API call to create rule
      const response = await api.createRule({
        repository_url,
        prompt,
      })

      if (!response.success) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Failed to create rule. ${response.error || response.message || "Unknown error"}`,
            },
          ],
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `I've remembered your request to create a rule for repository: ${repository_url}.`,
          },
        ],
      }
    } catch (error) {
      console.error("Error in create-rule tool:", error)
      return {
        content: [
          {
            type: "text",
            text: "Error: An error occurred while creating a rule. Please try again later.",
          },
        ],
      }
    }
  },
}
