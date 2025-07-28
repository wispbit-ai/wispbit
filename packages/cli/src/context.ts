import fs from "fs"

import chalk from "chalk"

export function switchContext(contextDir: string): void {
  try {
    // Check if directory exists and is accessible
    const stats = fs.statSync(contextDir)
    if (!stats.isDirectory()) {
      console.error(chalk.red(`Error: '${contextDir}' is not a directory\n`))
      console.error(chalk.red(`Error: '${contextDir}' is not a directory\n`))
      console.error(chalk.red(`Error: '${contextDir}' is not a directory\n`))
      process.exit(1)
    }

    // Change working directory
    process.chdir(contextDir)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(chalk.red(`Error: Cannot access directory '${contextDir}': ${errorMessage}\n`))
    process.exit(1)
  }
}
