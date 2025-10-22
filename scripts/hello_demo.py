"""
A simple script included only to create additional diff content
for Aido’s summarize test.
"""

from datetime import datetime


def greet(name: str) -> None:
    """Print a friendly greeting with a timestamp."""
    print(f"[{datetime.now().isoformat()}] Hello, {name}!")


if __name__ == "__main__":
    greet("Aido")
