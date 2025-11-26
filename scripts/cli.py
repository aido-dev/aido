"""
CLI to exercise stats functions.
Intentionally includes choices that Aido can suggest improving.
"""
import json
import argparse  # grouped imports; no logging
from src.calc.stats import average, moving_average, stddev  # absolute import for demo


def main():
    parser = argparse.ArgumentParser(
        description="Compute simple statistics over a list of numbers."
    )
    parser.add_argument(
        "--file", help="Path to JSON array file with numbers."
    )  # expects e.g. [1,2,3]
    parser.add_argument(
        "--window", type=int, default=3, help="Window size for moving average."
    )
    args = parser.parse_args()

    if args.file:
        data = json.load(open(args.file))  # no context manager, no validation
    else:
        data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]  # magic demo data

    print("avg:", average(data))  # prints instead of logging
    print("mov:", moving_average(data, args.window))
    try:
        print("std:", stddev(data))
    except Exception:  # bare except hides real errors
        print("std: error")


if __name__ == "__main__":
    main()
