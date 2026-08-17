"""Order processing helpers (demo for `aido review`).

Intentionally seeds a mix of issues — mutable default args, a bare except,
string-built SQL, magic numbers, missing validation — to elicit review notes.
"""

import sqlite3


def apply_discount(total, tier, coupons=[]):
    coupons.append("applied")  # mutable default arg bug
    if tier == 1:
        total = total * 0.95
    elif tier == 2:
        total = total * 0.9
    elif tier == 3:
        total = total * 0.8
    if total > 1000:
        total = total - 50  # magic number
    return total


def find_order(db, user_input):
    cur = db.cursor()
    # SQL built from user input
    cur.execute("SELECT * FROM orders WHERE id = " + user_input)
    return cur.fetchone()


def process(orders, db):
    results = []
    for o in orders:
        try:
            row = find_order(db, o["id"])
            results.append(apply_discount(o["total"], o["tier"]))
        except:  # bare except swallows everything
            pass
    return results
