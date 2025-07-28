### CI

#### Github Integration

For full GitHub integration with inline comments on pull requests, see [pull-request-code-review.yaml](.github/workflows/pull-request-code-review.yaml). [Example pull request](https://github.com/wispbit-ai/wispbit/pull/3).

This workflow:

- Runs automatically on PR open/sync
- Posts inline comments directly on the PR
- Supports caching for performance and cost reduction

#### Alternative: Markdown/Plaintext Comment Reviews

For scenarios where inline comments aren't supported, or you aren't using Github, you can still run wispbit manually:

See [pull-request-code-review-main-comment.yaml](.github/workflows/pull-request-code-review-main-comment.yaml) where we make a comment using the output of wispbit's markdown mode.

### MCP (Model Context Protocol)

Configure wispbit as an MCP server in your IDE for seamless code reviews.

#### Cursor Example

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "wispbit": {
      "command": "npx",
      "args": ["-y", "@wispbit/cli@latest", "mcp"]
    }
  }
}
```

Then ask your IDE:

```text
Please run a code review using wispbit
```

### Local Standalone

Run wispbit directly from the command line for local development:

```bash
npx @wispbit/cli@latest review
```

#### Claude Code

If your AI Editor supports CLI commands, you can use a simple prompt:

```text
run a code review using "npx @wispbit/cli@latest review --mode=markdown" and address any violations
```

Ideally, chain it after running a task

```text
create a button on the home page

run a code review using "npx @wispbit/cli@latest review --mode=markdown" and address any violations
```

**Important: use `mode=markdown` because Claude Code doesn't work well with interactive mode!**
