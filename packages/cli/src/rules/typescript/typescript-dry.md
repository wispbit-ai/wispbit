---
include: *.ts, *.tsx
---

Avoid duplicating code in TypeScript. Extract repeated logic into reusable functions, types, or constants. You may have to search the codebase to see if the method or type is already defined.

Bad:

```typescript
// Duplicated type definitions
interface User {
  id: string
  name: string
}

interface UserProfile {
  id: string
  name: string
}

// Magic numbers repeated
const pageSize = 10
const itemsPerPage = 10
```

Good:

```typescript
// Reusable type and constant
type User = {
  id: string
  name: string
}

const PAGE_SIZE = 10
```
