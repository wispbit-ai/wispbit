import path, { dirname } from "path"
import { fileURLToPath } from "url"

import { getRuleFromFile, getRulesFromRoot } from "@wispbit/sdk/codebaseRules"
import { CodebaseRule } from "@wispbit/sdk/types"
import fs from "fs-extra"

import { installRule } from "@wispbit/cli/install"

import { findGitRoot } from "../git"

// all available rule categories
const RuleCategoryConfigurations = [
  {
    language: "python",
    displayName: "Python",
  },
  {
    language: "typescript",
    displayName: "TypeScript",
  },
]

export interface DefaultRuleCategory {
  language: string
  displayName: string
  rules: CodebaseRule[]
}

/**
 * Load rules from a directory
 */
async function loadRulesFromDirectory(dirPath: string): Promise<CodebaseRule[]> {
  const rules: CodebaseRule[] = []

  try {
    const files = await fs.readdir(dirPath)

    for (const file of files) {
      if (file.endsWith(".md")) {
        const filePath = path.join(dirPath, file)
        const content = await fs.readFile(filePath, "utf-8")
        const rule = getRuleFromFile(filePath, content)
        const fileName = path.basename(filePath)
        rule.name = fileName
        rules.push(rule)
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
    console.warn(`Could not load rules from ${dirPath}`)
  }

  return rules
}

/**
 * Load all default rule categories from directories
 */
export async function loadDefaultRules(): Promise<DefaultRuleCategory[]> {
  const categories: DefaultRuleCategory[] = []

  const __filename = fileURLToPath(import.meta.url)
  const __dirname = dirname(__filename)
  const rulesDir = path.join(__dirname, "rules")

  for (const category of RuleCategoryConfigurations) {
    const rules = await loadRulesFromDirectory(path.join(rulesDir, category.language))
    if (rules.length > 0) {
      categories.push({ ...category, rules })
    }
  }

  return categories
}

/**
 * Install all rules from a category to the .wispbit/rules directory
 * @param category The category containing the rules to install
 * @returns Promise that resolves when installation is complete
 */
export async function installCategoryRules(category: DefaultRuleCategory): Promise<void> {
  for (const rule of category.rules) {
    await installRule(rule)
  }
}

export async function hasRulesInstalled(): Promise<boolean> {
  const gitRoot = await findGitRoot()
  const rules = await getRulesFromRoot(gitRoot)
  return rules.length > 0
}
