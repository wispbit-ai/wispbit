#!/usr/bin/env node
import { createServer } from "http"

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import chalk from "chalk"

import { runCodeReview } from "@wispbit/cli/codeReview"
import { switchContext } from "@wispbit/cli/context"
import { CodeReviewOptions } from "@wispbit/cli/types"
import { getLocalVersion } from "@wispbit/cli/version"

// Store SSE transports by session ID
const sseTransports: Record<string, SSEServerTransport> = {}

// Server started flag
export let serverStarted = false

// Function to create a new server instance with all tools registered
function createServerInstance(options: CodeReviewOptions) {
  const server = new Server(
    {
      name: "@wispbit/cli",
      version: getLocalVersion(),
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  )

  // Set up MCP server handlers
  server.setRequestHandler(ListToolsRequestSchema, () => {
    return {
      tools: [
        {
          name: "run-code-review",
          description:
            "Run a code review on the current repository. Returns a list of violations if any are present. If no violations are found, we return an empty list.",
          inputSchema: {
            type: "object",
            properties: {
              directory: {
                type: "string",
                description:
                  "The directory to run the code review on. Always provide the root of the repository.",
              },
            },
            required: ["directory"],
          },
        },
      ],
    }
  })

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "run-code-review") {
      if (request.params.arguments?.directory) {
        switchContext(request.params.arguments.directory as string)
      }

      const violations = await runCodeReview({
        options,
        hooks: {},
      })
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "complete",
              message: "Code review completed",
              instructions:
                "Please check the list of violations and suggest fixes to the user. If an empty list is returned, no violations were found.",
              violations: violations?.map((violation) => {
                return {
                  fileName: violation.fileName,
                  violations: violation.violations?.map((violation) => ({
                    description: violation.description,
                    line: violation.line,
                    rule: {
                      name: violation.rule.name,
                    },
                  })),
                }
              }),
            }),
          },
        ],
        isError: false,
      }
    }

    throw new Error(`Unknown tool: ${request.params.name}`)
  })

  return server
}

export async function startServer(
  port: number,
  transportType: "stdio" | "http" | "sse",
  options: CodeReviewOptions
): Promise<void> {
  if (transportType === "http" || transportType === "sse") {
    // Get initial port from environment or use default
    const initialPort = port

    // Keep track of which port we end up using
    let actualPort = initialPort

    const httpServer = createServer(async (req, res) => {
      const url = new URL(req.url || "", `http://${req.headers.host}`).pathname

      // Set CORS headers for all responses
      res.setHeader("Access-Control-Allow-Origin", "*")
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS,DELETE")
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, MCP-Session-Id, mcp-session-id, MCP-Protocol-Version"
      )
      res.setHeader("Access-Control-Expose-Headers", "MCP-Session-Id")

      // Handle preflight OPTIONS requests
      if (req.method === "OPTIONS") {
        res.writeHead(200)
        res.end()
        return
      }

      try {
        // Create new server instance for each request
        const requestServer = createServerInstance(options)

        if (url === "/mcp") {
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
          })
          await requestServer.connect(transport)
          await transport.handleRequest(req, res)
        } else if (url === "/sse" && req.method === "GET") {
          // Create new SSE transport for GET request
          const sseTransport = new SSEServerTransport("/messages", res)

          // Store the transport by session ID
          sseTransports[sseTransport.sessionId] = sseTransport

          // Clean up transport when connection closes
          res.on("close", () => {
            delete sseTransports[sseTransport.sessionId]
          })

          await requestServer.connect(sseTransport)
        } else if (url === "/messages" && req.method === "POST") {
          // Get session ID from query parameters
          const sessionId =
            new URL(req.url || "", `http://${req.headers.host}`).searchParams.get("sessionId") ?? ""

          if (!sessionId) {
            res.writeHead(400)
            res.end("Missing sessionId parameter")
            return
          }

          // Get existing transport for this session
          const sseTransport = sseTransports[sessionId]
          if (!sseTransport) {
            res.writeHead(400)
            res.end(`No transport found for sessionId: ${sessionId}`)
            return
          }

          // Handle the POST message with the existing transport
          await sseTransport.handlePostMessage(req, res)
        } else if (url === "/ping") {
          res.writeHead(200, { "Content-Type": "text/plain" })
          res.end("pong")
        } else {
          res.writeHead(404)
          res.end("Not found")
        }
      } catch (error) {
        console.error("Error handling request:", error)
        if (!res.headersSent) {
          res.writeHead(500)
          res.end("Internal Server Error")
        }
      }
    })

    // Function to attempt server listen with port fallback (like Context7)
    const startServerWithPortFallback = (port: number, maxAttempts = 10) => {
      httpServer.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE" && port < initialPort + maxAttempts) {
          console.warn(chalk.yellow(`Port ${port} is in use, trying port ${port + 1}...`))
          startServerWithPortFallback(port + 1, maxAttempts)
        } else {
          console.error(chalk.red(`Failed to start server: ${err.message}`))
          process.exit(1)
        }
      })

      httpServer.listen(port, () => {
        actualPort = port
        serverStarted = true
        console.error(
          chalk.green(
            `@wispbit/cli MCP Server running on ${transportType.toUpperCase()} at http://localhost:${actualPort}/mcp and legacy SSE at /sse`
          )
        )
      })
    }

    // Start the server with initial port
    startServerWithPortFallback(initialPort)
  } else {
    // Stdio transport - this is already stateless by nature
    const server = createServerInstance(options)
    const transport = new StdioServerTransport()
    await server.connect(transport)
    serverStarted = true
    console.error(chalk.green("@wispbit/cli MCP Server running on stdio"))
  }
}
