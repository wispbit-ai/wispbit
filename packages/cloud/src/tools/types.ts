import { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js"

export interface ToolContext {
  token: string
  host: string
}

export interface McpTool {
  name: string
  description: string
  inputSchema: Tool["inputSchema"]
  handler: (args: any, context: ToolContext) => Promise<CallToolResult>
}
