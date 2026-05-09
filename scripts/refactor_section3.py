#!/usr/bin/env python3
"""
Refactor Section 3: Add section headers and refactor if/for loops.
"""

import re
from pathlib import Path


def find_refactorable_code(lines, start_line, end_line):
    """Find code that can be refactored."""
    refactorable = []

    for i in range(start_line, min(end_line, len(lines))):
        line = lines[i]
        stripped = line.strip()

        # Find if statements that can use logical operators
        if_match = re.match(r"^\s*if\s*\(([^)]+)\)\s*\{?\s*$", line)
        if if_match:
            condition = if_match.group(1)
            # Check if it's a simple condition
            if "&&" not in condition and "||" not in condition:
                # Look ahead to see if it's a simple assignment or return
                for j in range(i + 1, min(i + 5, len(lines))):
                    next_line = lines[j].strip()
                    if next_line.startswith("return") or "=" in next_line:
                        refactorable.append(
                            {
                                "type": "if_logical",
                                "line": i + 1,
                                "condition": condition,
                                "code": line.strip(),
                            }
                        )
                        break

        # Find for loops
        for_match = re.match(r"^\s*for\s*\([^)]+\)\s*\{?\s*$", line)
        if for_match:
            # Check if it's iterating over an array
            if "of " in line or "in " in line:
                refactorable.append(
                    {"type": "for_loop", "line": i + 1, "code": line.strip()}
                )

    return refactorable


if __name__ == "__main__":
    file_path = Path(__file__).parent / "CriticalHit.plugin.js"
    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    # Find Section 3
    section3_start = None
    for i, line in enumerate(lines):
        if "SECTION 3: MAJOR OPERATIONS" in line:
            section3_start = i
            break

    if section3_start:
        print(f"Section 3 starts at line {section3_start + 1}")
        refactorable = find_refactorable_code(lines, section3_start, len(lines))
        print(f"Found {len(refactorable)} refactorable items")
        for item in refactorable[:20]:
            print(f"  Line {item['line']}: {item['type']} - {item['code'][:60]}")
