import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"

import { getAllToolsForMcp, executeTool } from "./tools/registry.js"
import { ToolContext } from "./tools/types.js"

// Create server factory function
export const createServer = ({ token, host }: { token: string; host: string }) => {
  const server = new Server(
    {
      name: "@wispbit/mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
      instructions:
        "This server provides tools to help your AI editor conform to codebase standards. Use `grep-rules` to search for existing patterns before committing to writing code- this will make the codebase cleaner and more consistent.",
    }
  )

  // Register list tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return await Promise.resolve({
      tools: getAllToolsForMcp(),
    })
  })

  // Register tool handlers
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    // Create context for the tool
    const context: ToolContext = {
      token,
      host,
    }

    try {
      return await executeTool(name, args, context)
    } catch (error) {
      console.error(`Error executing tool ${name}:`, error)

      if (error instanceof Error && error.message.startsWith("Unknown tool:")) {
        throw error
      }

      return {
        content: [
          {
            type: "text",
            text: `Error: An unexpected error occurred while executing ${name}. Please try again later.`,
          },
        ],
      }
    }
  })

  return server
}
