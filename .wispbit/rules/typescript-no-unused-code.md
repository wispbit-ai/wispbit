---
include: *.ts
---

Do not leave commented-out code blocks. Delete unused code instead of commenting it out.

Bad:

```typescript
function calculateTotal(items: Item[]): number {
  let total = 0

  // Old implementation
  // for (let i = 0; i < items.length; i++) {
  //   const item = items[i];
  //   total += item.price * item.quantity;
  //   if (item.discounted) {
  //     total -= item.discountAmount;
  //   }
  // }

  // New implementation
  for (const item of items) {
    total += item.price * item.quantity * (item.discounted ? 0.9 : 1)
  }

  return total
}
```

Good:

```typescript
function calculateTotal(items: Item[]): number {
  let total = 0

  for (const item of items) {
    total += item.price * item.quantity * (item.discounted ? 0.9 : 1)
  }

  return total
}
```
