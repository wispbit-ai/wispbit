import {
  extractDiffHunk,
  isLineReferenceValidForPatch,
  addLineNumbersToPatch,
  filterDiff,
} from "@wispbit/sdk-ts/patchParser"
import { LineReference } from "@wispbit/sdk-ts/types"

describe("isLineReferenceValidForPatch", () => {
  const createLineReference = (
    start: number,
    end: number,
    side: "right" | "left"
  ): LineReference => ({
    start,
    end,
    side,
  })

  it("should return false for line references that are outside the patch", () => {
    const patch = `@@ -36,11 +36,13 @@ export async function completeChatBotInvocation(
     response,
     cost,
     githubPullRequestCommentId = undefined,
+    skippedReason = undefined,
   }: {
     chatBotInvocationId: string
     response: string
     cost: string
     githubPullRequestCommentId?: string
+    skippedReason?: string
   }
 ) {
   await this.db
@@ -51,6 +53,7 @@ export async function completeChatBotInvocation(
       cost,
       response,
       githubPullRequestCommentId,
+      skippedReason,
     })
     .where(eq(chatBotInvocations.id, chatBotInvocationId))
 }
`

    // This line reference overlaps with the patch range [36, 48] (30 <= 48 && 46 >= 36)
    // So it's not completely outside, but it should still be invalid because it doesn't contain actual changes
    const lineRef = createLineReference(30, 46, "right")
    expect(isLineReferenceValidForPatch(lineRef, patch)).toBe(false)
  })

  it("should return false for line references that are completely outside the patch ranges", () => {
    const patch = `@@ -36,11 +36,13 @@ export async function completeChatBotInvocation(
     response,
     cost,
     githubPullRequestCommentId = undefined,
+    skippedReason = undefined,
   }: {
     chatBotInvocationId: string
     response: string
     cost: string
     githubPullRequestCommentId?: string
+    skippedReason?: string
   }
 ) {
   await this.db
@@ -51,6 +53,7 @@ export async function completeChatBotInvocation(
       cost,
       response,
       githubPullRequestCommentId,
+      skippedReason,
     })
     .where(eq(chatBotInvocations.id, chatBotInvocationId))
 }
`

    // Completely before all ranges
    const beforeAllRanges = createLineReference(20, 30, "right")
    expect(isLineReferenceValidForPatch(beforeAllRanges, patch)).toBe(false)

    // Completely after all ranges
    const afterAllRanges = createLineReference(60, 70, "right")
    expect(isLineReferenceValidForPatch(afterAllRanges, patch)).toBe(false)

    // Between ranges but not overlapping
    const betweenRanges = createLineReference(49, 50, "right")
    expect(isLineReferenceValidForPatch(betweenRanges, patch)).toBe(false)
  })

  it("should return true for line references that overlap with added lines", () => {
    const patch = `@@ -1,5 +1,6 @@
 line1
-line2
+new line
 line3
 line4
 line5`

    const validLineRef = createLineReference(2, 2, "right") // Overlaps with added line
    const invalidLineRef = createLineReference(10, 10, "right") // Doesn't overlap

    expect(isLineReferenceValidForPatch(validLineRef, patch)).toBe(true)
    expect(isLineReferenceValidForPatch(invalidLineRef, patch)).toBe(false)
  })

  it("should return true for line references that overlap with removed lines", () => {
    const patch = `@@ -1,5 +1,4 @@
 line1
-line2
 line3
 line4
 line5`

    const validLineRef = createLineReference(2, 2, "left") // Overlaps with removed line
    const invalidLineRef = createLineReference(10, 10, "left") // Doesn't overlap

    expect(isLineReferenceValidForPatch(validLineRef, patch)).toBe(true)
    expect(isLineReferenceValidForPatch(invalidLineRef, patch)).toBe(false)
  })

  it("should return true for line references that span multiple lines", () => {
    const patch = `@@ -1,5 +1,5 @@
 line1
-line2
+new line
 line3
 line4
 line5`

    const leftSpanningRef = createLineReference(1, 3, "left") // Spans removed line
    const rightSpanningRef = createLineReference(1, 3, "right") // Spans added line

    expect(isLineReferenceValidForPatch(leftSpanningRef, patch)).toBe(true)
    expect(isLineReferenceValidForPatch(rightSpanningRef, patch)).toBe(true)
  })

  it("should return false for empty patch", () => {
    const lineRef = createLineReference(1, 1, "right")
    expect(isLineReferenceValidForPatch(lineRef, "")).toBe(false)
  })

  it("should handle line references that don't overlap with changes", () => {
    const patch = `@@ -1,5 +1,5 @@
 line1
-line2
+new line
 line3
 line4
 line5`

    const nonOverlappingRight = createLineReference(10, 10, "right") // Doesn't overlap
    const overlappingLeft = createLineReference(2, 2, "left") // Overlaps with removed line

    expect(isLineReferenceValidForPatch(nonOverlappingRight, patch)).toBe(false)
    expect(isLineReferenceValidForPatch(overlappingLeft, patch)).toBe(true)
  })

  it("should return false when line reference is outside patch context range", () => {
    const patch = `@@ -10,5 +10,5 @@
 line10
-line11
+new line11
 line12
 line13
 line14`

    const beforeRangeLeft = createLineReference(5, 5, "left") // Before the patch range (10-14)
    const afterRangeLeft = createLineReference(20, 20, "left") // After the patch range
    const beforeRangeRight = createLineReference(5, 5, "right") // Before the patch range (10-14)
    const afterRangeRight = createLineReference(20, 20, "right") // After the patch range

    expect(isLineReferenceValidForPatch(beforeRangeLeft, patch)).toBe(false)
    expect(isLineReferenceValidForPatch(afterRangeLeft, patch)).toBe(false)
    expect(isLineReferenceValidForPatch(beforeRangeRight, patch)).toBe(false)
    expect(isLineReferenceValidForPatch(afterRangeRight, patch)).toBe(false)
  })

  it("should return true for context lines within patch range that contain changes", () => {
    const patch = `@@ -1,5 +1,5 @@
 line1
-line2
+new line
 line3
 line4
 line5`

    // Context lines that span across a change should be valid
    const spanningContext = createLineReference(1, 3, "right") // Context + change + context
    expect(isLineReferenceValidForPatch(spanningContext, patch)).toBe(true)
  })

  it("should return false for context lines within patch range that don't contain changes", () => {
    const patch = `@@ -1,5 +1,5 @@
 line1
-line2
+new line
 line3
 line4
 line5`

    // Context lines that don't include any changes should be invalid
    const onlyContext = createLineReference(3, 5, "right") // Only context lines
    expect(isLineReferenceValidForPatch(onlyContext, patch)).toBe(false)
  })

  it("should handle line references at patch boundaries", () => {
    const patch = `@@ -10,3 +10,3 @@
 line10
-line11
+new line11
 line12`

    const atStart = createLineReference(10, 10, "right") // At start of patch range
    const atEnd = createLineReference(12, 12, "right") // At end of patch range
    const withChange = createLineReference(11, 11, "right") // The actual change

    expect(isLineReferenceValidForPatch(atStart, patch)).toBe(false) // Context only
    expect(isLineReferenceValidForPatch(atEnd, patch)).toBe(false) // Context only
    expect(isLineReferenceValidForPatch(withChange, patch)).toBe(true) // Contains change
  })

  it("should handle multi-patch files correctly", () => {
    const multiPatch = `@@ -1,5 +1,5 @@
-from datetime import timedelta
-from typing import Any, Optional
+from datetime import timedelta, UTC
+from typing import Any
 
 from freezegun import freeze_time
 from freezegun.api import FrozenDateTimeFactory, StepTickTimeFactory
@@ -55,7 +55,7 @@ class TestActivityLog(APIBaseTest, QueryMatchingTest):
     def _create_insight(
         self,
         data: dict[str, Any],
-        team_id: Optional[int] = None,
+        team_id: int | None = None,
         expected_status: int = status.HTTP_201_CREATED,
     ) -> tuple[int, dict[str, Any]]:
         if team_id is None:
@@ -312,3 +312,59 @@ class TestActivityLog(APIBaseTest, QueryMatchingTest):
         assert res.status_code == status.HTTP_200_OK
         assert len(res.json()["results"]) == 6
         assert [r["scope"] for r in res.json()["results"]] == ["FeatureFlag"] * 6
+
+    def test_bookmark_microsecond_precision(self) -> None:
+        """Test that microsecond precision is preserved in timestamp comparisons (GitHub issue #35246)"""
+        from datetime import datetime
+        from posthog.models import ActivityLog, NotificationViewed`

    // Test line references in the first hunk (lines 1-5)
    const firstHunkLeft = createLineReference(2, 2, "left") // Changed line in first hunk
    const firstHunkRight = createLineReference(2, 2, "right") // Changed line in first hunk
    expect(isLineReferenceValidForPatch(firstHunkLeft, multiPatch)).toBe(true)
    expect(isLineReferenceValidForPatch(firstHunkRight, multiPatch)).toBe(true)

    // Test line references in the second hunk (lines 55-61)
    const secondHunkLeft = createLineReference(58, 58, "left") // Changed line in second hunk
    const secondHunkRight = createLineReference(58, 58, "right") // Changed line in second hunk
    expect(isLineReferenceValidForPatch(secondHunkLeft, multiPatch)).toBe(true)
    expect(isLineReferenceValidForPatch(secondHunkRight, multiPatch)).toBe(true)

    // Test line references in the third hunk (lines 312-370)
    const thirdHunkRight = createLineReference(315, 370, "right") // Range in third hunk with additions
    expect(isLineReferenceValidForPatch(thirdHunkRight, multiPatch)).toBe(true)

    // Test line references between hunks (should be invalid)
    const betweenHunks1 = createLineReference(10, 10, "right") // Between first and second hunk
    const betweenHunks2 = createLineReference(100, 100, "left") // Between second and third hunk
    expect(isLineReferenceValidForPatch(betweenHunks1, multiPatch)).toBe(false)
    expect(isLineReferenceValidForPatch(betweenHunks2, multiPatch)).toBe(false)

    // Test line references before all hunks
    const beforeAllHunks = createLineReference(0, 0, "right")
    expect(isLineReferenceValidForPatch(beforeAllHunks, multiPatch)).toBe(false)

    // Test line references after all hunks
    const afterAllHunks = createLineReference(400, 400, "left")
    expect(isLineReferenceValidForPatch(afterAllHunks, multiPatch)).toBe(false)
  })

  it("should handle edge cases in multi-patch files", () => {
    const edgeCaseMultiPatch = `@@ -1,2 +1,3 @@
 line1
+added line
 line2
@@ -100,1 +101,2 @@
+another added line
 line100`

    // Test line reference that includes an added line in the first hunk
    const firstHunkAdded = createLineReference(2, 2, "right") // Added line in first hunk
    expect(isLineReferenceValidForPatch(firstHunkAdded, edgeCaseMultiPatch)).toBe(true)

    // Test line reference that includes an added line in the second hunk
    const secondHunkAdded = createLineReference(101, 101, "right") // Added line in second hunk
    expect(isLineReferenceValidForPatch(secondHunkAdded, edgeCaseMultiPatch)).toBe(true)

    // Test context lines that don't include changes
    const contextOnly = createLineReference(1, 1, "right") // Context line in first hunk
    expect(isLineReferenceValidForPatch(contextOnly, edgeCaseMultiPatch)).toBe(false)

    // Test line reference completely outside all patch ranges
    const outsideRange = createLineReference(50, 80, "right") // Between the two hunks
    expect(isLineReferenceValidForPatch(outsideRange, edgeCaseMultiPatch)).toBe(false)
  })
})

describe("extractDiffHunk", () => {
  const samplePatch = `@@ -1,10 +1,11 @@
 line1
 line2
-removed line
+added line
 line4
 line5
 line6
 line7
 line8
 line9
 line10
+another added line`

  it("should extract diff hunk for right side (added lines) with default context", () => {
    const result = extractDiffHunk(samplePatch, 3, 3, "right")

    expect(result).toBe(`@@ -1,6 +1,6 @@
 line1
 line2
-removed line
+added line
 line4
 line5
 line6`)
  })

  it("should extract diff hunk for left side (removed lines) with default context", () => {
    const result = extractDiffHunk(samplePatch, 3, 3, "left")

    expect(result).toBe(`@@ -1,5 +1,5 @@
 line1
 line2
-removed line
+added line
 line4
 line5`)
  })

  it("should respect custom context lines", () => {
    const result = extractDiffHunk(samplePatch, 3, 3, "right", 1)

    expect(result).toBe(`@@ -3,2 +3,2 @@
-removed line
+added line
 line4`)
  })

  it("should handle line ranges spanning multiple lines", () => {
    const multiLinePatch = `@@ -1,8 +1,10 @@
 line1
-old line1
-old line2
+new line1
+new line2
+new line3
 line5
 line6
 line7
 line8`

    const result = extractDiffHunk(multiLinePatch, 2, 4, "right")

    expect(result).toBe(`@@ -1,6 +1,7 @@
 line1
-old line1
-old line2
+new line1
+new line2
+new line3
 line5
 line6
 line7`)
  })

  it("should return empty string when no violation lines are found", () => {
    const result = extractDiffHunk(samplePatch, 100, 100, "right")
    expect(result).toBe("")
  })

  it("should return empty string for empty patch", () => {
    const result = extractDiffHunk("", 1, 1, "right")
    expect(result).toBe("")
  })

  it("should handle violations at the beginning of the hunk", () => {
    const result = extractDiffHunk(samplePatch, 1, 1, "right", 1)

    expect(result).toBe(`@@ -1,2 +1,2 @@
 line1
 line2`)
  })

  it("should handle violations at the end of the hunk", () => {
    const result = extractDiffHunk(samplePatch, 11, 11, "right", 1)

    expect(result).toBe(`@@ -10 +10,2 @@
 line10
+another added line`)
  })

  it("should handle context lines that overlap with violation lines", () => {
    const contextPatch = `@@ -1,5 +1,5 @@
 context1
 context2
+added line
 context4
 context5`

    const result = extractDiffHunk(contextPatch, 3, 3, "right", 2)

    expect(result).toBe(`@@ -1,4 +1,5 @@
 context1
 context2
+added line
 context4
 context5`)
  })

  it("should extract proper context for multi-line violations", () => {
    const multiPatch = `@@ -1,8 +1,8 @@
 line1
 line2
-old1
-old2
+new1
+new2
 line7
 line8`

    const result = extractDiffHunk(multiPatch, 3, 4, "right", 1)

    expect(result).toBe(`@@ -4,2 +3,3 @@
-old2
+new1
+new2
 line7`)
  })

  it("should extract diff hunk for SQL query with phone_number addition", () => {
    const sqlPatch = `@@ -7,7 +7,8 @@
         select 
           cast(c.customer_uuid as text) as customer_id,
           c.customer_name,
-          c.email
+          c.email,
+          c.phone_number
         from customer c
       """
   )`

    const result = extractDiffHunk(sqlPatch, 11, 11, "right", 0)

    expect(result).toBe(`@@ -11,0 +11 @@
+          c.phone_number`)
  })
})

describe("addLineNumbersToPatch", () => {
  it("should add line numbers with L/R indicators to a patch", () => {
    const patch = `@@ -7,7 +7,8 @@
         select 
           cast(c.customer_uuid as text) as customer_id,
           c.customer_name,
-          c.email
+          c.email,
+          c.phone_number
         from customer c
       """
   )`

    const result = addLineNumbersToPatch(patch)

    expect(result).toBe(`@@ -7,7 +7,8 @@
L7 R7          select 
L8 R8            cast(c.customer_uuid as text) as customer_id,
L9 R9            c.customer_name,
L10 -          c.email
    R10 +          c.email,
    R11 +          c.phone_number
L11 R12          from customer c
L12 R13        """
L13 R14    )`)
  })

  it("should handle blank lines correctly and maintain accurate line numbering", () => {
    const patch = `@@ -1,8 +1,9 @@
 function test() {
   console.log("start");
 
-  // old comment
+  // new comment
+  console.log("added");
 
   console.log("end");
 }`

    const result = addLineNumbersToPatch(patch)

    expect(result).toBe(`@@ -1,8 +1,9 @@
L1 R1  function test() {
L2 R2    console.log("start");
L3 R3  
L4 -  // old comment
    R4 +  // new comment
    R5 +  console.log("added");
L5 R6  
L6 R7    console.log("end");
L7 R8  }`)
  })

  it("should handle patches with empty lines that are not context lines", () => {
    // This patch has an actual empty line (not a context line starting with space)
    const patchWithEmptyLines = `@@ -1,4 +1,5 @@
 line1

-line3
+new line3
+added line
 line4`

    const result = addLineNumbersToPatch(patchWithEmptyLines)

    // The empty line should be treated as a context line and have line numbers
    expect(result).toBe(`@@ -1,4 +1,5 @@
L1 R1  line1
L2 R2 
L3 -line3
    R3 +new line3
    R4 +added line
L4 R5  line4`)
  })
})

describe("filterDiff", () => {
  it("should return empty strings for empty patch", () => {
    const result = filterDiff("", "additions")
    expect(result).toBe("")
  })
  it("should split simple addition and removal", () => {
    const patch = `@@ -1,5 +1,5 @@
 line1
-removed line
+added line
 line3
 line4`

    const oldHunk = filterDiff(patch, "deletions")
    const newHunk = filterDiff(patch, "additions")

    expect(oldHunk).toBe(`@@ -1,4 +1,3 @@
 line1
-removed line
 line3
 line4`)
    expect(newHunk).toBe(`@@ -1,3 +1,4 @@
 line1
+added line
 line3
 line4`)
  })

  it("should handle multiple consecutive additions", () => {
    const patch = `@@ -1,3 +1,5 @@
 line1
+added line1
+added line2
 line2
 line3`

    const oldHunk = filterDiff(patch, "deletions")
    const newHunk = filterDiff(patch, "additions")

    expect(oldHunk).toBe(`@@ -1,3 +1,3 @@
 line1
 line2
 line3`)
    expect(newHunk).toBe(`@@ -1,3 +1,5 @@
 line1
+added line1
+added line2
 line2
 line3`)
  })

  it("should handle multiple consecutive removals", () => {
    const patch = `@@ -1,5 +1,3 @@
 line1
-removed line1
-removed line2
 line4
 line5`

    const oldHunk = filterDiff(patch, "deletions")
    const newHunk = filterDiff(patch, "additions")

    expect(oldHunk).toBe(`@@ -1,5 +1,3 @@
 line1
-removed line1
-removed line2
 line4
 line5`)
    expect(newHunk).toBe(`@@ -1,3 +1,3 @@
 line1
 line4
 line5`)
  })

  it("should separate non-consecutive diffs", () => {
    const patch = `@@ -1,7 +1,7 @@
 line1
-removed line1
 line3
+added line1
 line5
-removed line2
+added line2`

    const oldHunk = filterDiff(patch, "deletions")
    const newHunk = filterDiff(patch, "additions")

    expect(oldHunk).toBe(`@@ -1,5 +1,3 @@
 line1
-removed line1
 line3
 line5
-removed line2`)
    expect(newHunk).toBe(`@@ -1,3 +1,5 @@
 line1
 line3
+added line1
 line5
+added line2`)
  })

  it("should handle mixed additions and removals in sequence", () => {
    const patch = `@@ -1,6 +1,6 @@
 line1
-old line1
-old line2
+new line1
+new line2
 line6`

    const oldHunk = filterDiff(patch, "deletions")
    const newHunk = filterDiff(patch, "additions")

    expect(oldHunk).toBe(`@@ -1,4 +1,2 @@
 line1
-old line1
-old line2
 line6`)
    expect(newHunk).toBe(`@@ -1,2 +1,4 @@
 line1
+new line1
+new line2
 line6`)
  })

  it("should handle only context lines", () => {
    const patch = `@@ -1,3 +1,3 @@
 line1
 line2
 line3`

    const oldHunk = filterDiff(patch, "deletions")
    const newHunk = filterDiff(patch, "additions")

    expect(oldHunk).toBe(`@@ -1,3 +1,3 @@
 line1
 line2
 line3`)
    expect(newHunk).toBe(`@@ -1,3 +1,3 @@
 line1
 line2
 line3`)
  })

  it("should handle complex real-world example", () => {
    const complexPatch = `@@ -7,7 +7,8 @@
         select 
           cast(c.customer_uuid as text) as customer_id,
           c.customer_name,
-          c.email
+          c.email,
+          c.phone_number
         from customer c
       """
   )`

    const oldHunk = filterDiff(complexPatch, "deletions")
    const newHunk = filterDiff(complexPatch, "additions")

    expect(oldHunk).toBe(`@@ -7,7 +7,6 @@
         select 
           cast(c.customer_uuid as text) as customer_id,
           c.customer_name,
-          c.email
         from customer c
       """
   )`)
    expect(newHunk).toBe(`@@ -7,6 +7,8 @@
         select 
           cast(c.customer_uuid as text) as customer_id,
           c.customer_name,
+          c.email,
+          c.phone_number
         from customer c
       """
   )`)
  })

  it("should handle context at boundaries", () => {
    const patch = `@@ -1,3 +1,3 @@
-first line
+new first line
 middle line
 last line`

    const oldHunk = filterDiff(patch, "deletions")
    const newHunk = filterDiff(patch, "additions")

    // With 3 lines of context, should include all available lines
    expect(oldHunk).toBe(`@@ -1,3 +1,2 @@
-first line
 middle line
 last line`)
    expect(newHunk).toBe(`@@ -1,2 +1,3 @@
+new first line
 middle line
 last line`)
  })
})
