import { z } from "zod"

import { createWispbitApi } from "../apiClient"

import { McpTool, ToolContext } from "./types"

const UpdateRuleSchema = z.object({
  rule_id: z.string().describe("The ID of the rule to update"),
  prompt: z
    .string()
    .describe(
      "The prompt that describes what changes you want to make to the rule. Provide instructions on the rule rewrite as well as any code examples to support it."
    ),
})

export const updateRuleTool: McpTool = {
  name: "update-rule",
  description:
    "Update an existing rule based on feedback or new requirements. This will rewrite the rule using AI.",
  inputSchema: {
    type: "object",
    properties: {
      rule_id: {
        type: "string",
        description: "The ID of the rule to update",
      },
      prompt: {
        type: "string",
        description:
          "The prompt that describes what changes you want to make to the rule. Provide instructions on the rule rewrite as well as any code examples to support it.",
      },
    },
    required: ["rule_id", "prompt"],
  },
  handler: async (args: any, context: ToolContext) => {
    try {
      const { rule_id, prompt } = UpdateRuleSchema.parse(args)

      // Create API client with the token from context
      const api = createWispbitApi(context.token, context.host)

      // Make API call to update rule
      const response = await api.updateRule({
        rule_id,
        prompt,
      })

      if (!response.success) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Failed to update rule. ${response.message || response.error || "Unknown error"}`,
            },
          ],
        }
      }

      // Get rule name for response (we need to fetch the rule first)
      // For now, we'll use a generic response since we don't have rule details in the API response
      return {
        content: [
          {
            type: "text",
            text: `I've remembered your request to update rule: ${rule_id}.`,
          },
        ],
      }
    } catch (error) {
      console.error("Error in update-rule tool:", error)
      return {
        content: [
          {
            type: "text",
            text: "Error: An error occurred while updating a rule. Please try again later.",
          },
        ],
      }
    }
  },
}
