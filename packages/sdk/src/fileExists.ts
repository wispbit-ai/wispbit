import { promises as fs } from "fs"

/**
 * Checks if a file exists at the given path
 * @param path Path to the file
 * @returns Promise that resolves to boolean indicating if file exists
 */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}
