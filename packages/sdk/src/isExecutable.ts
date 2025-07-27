import fs from "fs"
import path from "path"

/**
 * Checks if a command is executable by searching in the system PATH
 *
 * @param command - Command to check
 * @returns Promise that resolves to boolean indicating if command is executable
 */
export async function isCommandExecutable(command: string): Promise<boolean> {
  try {
    // For absolute paths or explicit paths, check directly
    if (command.includes("/") || command.includes("\\")) {
      await fs.promises.access(command, fs.constants.X_OK)
      return true
    }

    // For commands that should be in PATH
    const pathEnv = process.env.PATH || ""
    const pathSeparator = process.platform === "win32" ? ";" : ":"
    const pathDirs = pathEnv.split(pathSeparator)
    const extensions =
      process.platform === "win32" ? (process.env.PATHEXT || ".exe;.cmd;.bat").split(";") : [""]

    for (const dir of pathDirs) {
      for (const ext of extensions) {
        const fullPath = path.join(dir, command + ext)
        try {
          await fs.promises.access(fullPath, fs.constants.X_OK)
          return true
        } catch {
          // Continue checking other paths
        }
      }
    }
    return false
  } catch {
    return false
  }
}
