#!/usr/bin/env python3
"""Detect problematic characters on line 275 of script-copy.ts."""
import os

filepath = os.path.join(os.path.dirname(__file__), 'script-copy.ts')

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

line = lines[274]  # 0-indexed
print(f"Line 275 length: {len(line)}")
print(f"Line 275 content: {line[:200]}")
print()
print("Non-ASCII characters:")
for i, ch in enumerate(line):
    code = ord(ch)
    if code > 127:
        print(f"  pos {i}: U+{code:04X} ({ch})")
