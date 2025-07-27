import { readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

import chalk from "chalk"
import latestVersion from "latest-version"
// @ts-expect-error no types
import semver from "semver"

/**
 * Gets the version from package.json
 */
export function getLocalVersion(): string {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = dirname(__filename)

  // Path to package.json relative to this file
  const packageJsonPath = join(__dirname, "..", "package.json")

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"))
  return packageJson.version
}

export async function checkForUpdates() {
  const currentVersion = getLocalVersion()
  const latestCliVersion = await latestVersion("@wispbit/cli")

  if (semver.gt(latestCliVersion, currentVersion)) {
    console.log(chalk.yellow(`A new version of wispbit is available: ${latestCliVersion}`))
  }
}
