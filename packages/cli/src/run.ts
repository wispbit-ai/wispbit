import { context as githubContext } from "@actions/github"
import { CLAUDE_4_SONNET } from "@wispbit/sdk/models"
import chalk from "chalk"
import dotenv from "dotenv"
import meow from "meow"

import { runCodeReviewCi } from "@wispbit/cli/commands/codeReviewCi"
import { runCodeReviewInteractive } from "@wispbit/cli/commands/codeReviewInteractive"
import { configProviderCommand } from "@wispbit/cli/commands/configProvider"
import { hasRulesInstalled } from "@wispbit/cli/commands/installCategoryRules"
import { installCustomRule } from "@wispbit/cli/commands/installCustomRule"
import { startServer } from "@wispbit/cli/commands/mcp"
import { getProvider, getProviderApiKey, getProviderById } from "@wispbit/cli/config"
import { switchContext } from "@wispbit/cli/context"
import { purgeCache, setCustomCacheDir } from "@wispbit/cli/db"
import { CiOptions, CodeReviewOptions } from "@wispbit/cli/types"
import { promptForRuleInstall } from "@wispbit/cli/ui/ruleInstallPrompt"
import { checkForUpdates, getLocalVersion } from "@wispbit/cli/version"

if (process.env.NODE_ENV !== "production") dotenv.config()

const cli = meow(
  `
Build your own AI code reviewer with wispbit
https://wispbit.com/

Usage:
  $ wispbit review [review-options]
  $ wispbit mcp [mcp-options]

Commands:
  review                             Run a code review.
  mcp                                Run the MCP server. This will error out if you didn't configure the provider first.
  configure                          Configure the code reviewer.
  rule install default               Install default rules for the code review.
  rule install [rule-name]           Install a custom rule found in https://wispbit.com/rules.
  cache purge                        Clear all cached review data.

Options for review:
  -c, --context <directory>          Set working directory context (default: current directory)
  -r, --rules <directory>            Set custom rules directory (default: checks for .wispbit/rules in each directory and root)
  -m, --model <model>                Set custom model for the code review (default: ${CLAUDE_4_SONNET})
  -p, --provider <provider>          Change the provider for the code review (default: openrouter; options: openrouter, anthropic)
  --provider-url <url>               Set a custom OpenAI-compatible model provider URL for the code review. Overrides provider flag.
  --openrouter-api-key <key>         Set a custom API key for the OpenRouter provider (env: OPENROUTER_API_KEY)
  --anthropic-api-key <key>          Set a custom API key for the Anthropic provider (env: ANTHROPIC_API_KEY)
  --base                             Set a base branch or commit to compare against (default: repository's default branch, such as origin/main or origin/master)
  --ci                               Runs in CI mode - will attempt to call the provider's API to make comments on the pull request when violations are found.
  --ci-provider <provider>            Set the provider for the CI mode (default: none; options: github, none)
                                       Will auto-detect if it's in github actions.
  --cache-dir <directory>              Set custom cache directory for storing cached review data (default: ~/.wispbit). Useful if you want to set up custom caching between runs in CI.
  --debug                            Enable debug logging for code review (prints more info)

Options for mcp:
  --transport <stdio|http|sse>       Set the transport for the MCP server (default: stdio)
  --port <port>                      Set the port for the HTTP/SSE transport (default: 3000)
  --debug                            Enable debug logging for the MCP server

Options for github CI provider (by default, will auto-detect if it's in github actions):
  --github-token <token>              Set a custom GitHub token for the CI mode (env: GITHUB_TOKEN)
  --github-repository <repo>         Set a custom GitHub repository for the CI mode. Should be in format <owner>/<repo> (env: GITHUB_REPOSITORY)
  --github-pull-request-number <number>  Set a custom GitHub pull request number for the CI mode (env: GITHUB_PULL_REQUEST_NUMBER)

Global options:
  -v, --version                      Show version number
  -h, --help                         Show help
`,
  {
    importMeta: import.meta,
    flags: {
      // Review options
      context: {
        type: "string",
        shortFlag: "c",
      },
      rules: {
        type: "string",
        shortFlag: "r",
      },
      model: {
        type: "string",
        shortFlag: "m",
      },
      provider: {
        type: "string",
        shortFlag: "p",
      },
      providerUrl: {
        type: "string",
      },
      openrouterApiKey: {
        type: "string",
      },
      anthropicApiKey: {
        type: "string",
      },
      cacheDir: {
        type: "string",
      },
      ci: {
        type: "boolean",
        default: false,
      },
      ciProvider: {
        type: "string",
      },
      debug: {
        type: "boolean",
        default: false,
      },
      base: {
        type: "string",
      },

      // MCP options
      transport: {
        type: "string",
      },
      port: {
        type: "string",
      },

      // Github CI options
      githubToken: {
        type: "string",
      },
      githubPullRequestNumber: {
        type: "string",
      },
      githubRepository: {
        type: "string",
      },

      // Global options
      version: {
        type: "boolean",
        shortFlag: "v",
      },
      help: {
        type: "boolean",
        shortFlag: "h",
      },
    },
    version: getLocalVersion(),
  }
)

const constructCodeReviewOptions = (): CodeReviewOptions => {
  let provider = cli.flags.provider ? getProviderById(cli.flags.provider) : getProvider()

  if (!provider) {
    if (process.env.ANTHROPIC_API_KEY) {
      provider = getProviderById("anthropic")
    } else if (process.env.OPENROUTER_API_KEY) {
      provider = getProviderById("openrouter")
    }
  }

  const apiKey = provider ? getProviderApiKey(provider.id) : null

  const endpoint = cli.flags.providerUrl ?? provider?.endpoint
  const model = cli.flags.model ?? provider?.defaultModel

  if (!endpoint && !model) {
    throw new Error(
      "Provider configuration is required to run code review. Run `wispbit configure` to configure your provider, or pass in a model and endpoint with the --model and --provider-url flags."
    )
  }

  return {
    customRulesDir: cli.flags.rules ?? undefined,
    endpoint: endpoint!,
    model: model!,
    debug: cli.flags.debug || false,
    apiKey: cli.flags.openrouterApiKey ?? cli.flags.anthropicApiKey ?? apiKey ?? "",
    base:
      cli.flags.base ??
      (cli.flags.ciProvider === "github"
        ? process.env.GITHUB_SHA ?? githubContext?.payload?.pull_request?.base.sha
        : undefined),
  }
}

const constructCiOptions = (): CiOptions => {
  if (githubContext.payload?.pull_request?.base.sha || cli.flags.ciProvider === "github") {
    return {
      ciProvider: "github",
      githubToken: cli.flags.githubToken ?? process.env.GITHUB_TOKEN ?? "",
      githubRepository:
        cli.flags.githubRepository ?? process.env.GITHUB_REPOSITORY ?? githubContext.repo.repo,
      githubPullRequestNumber:
        cli.flags.githubPullRequestNumber ??
        process.env.GITHUB_PULL_REQUEST_NUMBER ??
        githubContext.payload.pull_request?.number?.toString() ??
        undefined,
    }
  }

  return {
    ciProvider: "none",
  }
}

/**
 * Main function to orchestrate the workflow
 */
async function main() {
  try {
    if (cli.flags.context) switchContext(cli.flags.context)

    // Set custom cache directory if provided
    if (cli.flags.cacheDir) setCustomCacheDir(cli.flags.cacheDir)

    await checkForUpdates()

    // Check the command first to handle commands that don't need API key validation
    const command = cli.input[0]
    const subcommand = cli.input[1]

    switch (command) {
      case "rule": {
        if (subcommand === "install") {
          const target = cli.input[2]
          if (target === "default") {
            await promptForRuleInstall()
            console.log(chalk.green("See more rules at https://wispbit.com/rules"))
          } else {
            await installCustomRule(target)
          }
        }
        break
      }
      case "configure": {
        const success = await configProviderCommand()
        if (!success) {
          console.log(chalk.red("Provider configuration is required to run code review."))
          process.exit(1)
        }

        const hasRules = await hasRulesInstalled()
        if (!hasRules) {
          await promptForRuleInstall()
        }

        console.log(
          chalk.green(
            "Thanks for configuring your code reviewer! See more rules at https://wispbit.com/rules"
          )
        )

        break
      }

      case "mcp": {
        const port = cli.flags.port ? parseInt(cli.flags.port) : 3000
        const transport = cli.flags.transport as "stdio" | "http" | "sse"

        startServer(port, transport, constructCodeReviewOptions())

        break
      }

      case "review": {
        if (cli.flags.ci) {
          runCodeReviewCi(constructCodeReviewOptions(), constructCiOptions())
        } else {
          runCodeReviewInteractive(constructCodeReviewOptions())
        }

        break
      }

      case "cache": {
        if (subcommand === "purge") {
          await purgeCache()
          console.log(chalk.green("wispbit cache purged"))
        }
        break
      }

      default:
        cli.showHelp()
        process.exit(1)
    }
  } catch (error) {
    console.error(chalk.red("Error:"), error)
    process.exit(1)
  }
}

// Execute the main function
main()
