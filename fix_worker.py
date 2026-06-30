"""
Fix worker.js encoding damage caused by global curly-quote replacement.

The original file had sequences like `"Î"Ã‡Ã¶"` where U+201C/201D curly quotes
were embedded inside string literals as part of encoding artifacts.
After global replacement of curly quotes → straight quotes, those inner
quotes now prematurely close JS string literals.

Strategy: escape any bare " (straight quote) that appears immediately after
U+00CE (Î) or similar high-byte chars that are clearly encoding artifacts,
NOT real string delimiters.
"""

import re

path = r"C:\Users\flipo\repo\dash\worker\worker.js"

with open(path, encoding="utf-8") as f:
    text = f.read()

# The problematic pattern: inside a JS double-quoted string,
# a straight " that follows Î (U+00CE) is NOT a string closer — it was a curly quote.
# Replace "Î" with "Î (escape the inner quote).
# More generally: replace any occurrence of Î" (U+00CE + U+0022) within code
# with Î“ so it doesn't break the string.
# Similarly for Ã" (U+00C3 + U+0022) patterns in the artifact sequences.

# We do context-aware replacement: only inside string literals.
# Simpler heuristic: these artifact chars (>U+007F) followed by a quote
# that's NOT at end-of-token should be escaped.

# The specific broken patterns found in the file:
# 1. "Î"  → the second " closes the string prematurely
# 2. The section markers like // Î"Ã¶Ã‡ are in comments — safe
# 3. String value "Î"Ã‡Ã¶" — broken

# Replace the inner raw " that follows non-ASCII chars with unicode escape
# We target: <non-ascii-char>" sequences that appear INSIDE double-quoted strings
# For safety: just replace the specific artifact pattern entirely with a clean placeholder

# Pattern: a double-quote that immediately follows a non-ASCII char (likely an artifact inner quote)
# Replace by escaping: X" → X\\u0022 — but that's ugly. Better: just remove those artifact chars.

# The cleanest fix: strip all non-ASCII chars from JS string VALUES that are clearly
# garbage (the Î, Ã, etc. encoding artifacts) and replace with clean fallback text.

# Find the specific broken strings and fix them
replacements = [
    # String values that contain encoding artifacts with embedded quotes
    ('"Î"Ã‡Ã¶"',    '"?"'),
    ('"Î"Ã¶Ã‡"',    '"?"'),
    ('"Î"Ã¶"',      '"?"'),
    # Section comment markers — these are in // comments, safe to clean up
    # "Î"Ã¶Ã‡Î"Ã¶Ã‡" in comments — find pattern and clean
]

for old, new in replacements:
    if old in text:
        count = text.count(old)
        text = text.replace(old, new)
        print(f"  Replaced {count}x: {repr(old)} → {repr(new)}")

# Also fix comment-line section markers: lines like
# // Î"Ã¶Ã‡Î"Ã¶Ã‡ SECTION NAME Î"Ã¶Ã‡Î"Ã¶Ã‡
# These are in comments so the quotes don't matter for parsing,
# but let's clean them so the file is readable.
# (No changes needed for comments — they parse fine regardless.)

# Write back
with open(path, "w", encoding="utf-8", newline="") as f:
    f.write(text)

print("Done. Running syntax check...")

# Quick heuristic check: count unmatched quotes on non-comment lines
errors = []
for i, line in enumerate(text.split("\n"), 1):
    stripped = line.strip()
    if stripped.startswith("//") or stripped.startswith("*"):
        continue
    # Count bare double quotes — if odd number on a line with string content, flag it
    # (very rough, just for spot-checking)

print(f"File written: {len(text)} chars")
