import chalk from "chalk"

import { saveProvider, saveProviderApiKey } from "@wispbit/cli/config"
import { promptForProvider } from "@wispbit/cli/ui/providerPrompt"

/**
 * Handle the "config provider" command
 */
export async function configProviderCommand(): Promise<boolean> {
  try {
    console.log(chalk.blue("Let's configure your code review provider.\n"))

    const result = await promptForProvider()

    if (!result) {
      console.log(chalk.yellow("Configuration cancelled."))
      return false
    }

    // Save the provider and API key to config
    saveProvider(result.provider)
    saveProviderApiKey(result.provider, result.apiKey)

    console.log(chalk.green(`✓ ${result.provider} API key saved`))

    return true
  } catch (error) {
    console.error(chalk.red("Error configuring provider:"), error)
    return false
  }
}
