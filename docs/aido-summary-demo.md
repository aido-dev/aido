# Aido Summarize Demo

This document exists to test Aido’s **summarize command**.
It contains multiple sections and a small code snippet to help Aido produce a meaningful summary.

## Section 1: Purpose
The purpose of this demo is to verify that Aido can accurately summarize PR content across multiple files.

## Section 2: Example Code
Below is a trivial Python snippet to make the diff non-trivial.

```python
def greet(name: str) -> str:
    """Return a friendly greeting."""
    return f"Hello, {name}!"
```

## Section 3: Expected Behavior

When aido summarize is triggered on this PR, it should produce a short description of:
- The new Markdown document.
- The small Python example.
- The intent of the PR (testing the summarize command).
