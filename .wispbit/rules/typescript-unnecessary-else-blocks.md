---
include: *.ts
---

Avoid unnecessary `else` blocks when the `if` block ends with a return statement, break, continue, or similar control flow statements.

Bad:

```typescript
function processValue(value: number): string {
  if (value > 10) {
    return "high"
  } else {
    return "low"
  }
}
```

```typescript
function checkItems(items: string[]): void {
  for (const item of items) {
    if (item.length > 5) {
      console.log("Long item:", item)
      continue
    } else {
      console.log("Short item:", item)
    }
  }
}
```

Good:

```typescript
function processValue(value: number): string {
  if (value > 10) {
    return "high"
  }
  return "low"
}
```

```typescript
function checkItems(items: string[]): void {
  for (const item of items) {
    if (item.length > 5) {
      console.log("Long item:", item)
      continue
    }
    console.log("Short item:", item)
  }
}
```
