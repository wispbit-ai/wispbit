---
include: *.ts, *.tsx
---

When using try-catch blocks in Typescript, keep the try block focused only on the code that can raise the expected exception.

Bad:

```typescript
async function doSomething() {
  try {
    // Large block of code with multiple potential error sources
    await fetchData()
    await processData()
    await saveResults()
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`)
    process.exit(1)
  }
}
```

Good:

```typescript
async function doSomething() {
  // Let errors propagate with their full stack trace
  // or handle specific errors at appropriate points
  await fetchData()
  await processData()
  await saveResults()
}

// If you need top-level error handling:
async function main() {
  try {
    await doSomething()
  } catch (error) {
    console.error("Unexpected error:", error)
    process.exit(1)
  }
}
```
