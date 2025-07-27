import path from "path"

import { createRuleFile } from "@wispbit/sdk/codebaseRules"
import { CodebaseRule } from "@wispbit/sdk/types"
import fs from "fs-extra"

import { findGitRoot } from "@wispbit/cli/git"

export async function installRule(rule: CodebaseRule): Promise<void> {
  // Find git root
  const gitRoot = await findGitRoot()
  const rulesDir = path.join(gitRoot, ".wispbit", "rules")

  // Ensure rules directory exists
  await fs.ensureDir(rulesDir)

  const filePath = path.join(rulesDir, rule.name)
  const fileContent = createRuleFile(rule)
  await fs.writeFile(filePath, fileContent, "utf-8")
}
