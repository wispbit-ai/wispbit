export interface Provider {
  id: string
  name: string
  description: string
  defaultModel: string
  apiKeyName: string
  endpoint: string
}

// Only OpenAI-compatible providers are supported for now
export const PROVIDERS: Provider[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Access to multiple AI models through OpenRouter API",
    defaultModel: "anthropic/claude-sonnet-4",
    apiKeyName: "OpenRouter API Key",
    endpoint: "https://openrouter.ai/api/v1",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Direct access to Claude models via Anthropic API",
    defaultModel: "claude-sonnet-4",
    apiKeyName: "Anthropic API Key",
    endpoint: "https://api.anthropic.com/v1",
  },
]
