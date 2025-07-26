---
include: *.ts,*.tsx
---

Replace magic numbers with self-documenting expressions when dealing with string operations.

Bad:

```typescript
// Magic number - unclear what it represents
const position = url.indexOf("/", 12)
```

Good:

```typescript
// Self documenting expression
const prefix = "rsc://React/"
const position = url.indexOf("/", prefix.length)
```
