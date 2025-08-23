// @ts-expect-error no types
// eslint-disable-next-line import/no-named-as-default
import Big from "big.js"
import { OpenAI } from "openai"
import {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption,
} from "openai/resources/index.mjs"

// Define types for OpenAI API responses
export type ToolCall = {
  id: string
  type: string
  function: {
    name: string
    arguments: string
  }
}

export type OpenAIMessage = {
  content: string | null
  role: string
  tool_calls?: ToolCall[]
}

export type OpenAICompletion = {
  choices: {
    message: OpenAIMessage
    index: number
    finish_reason: string
  }[]
  id: string
  created: number
  model: string
}

// Response types
export type MessageResponse = {
  type: "message"
  content: string | null
  usage: {
    cost: number
  }
}

export type ToolResponse = {
  type: "tool"
  toolCalls: ToolCall[]
  usage: {
    cost: number
  }
}

export type StructuredResponse = {
  type: "structured"
  content: Record<string, any>
  usage: {
    cost: number
  }
}

export type AIResponse = MessageResponse | ToolResponse | StructuredResponse

/**
 * Parse API error object to extract meaningful error information
 *
 * @param error - The error object from API call
 * @returns Parsed error details
 */
function parseAPIError(error: any): {
  message: string
  code: string
  type: string
  providerName: string
  statusCode?: number
} {
  let errorMessage = "API Error"
  let errorCode = "unknown"
  let errorType = "api_error"
  let providerName = "OpenAI"
  let statusCode: number | undefined

  if (error && typeof error === "object" && "error" in error) {
    const apiError = error as any

    if (apiError.error) {
      // Check if this has metadata.raw (common structure for all providers)
      if (apiError.error.metadata?.raw) {
        try {
          const rawError = JSON.parse(apiError.error.metadata.raw)
          if (rawError.error) {
            errorMessage = rawError.error.message || errorMessage
            errorCode = rawError.error.code || apiError.error.code || errorCode
            errorType = rawError.error.type || errorType
          }
          providerName = apiError.error.metadata.provider_name || providerName
        } catch (parseError) {
          // If parsing fails, fall back to the outer error
          errorMessage = apiError.error.message || errorMessage
          errorCode = apiError.error.code || errorCode
          providerName = apiError.error.metadata?.provider_name || providerName
        }
      } else {
        // Direct error structure (fallback)
        errorMessage = apiError.error.message || errorMessage
        errorCode = apiError.error.code || errorCode
        errorType = apiError.error.type || errorType
      }
    } else if (apiError.message) {
      errorMessage = apiError.message
    }

    // Include status code if available
    statusCode = apiError.status || apiError.statusCode
  }

  return {
    message: errorMessage,
    code: errorCode,
    type: errorType,
    providerName,
    statusCode,
  }
}

/**
 * Check if an OpenAI response contains tool calls
 *
 * @param completion - OpenAI API completion response
 * @returns boolean indicating if the response has tool calls
 */
export function isToolResponse(completion: OpenAICompletion): boolean {
  return !!completion.choices[0]?.message.tool_calls?.length
}

/**
 * Check if an OpenAI response is a regular message response
 *
 * @param completion - OpenAI API completion response
 * @returns boolean indicating if the response is a regular message
 */
export function isMessageResponse(completion: OpenAICompletion): boolean {
  return !isToolResponse(completion) && !isStructuredResponse(completion)
}

/**
 * Check if an OpenAI response is a structured response
 *
 * @param completion - OpenAI API completion response
 * @param wasStructuredRequest - Whether the request used structured output format
 * @returns boolean indicating if the response is structured
 */
export function isStructuredResponse(completion: OpenAICompletion): boolean {
  try {
    const content = completion.choices[0]?.message.content
    if (!content) return false
    const parsed = JSON.parse(content)
    return typeof parsed === "object" && parsed !== null
  } catch {
    return false
  }
}

/**
 * Get the content of a message response
 *
 * @param completion - OpenAI API completion response
 * @returns the content of the message or null
 */
export function getMessageContent(completion: OpenAICompletion): string | null {
  return completion.choices[0]?.message.content
}

/**
 * Get structured content from a response
 *
 * @param completion - OpenAI API completion response
 * @returns the structured content or null
 */
export function getStructuredContent(completion: OpenAICompletion): Record<string, any> | null {
  try {
    const content = completion.choices[0]?.message.content
    if (!content) return null
    return JSON.parse(content)
  } catch {
    return null
  }
}

/**
 * Get tool calls from a response
 *
 * @param completion - OpenAI API completion response
 * @returns array of tool calls or empty array
 */
export function getToolCalls(completion: OpenAICompletion): ToolCall[] {
  return completion.choices[0]?.message.tool_calls || []
}

/**
 * Type guard for MessageResponse
 */
export function isMessageResponseType(response: AIResponse): response is MessageResponse {
  return response.type === "message"
}

/**
 * Type guard for ToolResponse
 */
export function isToolResponseType(response: AIResponse): response is ToolResponse {
  return response.type === "tool"
}

/**
 * Type guard for StructuredResponse
 */
export function isStructuredResponseType(response: AIResponse): response is StructuredResponse {
  return response.type === "structured"
}

// Types for structured outputs following OpenRouter's specification
export type ResponseFormat = {
  type: "json_schema"
  json_schema: {
    name: string
    strict?: boolean
    schema: Record<string, any>
  }
}

/**
 * Example usage of structured outputs:
 *
 * const responseFormat = {
 *   type: "json_schema" as const,
 *   json_schema: {
 *     name: "weather",
 *     strict: true,
 *     schema: {
 *       type: "object",
 *       properties: {
 *         location: {
 *           type: "string",
 *           description: "City or location name"
 *         },
 *         temperature: {
 *           type: "number",
 *           description: "Temperature in Celsius"
 *         },
 *         conditions: {
 *           type: "string",
 *           description: "Weather conditions description"
 *         }
 *       },
 *       required: ["location", "temperature", "conditions"],
 *       additionalProperties: false
 *     }
 *   }
 * }
 *
 * const response = await getOpenAICompletion(openAI, {
 *   messages: [{ role: "user", content: "What's the weather like in London?" }],
 *   tools: [],
 *   model: "gpt-4o",
 *   responseFormat
 * })
 *
 * if (isStructuredResponseType(response)) {
 *   console.log(response.content) // { location: "London", temperature: 18, conditions: "Partly cloudy" }
 * }
 */

/**
 * Call OpenAI API with messages.
 *
 * @param service - Service instance with OpenAI client
 * @param messages - Array of message objects
 * @param responseFormat - Optional structured output format using OpenRouter's JSON Schema specification
 * @returns Either a MessageResponse, ToolResponse, or StructuredResponse based on the API response
 */
export const getOpenAICompletion = async function (
  openAI: OpenAI,
  {
    messages,
    tools,
    model,
    toolChoice = "auto",
    temperature,
    maxTokens,
    reasoningMaxTokens,
    responseFormat,
  }: {
    messages: ChatCompletionMessageParam[]
    tools: ChatCompletionTool[]
    model: string
    toolChoice?: ChatCompletionToolChoiceOption
    temperature?: number
    maxTokens?: number
    reasoningMaxTokens?: number
    responseFormat?: ResponseFormat
  }
): Promise<AIResponse> {
  let completion: OpenAICompletion

  try {
    completion = await openAI.chat.completions.create({
      model,
      messages,
      tools,
      tool_choice: toolChoice,
      temperature,
      max_tokens: maxTokens,
      // @ts-expect-error this is a valid type
      usage: {
        include: true,
      },
      ...(reasoningMaxTokens
        ? { reasoning: { enabled: true, max_tokens: reasoningMaxTokens } }
        : {}),
      ...(responseFormat ? { response_format: responseFormat } : {}),
    })

    // catch and re-throw errors because openrouter returns a different syntax
  } catch (error) {
    const parsedError = parseAPIError(error)
    const statusText = parsedError.statusCode ? ` (HTTP ${parsedError.statusCode})` : ""

    // Re-throw with enhanced error message
    throw new Error(
      `${parsedError.providerName} API Error${statusText}: ${parsedError.message} [Type: ${parsedError.type}, Code: ${parsedError.code}]`
    )
  }

  const usage = {
    // @ts-expect-error this is a valid type
    cost: new Big(completion.usage?.cost ?? 0).toString(),
  }

  // Return a different response type based on the content
  if (isToolResponse(completion)) {
    return {
      type: "tool",
      toolCalls: getToolCalls(completion),
      usage,
    }
  } else if (isStructuredResponse(completion)) {
    return {
      type: "structured",
      content: JSON.parse(getMessageContent(completion) || "{}"),
      usage,
    }
  } else if (isMessageResponse(completion)) {
    return {
      type: "message",
      content: getMessageContent(completion),
      usage,
    }
  } else {
    throw new Error("Invalid response type")
  }
}
