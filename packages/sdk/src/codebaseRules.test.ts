import os from "os"
import path from "path"

import fs from "fs-extra"
import { describe, it, expect, beforeEach, afterEach } from "vitest"

import { matchesInclude, getRulesFromRoot, newRule } from "@wispbit/sdk-ts/codebaseRules"

describe("Codebase Rules", () => {
  describe("newRule", () => {
    it("should remove heading lines that start with #, ##, or ###", () => {
      // Test removing # heading
      const ruleWithH1 = newRule({
        name: "test-rule",
        contents: "# Main Heading\n\nThis is the actual content that should remain.",
        include: "*.ts",
      })
      expect(ruleWithH1.contents).toBe("This is the actual content that should remain.")

      // Test removing ## heading
      const ruleWithH2 = newRule({
        name: "test-rule",
        contents: "## Section Heading\n\nThis is the actual content that should remain.",
        include: "*.ts",
      })
      expect(ruleWithH2.contents).toBe("This is the actual content that should remain.")

      // Test removing ### heading
      const ruleWithH3 = newRule({
        name: "test-rule",
        contents: "### Subsection Heading\n\nThis is the actual content that should remain.",
        include: "*.ts",
      })
      expect(ruleWithH3.contents).toBe("This is the actual content that should remain.")

      // Test with empty lines before heading
      const ruleWithEmptyLines = newRule({
        name: "test-rule",
        contents: "\n\n# Main Heading\n\nThis is the actual content that should remain.",
        include: "*.ts",
      })
      expect(ruleWithEmptyLines.contents).toBe("This is the actual content that should remain.")

      // Test that #### (4 hashes) is NOT removed
      const ruleWithH4 = newRule({
        name: "test-rule",
        contents: "#### This should remain\n\nThis is the actual content.",
        include: "*.ts",
      })
      expect(ruleWithH4.contents).toBe("#### This should remain\n\nThis is the actual content.")

      // Test that content without heading remains unchanged
      const ruleWithoutHeading = newRule({
        name: "test-rule",
        contents: "This is regular content without a heading.",
        include: "*.ts",
      })
      expect(ruleWithoutHeading.contents).toBe("This is regular content without a heading.")
    })

    it("should strip out checkmark and X emojis from the content", () => {
      // Test checkmark and X emojis specifically
      const ruleWithCheckmarks = newRule({
        name: "test-rule",
        contents: "Task completed ✅ but this failed ❌ and this one too ❎.",
        include: "*.ts",
      })
      expect(ruleWithCheckmarks.contents).toBe(
        "Task completed  but this failed  and this one too ."
      )

      // Test mixed content with heading and checkmark emojis
      const ruleWithHeadingAndEmojis = newRule({
        name: "test-rule",
        contents: "# Task Status ✓\n\nThis task is done ✅ but that one failed ❌.",
        include: "*.ts",
      })
      expect(ruleWithHeadingAndEmojis.contents).toBe("This task is done  but that one failed .")

      // Test that other emojis are NOT removed
      const ruleWithOtherEmojis = newRule({
        name: "test-rule",
        contents: "This has other emojis 😀 🎉 🚀 that should remain.",
        include: "*.ts",
      })
      expect(ruleWithOtherEmojis.contents).toBe(
        "This has other emojis 😀 🎉 🚀 that should remain."
      )

      // Test content without target emojis remains unchanged
      const ruleWithoutTargetEmojis = newRule({
        name: "test-rule",
        contents: "This is regular content without checkmarks or X marks.",
        include: "*.ts",
      })
      expect(ruleWithoutTargetEmojis.contents).toBe(
        "This is regular content without checkmarks or X marks."
      )
    })
  })

  describe("matchesInclude", () => {
    it("should match all files when no include patterns are specified", () => {
      const rule = { id: "1234", name: "test", directory: "", contents: "", include: [] }
      expect(matchesInclude(rule, "any/file/path.py")).toBe(true)
      expect(matchesInclude(rule, "another/file.txt")).toBe(true)
      expect(matchesInclude(rule, path.join("some", "path", "file.json"))).toBe(true)
    })

    it("should match files correctly with a single pattern", () => {
      const rule = { id: "1234", name: "test", directory: "", contents: "", include: ["*.py"] }

      // Should match Python files
      expect(matchesInclude(rule, "file.py")).toBe(true)
      expect(matchesInclude(rule, "path/to/file.py")).toBe(true)
      expect(matchesInclude(rule, path.join("file.py"))).toBe(true)
      expect(matchesInclude(rule, path.join("path", "to", "file.py"))).toBe(true)

      // Should not match non-Python files
      expect(matchesInclude(rule, "file.txt")).toBe(false)
      expect(matchesInclude(rule, "path/to/file.txt")).toBe(false)
      expect(matchesInclude(rule, path.join("file.txt"))).toBe(false)
    })

    it("should match files correctly with multiple patterns", () => {
      const rule = {
        id: "1234",
        name: "test",
        directory: "",
        contents: "",
        include: ["*.py", "*.js", "*.ts"],
      }

      // Should match supported file types
      expect(matchesInclude(rule, "file.py")).toBe(true)
      expect(matchesInclude(rule, "script.js")).toBe(true)
      expect(matchesInclude(rule, "component.ts")).toBe(true)

      // Should not match unsupported file types
      expect(matchesInclude(rule, "file.txt")).toBe(false)
      expect(matchesInclude(rule, "document.md")).toBe(false)
    })

    it("should match files correctly with directory patterns", () => {
      const rule = {
        id: "1234",
        name: "test",
        directory: "",
        contents: "",
        include: ["src/*.py", "tests/*.py"],
      }

      // Should match Python files in specified directories
      expect(matchesInclude(rule, "src/file.py")).toBe(true)
      expect(matchesInclude(rule, "tests/test_file.py")).toBe(true)

      // Should not match Python files in other directories
      expect(matchesInclude(rule, "other/file.py")).toBe(false)

      // Should not match non-Python files in specified directories
      expect(matchesInclude(rule, "src/file.js")).toBe(false)
    })

    it("should match files correctly with complex patterns", () => {
      const rule = {
        id: "1234",
        name: "test",
        directory: "",
        contents: "",
        include: ["**/*.py", "config/*.json"],
      }

      // Test **/*.py pattern
      expect(matchesInclude(rule, "file.py")).toBe(true) // Root level
      expect(matchesInclude(rule, "src/file.py")).toBe(true) // One level deep
      expect(matchesInclude(rule, "src/deep/path/file.py")).toBe(true) // Multiple levels deep

      // Test config/*.json pattern
      expect(matchesInclude(rule, "config/settings.json")).toBe(true) // In config directory
      expect(matchesInclude(rule, "other/settings.json")).toBe(false) // Outside config directory
    })

    it("should work with path objects", () => {
      const rule = { id: "1234", name: "test", directory: "", contents: "", include: ["*.py"] }

      // Should work with path objects
      expect(matchesInclude(rule, path.join("file.py"))).toBe(true)
      expect(matchesInclude(rule, path.join("path", "to", "file.py"))).toBe(true)
      expect(matchesInclude(rule, path.join("file.txt"))).toBe(false)
    })

    it("should handle brace expansion patterns correctly", () => {
      const rule = {
        id: "1234",
        name: "test",
        directory: "",
        contents: "",
        include: ["app/javascript/**/*.{js,vue}"],
      }

      // Should match JavaScript files
      expect(matchesInclude(rule, "app/javascript/file.js")).toBe(true)
      expect(matchesInclude(rule, "app/javascript/components/Component.js")).toBe(true)
      expect(matchesInclude(rule, "app/javascript/deep/nested/path/script.js")).toBe(true)

      // Should match Vue files
      expect(matchesInclude(rule, "app/javascript/file.vue")).toBe(true)
      expect(matchesInclude(rule, "app/javascript/components/Component.vue")).toBe(true)
      expect(matchesInclude(rule, "app/javascript/deep/nested/path/component.vue")).toBe(true)

      // Should not match other file types in the same directory
      expect(matchesInclude(rule, "app/javascript/file.ts")).toBe(false)
      expect(matchesInclude(rule, "app/javascript/file.css")).toBe(false)

      // Should not match files outside the app/javascript directory
      expect(matchesInclude(rule, "other/path/file.js")).toBe(false)
      expect(matchesInclude(rule, "other/path/file.vue")).toBe(false)
    })

    it("should handle exclude patterns with ! prefix correctly", () => {
      const rule = {
        id: "1234",
        name: "test",
        directory: "",
        contents: "",
        include: ["**/*.js", "!**/node_modules/**", "!**/*.test.js"],
      }

      // Should match JavaScript files
      expect(matchesInclude(rule, "src/file.js")).toBe(true)
      expect(matchesInclude(rule, "components/Component.js")).toBe(true)
      expect(matchesInclude(rule, "deep/nested/path/script.js")).toBe(true)

      // Should not match files in node_modules (excluded)
      expect(matchesInclude(rule, "node_modules/package/file.js")).toBe(false)
      expect(matchesInclude(rule, "src/node_modules/file.js")).toBe(false)
      expect(matchesInclude(rule, "deep/path/node_modules/script.js")).toBe(false)

      // Should not match test files (excluded)
      expect(matchesInclude(rule, "src/file.test.js")).toBe(false)
      expect(matchesInclude(rule, "components/Component.test.js")).toBe(false)
      expect(matchesInclude(rule, "deep/nested/path/script.test.js")).toBe(false)

      // Should not match non-JavaScript files
      expect(matchesInclude(rule, "src/file.py")).toBe(false)
      expect(matchesInclude(rule, "components/Component.css")).toBe(false)
    })

    it("should handle mixed include and exclude patterns", () => {
      const rule = {
        id: "1234",
        name: "test",
        directory: "",
        contents: "",
        include: ["src/**/*.{js,ts}", "!src/**/*.test.{js,ts}", "!src/legacy/**"],
      }

      // Should match JavaScript and TypeScript files in src
      expect(matchesInclude(rule, "src/file.js")).toBe(true)
      expect(matchesInclude(rule, "src/file.ts")).toBe(true)
      expect(matchesInclude(rule, "src/components/Component.js")).toBe(true)
      expect(matchesInclude(rule, "src/components/Component.ts")).toBe(true)

      // Should not match test files (excluded)
      expect(matchesInclude(rule, "src/file.test.js")).toBe(false)
      expect(matchesInclude(rule, "src/file.test.ts")).toBe(false)
      expect(matchesInclude(rule, "src/components/Component.test.js")).toBe(false)

      // Should not match files in legacy directory (excluded)
      expect(matchesInclude(rule, "src/legacy/old-file.js")).toBe(false)
      expect(matchesInclude(rule, "src/legacy/components/OldComponent.ts")).toBe(false)

      // Should not match files outside src directory
      expect(matchesInclude(rule, "lib/file.js")).toBe(false)
      expect(matchesInclude(rule, "tests/file.ts")).toBe(false)
    })

    it("should handle exclude-only patterns", () => {
      const rule = {
        id: "1234",
        name: "test",
        directory: "",
        contents: "",
        include: ["!**/node_modules/**", "!**/*.log"],
      }

      // When only exclude patterns are specified, should match all files except excluded ones
      expect(matchesInclude(rule, "src/file.js")).toBe(true)
      expect(matchesInclude(rule, "components/Component.ts")).toBe(true)
      expect(matchesInclude(rule, "config/settings.json")).toBe(true)

      // Should not match excluded patterns
      expect(matchesInclude(rule, "node_modules/package/file.js")).toBe(false)
      expect(matchesInclude(rule, "src/node_modules/file.js")).toBe(false)
      expect(matchesInclude(rule, "debug.log")).toBe(false)
      expect(matchesInclude(rule, "logs/error.log")).toBe(false)
    })

    it("should match files correctly with directory field", () => {
      const rule = {
        id: "1234",
        name: "test",
        directory: "src/components",
        contents: "",
        include: ["*.tsx", "*.ts"],
      }

      // Should match files within the directory
      expect(matchesInclude(rule, "src/components/Button.tsx")).toBe(true)
      expect(matchesInclude(rule, "src/components/types.ts")).toBe(true)

      // Should not match files outside the directory
      expect(matchesInclude(rule, "src/utils/helper.ts")).toBe(false)
      expect(matchesInclude(rule, "components/Button.tsx")).toBe(false)
      expect(matchesInclude(rule, "Button.tsx")).toBe(false)

      // Should not match wrong file types within the directory
      expect(matchesInclude(rule, "src/components/Button.css")).toBe(false)

      // Should not match subdirectories with single * pattern
      expect(matchesInclude(rule, "src/components/utils/helper.ts")).toBe(false)
    })

    it("should match files correctly with nested directory field", () => {
      const rule = {
        id: "1234",
        name: "test",
        directory: "packages/shared/src",
        contents: "",
        include: ["**/*.ts", "!**/*.test.ts"],
      }

      // Should match TypeScript files within the directory
      expect(matchesInclude(rule, "packages/shared/src/index.ts")).toBe(true)
      expect(matchesInclude(rule, "packages/shared/src/utils/helper.ts")).toBe(true)
      expect(matchesInclude(rule, "packages/shared/src/components/Button.ts")).toBe(true)

      // Should not match test files (excluded)
      expect(matchesInclude(rule, "packages/shared/src/index.test.ts")).toBe(false)
      expect(matchesInclude(rule, "packages/shared/src/utils/helper.test.ts")).toBe(false)

      // Should not match files outside the directory
      expect(matchesInclude(rule, "packages/other/src/index.ts")).toBe(false)
      expect(matchesInclude(rule, "src/index.ts")).toBe(false)
      expect(matchesInclude(rule, "index.ts")).toBe(false)
    })

    it("should work with empty directory field", () => {
      const rule = {
        id: "1234",
        name: "test",
        directory: "",
        contents: "",
        include: ["*.py"],
      }

      // Should match files anywhere when directory is empty
      expect(matchesInclude(rule, "file.py")).toBe(true)
      expect(matchesInclude(rule, "src/file.py")).toBe(true)
      expect(matchesInclude(rule, "deep/nested/path/file.py")).toBe(true)
    })

    it("should work with dot directory field", () => {
      const rule = {
        id: "1234",
        name: "test",
        directory: ".",
        contents: "",
        include: ["*.md"],
      }

      // Should match files anywhere when directory is "."
      expect(matchesInclude(rule, "README.md")).toBe(true)
      expect(matchesInclude(rule, "docs/guide.md")).toBe(true)
      expect(matchesInclude(rule, "src/docs/api.md")).toBe(true)
    })

    it("should handle exclude patterns correctly with directory field", () => {
      const rule = {
        id: "1234",
        name: "test",
        directory: "src",
        contents: "",
        include: ["**/*.js", "!**/*.test.js", "!**/node_modules/**"],
      }

      // Should match JavaScript files within the directory
      expect(matchesInclude(rule, "src/index.js")).toBe(true)
      expect(matchesInclude(rule, "src/components/Button.js")).toBe(true)
      expect(matchesInclude(rule, "src/utils/helper.js")).toBe(true)

      // Should not match test files (excluded)
      expect(matchesInclude(rule, "src/index.test.js")).toBe(false)
      expect(matchesInclude(rule, "src/components/Button.test.js")).toBe(false)
      expect(matchesInclude(rule, "src/utils/helper.test.js")).toBe(false)

      // Should not match files in node_modules (excluded)
      expect(matchesInclude(rule, "src/node_modules/package/file.js")).toBe(false)

      // Should not match files outside the directory
      expect(matchesInclude(rule, "lib/index.js")).toBe(false)
      expect(matchesInclude(rule, "index.js")).toBe(false)
    })
  })

  describe("getRulesFromRoot", () => {
    let tempDir: string

    beforeEach(async () => {
      // Create a temporary directory for testing
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wispbit-test-"))
    })

    afterEach(async () => {
      // Clean up the temporary directory
      await fs.remove(tempDir)
    })

    it("should find rules in both root and subdirectories", async () => {
      // Create root rule
      const rootRulesDir = path.join(tempDir, ".wispbit", "rules")
      await fs.ensureDir(rootRulesDir)
      await fs.writeFile(
        path.join(rootRulesDir, "global-rule.md"),
        `---
include: *.md
---

Global documentation rule.`
      )

      // Create subdirectory rule
      const backendRulesDir = path.join(tempDir, "services", "api", ".wispbit", "rules")
      await fs.ensureDir(backendRulesDir)
      await fs.writeFile(
        path.join(backendRulesDir, "api-rule.md"),
        `---
include: *.py, *.sql
---

API service rule forrules Python and SQL files.`
      )

      // Create another subdirectory rule
      const sharedRulesDir = path.join(tempDir, "packages", "shared", ".wispbit", "rules")
      await fs.ensureDir(sharedRulesDir)
      await fs.writeFile(
        path.join(sharedRulesDir, "shared-rule.md"),
        `---
include: *.ts
---

Shared TypeScript utilities rule.`
      )

      const rules = await getRulesFromRoot(tempDir)

      expect(rules).toHaveLength(3)

      // Find each rule by name
      const globalRule = rules.find((r) => r.name === "global-rule")
      const apiRule = rules.find((r) => r.name === "api-rule")
      const sharedRule = rules.find((r) => r.name === "shared-rule")

      expect(globalRule).toBeDefined()
      expect(globalRule!.include).toEqual(["*.md"]) // Root rule patterns unchanged
      expect(globalRule!.directory).toBe("") // Root directory

      expect(apiRule).toBeDefined()
      expect(apiRule!.include).toEqual(["*.py", "*.sql"]) // Patterns remain as specified
      expect(apiRule!.directory).toBe("services/api") // Directory field set correctly

      expect(sharedRule).toBeDefined()
      expect(sharedRule!.include).toEqual(["*.ts"]) // Patterns remain as specified
      expect(sharedRule!.directory).toBe("packages/shared") // Directory field set correctly
    })

    it("should handle rules with complex patterns", async () => {
      const subRulesDir = path.join(tempDir, "apps", "web", ".wispbit", "rules")
      await fs.ensureDir(subRulesDir)

      const ruleContent = `---
include: **/*.tsx, src/components/*.ts, tests/**/*.test.js
---

Complex pattern rule for web app.`

      await fs.writeFile(path.join(subRulesDir, "web-rule.md"), ruleContent)

      const rules = await getRulesFromRoot(tempDir)

      expect(rules).toHaveLength(1)
      expect(rules[0].name).toBe("web-rule")
      expect(rules[0].include).toEqual(["**/*.tsx", "src/components/*.ts", "tests/**/*.test.js"]) // Patterns remain as specified
      expect(rules[0].directory).toBe("apps/web") // Directory field set correctly
    })

    it("should correctly parse include patterns from markdown frontmatter", async () => {
      const rulesDir = path.join(tempDir, ".wispbit", "rules")
      await fs.ensureDir(rulesDir)

      // Test various include formats
      const ruleContent = `---
include: app/javascript/**/*.{js,vue}
---

Rule for JavaScript and Vue files with brace expansion.`

      await fs.writeFile(path.join(rulesDir, "js-vue-rule.md"), ruleContent)

      // Test comma-separated patterns
      const multiPatternContent = `---
include: *.py, *.js, config/**/*.json
---

Rule for multiple file types.`

      await fs.writeFile(path.join(rulesDir, "multi-pattern-rule.md"), multiPatternContent)

      const rules = await getRulesFromRoot(tempDir)

      expect(rules).toHaveLength(2)

      // Find each rule by name
      const jsVueRule = rules.find((r) => r.name === "js-vue-rule")
      const multiPatternRule = rules.find((r) => r.name === "multi-pattern-rule")

      // Test brace expansion parsing
      expect(jsVueRule).toBeDefined()
      expect(jsVueRule!.include).toEqual(["app/javascript/**/*.{js,vue}"])

      // Test comma-separated parsing
      expect(multiPatternRule).toBeDefined()
      expect(multiPatternRule!.include).toEqual(["*.py", "*.js", "config/**/*.json"])
    })
  })
})
