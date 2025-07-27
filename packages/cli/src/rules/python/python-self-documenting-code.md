---
include: *.py
---

Avoid unnecessary explanatory comments for code that is self-documenting. Comments should only be used when they add context that the code itself cannot convey.

Bad:

```python
# Join the test directory with the base directory
test_dir = os.path.join(BASE_DIR, test_case.identifier)
```

Good:

```python
test_dir = os.path.join(BASE_DIR, test_case.identifier)
```
