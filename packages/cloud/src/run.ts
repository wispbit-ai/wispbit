#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio"
import { Command } from "commander"
import dotenv from "dotenv"

import { createServer as createMcpServer } from "./mcp"

dotenv.config()

// Parse CLI arguments using commander
const program = new Command()
  .name("@wispbit/cloud")
  .description("Wispbit Cloud MCP Server")
  .version("1.0.0")

// Add the 'mcp' subcommand
const mcpCommand = program
  .command("mcp")
  .description("Start the MCP server")
  .option("--api-key <string>", "API key for authentication")
  .option("--host <string>", "API host for authentication")
  .allowUnknownOption() // let MCP Inspector / other wrappers pass through extra flags

// Parse arguments
program.parse(process.argv)

// If no command is provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp()
  process.exit(0)
}

// Get the parsed command and options
const parsedCommand = program.args[0]
if (parsedCommand !== "mcp") {
  program.outputHelp()
  process.exit(1)
}

const cliOptions = mcpCommand.opts<{
  apiKey?: string
  host?: string
}>()

// Function to create a new server instance with all tools registered
function createServerInstance(apiKey: string, host: string) {
  return createMcpServer({ token: apiKey, host })
}

async function main() {
  // Only stdio transport is supported
  const server = createServerInstance(
    cliOptions.apiKey ?? (process.env.WISPBIT_API_KEY || ""),
    cliOptions.host ?? (process.env.WISPBIT_HOST || "https://api.wispbit.com")
  )
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("wispbit MCP Server running on stdio")
}

main().catch((error) => {
  console.error("Fatal error in main():", error)
  process.exit(1)
})
