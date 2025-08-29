import type { Scorer, ScorerArgs, ScorerWithPartial } from "autoevals"

export function makePartial<Output, Extra>(
  fn: Scorer<Output, Extra>,
  name?: string
): ScorerWithPartial<Output, Extra> {
  const ret: any = fn.bind({})
  ret.partial = (args: Partial<ScorerArgs<Output, Extra>>) => {
    const newFn = (newArgs: ScorerArgs<Output, Extra>) => ret({ ...args, ...newArgs })
    if (name) {
      Object.defineProperty(newFn, "name", {
        value: name,
        configurable: true,
      })
    }
    return newFn
  }
  if (name) {
    Object.defineProperty(ret, "name", {
      value: name,
      configurable: true,
    })
  }
  return ret
}

// Custom ExactMatch function that replicates autoeval's behavior
export const ExactMatch: ScorerWithPartial<unknown, object> = makePartial((args) => {
  const maybeObject = needsJSON(args.output) || needsJSON(args.expected)
  const [output, expected] = [
    normalizeValue(args.output ?? null, maybeObject),
    normalizeValue(args.expected ?? null, maybeObject),
  ]

  const score = output === expected ? 1 : 0

  return {
    name: "ExactMatch",
    score,
  }
}, "ExactMatch")

function needsJSON(value: unknown): boolean {
  return typeof value === "object" || Array.isArray(value)
}

export function normalizeValue(value: unknown, maybeObject: boolean): string {
  if (needsJSON(value)) {
    return JSON.stringify(value, Object.keys(value as any).sort())
  }
  try {
    if (typeof value === "string" && maybeObject) {
      const parsed = JSON.parse(value)
      return JSON.stringify(parsed, Object.keys(parsed).sort())
    }
  } catch (e) {
    // That's ok, just return the string representation
  }
  return `${value}`
}
