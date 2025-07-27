---
include: *.py
---

When using try-except blocks in Python, keep the try block focused only on the code that can raise the expected exception.

Bad:

```python
try:
    # Large block of code with many potential errors
    user_data = get_user_data()
    process_data(user_data)
    save_to_db(user_data)
except (NetworkError, DBError):
    logger.error("Operation failed")
```

Bad:

```python
try:
    # Contains only one potential error but still
    # has a block of code unrelated to the exception
    url = "https://google.com"
    url += "/?search=hello"
    response = requests.get(url)
    data = response.json()
    print(data)
except NetworkError as e:
    logger.error(f"Error: {e}")
```

Bad:

```python
# Try except blocks are nested into each other
try:
    response = client.beta.chat.completions.parse(
        model="some-model",
        messages=[
            {"role": "system", "content": "hello"},
            {"role": "user", "content": "how are you"},
        ],
    )
    try:
        json.loads(response.choices[0].message.parsed)
    except json.JSONDecodeError as e:
        logger.error(f"Decode failed: {e}")
except requests.RequestException as e:
    logger.error(f"Error: {e}")
```

Good:

```python
try:
    # Only one function that could have an error
    user_data = get_user_data()
except NetworkError:
    logger.error("Failed to fetch user data")
    return

# Cannot raise an exception so it doesn't need to be handled
process_data(user_data)

try:
    # Only one potential error
    save_to_db(user_data)
except DBError:
    logger.error("Failed to save to database")
    return
```

Good:

```python
url = "https://google.com"
url += "/?search=hello"

# Network call is a separate try except block
try:
    response = requests.get(url)
    response.raise_for_status()
except RequestException as e:
    logger.error(f"Error: {e}")

# Getting response in json is a separate try except block
try:
    data = response.json()
except JSONDecodeError as e:
    logger.error(f"Error: {e}")
```

Good:

```python
# Blocks that were nested before are now unnested
# into separate blocks
try:
    response = client.beta.chat.completions.parse(
        model="some-model",
        messages=[
            {"role": "system", "content": "hello"},
            {"role": "user", "content": "how are you"},
        ],
    )
except requests.RequestException as e:
    logger.error(f"Error: {e}")

try:
    json.loads(response.choices[0].message.parsed)
except json.JSONDecodeError as e:
    logger.error(f"Decode failed: {e}")
```
