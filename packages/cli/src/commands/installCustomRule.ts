import { getRuleFromFile } from "@wispbit/sdk/codebaseRules"
import chalk from "chalk"

import { installRule } from "@wispbit/cli/install"

export async function installCustomRule(ruleName: string) {
  if (!ruleName) {
    console.log(chalk.red("Rule name is required"))
    process.exit(1)
  }

  const response = await fetch(`https://wispbit.com/api/rules/${ruleName}/text`)

  if (!response.ok) {
    throw new Error(`Failed to fetch rule: ${response.statusText}`)
  }

  const data = await response.text()

  const fullRule = getRuleFromFile(ruleName, data)

  await installRule(fullRule)

  console.log(chalk.green(`Rule ${ruleName} installed. Thank you for using wispbit!`))
}
