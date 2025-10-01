import { OpenAI } from "openai"
import { ChatCompletionMessageParam } from "openai/resources/chat/completions"
import pRetry from "p-retry"
import pino from "pino"
import { prettyFactory } from "pino-pretty"

import { CLAUDE_4_SONNET } from "@wispbit/sdk-ts/models"
import { getOpenAICompletion, isToolResponseType } from "@wispbit/sdk-ts/openai"
import { addLineNumbersToPatch, extractDiffHunk, filterDiff } from "@wispbit/sdk-ts/patchParser"
import {
  Evidence,
  FileChange,
  PromptSuggestion,
  QuickSuggestion,
  Violation,
} from "@wispbit/sdk-ts/types"

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
    fileChange: FileChange,
    evidence: Evidence[] = []
  ): Promise<{
    isValid: boolean
    reasoning: string
    cost: number
    quickSuggestion?: QuickSuggestion
    promptSuggestion?: PromptSuggestion[]
    suggestionToUse: "quickSuggestion" | "promptSuggestion" | "none"
  }> {
    const context = extractDiffHunk(
      fileChange.patch || "",
      violation.line.start,
      violation.line.end,
      violation.line.side,
      3
    )

    const oldHunk = filterDiff(context, "deletions")
    const newHunk = filterDiff(context, "additions")

    const systemPrompt = `You are a code review validator. Your job is to determine if this violation is actually a violation of the stated rule.

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

Use the following criteria to determine if the violation is valid:
1. The rule description makes sense in the context of the code and violation description.
2. The status of the file aligns with the rule. For example, if we are checking for style violations, and the file is deleted, we should probably not consider it a violation.
3. If the rule requires you to check other files and you don't have access to them, you should always consider it a violation.
4. The comment isn't guessing or making an assumption for something that's not in the rule.
5. The reason why the violation was reported by the original reviewer makes sense in context of the rule.

SUGGESTION GENERATION: You can provide suggestions for VALID violations in two ways:

1. **quickSuggestion** (OPTIONAL) - For simple, single-file fixes that can be applied immediately:
   - Use ONLY when the violation can be fixed by modifying the exact violation lines with no additional context
   - The codeBlock should replace ONLY the exact violation line range (lineStart to lineEnd)
   - Only provide if no evidence from other files is needed
   - Fix only the specific violation without changing surrounding code
   - Should be minimal and focused on the specific violation
   - Ensure proper syntax and formatting
   - Example: Fixing a console.log statement, correcting variable naming, simple refactoring
   - CRITICAL CONSTRAINT: The lineStart and lineEnd MUST be EXACTLY the same as the original violation's line.start and line.end. You CANNOT expand beyond these boundaries under any circumstances
   - CRITICAL CONSTRAINT: The codeBlock MUST only contain the exact lines within the violation range - no additional lines above or below
   - CRITICAL CONSTRAINT: Do NOT try to make the code "complete" or "functional" by adding surrounding context - only fix the violation lines
   - Adjust indentation and spacing in the codeBlock to make the new code fit properly within the existing context

2. **promptSuggestion** (ALWAYS PROVIDE) - For all valid violations, provide this as the primary or fallback solution:
   - ALWAYS provide this for every valid violation, even if quickSuggestion is also provided
   - Use when the fix requires changes to multiple files
   - Use when the fix requires changes to code outside of the violation range
   - Use when the fix requires understanding of code outside the current diff context
   - Provide clear, copy-paste ready instructions for an AI to implement the fix
   - Include specific file paths and line ranges where changes should be made
   - Make instructions actionable and comprehensive
   - Example: "Extract this function to a utility file", "Update all imports across the codebase", "Implement missing interface methods"

CRITICAL RULES for suggestions:
- Only provide suggestions for VALID violations
- ALWAYS provide promptSuggestion for every valid violation
- quickSuggestion is optional and should only be provided if the fix can be done within exact violation line boundaries
- quickSuggestion lineStart and lineEnd MUST match the original violation's line.start and line.end EXACTLY - NO EXCEPTIONS
- quickSuggestion codeBlock can ONLY contain code WITHIN the original violation line range - never expand beyond
- quickSuggestion must include ONLY the lines specified by the violation range (lineStart to lineEnd) - nothing more, nothing less
- If the fix cannot be done within the exact violation line range, omit quickSuggestion and rely on promptSuggestion
- promptSuggestion instructions should be specific enough for an AI to execute without additional context
- Avoid suggestions that change behavior or introduce breaking changes
- If the rule provides examples of correct implementation, use those patterns in your suggestion
- IMPORTANT: NO INCOMPLETE CODE BLOCKS. THE CODE BLOCK MUST BE A COMPLETE REPLACEMENT WITH NO HANGING / LEADING BRACKETS THAT ARE NOT CLOSED.

Use the report_validation tool to report your decision and reasoning.`

    const userPrompt = `<rule_description>
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

<other_file_evidence>
${evidence.map((e) => `<file_path>${e.filePath}</file_path>\n<patch>${e.patch}</patch>`).join("\n")}
</other_file_evidence>`

    const response = await this.callOpenAIWithRetry([
      {
        role: "system",
        content: [
          {
            type: "text" as const,
            text: systemPrompt,
            // @ts-expect-error - cache_control is not a valid property of ChatCompletionContentPartText
            cache_control: { type: "ephemeral" },
          },
        ],
      },
      {
        role: "user",
        content: userPrompt,
      },
    ])

    if (!isToolResponseType(response)) {
      throw new Error("Validation response is not a tool response")
    }

    const toolCall = response.toolCalls[0]
    const validationResult = JSON.parse(toolCall.function.arguments)
    const isValid = validationResult.valid
    const quickSuggestion = validationResult?.quickSuggestion ?? undefined
    const promptSuggestion = validationResult?.promptSuggestion || []

    // Validate quick suggestion if provided
    const validQuickSuggestion =
      quickSuggestion &&
      this.isQuickSuggestionValid(quickSuggestion, violation, evidence, fileChange, isValid)
        ? quickSuggestion
        : undefined

    this.logger.debug(
      {
        filename: fileChange.filename,
        rule: violation.rule.name,
        description: violation.description,
        isValid,
        reasoning: validationResult.reasoning,
        hasQuickSuggestion: !!validQuickSuggestion,
        hasPromptSuggestion: !!promptSuggestion,
      },
      "Violation validation result"
    )

    const findSuggestion = promptSuggestion?.find(
      (s: PromptSuggestion) => s.fileName === fileChange.filename
    )

    const suggestionToUse =
      validQuickSuggestion &&
      this.isQuickSuggestionValid(
        validationResult.quickSuggestion,
        violation,
        [],
        fileChange,
        validationResult.isValid
      )
        ? "quickSuggestion"
        : promptSuggestion &&
            validationResult.promptSuggestion &&
            validationResult.promptSuggestion.length > 0 &&
            findSuggestion
          ? "promptSuggestion"
          : "none"

    return {
      isValid,
      reasoning: validationResult.reasoning,
      cost: response.usage.cost,
      quickSuggestion: validQuickSuggestion,
      promptSuggestion,
      suggestionToUse,
    }
  }

  // Validate quick suggestion
  private isQuickSuggestionValid(
    suggestion: QuickSuggestion,
    violation: Violation,
    evidence: Evidence[],
    fileChange: FileChange,
    isViolationValid: boolean
  ): boolean {
    if (!suggestion.codeBlock || suggestion.codeBlock.trim() === "") {
      return false
    }

    // If the violation itself is not valid, the suggestion should not be valid either
    if (!isViolationValid) {
      return false
    }
    // If there is evidence, the suggestion should not be valid either
    if (evidence.length > 0) {
      return false
    }

    // Check that lineStart and lineEnd are positive numbers
    if (suggestion.lineStart <= 0 || suggestion.lineEnd <= 0) {
      return false
    }

    // Check that lineStart <= lineEnd
    if (suggestion.lineStart > suggestion.lineEnd) {
      return false
    }

    // Check that the suggestion's fileName matches the file being analyzed
    if (suggestion.fileName !== fileChange.filename) {
      return false
    }

    // Check that the suggestion's line range is strictly within the violation's line range
    const violationStart = violation.line.start
    const violationEnd = violation.line.end
    const suggestionStart = suggestion.lineStart
    const suggestionEnd = suggestion.lineEnd

    // Suggestion must be completely within the violation range
    if (suggestionStart < violationStart || suggestionEnd > violationEnd) {
      return false
    }

    // Skip suggestions that are longer than 30 lines
    const suggestionLineCount = suggestionEnd - suggestionStart + 1
    if (suggestionLineCount > 20) {
      return false
    }

    return true
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
                description:
                  "Report the final validation result with confidence and reasoning after analyzing the violation",
                parameters: {
                  type: "object",
                  properties: {
                    valid: {
                      type: "boolean",
                      description:
                        "Whether the violation is valid: true if the violation is valid and should be reported, false if the violation is invalid and should be dismissed",
                    },
                    confidence: {
                      type: "number",
                      minimum: 0,
                      maximum: 1,
                      description: "How confident the decision is, score between 0 and 1",
                    },
                    reasoning: {
                      type: "string",
                      description:
                        "Structured explanation following the required format: Factuality Check, Relevancy Check, Resolution Check, and Final Decision that matches the boolean decision",
                    },
                    quickSuggestion: {
                      type: "object",
                      description:
                        "Optional quick code suggestion to fix the violation. Only provide if the violation is valid and a simple fix can be suggested within the current file context.",
                      properties: {
                        lineStart: {
                          type: "number",
                          description: "Starting line number for the suggestion",
                        },
                        lineEnd: {
                          type: "number",
                          description: "Ending line number for the suggestion",
                        },
                        side: {
                          type: "string",
                          enum: ["right", "left"],
                          description: "Which side of the diff the suggestion applies to",
                        },
                        codeBlock: {
                          type: "string",
                          description: "The suggested code block that would fix the violation",
                        },
                        fileName: {
                          type: "string",
                          description: "The file name where the suggestion applies",
                        },
                      },
                      required: ["lineStart", "lineEnd", "side", "codeBlock", "fileName"],
                      additionalProperties: false,
                    },
                    promptSuggestion: {
                      type: "array",
                      description:
                        "Optional array of structured prompt suggestions for AI to fix the violation. Can span multiple files and provides copy-paste ready instructions.",
                      items: {
                        type: "object",
                        properties: {
                          fileName: {
                            type: "string",
                            description: "The file name where the fix should be applied",
                          },
                          lineStart: {
                            type: "number",
                            description: "Starting line number for the fix",
                          },
                          lineEnd: {
                            type: "number",
                            description: "Ending line number for the fix",
                          },
                          instructions: {
                            type: "string",
                            description:
                              "Clear instructions for an AI to fix this violation - ready to copy and paste",
                          },
                        },
                        required: ["fileName", "lineStart", "lineEnd", "instructions"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["valid", "confidence", "reasoning"],
                  additionalProperties: false,
                },
              },
            },
          ],
          model: this.model,
          toolChoice: { type: "function", function: { name: "report_validation" } },
          temperature: 0.1,
          maxTokens: 8000,
        })
      },
      {
        retries: 10,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 30000,
        randomize: true, // Add jitter to prevent thundering herd
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
