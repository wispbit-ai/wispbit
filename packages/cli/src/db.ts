import fs from "fs/promises"
import { join } from "path"

import { createRuleFile } from "@wispbit/sdk/codebaseRules"
import { hashString } from "@wispbit/sdk/hash"
import { CodebaseRule, FileChange, Violation } from "@wispbit/sdk/types"
import { Low } from "lowdb"
import { JSONFile } from "lowdb/node"

import { CONFIG_DIR, ensureDirExists } from "@wispbit/cli/config"
import { ViolationDetail } from "@wispbit/cli/types"

let cacheDir: string | undefined

// Define the database schema
interface DatabaseSchema {
  rules: Array<{
    id: string
    path: string
    sha: string
  }>
  visited_files: Array<{
    review_file_id: string
    fileName: string
    fileSha: string
  }>
  review_files: Array<{
    id: string
    fileName: string
    fileSha: string
    cost: number
    rule_ids: string[]
  }>
  review_violations: Array<{
    id: string
    rule_id: string
    description: string
    fileName: string
    fileSha: string
    lineNumberStart: number
    lineNumberEnd: number
    lineNumberSide: string
  }>
}

export const setCustomCacheDir = (newCacheDir?: string) => {
  cacheDir = newCacheDir
}

const databases = new Map<string, Low<DatabaseSchema>>()

// Initialize the database
async function initializeDb() {
  const cache = cacheDir || CONFIG_DIR
  ensureDirExists(cache)
  const dbPath = join(cache, `wispbit-cache.json`)

  if (databases.has(dbPath)) {
    return databases.get(dbPath)!
  }

  const adapter = new JSONFile<DatabaseSchema>(dbPath)
  const db = new Low(adapter, {
    rules: [],
    visited_files: [],
    review_files: [],
    review_violations: [],
  })

  await db.read()
  if (!db.data) {
    db.data = {
      rules: [],
      visited_files: [],
      review_files: [],
      review_violations: [],
    }
    await db.write()
  }

  databases.set(dbPath, db)
  return db
}

export async function hasReviewedFileWithSameHash(
  root: string,
  fileName: string,
  hash: string,
  codebaseRules: CodebaseRule[]
): Promise<boolean> {
  const db = await initializeDb()
  await db.read()

  const ruleIds = codebaseRules.map((r) => hashString(createRuleFile(r)))

  const file = db.data.review_files.find(
    (f) =>
      f.fileName === fileName &&
      f.fileSha === hash &&
      f.rule_ids.every((id) => ruleIds.includes(id))
  )

  if (file) {
    const visitedFiles = db.data.visited_files.filter((v) => v.review_file_id === file.id)

    for (const visitedFile of visitedFiles) {
      if ((await getFileSha(root, visitedFile.fileName)) !== visitedFile.fileSha) {
        return false
      }
    }
  }

  return file !== undefined
}

export async function hasExistingFileViolation(
  fileName: string,
  ruleId: string,
  lineNumberStart: number,
  lineNumberEnd: number,
  lineNumberSide: string
): Promise<boolean> {
  const db = await initializeDb()
  await db.read()
  const violation = db.data.review_violations.find(
    (v) =>
      v.fileName === fileName &&
      v.rule_id === ruleId &&
      v.lineNumberStart === lineNumberStart &&
      v.lineNumberEnd === lineNumberEnd &&
      v.lineNumberSide === lineNumberSide
  )
  return violation !== undefined
}

export async function getViolationsForFile(
  fileName: string,
  hash: string
): Promise<ViolationDetail[]> {
  const db = await initializeDb()
  await db.read()
  const violations = db.data.review_violations.filter(
    (v) => v.fileName === fileName && v.fileSha === hash
  )

  return violations.map((violation) => ({
    description: violation.description,
    line: {
      start: violation.lineNumberStart,
      end: violation.lineNumberEnd,
      side: violation.lineNumberSide as "right" | "left",
    },
    ruleId: violation.rule_id,
  }))
}

export async function saveFileReview(
  root: string,
  file: FileChange,
  violations: Violation[],
  visitedFiles: string[],
  rules: CodebaseRule[]
) {
  const db = await initializeDb()
  await db.read()

  const ruleIds: string[] = []

  for (const ruleToSave of rules) {
    const newRuleId = hashString(createRuleFile(ruleToSave))
    let rule = db.data.rules.find((r) => r.id === newRuleId)
    if (!rule) {
      rule = {
        id: newRuleId,
        path: ruleToSave.directory + "/" + ruleToSave.name,
        sha: newRuleId,
      }
      db.data.rules.push(rule)
    }

    ruleIds.push(rule.id)
  }

  // Generate unique ID for the file review
  const fileId = `${file.filename}-${file.sha}-${Date.now()}`

  // Add file review record
  db.data.review_files.push({
    id: fileId,
    fileName: file.filename,
    fileSha: file.sha,
    cost: 0,
    rule_ids: ruleIds,
  })

  // Process violations
  for (const violation of violations) {
    // Add violation record
    const violationId = `${violation.rule.id}-${file.filename}-${violation.line.start}-${Date.now()}`
    db.data.review_violations.push({
      id: violationId,
      rule_id: violation.rule.id,
      description: violation.description,
      fileName: file.filename,
      fileSha: file.sha,
      lineNumberStart: violation.line.start,
      lineNumberEnd: violation.line.end,
      lineNumberSide: violation.line.side,
    })
  }

  for (const visitedFile of visitedFiles) {
    const file = db.data.visited_files.find((f) => f.fileName === visitedFile)
    if (!file) {
      db.data.visited_files.push({
        review_file_id: fileId,
        fileName: visitedFile,
        fileSha: await getFileSha(root, visitedFile),
      })
    }
  }

  await db.write()
}

export async function purgeCache() {
  const db = await initializeDb()
  await db.read()
  db.data = {
    rules: [],
    visited_files: [],
    review_files: [],
    review_violations: [],
  }
  await db.write()
}

// quick sha for visited files without reading the file
async function getFileSha(root: string, fileName: string) {
  const { mtimeMs } = await fs.stat(join(root, fileName))
  return hashString(`${fileName}:${mtimeMs}`)
}
