"""Fails on what disappeared between two surface captures. New things are fine.

Usage: python scripts/surface/compare.py before.json after.json
"""
import json, sys
a, b = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))
lost = 0
for route, before in a.items():
    after = b.get(route, {})
    for kind in ("links", "controls"):
        gone = sorted(set(before.get(kind, [])) - set(after.get(kind, [])))
        if gone:
            lost += len(gone)
            print(f"{route} {kind} weg: " + " | ".join(gone))
print(f"{lost} verdwenen"); sys.exit(1 if lost else 0)
