#!/usr/bin/env python3
"""
Remove all orphaned code blocks that are outside function definitions.
Orphaned code appears after section headers but before function definitions.
"""

import re


def is_function_definition(line):
    """Check if a line is a function definition."""
    # Pattern: function name( or methodName(
    pattern = r"^\s*\w+\s*\([^)]*\)\s*\{?\s*$"
    if re.match(pattern, line):
        return True
    # Check for JSDoc comment before function
    if line.strip().startswith("/**"):
        return True
    return False


def is_section_header(line):
    """Check if a line is a section header."""
    return "// =" in line and ("HELPERS" in line or "SECTION" in line)


def fix_orphaned_code(file_path):
    """Remove orphaned code blocks."""
    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    new_lines = []
    i = 0
    removed_count = 0
    in_function = False
    brace_count = 0

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Track if we're inside a function
        if "{" in line:
            brace_count += line.count("{")
        if "}" in line:
            brace_count -= line.count("}")

        # Check if this is a function definition
        if is_function_definition(line) or (
            i + 1 < len(lines) and is_function_definition(lines[i + 1])
        ):
            in_function = True
            new_lines.append(line)
            i += 1
            continue

        # Check if we're after a section header
        if i > 0 and is_section_header(lines[i - 1]):
            # Look ahead to see if there's a function definition coming
            has_function_ahead = False
            for j in range(i, min(i + 50, len(lines))):
                if is_function_definition(lines[j]) or lines[j].strip().startswith(
                    "/**"
                ):
                    has_function_ahead = True
                    break
                # If we hit another section header, stop
                if is_section_header(lines[j]):
                    break

            # If there's code before the function and it's not a comment, it's orphaned
            if (
                not has_function_ahead
                and stripped
                and not stripped.startswith("//")
                and not stripped.startswith("*")
                and not stripped.startswith("/**")
            ):
                # This is orphaned code - skip until we find a function or section header
                print(f"Found orphaned code at line {i+1}: {stripped[:60]}")
                skip_until = i
                while skip_until < len(lines) and skip_until < i + 500:
                    check_line = lines[skip_until]
                    check_stripped = check_line.strip()

                    # Stop at function definition
                    if is_function_definition(check_line) or check_stripped.startswith(
                        "/**"
                    ):
                        break
                    # Stop at next section header
                    if is_section_header(check_line):
                        break
                    # Stop at class method (starts with method name and opening brace)
                    if re.match(r"^\s*\w+\s*\([^)]*\)\s*\{", check_line):
                        break

                    skip_until += 1

                removed_count += skip_until - i
                print(f"  Removing lines {i+1} to {skip_until}")
                i = skip_until
                continue

        new_lines.append(line)
        i += 1

    if removed_count > 0:
        with open(file_path, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
        print(f"\n✅ Removed {removed_count} lines of orphaned code")
        print(f"File now has {len(new_lines)} lines (was {len(lines)})")
        return True
    else:
        print("No orphaned code found")
        return False


if __name__ == "__main__":
    from pathlib import Path

    file_path = Path(__file__).parent / "CriticalHit.plugin.js"
    fix_orphaned_code(file_path)
    fix_orphaned_code(file_path)

