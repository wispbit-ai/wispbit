import { execSync } from "child_process"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"

import dotenv from "dotenv"

import { CodeReviewer } from "@wispbit/sdk/CodeReviewer"
import { hashString } from "@wispbit/sdk/hash"
import { FileChange, CodebaseRule } from "@wispbit/sdk/types"

dotenv.config()

describe(
  "Code Reviewer",
  {
    timeout: 100000,
  },
  () => {
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

    function createTestFile(filePath: string, content: string | null): string {
      const fullPath = path.join(testDir, filePath)
      const dir = path.dirname(fullPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      if (content !== null) {
        fs.writeFileSync(fullPath, content)
      }
      return fullPath
    }

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
        sha: "1234",
      }
    }

    function createCodeReviewer(additionalFiles: FileChange[] = []): CodeReviewer {
      const ripGrepPath = execSync("which rg").toString().trim()
      return new CodeReviewer(
        {
          cwd: testDir,
          ripGrepPath,
          debug: true,
        },
        undefined,
        additionalFiles
      )
    }

    function createRule(contents: string, include: string[] = ["*"]): CodebaseRule {
      return {
        id: hashString(contents),
        directory: "",
        name: hashString(contents),
        contents,
        include,
      }
    }

    it("should detect non-compliant SQL triggers", async () => {
      const rule = createRule(
        "Writing a database trigger in .sql files should always have INITIALLY DEFERRED to prevent issues with triggers being ran before a transaction finished",
        ["*.sql"]
      )

      const files: FileChange[] = [
        createFileChange(
          "migrations/001_create_triggers.sql",
          "added",
          `@@ -0,0 +1,15 @@
+CREATE CONSTRAINT TRIGGER user_update_trigger
+    AFTER UPDATE ON users
+    DEFERRABLE INITIALLY DEFERRED
+    FOR EACH ROW
+    EXECUTE FUNCTION track_user_changes();
+
+
+CREATE TRIGGER product_update_trigger
+    AFTER INSERT ON products
+    FOR EACH ROW
+    EXECUTE FUNCTION update_product_stats();`,
          11,
          0
        ),
      ]

      const codeReviewer = createCodeReviewer()

      const result = await codeReviewer.codeReviewFile(files[0], [rule])

      expect(result.violations.length).toBe(1)
      expect(result.violations.every((v) => v.optional === false)).toBe(true)
    })

    it("should detect non-compliant GraphQL field removals", async () => {
      const rule = createRule(
        "When removing fields in .graphql files, you must first add a 'deprecated' comment before removing the field",
        ["*.graphql"]
      )

      const graphqlBaseContent = `type User {
  id: ID!
  name: String!
  email: String
}`

      const pyBaseContent = `class User:
    id: str
    name: str
    email: str`

      createTestFile("schema/user.graphql", graphqlBaseContent)
      createTestFile("models/user.py", pyBaseContent)

      const files: FileChange[] = [
        createFileChange(
          "schema/user.graphql",
          "modified",
          `@@ -1,8 +1,6 @@
 type User {
   id: ID!
   name: String!
-  age: Int!
   email: String
}`,
          0,
          1
        ),
        createFileChange(
          "models/user.py",
          "modified",
          `@@ -1,8 +1,6 @@
 class User:
     id: str
     name: str
-    age: int
     email: str`,
          0,
          1
        ),
      ]

      const codeReviewer = createCodeReviewer()

      const result = await codeReviewer.codeReviewFile(files[0], [rule])

      expect(result.violations.length).toBe(1)
      expect(result.violations.every((v) => v.optional === false)).toBe(true)

      const result2 = await codeReviewer.codeReviewFile(files[1], [rule])

      expect(result2.violations.length).toBe(0)
    })

    it("should detect non-compliant function names", async () => {
      const rule = createRule("make sure all functions are prefixed with ABC", ["*.py"])

      const baseContent = `def ABCvalidate_user(user_id: str) -> bool:
    return True
`

      createTestFile("example.py", baseContent)

      const files: FileChange[] = [
        createFileChange(
          "example.py",
          "modified",
          `@@ -1,7 +1,4 @@
 def ABCvalidate_user(user_id: str) -> bool:
     return True
 
-def invalid_function():
-    return False
`,
          0,
          3
        ),
      ]

      const codeReviewer = createCodeReviewer([])

      const result = await codeReviewer.codeReviewFile(files[0], [rule])

      expect(result.violations.length).toBe(0)
    })

    it("should detect non-compliant file operations", async () => {
      const rule = createRule(
        "All file operations (open/read/write) must have proper error handling with try/except blocks to prevent runtime crashes",
        ["*.py"]
      )

      const baseContent = `def read_config():
    with open('config.json', 'r') as f:
        return f.read()
`

      createTestFile("file_utils.py", baseContent)

      const files: FileChange[] = [
        createFileChange(
          "file_utils.py",
          "modified",
          `@@ -1,10 +1,4 @@
 def read_config():
-    try:
-        with open('config.json', 'r') as f:
-            return f.read()
-    except FileNotFoundError:
-        return None
-    except IOError as e:
-        raise RuntimeError(f"Failed to read config: {e}")
-
+    with open('config.json', 'r') as f:
+        return f.read()
`,
          2,
          8
        ),
      ]

      const codeReviewer = createCodeReviewer()

      const result = await codeReviewer.codeReviewFile(files[0], [rule])

      expect(result.violations.length).toBe(1)
      expect(result.violations.every((v) => v.optional === false)).toBe(true)
    })

    // this test was added because the code reviewer would comment on context lines that were not part of the original changes
    // we fix this by adding filtering steps to the code reviewer
    // this test should fail without the filtering steps
    it("should not detect non-compliant SQLAlchemy imports since the violation is outside of the original changes", async () => {
      const rule = createRule(
        "all sqlalchemy imports must be prefixed with _SQL when being imported",
        ["*.py"]
      )

      const baseContent = `from sqlalchemy import Column, Integer
from sqlalchemy.orm import Session as _SQLSession
from sqlalchemy.types import String as _SQLString
from sqlalchemy.sql import select

# Updated user model definition
class User:
    pass
`

      createTestFile("models/user_model.py", baseContent)

      const files: FileChange[] = [
        createFileChange(
          "models/user_model.py",
          "modified",
          `@@ -1,9 +1,9 @@
 from sqlalchemy.types import String as _SQLString
 from sqlalchemy.sql import select

-# User model definition
+# Updated user model definition
 class User:
     pass
`,
          1,
          1
        ),
      ]

      const codeReviewer = createCodeReviewer()

      const result = await codeReviewer.codeReviewFile(files[0], [rule])

      expect(result.violations.length).toBe(0)
    })

    // this test was added to check the code reviewer's ability to look at other files when mentioned by the rule
    it("should detect non-compliant file changes", async () => {
      const rule = createRule(
        "Any changes made to afile.py must also be made to zfile.py to maintain consistency",
        ["*.py"]
      )

      const initialContent = `def process_data():
    return "new data"
`

      createTestFile("afile.py", initialContent)
      createTestFile("zfile.py", initialContent)

      const files: FileChange[] = [
        createFileChange(
          "afile.py",
          "modified",
          `@@ -1,2 +1,2 @@
 def process_data():
-    return "new data"
+    return "old data"
`,
          1,
          1
        ),
      ]

      const codeReviewer = createCodeReviewer()

      const result = await codeReviewer.codeReviewFile(files[0], [rule])

      expect(result.violations.length).toBe(1)
      expect(result.violations.every((v) => v.optional === false)).toBe(true)
    })

    // this test was added to test the code reviewer's ability to use a rule that requires multiple files to be checked
    // this test should fail without the ability to check multiple files
    it("should detect non-compliant DBT model schema synchronization", async () => {
      const rule = createRule(
        "When modifying DBT SQL models in the `analytics` folder, ensure that any changes to column definitions are also reflected in the corresponding `schema.yml` file. When adding, removing, or modifying columns in a SQL model, the corresponding `schema.yml` entry must be updated to match. All columns defined in a SQL model should have matching definitions in `schema.yml`. Column data types in the schema should accurately reflect the SQL implementation.",
        ["analytics/**/*.sql", "analytics/**/schema.yml"]
      )

      const initialSqlContent = `{{ config(
    materialized="table",
    enabled=true,
) }}

with customers as (
  select * from external_query("{{ var('postgres_connector') }}", 
      """
        select 
          cast(c.customer_uuid as text) as customer_id,
          c.customer_name,
          c.email,
          c.phone_number
        from customer c
      """
  )
)

select
  c.customer_id,
  c.customer_name,
  c.email,
  c.phone_number
from customers c
`

      const initialSchemaContent = `version: 2

models:
  - name: customers
    description: A list of customers for our company
    columns:
      - name: customer_id
        description: ID of the customer
      - name: customer_name
        description: Name of the customer
      - name: email
        description: Email address of the customer
`

      createTestFile("analytics/models/customers.sql", initialSqlContent)
      createTestFile("analytics/models/schema.yml", initialSchemaContent)

      const files: FileChange[] = [
        createFileChange(
          "analytics/models/customers.sql",
          "modified",
          `@@ -7,7 +7,8 @@
         select 
           cast(c.customer_uuid as text) as customer_id,
           c.customer_name,
-          c.email
+          c.email,
+          c.phone_number
         from customer c
       """
   )
@@ -16,5 +17,6 @@
 select
   c.customer_id,
   c.customer_name,
-  c.email
+  c.email,
+  c.phone_number
 from customers c`,
          2,
          0
        ),
      ]

      const codeReviewer = createCodeReviewer()

      const result = await codeReviewer.codeReviewFile(files[0], [rule])

      expect(result.violations.length).toBe(1)
      expect(result.violations.every((v) => v.optional === false)).toBe(true)
    })

    // this test was added because the code reviewer would comment on changes that were removed- this was a correct interpretation (violation existed) but not correct in the fact that the removal "fixed" the violation
    // this test should fail if we modify the prompt to not consider this
    it("should not detect non-compliant repo.models imports because the violation is in a removed line", async () => {
      const rule = createRule(
        "Make sure models are imported from repo.models. Good: from repo.models import User, Company. Bad: from repo.models.user import User, from repo.models.company import Company",
        ["*.py"]
      )

      const baseContent = `from repo.models import User, Company
from repo.utils import helper_function

def process_users():
    user = User()
    company = Company()
    return helper_function(user, company)
`

      createTestFile("services/user_service.py", baseContent)

      const files: FileChange[] = [
        createFileChange(
          "services/user_service.py",
          "modified",
          `@@ -1,5 +1,4 @@
-from repo.models.user import User
-from repo.models.company import Company
+from repo.models import User, Company
 from repo.utils import helper_function
 
 def process_users():`,
          1,
          2
        ),
      ]

      const codeReviewer = createCodeReviewer()

      const result = await codeReviewer.codeReviewFile(files[0], [rule])

      expect(result.violations.length).toBe(0)
    })

    it("should detect non-compliant repo.models imports", async () => {
      const rule = createRule(
        "Make sure models are imported from repo.models.{model_name}. Bad: from repo.models import User, Company. Good: from repo.models.user import User, from repo.models.company import Company",
        ["*.py"]
      )

      const baseContent = `from repo.models import User, Company
from repo.utils import helper_function

def process_users():
    user = User()
    company = Company()
    return helper_function(user, company)
`

      createTestFile("services/user_service.py", baseContent)

      const files: FileChange[] = [
        createFileChange(
          "services/user_service.py",
          "modified",
          `@@ -1,5 +1,4 @@
-from repo.models.user import User
-from repo.models.company import Company
+from repo.models import User, Company
 from repo.utils import helper_function
 
 def process_users():`,
          1,
          2
        ),
      ]

      const codeReviewer = createCodeReviewer()

      const result = await codeReviewer.codeReviewFile(files[0], [rule])

      expect(result.violations.length).toBe(1)
      expect(result.violations.every((v) => v.optional === false)).toBe(true)
    })

    it("should detect optional repo.models imports", async () => {
      const rule = createRule(
        "Make sure models are imported from repo.models.{model_name} (optional). Bad: from repo.models import User, Company. Good: from repo.models.user import User, from repo.models.company import Company",
        ["*.py"]
      )

      const baseContent = `from repo.models import User, Company
from repo.utils import helper_function

def process_users():
    user = User()
    company = Company()
    return helper_function(user, company)
`

      createTestFile("services/user_service.py", baseContent)

      const files: FileChange[] = [
        createFileChange(
          "services/user_service.py",
          "modified",
          `@@ -1,5 +1,4 @@
-from repo.models.user import User
-from repo.models.company import Company
+from repo.models import User, Company
 from repo.utils import helper_function
 
 def process_users():`,
          1,
          2
        ),
      ]

      const codeReviewer = createCodeReviewer()

      const result = await codeReviewer.codeReviewFile(files[0], [rule])

      expect(result.violations.length).toBe(1)
      expect(result.violations.every((v) => v.optional === true)).toBe(true)
    })
  }
)
