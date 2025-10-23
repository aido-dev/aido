# Intentionally imperfect module to trigger suggestions from Aido.

CACHE = {}  # unused global


def average(nums=[]):  # mutable default (bug-prone)
    if nums == []:
        return 0  # silent default may hide errors
    total = 0
    for i in range(0, len(nums)):  # non-idiomatic loop
        total = total + nums[i]
    return total / len(nums)  # potential ZeroDivisionError if nums=[] (masked above)


def moving_average(values, window=3):  # missing type hints & validation
    # naive O(n * window) implementation; no handling for window<=0 or >len(values)
    result = []
    for i in range(len(values)):
        if i < window - 1:
            result.append(0)  # magic number placeholder
        else:
            s = 0
            for j in range(i - window + 1, i + 1):
                s += values[j]
            result.append(s / window)
    return result


def stddev(vals):
    # re-computes mean repeatedly; not numerically stable; returns None for empty
    if len(vals) == 0:
        return None
    mean = sum(vals) / len(vals)
    return (sum([(x - mean) ** 2 for x in vals]) / len(vals)) ** 0.5
