#!/usr/bin/env python3
"""
Analyze Section 3 for reorganization and refactoring opportunities.
Identifies if statements and for loops that can be refactored.
"""

import re
from pathlib import Path


def find_if_statements(lines, start_line, end_line):
    """Find if statements that can be refactored."""
    if_statements = []

    for i in range(start_line, min(end_line, len(lines))):
        line = lines[i]
        stripped = line.strip()

        # Find if statements (not if expressions in ternary)
        if_match = re.match(r"^\s*if\s*\([^)]+\)\s*\{?\s*$", line)
        if if_match:
            # Check if it's a simple condition that could use logical operators
            condition = if_match.group(0)
            # Look ahead to see if there's an else
            has_else = False
            for j in range(i + 1, min(i + 20, len(lines))):
                if "} else" in lines[j] or "else {" in lines[j]:
                    has_else = True
                    break
                if lines[j].strip() == "}" and j < len(lines) - 1:
                    if "else" in lines[j + 1]:
                        has_else = True
                    break

            if_statements.append(
                {
                    "line": i + 1,
                    "condition": condition.strip(),
                    "has_else": has_else,
                    "context": "".join(lines[max(0, i - 2) : min(len(lines), i + 5)]),
                }
            )

    return if_statements


def find_for_loops(lines, start_line, end_line):
    """Find for loops that can be refactored to array methods."""
    for_loops = []

    for i in range(start_line, min(end_line, len(lines))):
        line = lines[i]
        stripped = line.strip()

        # Find for loops
        for_patterns = [
            r"^\s*for\s*\([^)]+\)\s*\{?\s*$",  # for (...
            r"^\s*for\s+\([^)]+\)\s*\{?\s*$",  # for (...)
        ]

        for pattern in for_patterns:
            if re.match(pattern, line):
                # Look ahead to see what's in the loop
                loop_body = []
                brace_count = 1
                for j in range(i + 1, min(i + 50, len(lines))):
                    loop_body.append(lines[j])
                    brace_count += lines[j].count("{") - lines[j].count("}")
                    if brace_count == 0:
                        break

                body_text = "".join(loop_body)

                # Check for patterns that suggest array method refactoring
                refactor_type = None
                if "if (" in body_text and "push(" in body_text:
                    refactor_type = "filter"
                elif "push(" in body_text and "if (" not in body_text:
                    refactor_type = "map"
                elif "find(" in body_text or "break" in body_text:
                    refactor_type = "find"
                elif (
                    "reduce(" in body_text or "sum" in body_text or "total" in body_text
                ):
                    refactor_type = "reduce"
                elif "forEach" in body_text:
                    refactor_type = "forEach"

                for_loops.append(
                    {
                        "line": i + 1,
                        "pattern": line.strip(),
                        "refactor_type": refactor_type,
                        "body_lines": len(loop_body),
                    }
                )
                break

    return for_loops


def analyze_section3(file_path):
    """Analyze Section 3 for reorganization."""
    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    # Find Section 3 start
    section3_start = None
    for i, line in enumerate(lines):
        if "SECTION 3: MAJOR OPERATIONS" in line:
            section3_start = i
            break

    if not section3_start:
        print("Could not find Section 3")
        return

    print(f"Section 3 starts at line {section3_start + 1}")
    print("=" * 80)

    # Find existing section headers
    section_headers = []
    for i in range(section3_start, len(lines)):
        if (
            "// ============================================================================"
            in lines[i]
        ):
            # Check next few lines for section name
            for j in range(i + 1, min(i + 5, len(lines))):
                if "// " in lines[j] and "===" not in lines[j]:
                    section_name = lines[j].strip().replace("// ", "")
                    if section_name and section_name not in [
                        "",
                        "SECTION 3: MAJOR OPERATIONS",
                    ]:
                        section_headers.append({"line": i + 1, "name": section_name})
                    break

    print("\nExisting Section Headers in Section 3:")
    for header in section_headers:
        print(f"  Line {header['line']}: {header['name']}")

    # Find if statements
    if_statements = find_if_statements(lines, section3_start, len(lines))
    print(f"\n\nIf Statements Found: {len(if_statements)}")
    print("=" * 80)

    # Group by pattern
    simple_ifs = []
    if_else_chains = []

    for stmt in if_statements[:20]:  # Show first 20
        if stmt["has_else"]:
            if_else_chains.append(stmt)
        else:
            simple_ifs.append(stmt)

    print(f"\nSimple If Statements (can use logical operators): {len(simple_ifs)}")
    for stmt in simple_ifs[:10]:
        print(f"  Line {stmt['line']}: {stmt['condition'][:60]}")

    print(f"\nIf-Else Chains (can use dictionaries): {len(if_else_chains)}")
    for stmt in if_else_chains[:10]:
        print(f"  Line {stmt['line']}: {stmt['condition'][:60]}")

    # Find for loops
    for_loops = find_for_loops(lines, section3_start, len(lines))
    print(f"\n\nFor Loops Found: {len(for_loops)}")
    print("=" * 80)

    refactorable = [f for f in for_loops if f["refactor_type"]]
    print(f"\nRefactorable For Loops: {len(refactorable)}")
    for loop in refactorable[:15]:
        print(f"  Line {loop['line']}: {loop['pattern'][:60]}")
        print(f"    -> Can use: {loop['refactor_type']}")

    return {
        "section_headers": section_headers,
        "if_statements": if_statements,
        "for_loops": for_loops,
        "refactorable_loops": refactorable,
    }


if __name__ == "__main__":
    file_path = Path(__file__).parent / "CriticalHit.plugin.js"
    analyze_section3(file_path)
