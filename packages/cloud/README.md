# Wispbit MCP Server

A Model Context Protocol (MCP) server that provides tools for code quality rules and violations management.

## Features

- **grep-rules**: Search for existing code quality rules using pattern matching
- **create-rule**: Create new code quality rules for repositories  
- **update-rule**: Update existing rules based on feedback
- **get-violations**: Retrieve violations for specific pull requests

## Usage

The MCP server uses STDIO transport for direct integration with MCP clients like Claude Desktop.

```bash
npx @wispbit/cloud mcp
```

## Configuration

### Environment Variables

- `WISPBIT_HOST`: Wispbit API base URL (default: https://api.wispbit.com)
- `WISPBIT_API_KEY`: Your Wispbit API key (required)

## Integration with Claude Desktop

Add to your Claude Desktop MCP settings:

```json
{
  "mcpServers": {
    "wispbit": {
      "command": "npx",
      "args": ["@wispbit/cloud", "mcp"],
      "env": {
        "WISPBIT_API_KEY": "your-wispbit-api-key-here",
        "WISPBIT_HOST": "https://api.wispbit.com"
      }
    }
  }
}
```

