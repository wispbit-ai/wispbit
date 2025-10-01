# @wispbit/sdk-ts

The core SDK for wispbit's AI code review functionality. This package provides the underlying engine that powers the [@wispbit/cli](https://npmjs.com/package/@wispbit/cli) and allows you to integrate AI code review capabilities directly into your own applications and environments.

## Overview

The SDK provides a complete AI-powered code review system that can:
- Review code changes against custom rules
- Analyze files and detect violations
- Support multiple AI models and providers

## Installation

```bash
npm install @wispbit/sdk-ts
```

## Quick Start

```typescript
import { CodeReviewer, newRule } from '@wispbit/sdk-ts'

// Create a code reviewer instance
const reviewer = new CodeReviewer({
  baseURL: 'https://api.openai.com/v1',
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4o'
})

// Define a simple rule
const rule = newRule({
  id: 'no-console-log',
  title: 'No console.log statements',
  description: 'Avoid console.log in production code',
  include: ['**/*.ts', '**/*.js'],
  exclude: ['**/*.test.*']
})

// Review code changes
const fileChanges = [
  {
    filename: 'src/app.ts',
    patch: `@@ -1,3 +1,4 @@
 function hello() {
+  console.log('debug message')
   return 'Hello World'
 }`
  }
]

const violations = await reviewer.reviewChanges(fileChanges, [rule])
console.log(violations)
```

## Core Classes

### CodeReviewer

The main class that orchestrates AI-powered code reviews.

```typescript
const reviewer = new CodeReviewer({
  baseURL: 'https://api.anthropic.com',
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: 'claude-3-5-sonnet-20241022',
  headers: {
    'anthropic-version': '2023-06-01'
  }
})
```

## Rules Management

### Creating Rules

```typescript
import { newRule, newRuleFromBlocks } from '@wispbit/sdk-ts'

// Simple rule
const rule = newRule({
  id: 'typescript-strict',
  title: 'Use TypeScript strict mode',
  description: 'All TypeScript files should use strict mode',
  include: ['**/*.ts'],
  exclude: ['**/*.d.ts']
})

// Rule from markdown blocks
const markdownRule = newRuleFromBlocks([
  '# No TODO comments',
  'TODO comments should not be committed to main branch',
  '```include',
  '**/*.ts',
  '**/*.js',
  '```'
])
```

### Loading Rules

```typescript
import { getRulesFromDirectory, getRuleFromFile } from '@wispbit/sdk-ts'

// Load all rules from a directory
const rules = await getRulesFromDirectory('./rules')

// Load a single rule file
const rule = await getRuleFromFile('./rules/my-rule.md')
```

## AI Model Support

The SDK supports any OpenAI-compatible API:

```typescript
// OpenAI
const openaiReviewer = new CodeReviewer({
  baseURL: 'https://api.openai.com/v1',
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4o'
})

// Anthropic
const claudeReviewer = new CodeReviewer({
  baseURL: 'https://api.anthropic.com',
  apiKey: process.env.ANTHROPIC_API_KEY!,
  model: 'claude-3-5-sonnet-20241022',
  headers: {
    'anthropic-version': '2023-06-01'
  }
})
```

## TypeScript Support

The SDK is written in TypeScript and provides full type definitions:

```typescript
import type { 
  FileChange, 
  CodebaseRule, 
  Violation, 
  FileAnalysis 
} from '@wispbit/sdk-ts'

const fileChange: FileChange = {
  filename: 'src/app.ts',
  patch: '...'
}

const rule: CodebaseRule = {
  id: 'my-rule',
  title: 'My Rule',
  description: 'Rule description',
  include: ['**/*.ts'],
  exclude: []
}
```

## Use Cases

- **Custom CI/CD Integration**: Build your own code review workflows
- **IDE Extensions**: Add AI code review to your favorite editor
- **Git Hooks**: Implement pre-commit or pre-push review checks
- **Code Analysis Tools**: Build specialized analysis applications
- **Batch Processing**: Review large codebases or historical changes
- **Custom Deployment**: Run code review in your own infrastructure

## Related Packages

- **[@wispbit/cli](https://npmjs.com/package/@wispbit/cli)** - Command-line interface built on this SDK
- **[wispbit.com/rules](https://wispbit.com/rules)** - Community rules repository

## Support

- [Documentation](https://wispbit.com)
- [Discord Community](https://wispbit.com/discord)
- [GitHub Issues](https://github.com/wispbit/wispbit)

## License

Open source - see [LICENSE](../../LICENSE) file for details. 