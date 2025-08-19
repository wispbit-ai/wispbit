import os from "os"
import path from "path"

import fs from "fs-extra"
import { describe, it, expect, beforeEach, afterEach } from "vitest"

import { grepSearch, listDir, readFile, globSearch } from "@wispbit/sdk/tools"

// Test suite for tools
describe("Tools", () => {
  let testDir: string

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `test_repo_${Math.random().toString(36).substring(2)}`)
    fs.mkdirSync(testDir)
  })

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
  })

  // Helper function to write files with directory creation
  const writeTestFile = (relativePath: string, content: string = "") => {
    const fullPath = path.join(testDir, relativePath)
    const dirPath = path.dirname(fullPath)
    fs.mkdirSync(dirPath, { recursive: true })
    fs.writeFileSync(fullPath, content)
  }

  describe("read_file", () => {
    it("should read the specified range of lines from a file", async () => {
      const fileContent = "Line 1\nLine 2\nLine 3\nLine 4"
      writeTestFile("test.txt", fileContent)

      const result = await readFile(
        {
          target_file: "test.txt",
          start_line_one_indexed: 2,
          end_line_one_indexed_inclusive: 3,
          should_read_entire_file: false,
        },
        testDir
      )

      if ("content" in result) {
        expect(result.content).toBe("[Lines 1-1 omitted]\nLine 2\nLine 3\n[Lines 4-4 omitted]")
      } else {
        throw new Error("Expected content in result")
      }
    })
  })

  describe("grep_search", () => {
    it("should return matches for the given regex pattern", async () => {
      const fileContent = "const a = 1;\nconst b = 2;\nconst c = 3;"
      writeTestFile("test.ts", fileContent)

      const result = await grepSearch(
        {
          query: "const ",
          include_pattern: "*.ts",
          case_sensitive: true,
        },
        "rg",
        testDir
      )

      if ("matches" in result) {
        expect(result.matches).toEqual([
          { file: "test.ts", line_number: 1, content: "const a = 1;" },
          { file: "test.ts", line_number: 2, content: "const b = 2;" },
          { file: "test.ts", line_number: 3, content: "const c = 3;" },
        ])
      } else {
        throw new Error("Expected matches in result")
      }
    })
  })

  describe("list_dir", () => {
    it("should list files and directories in the specified path", async () => {
      const dirPath = path.join(testDir, "testDir")
      fs.mkdirSync(dirPath)
      const files = ["file1.txt", "file2.js"]
      const directories = ["dir1", "dir2"]

      files.forEach((file) => writeTestFile(`testDir/${file}`))
      directories.forEach((dir) => fs.mkdirSync(path.join(dirPath, dir)))

      const result = await listDir(
        {
          relative_workspace_path: "testDir",
        },
        testDir
      )

      if ("files" in result && "directories" in result) {
        expect(result.files).toEqual(files)
        expect(result.directories).toEqual(directories)
      } else {
        throw new Error("Expected files and directories in result")
      }
    })
  })

  describe("glob_search", () => {
    beforeEach(() => {
      // Create test files for glob search tests
      writeTestFile("src/test_example.py", "# Python test file")
      writeTestFile("tests/test_another.py", "# Another Python test file")
      writeTestFile("lib/test_utils.py", "# Python utils test file")
      writeTestFile("app/models.py", "# Regular Python file")

      writeTestFile("src/components/Button.test.ts", "// TypeScript test file")
      writeTestFile("src/utils/helpers.test.js", "// JavaScript test file")
      writeTestFile("tests/integration/api.test.tsx", "// React test file")
      writeTestFile("src/components/Button.ts", "// Regular TypeScript file")
      writeTestFile("src/index.js", "// Regular JavaScript file")
    })

    it("should find Python test files with pattern **/test*.py", async () => {
      const result = await globSearch(
        {
          pattern: "**/test*.py",
        },
        testDir
      )

      if ("files" in result) {
        expect(result.files).toHaveLength(3)
        expect(result.files).toEqual(
          expect.arrayContaining([
            expect.stringContaining("test_example.py"),
            expect.stringContaining("test_another.py"),
            expect.stringContaining("test_utils.py"),
          ])
        )
        // Should not include regular Python files
        expect(result.files.every((file) => file.includes("test"))).toBe(true)
      } else {
        throw new Error("Expected files in result")
      }
    })

    it("should find test files with pattern **/*.test.*", async () => {
      const result = await globSearch(
        {
          pattern: "**/*.test.*",
        },
        testDir
      )

      if ("files" in result) {
        expect(result.files).toHaveLength(3)
        expect(result.files).toEqual(
          expect.arrayContaining([
            expect.stringContaining("Button.test.ts"),
            expect.stringContaining("helpers.test.js"),
            expect.stringContaining("api.test.tsx"),
          ])
        )
        // Should not include regular files or Python test files
        expect(result.files.every((file) => file.includes(".test."))).toBe(true)
      } else {
        throw new Error("Expected files in result")
      }
    })

    it("should return empty array when no files match pattern", async () => {
      const result = await globSearch(
        {
          pattern: "**/*.nonexistent",
        },
        testDir
      )

      if ("files" in result) {
        expect(result.files).toEqual([])
      } else {
        throw new Error("Expected files in result")
      }
    })

    it("should search in specified subdirectory", async () => {
      writeTestFile("subdir/test_file.py", "# Test file in subdir")
      writeTestFile("subdir/regular_file.py", "# Regular file in subdir")

      const result = await globSearch(
        {
          pattern: "**/test*.py",
          path: "subdir",
        },
        testDir
      )

      if ("files" in result) {
        expect(result.files).toHaveLength(1)
        expect(result.files[0]).toMatch(/subdir.*test_file\.py/)
      } else {
        throw new Error("Expected files in result")
      }
    })

    it("should handle error when searching in non-existent directory", async () => {
      const result = await globSearch(
        {
          pattern: "**/*.py",
          path: "nonexistent",
        },
        testDir
      )

      if ("error" in result) {
        expect(result.error).toEqual("directory not found or not accessible: nonexistent")
      } else {
        throw new Error("Expected error in result")
      }
    })
  })
})
