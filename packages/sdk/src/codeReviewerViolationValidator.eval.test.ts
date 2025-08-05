import * as fs from "fs"
import * as os from "os"
import * as path from "path"

import dotenv from "dotenv"

import { CodeReviewerViolationValidator } from "@wispbit/sdk/CodeReviewerViolationValidator"
import { FileChange, CodebaseRule, Violation } from "@wispbit/sdk/types"

dotenv.config()

describe(
  "Code Reviewer Violation Validator",
  {
    timeout: 100000,
  },
  () => {
    let testDir: string
    let validator: CodeReviewerViolationValidator

    beforeEach(() => {
      testDir = path.join(os.tmpdir(), `test_repo_${Math.random().toString(36).substring(2)}`)
      fs.mkdirSync(testDir)
      validator = new CodeReviewerViolationValidator({ debug: true }, undefined)
    })

    afterEach(() => {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true })
      }
    })

    function createFileChange(
      filename: string,
      status: FileChange["status"],
      patch: string,
      additions?: number,
      deletions?: number
    ): FileChange {
      return {
        filename,
        status,
        patch,
        additions: additions ?? 0,
        deletions: deletions ?? 0,
        sha: "sha",
      }
    }

    function createViolation(
      rule: CodebaseRule,
      description: string,
      lineStart: number,
      lineEnd: number,
      side: "left" | "right"
    ): Violation {
      return {
        rule,
        description,
        line: {
          start: lineStart,
          end: lineEnd,
          side,
        },
        optional: false,
      }
    }

    function createRule(contents: string, include: string[] = ["*"]): CodebaseRule {
      return {
        id: "1234",
        directory: "",
        name: "test",
        contents,
        include,
      }
    }

    // this test was added to make sure that the violation validator can filter out violations for "removed" files
    it("should not validate a violation for a removed file", async () => {
      const rule = createRule(
        "Make sure models are imported from repo.models. Good: from repo.models import User, Company. Bad: from repo.models.user import User, from repo.models.company import Company",
        ["*.py"]
      )

      const violation = createViolation(
        rule,
        "Model was imported incorrectly: `from repo.models.company import Company`",
        3,
        3,
        "left"
      )

      const fileChange = createFileChange(
        "services/user_service.py",
        "modified",
        `@@ -1,5 +1,4 @@
-from repo.models.user import User
-from repo.models.company import Company
+from repo.models import User, Company
 from repo.utils import helper_function
 
 def process_users():,
`,
        0,
        300
      )

      const result = await validator.validateViolation(violation, fileChange)
      expect(result.isValid).toBe(false)
    })
  }
)
