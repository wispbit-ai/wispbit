import { createHash } from "crypto"

export function hashString(str: string) {
  return createHash("sha256").update(str).digest("hex")
}
