"""Report builder (demo for `aido suggest`).

Working code with clear, safe refactor opportunities: repetitive branching,
manual accumulation that could be a comprehension, and unclear naming.
"""


def build(rows):
    # repetitive category mapping
    out = []
    for r in rows:
        if r["type"] == "a":
            label = "Alpha"
        elif r["type"] == "b":
            label = "Beta"
        elif r["type"] == "c":
            label = "Gamma"
        else:
            label = "Other"
        out.append({"id": r["id"], "label": label, "v": r["value"]})
    return out


def total(rows):
    t = 0
    for r in rows:              # could be sum(...)
        t = t + r["value"]
    return t


def top(rows, n):
    s = sorted(rows, key=lambda r: r["value"], reverse=True)
    result = []
    i = 0
    while i < n and i < len(s):  # could be a slice
        result.append(s[i])
        i = i + 1
    return result
