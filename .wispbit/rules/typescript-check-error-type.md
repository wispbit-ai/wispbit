---
include: *.ts
---

Always check the error type in catch blocks and handle specific error types explicitly.

Bad:

```typescript
try {
  // Some operation
} catch (error) {
  // Converting all errors to a specific type without checking
  throw new CredentialNotFoundError(id, type)
}
```

Good:

```typescript
try {
  // Some operation
} catch (error) {
  // Check specific error type first
  if (error instanceof EntityNotFoundError) {
    throw new CredentialNotFoundError(id, type)
  }

  // Pass through other errors
  throw error
}
```
