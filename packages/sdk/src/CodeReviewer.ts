// @ts-expect-error no types
// eslint-disable-next-line import/no-named-as-default
import Big from "big.js"
import OpenAI from "openai"
import { ChatCompletionMessageParam } from "openai/resources/chat/completions"
import pRetry from "p-retry"
import pino from "pino"
import { prettyFactory } from "pino-pretty"

import { filterRules } from "@wispbit/sdk/codebaseRules"
import {
  CodeReviewerExecutor,
  codeReviewTools,
  ComplaintParameters,
  ReadFileParameters,
} from "@wispbit/sdk/CodeReviewerExecutor"
import { CodeReviewerViolationValidator } from "@wispbit/sdk/CodeReviewerViolationValidator"
import { getCodeReviewUserPrompt, getCodeReviewSystemPrompt } from "@wispbit/sdk/codeReviewPrompt"
import { CLAUDE_4_SONNET } from "@wispbit/sdk/models"
import { getOpenAICompletion, isToolResponseType } from "@wispbit/sdk/openai"
import { CodebaseRule, FileAnalysis, FileChange, Violation } from "@wispbit/sdk/types"

const prettify = prettyFactory({ sync: true })

type CodeReviewerOptions = {
  baseURL: string
  apiKey: string
  model: string
  validationModel?: string
  headers?: Record<string, string>
  retryOptions?: {
    retries?: number
    factor?: number
    minTimeout?: number
    maxTimeout?: number
  }
}

export class CodeReviewer {
  private openai: OpenAI
  private model: string
  private executor: CodeReviewerExecutor
  private violationValidator: CodeReviewerViolationValidator
  private systemPrompt: string
  private logger: pino.Logger
  private retryOptions: {
    retries: number
    factor: number
    minTimeout: number
    maxTimeout: number
  }

  constructor(
    {
      ripGrepPath = "rg",
      cwd = process.cwd(),
      debug = false,
      openAiClient,
    }: {
      ripGrepPath?: string
      cwd?: string
      debug?: boolean
      openAiClient?: OpenAI | undefined
    },
    options: CodeReviewerOptions = {
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.AI_KEY!,
      model: CLAUDE_4_SONNET,
      validationModel: CLAUDE_4_SONNET,
    },
    files: FileChange[] = []
  ) {
    this.openai =
      openAiClient ??
      new OpenAI({
        baseURL: options.baseURL,
        apiKey: options.apiKey,
        defaultHeaders: {
          ...options.headers,
        },
      })

    this.model = options.model
    this.executor = new CodeReviewerExecutor({ ripGrepPath, cwd })
    this.violationValidator = new CodeReviewerViolationValidator({ debug }, openAiClient, {
      baseURL: options.baseURL,
      apiKey: options.apiKey,
      model: options.validationModel || CLAUDE_4_SONNET,
    })

    this.systemPrompt = getCodeReviewSystemPrompt(files.map((f) => f.filename))

    // Set up retry options with defaults
    this.retryOptions = {
      retries: 3,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 10000,
      ...options.retryOptions,
    }

    // Use provided logger or create default pino logger
    this.logger = pino(
      { level: debug ? "debug" : "info" },
      {
        write(str) {
          if (debug) {
            console.log(prettify(str))
          }
        },
      }
    )
  }

  private async callOpenAIWithRetry(messages: ChatCompletionMessageParam[], filename: string) {
    return await pRetry(
      async () => {
        return await getOpenAICompletion(this.openai, {
          messages,
          tools: codeReviewTools,
          model: this.model,
        })
      },
      {
        ...this.retryOptions,
        onFailedAttempt: (error) => {
          this.logger.debug(
            {
              filename,
              attempt: error.attemptNumber,
              retriesLeft: error.retriesLeft,
              error: error.message,
            },
            "OpenAI API call failed, retrying..."
          )
        },
      }
    )
  }

  async codeReviewFile(file: FileChange, rules: CodebaseRule[]): Promise<FileAnalysis> {
    if (!file.patch) {
      this.logger.debug({ filename: file.filename }, "no patch found for file")
      return {
        violations: [],
        explanation: "NO_PATCH_FOUND",
        rules: [],
        visitedFiles: [],
        cost: "0",
      }
    }

    // Find rules that apply to this file
    const allowedRules = filterRules(rules, file.filename)

    if (allowedRules.length === 0) {
      return {
        visitedFiles: [],
        violations: [],
        explanation: "NO_APPLICABLE_RULES",
        rules: [],
        cost: "0",
      }
    }

    this.logger.debug(
      { filename: file.filename, rules: allowedRules.map((r) => r.name) },
      "running code review"
    )
    const result = await this.runPromptAndGetAnalysis(file, allowedRules)
    this.logger.debug({ filename: file.filename, result }, "analysis results")

    return {
      ...result,
      rules: allowedRules,
    }
  }

  async runPromptAndGetAnalysis(
    file: FileChange,
    rules: CodebaseRule[]
  ): Promise<Omit<FileAnalysis, "rules">> {
    const systemPrompt = this.systemPrompt

    const userMessages: ChatCompletionMessageParam[] = getCodeReviewUserPrompt({
      fileChange: file,
      rules,
    })

    const messages: ChatCompletionMessageParam[] = [
      systemPrompt
        ? {
            role: "system",
            content: [
              {
                type: "text" as const,
                text: systemPrompt,
                cache_control: { type: "ephemeral" },
              },
            ],
          }
        : undefined,
      ...userMessages,
    ].filter(Boolean) as ChatCompletionMessageParam[]

    // Initialize an empty array to collect violations
    const violations: Violation[] = []
    const rejectedViolations: Array<{ violation: Violation; reasoning: string }> = []
    let visitedFiles: string[] = []
    let totalCost = new Big(0)

    // Get initial completion
    let response = await this.callOpenAIWithRetry(messages, file.filename)

    totalCost = totalCost.plus(response.usage.cost)

    // Process tool calls in a loop until we get a message response
    while (isToolResponseType(response)) {
      // Add assistant message with tool calls to the conversation
      messages.push({
        role: "assistant",
        content: null,
        tool_calls: response.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })),
      })

      // Process each tool call using executeTool
      const toolCallPromises = response.toolCalls.map(async (toolCall) => {
        // Parse the tool arguments
        const args = JSON.parse(toolCall.function.arguments)

        this.logger.debug(
          { file: file.filename, toolCall: toolCall.function.name, args },
          "tool call with args"
        )

        // Execute the tool using the imported executeTool function
        const toolResult = await this.executor.executeCodeReviewTool(
          {
            filename: file.filename,
            patch: file.patch || "",
          },
          rules,
          toolCall.function.name,
          args
        )

        this.logger.debug(
          { file: file.filename, toolCall: toolCall.function.name, result: toolResult },
          "tool call result"
        )

        return {
          toolCall,
          toolResult,
          args,
        }
      })

      // Wait for all tool calls to complete
      const toolCallResults = await Promise.all(toolCallPromises)

      // Process results in order and add to messages
      const violationsToValidate: Violation[] = []

      for (const { toolCall, toolResult, args } of toolCallResults) {
        // Add the tool result to the conversation
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult),
        })

        if (toolCall.function.name === "read_file" && !("error" in toolResult)) {
          const readFileParams = args as ReadFileParameters
          visitedFiles.push(readFileParams.target_file)
        }

        // Handle complaint tool calls - collect violations for validation
        if (toolCall.function.name === "complaint" && !("error" in toolResult)) {
          const complaintParams = toolResult as ComplaintParameters

          const violation: Violation = {
            description: complaintParams.description,
            line: {
              start: complaintParams.line_start,
              end: complaintParams.line_end,
              side: complaintParams.line_side,
            },
            rule: rules.find((r) => r.id === complaintParams.rule_id)!,
            optional: complaintParams.optional,
          }

          violationsToValidate.push(violation)
        }
      }

      // Validate all violations in parallel
      if (violationsToValidate.length > 0) {
        const validationPromises = violationsToValidate.map(async (violation) => {
          const validationResult = await this.violationValidator.validateViolation(violation, file)
          return { violation, validationResult }
        })

        const validationResults = await Promise.all(validationPromises)

        // Process validation results
        for (const { violation, validationResult } of validationResults) {
          totalCost = totalCost.plus(validationResult.cost)

          if (validationResult.isValid) {
            violations.push({ ...violation, validationReasoning: validationResult.reasoning })
          } else {
            rejectedViolations.push({ violation, reasoning: validationResult.reasoning })
          }
        }
      }

      // Get the next response with tool results
      response = await this.callOpenAIWithRetry(messages, file.filename)
      totalCost = totalCost.plus(response.usage.cost)
    }

    // Now we have a message response or all tool calls are processed
    const content = response.type === "message" ? response.content || "" : ""

    visitedFiles = visitedFiles.filter((f) => f !== file.filename)
    visitedFiles = visitedFiles.toSorted()

    return {
      violations,
      explanation: content,
      visitedFiles,
      rejectedViolations,
      cost: totalCost.toString(),
    }
  }
}
