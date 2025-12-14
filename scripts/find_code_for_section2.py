#!/usr/bin/env python3
"""
Find code that should be moved and organized into Section 2.
This script identifies helper functions, utility functions, and code patterns
that should be extracted from Section 3 and moved to Section 2.
"""

import re
from collections import defaultdict
from pathlib import Path


def is_helper_function(func_name, func_body):
    """Check if a function is a helper function (should be in Section 2)."""
    # Helper functions are typically:
    # - Small, focused functions
    # - Used by multiple other functions
    # - Don't have side effects (or minimal)
    # - Utility/helper in nature

    helper_indicators = [
        "normalize",
        "find",
        "get",
        "check",
        "verify",
        "validate",
        "calculate",
        "apply",
        "setup",
        "create",
        "update",
        "process",
        "handle",
        "match",
        "restore",
        "should",
        "is",
        "has",
    ]

    func_lower = func_name.lower()
    return any(indicator in func_lower for indicator in helper_indicators)


def find_function_definitions(lines, section3_start):
    """Find all function definitions in Section 3."""
    functions = []
    current_func = None
    brace_count = 0
    in_string = False
    string_char = None

    for i in range(section3_start, len(lines)):
        line = lines[i]
        stripped = line.strip()

        # Track string literals
        j = 0
        while j < len(line):
            char = line[j]
            if j > 0 and line[j - 1] == "\\":
                j += 1
                continue
            if char in ('"', "'", "`") and (j == 0 or line[j - 1] != "\\"):
                if not in_string:
                    in_string = True
                    string_char = char
                elif char == string_char:
                    in_string = False
                    string_char = None
            j += 1

        # Check for function definition (not if/while/for statements)
        if not in_string:
            # Pattern: methodName( or methodName ( - but NOT if/while/for/switch/catch
            func_match = re.match(r"^\s*(\w+)\s*\([^)]*\)\s*\{?\s*$", line)
            if (
                func_match
                and not stripped.startswith("//")
                and not stripped.startswith("*")
            ):
                func_name = func_match.group(1)
                # Skip control flow statements
                if func_name.lower() in [
                    "if",
                    "while",
                    "for",
                    "switch",
                    "catch",
                    "else",
                ]:
                    continue
                # Check if it's a JSDoc comment before
                has_doc = i > 0 and lines[i - 1].strip().startswith("/**")
                doc_start = i - 20 if has_doc else i
                # Find backwards for JSDoc
                while doc_start > 0 and doc_start > i - 30:
                    if lines[doc_start].strip().startswith("/**"):
                        break
                    doc_start -= 1

                current_func = {
                    "name": func_name,
                    "start": (
                        doc_start if lines[doc_start].strip().startswith("/**") else i
                    ),
                    "line": i + 1,
                    "body_start": i,
                    "brace_count": 0,
                }
                brace_count = 1  # Opening brace of function
                continue

        # Track function body
        if current_func:
            if not in_string:
                brace_count += line.count("{") - line.count("}")
                if brace_count == 0:
                    current_func["end"] = i + 1
                    current_func["body"] = "\n".join(
                        lines[current_func["body_start"] : i + 1]
                    )
                    functions.append(current_func)
                    current_func = None
                    brace_count = 0

    return functions


def analyze_function_usage(func_name, lines):
    """Analyze how often a function is used."""
    pattern = re.compile(rf"\b{re.escape(func_name)}\s*\(")
    count = 0
    for line in lines:
        count += len(pattern.findall(line))
    return count


def find_code_for_section2(file_path):
    """Find code that should be moved to Section 2."""
    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    # Find Section 2 and Section 3 boundaries
    section2_start = None
    section3_start = None

    for i, line in enumerate(lines):
        if "SECTION 2: CONFIGURATION & HELPERS" in line:
            section2_start = i
        if "SECTION 3: MAJOR OPERATIONS" in line:
            section3_start = i
            break

    if not section2_start or not section3_start:
        print("Could not find Section 2 or Section 3")
        return

    print(f"Section 2 starts at line {section2_start + 1}")
    print(f"Section 3 starts at line {section3_start + 1}")
    print("=" * 60)

    # Find functions already in Section 2
    section2_functions = []
    for i in range(section2_start, section3_start):
        line = lines[i]
        func_match = re.match(r"^\s*(\w+)\s*\([^)]*\)\s*\{?\s*$", line)
        if func_match:
            func_name = func_match.group(1)
            if func_name.lower() not in [
                "if",
                "while",
                "for",
                "switch",
                "catch",
                "else",
            ]:
                section2_functions.append({"name": func_name})

    section2_func_names = {f["name"] for f in section2_functions}
    print(f"\nFunctions already in Section 2: {len(section2_func_names)}")

    # Find all functions in Section 3
    functions = find_function_definitions(lines, section3_start)

    print(f"\nFound {len(functions)} functions in Section 3")

    # Analyze each function
    candidates = []

    for func in functions:
        func_name = func["name"]
        body = func["body"]
        line_num = func["line"]

        # Skip if already in Section 2
        if func_name in section2_func_names:
            continue

        # Skip major operations that should stay in Section 3
        major_operations = [
            "addToHistory",
            "restoreChannelCrits",
            "checkForCrit",
            "checkForRestoration",
            "applyCritStyle",
            "applyCritStyleWithSettings",
            "onCritHit",
            "showAnimation",
            "start",
            "stop",
            "loadSettings",
            "saveSettings",
            "getSettingsPanel",
            "injectCritCSS",
            "injectSettingsCSS",
            "testCrit",
        ]
        if func_name in major_operations:
            continue

        # Check if it's a helper function
        is_helper = is_helper_function(func_name, body)

        # Count usage
        usage_count = analyze_function_usage(func_name, lines)

        # Calculate function size
        func_size = func["end"] - func["start"]

        # Check characteristics
        characteristics = []
        if is_helper:
            characteristics.append("Helper pattern")
        if usage_count > 1:
            characteristics.append(f"Used {usage_count} times")
        if func_size < 50:
            characteristics.append("Small function")
        if "find" in func_name.lower() or "get" in func_name.lower():
            characteristics.append("Utility function")
        if "apply" in func_name.lower() or "setup" in func_name.lower():
            characteristics.append("Helper function")

        if characteristics:
            candidates.append(
                {
                    "name": func_name,
                    "line": line_num,
                    "size": func_size,
                    "usage": usage_count,
                    "characteristics": characteristics,
                    "start": func["start"],
                    "end": func["end"],
                }
            )

    # Sort by priority (usage count, then characteristics)
    candidates.sort(key=lambda x: (x["usage"], len(x["characteristics"])), reverse=True)

    print(f"\n{'='*60}")
    print("CODE THAT SHOULD BE MOVED TO SECTION 2")
    print(f"{'='*60}")
    print(f"\nFound {len(candidates)} candidate functions:\n")

    for i, candidate in enumerate(candidates, 1):
        print(f"{i}. {candidate['name']} (line {candidate['line']})")
        print(f"   Size: {candidate['size']} lines")
        print(f"   Usage: {candidate['usage']} times")
        print(f"   Characteristics: {', '.join(candidate['characteristics'])}")
        print()

    # Also find inline helper code patterns
    print(f"\n{'='*60}")
    print("INLINE HELPER CODE PATTERNS")
    print(f"{'='*60}\n")

    # Look for repeated code patterns that could be extracted
    patterns = defaultdict(list)

    for i in range(section3_start, len(lines)):
        line = lines[i]
        # Look for common helper patterns
        if re.search(r"\.find\(|\.filter\(|\.map\(|\.reduce\(", line):
            # Check if this is part of a larger function
            # (would need more context analysis)
            pass

    return candidates


if __name__ == "__main__":
    file_path = Path(__file__).parent / "CriticalHit.plugin.js"
    find_code_for_section2(file_path)
