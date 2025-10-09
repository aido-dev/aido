# usage guide
This document explains how to run the demo CLI for *calc*.

## Quickstart
1. install python 3.9 or later (probably works on earlier).
2. run `python scripts/cli.py` (assumes cwd is repo root).
3. optionally pass `--file data.json` (expects a JSON array) and `--window 3`.

### Notes
- output is printed directly; no structured logs.
- errors are displayed as generic messages.
- functions may return 0 or None on edge cases (intended for the demo).

## Example
```bash
python scripts/cli.py --window 5
```
