# Wispbit MCP Server

A Model Context Protocol (MCP) server that provides tools for code quality rules and violations management.

## Features

- **grep-rules**: Search for existing code quality rules using pattern matching
- **create-rule**: Create new code quality rules for repositories  
- **update-rule**: Update existing rules based on feedback
- **get-violations**: Retrieve violations for specific pull requests

## Installation

```bash
npm install
npm run build
```

## Usage

### Stdio Transport (Default)

```bash
npm start
# or
node dist/index.js
```

### HTTP Transport

```bash
npm start -- --transport http --port 3000
# or
node dist/index.js --transport http --port 3000
```

### Development

```bash
npm run dev
```

## Transport Options

### Stdio Transport
- **Use case**: Direct integration with MCP clients (like Claude Desktop)
- **Command**: `node dist/index.js` or `node dist/index.js --transport stdio`
- **Authentication**: Pass API key via `--api-key` flag

### HTTP Transport
- **Use case**: Web-based integration or when stdio isn't available
- **Command**: `node dist/index.js --transport http --port 3000`
- **Endpoints**:
  - `/mcp` - Main MCP endpoint
  - `/sse` - Server-Sent Events endpoint  
  - `/messages` - POST messages endpoint
  - `/ping` - Health check
- **Authentication**: Pass API key via `Authorization: Bearer <token>` header

## Configuration

### Environment Variables

- `WISPBIT_HOST`: Wispbit API base URL (default: https://api.wispbit.com)
- `WISPBIT_API_KEY`: Your Wispbit API key (required)
- `NODE_ENV`: Environment (development/production)

### Command Line Options

- `--transport <stdio|http>`: Transport type (default: stdio)
- `--port <number>`: Port for HTTP transport (default: 3000)
- `--api-key <string>`: API key for authentication (stdio only)

## Authentication

The server requires authentication to access Wispbit services. Currently, authentication is not fully implemented in standalone mode and will need to be connected to your actual authentication service.

To implement authentication:

1. Replace the `authenticateAndAuthorizeRequest` function in `src/mcp-standalone.ts`
2. Connect to your organization API key validation service
3. Return appropriate organization and API key IDs

## Integration with Claude Desktop

Add to your Claude Desktop MCP settings:

```json
{
  "mcpServers": {
    "wispbit": {
      "command": "node",
      "args": ["/path/to/your/wispbit/packages/cloud/dist/index.js"],
      "env": {
        "WISPBIT_API_KEY": "your-wispbit-api-key-here",
        "WISPBIT_HOST": "https://api.wispbit.com"
      }
    }
  }
}
```

## API Reference

### grep-rules

Search for code quality rules matching a pattern.

**Parameters:**
- `pattern` (string, required): Search pattern (supports regex)
- `case_sensitive` (boolean, optional): Whether search is case-sensitive
- `repository_url` (string, required): GitHub repository URL

### create-rule

Create a new code quality rule.

**Parameters:**
- `repository_url` (string, required): GitHub repository URL  
- `prompt` (string, required): Description of the rule to create

### update-rule

Update an existing code quality rule.

**Parameters:**
- `rule_id` (string, required): ID of the rule to update
- `prompt` (string, required): Instructions for updating the rule

### get-violations

Get violations for a pull request.

**Parameters:**
- `repository_url` (string, required): GitHub repository URL
- `pull_request_number` (number, required): Pull request number
- `show_other_comments` (boolean, optional): Include non-Wispbit comments

## Development Notes

### Implementation Status

✅ **Completed:**
- Modular tool architecture with separate files
- API client for Wispbit API integration
- Environment variable configuration
- HTTP request handling with proper error management
- Formatted responses for all tools

🔧 **Ready for Production:**
All tools now make actual API calls to the Wispbit API at `WISPBIT_HOST` with your `WISPBIT_API_KEY`. The MCP server is ready to use with your Wispbit backend service.

**API Endpoints Used:**
- `POST /rules/search` - Grep rules functionality
- `POST /rules/create` - Create new rules
- `PATCH /rules/{id}` - Update existing rules  
- `GET /violations` - Get PR violations

## Error Handling

The server includes comprehensive error handling and will return appropriate error messages for:

- Invalid API keys
- Missing repositories
- Network issues
- Invalid parameters

## CORS Support

The HTTP transport includes CORS headers for web-based integration:

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET,POST,OPTIONS,DELETE`
- `Access-Control-Allow-Headers: Content-Type, MCP-Session-Id, MCP-Protocol-Version, Authorization`