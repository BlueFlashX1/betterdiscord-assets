#!/usr/bin/env python3
"""
Fix the try-catch structure in checkForCrit function.
The try block should continue until the catch at line 3301.
"""


def fix_try_catch_structure(file_path):
    """Fix try-catch structure."""
    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    # Find the try block that starts checkForCrit
    try_start = None
    catch_line = None

    for i, line in enumerate(lines):
        if "checkForCrit(messageElement)" in line:
            # Find the try on next few lines
            for j in range(i, min(i + 5, len(lines))):
                if "try {" in lines[j] or "try{" in lines[j]:
                    try_start = j
                    break
            break

    if not try_start:
        print("Could not find checkForCrit try block")
        return False

    # Find the catch block
    for i in range(try_start, min(try_start + 400, len(lines))):
        if "} catch (error)" in lines[i] and "CHECK_FOR_CRIT" in "".join(
            lines[i : i + 3]
        ):
            catch_line = i
            break

    if not catch_line:
        print("Could not find catch block")
        return False

    print(f"Try block starts at line {try_start + 1}")
    print(f"Catch block at line {catch_line + 1}")

    # Count braces from try to catch
    brace_count = 1  # Opening brace of try
    in_string = False
    string_char = None

    for i in range(try_start + 1, catch_line + 1):
        line = lines[i]

        j = 0
        while j < len(line):
            char = line[j]

            # Handle escaped characters
            if j > 0 and line[j - 1] == "\\":
                j += 1
                continue

            # Handle string literals
            if char in ('"', "'", "`") and (j == 0 or line[j - 1] != "\\"):
                if not in_string:
                    in_string = True
                    string_char = char
                elif char == string_char:
                    in_string = False
                    string_char = None

            # Count braces when not in string
            if not in_string:
                if char == "{":
                    brace_count += 1
                elif char == "}":
                    brace_count -= 1
                    if brace_count == 0 and i < catch_line:
                        print(f"⚠️  Try block closes early at line {i+1}")
                        print(f"   But catch is at line {catch_line + 1}")
                        print(f"   Line {i+1}: {line.rstrip()[:70]}")
                        # This is the problem - try closes too early
                        # We need to check if this closing brace is correct
                        # or if there's a missing opening brace
                        return False

            j += 1

    print(f"✅ Brace count at catch: {brace_count}")
    if brace_count == 0:
        print("✅ Try-catch structure is correct!")
        return True
    else:
        print(f"❌ Brace mismatch: {brace_count}")
        return False


if __name__ == "__main__":
    from pathlib import Path

    file_path = Path(__file__).parent / "CriticalHit.plugin.js"
    fix_try_catch_structure(file_path)
