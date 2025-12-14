#!/usr/bin/env python3
"""
Comprehensive fix for all orphaned code in CriticalHit.plugin.js
Removes all code that's at class level but not inside function definitions.
"""

import re


def is_function_definition(line):
    """Check if line is a function definition."""
    stripped = line.strip()
    # Function pattern: methodName( or methodName (
    if re.match(r"^\s*\w+\s*\([^)]*\)\s*\{?\s*$", line):
        return True
    return False


def is_javadoc_start(line):
    """Check if line starts JSDoc comment."""
    return line.strip().startswith("/**")


def is_section_header(line):
    """Check if line is a section header."""
    return "// =" in line and (
        "HELPERS" in line or "SECTION" in line or "CONFIGURATION" in line
    )


def fix_all_orphaned_code(file_path):
    """Remove all orphaned code blocks."""
    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    new_lines = []
    i = 0
    removed_count = 0
    in_class = False
    brace_level = 0

    # Find where class starts
    class_start = None
    for j, line in enumerate(lines):
        if "module.exports = class CriticalHit" in line or "class CriticalHit" in line:
            class_start = j
            break

    if not class_start:
        print("Could not find class definition")
        return False

    print(f"Class starts at line {class_start + 1}")

    # Process lines
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Track brace level
        brace_level += line.count("{") - line.count("}")

        # Before class, keep everything
        if i < class_start:
            new_lines.append(line)
            i += 1
            continue

        # Check if this is a function definition
        is_func_def = is_function_definition(line)
        is_javadoc = is_javadoc_start(line)
        is_section = is_section_header(line)

        # If JSDoc, check if next line is function
        if is_javadoc:
            # Look ahead for function
            func_found = False
            for j in range(i + 1, min(i + 10, len(lines))):
                if is_function_definition(lines[j]):
                    func_found = True
                    break
                if (
                    lines[j].strip()
                    and not lines[j].strip().startswith("*")
                    and not lines[j].strip().startswith("//")
                ):
                    break

            if func_found:
                # This JSDoc belongs to a function - keep it
                new_lines.append(line)
                i += 1
                continue

        # If function definition, we're entering a function
        if is_func_def:
            new_lines.append(line)
            i += 1
            continue

        # If section header, keep it
        if is_section:
            new_lines.append(line)
            i += 1
            continue

        # If we're inside braces (in a function), keep the line
        if brace_level > 0:
            new_lines.append(line)
            i += 1
            continue

        # If blank line or comment, keep it
        if not stripped or stripped.startswith("//") or stripped.startswith("*"):
            new_lines.append(line)
            i += 1
            continue

        # This is orphaned code at class level - remove it
        print(f"Removing orphaned code at line {i+1}: {stripped[:70]}")
        removed_count += 1
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
    fix_all_orphaned_code(file_path)
    fix_all_orphaned_code(file_path)

