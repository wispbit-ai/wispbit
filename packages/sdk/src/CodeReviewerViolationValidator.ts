import { OpenAI } from "openai"
import { ChatCompletionMessageParam } from "openai/resources/chat/completions"
import pRetry from "p-retry"
import pino from "pino"
import { prettyFactory } from "pino-pretty"

import { CLAUDE_4_SONNET } from "@wispbit/sdk/models"
import { getOpenAICompletion, isToolResponseType } from "@wispbit/sdk/openai"
import { addLineNumbersToPatch, extractDiffHunk, filterDiff } from "@wispbit/sdk/patchParser"
import { FileChange, Violation } from "@wispbit/sdk/types"

type CodeReviewerViolationValidatorOptions = {
  baseURL: string
  apiKey: string
  model: string
  validationModel?: string
  headers?: Record<string, string>
}

const prettify = prettyFactory({ sync: true })

export class CodeReviewerViolationValidator {
  private openai: OpenAI
  private model: string
  private retryOptions: {
    retries: number
    factor: number
    minTimeout: number
    maxTimeout: number
  }
  private logger: pino.Logger

  constructor(
    {
      debug = false,
    }: {
      debug?: boolean
    },
    openAiClient: OpenAI | undefined,
    options: CodeReviewerViolationValidatorOptions = {
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.AI_KEY!,
      model: CLAUDE_4_SONNET,
    }
  ) {
    this.openai = this.openai =
      openAiClient ??
      new OpenAI({
        baseURL: options.baseURL,
        apiKey: options.apiKey,
        defaultHeaders: {
          ...options.headers,
        },
      })
    this.model = options.model
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

    this.retryOptions = {
      retries: 3,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 10000,
    }
  }

  async validateViolation(
    violation: Violation,
    fileChange: FileChange
  ): Promise<{ isValid: boolean; reasoning: string; cost: number }> {
    const context = extractDiffHunk(
      fileChange.patch || "",
      violation.line.start,
      violation.line.end,
      violation.line.side,
      3
    )

    const oldHunk = filterDiff(context, "deletions")
    const newHunk = filterDiff(context, "additions")

    const validationPrompt = `You are a code review validator. Your job is to determine if this violation is actually a violation of the stated rule

You will be given:
1. A rule that was supposedly violated
2. A description of the violation
3. The file and it's status
4. The relevant old_lines and new_lines. 
    - Code context is organized into old_lines and new_lines.
    - new_lines shows added / updated lines. old_lines shows removed lines. 
    - Code lines are prefixed with symbols ('+', '-', ' '). The '+' symbol indicates new code added, the '-' symbol indicates code removed in the PR, and the ' ' symbol indicates unchanged code.
    - Line numbers are included to help you understand the context of the code change.
5. The reason why the violation was reported by the original reviewer.

<rule_description>
${violation.rule.contents}
</rule_description>

<violation_description>
${violation.description}
</violation_description>

<file_name>
${fileChange.filename}
</file_name>

<file_status>
${fileChange.status}
</file_status>

<old_lines>
${addLineNumbersToPatch(oldHunk)}
</old_lines>

<new_lines>
${addLineNumbersToPatch(newHunk)}
</new_lines>

<reason>
${violation.reason}
</reason>

Use the following criteria to determine if the violation is valid:
1. The rule description makes sense in the context of the code and violation description.
2. The status of the file aligns with the rule. For example, if we are checking for style violations, and the file is deleted, we should probably not consider it a violation.
3. If the rule requires you to check other files and you don't have access to them, you should always consider it a violation.
4. The comment isn't guessing or making an assumption for something that's not in the rule.
5. The reason why the violation was reported by the original reviewer makes sense in context of the rule.

Use the report_validation tool to report your decision and reasoning.
`

    const response = await this.callOpenAIWithRetry([
      {
        role: "system",
        content: [
          {
            type: "text" as const,
            text: validationPrompt,
            // @ts-expect-error - cache_control is not a valid property of ChatCompletionContentPartText
            cache_control: { type: "ephemeral" },
          },
        ],
      },
    ])

    if (!isToolResponseType(response)) {
      throw new Error("Validation response is not a tool response")
    }

    const toolCall = response.toolCalls[0]
    const validationResult = JSON.parse(toolCall.function.arguments)
    const isValid = validationResult.is_valid

    this.logger.debug(
      {
        filename: fileChange.filename,
        rule: violation.rule.name,
        description: violation.description,
        isValid,
        reasoning: validationResult.reasoning,
      },
      "Violation validation result"
    )

    return {
      isValid,
      reasoning: validationResult.reasoning,
      cost: response.usage.cost,
    }
  }

  private async callOpenAIWithRetry(messages: ChatCompletionMessageParam[]) {
    return await pRetry(
      async () => {
        return await getOpenAICompletion(this.openai, {
          messages,
          tools: [
            {
              type: "function",
              function: {
                name: "report_validation",
                description: "Report whether a code violation is valid or not",
                parameters: {
                  type: "object",
                  properties: {
                    is_valid: {
                      type: "boolean",
                      description: "Whether the violation is valid and actionable",
                    },
                    reasoning: {
                      type: "string",
                      description: "Brief explanation of the validation decision",
                    },
                  },
                  required: ["is_valid", "reasoning"],
                  additionalProperties: false,
                },
              },
            },
          ],
          model: this.model,
          toolChoice: { type: "function", function: { name: "report_validation" } },
          temperature: 0.1,
          maxTokens: 300,
        })
      },
      {
        ...this.retryOptions,
        onFailedAttempt: (error) => {
          this.logger.debug(
            {
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
}
