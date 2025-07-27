---
include: *.py
---

Avoid duplicating code in Python. Extract repeated logic into reusable functions, classes, or constants. You may have to search the codebase to see if the function or class is already defined.

Bad:

```python
# Duplicated class definitions
class User:
    def __init__(self, id: str, name: str):
        self.id = id
        self.name = name

class UserProfile:
    def __init__(self, id: str, name: str):
        self.id = id
        self.name = name

# Magic numbers repeated
page_size = 10
items_per_page = 10
```

Good:

```python
# Reusable class and constant
class User:
    def __init__(self, id: str, name: str):
        self.id = id
        self.name = name

PAGE_SIZE = 10
```
