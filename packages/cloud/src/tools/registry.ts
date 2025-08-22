import { createRuleTool } from "./createRule.js"
import { getViolationsTool } from "./getViolations.js"
import { grepRulesTool } from "./grepRules.js"
import { McpTool, ToolContext } from "./types.js"
import { updateRuleTool } from "./updateRule.js"

// Tool registry - add new tools here
export const tools: McpTool[] = [grepRulesTool, createRuleTool, updateRuleTool, getViolationsTool]

// Get tool by name
export function getTool(name: string): McpTool | undefined {
  return tools.find((tool) => tool.name === name)
}

// Get all tool names
export function getToolNames(): string[] {
  return tools.map((tool) => tool.name)
}

// Get all tools for MCP ListTools response
export function getAllToolsForMcp() {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }))
}

// Execute a tool by name
export async function executeTool(name: string, args: any, context: ToolContext) {
  const tool = getTool(name)
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`)
  }

  return await tool.handler(args, context)
}
