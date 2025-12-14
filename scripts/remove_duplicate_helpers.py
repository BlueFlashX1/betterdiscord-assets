#!/usr/bin/env python3
"""
Script to remove duplicate helper functions from Section 3 of CriticalHit.plugin.js
These functions have been moved to Section 2 and should not be duplicated.
"""

import re
import sys

# Helper functions that should only exist in Section 2
HELPER_FUNCTIONS_TO_REMOVE = [
    "normalizeMessageData",
    "updatePendingCritsQueue",
    "findExistingHistoryEntry",
    "findMessagesInDOM",
    "matchCritToMessage",
    "restoreSingleCrit",
    "setupRestorationRetryObserver",
    "applyGradientStylesWithSettings",
    "setupGradientRetryObserver",
    "applySolidColorStyles",
    "applyFontStyles",
    "applyGlowEffect",
    "setupGradientMonitoring",
    "setupGradientRestorationRetryObserver",
    "isInHeaderArea",
    "findMessageContentForStyling",
    "applyGradientToContentForStyling",
    "applySolidColorToContentForStyling",
    "applyGlowToContentForStyling",
    "handleQueuedMessage",
    "calculateCritRoll",
    "processNewCrit",
    "processNonCrit",
    "findMessageElementForRestoration",
    "shouldThrottleRestorationCheck",
    "calculateContentHashForRestoration",
    "findHistoryEntryForRestoration",
]

# Section 3 starts after this line
SECTION_3_START_MARKER = "// ============================================\n// SECTION 3: MAJOR OPERATIONS\n// ============================================"


def find_function_definition(lines, func_name, start_line):
    """
    Find a complete function definition including JSDoc comments.
    Returns (start_index, end_index) or None if not found.
    """
    # Pattern to match function definition: functionName( or functionName (
    # Handle both method syntax: funcName( and class method: funcName(
    func_pattern = re.compile(rf"^\s*{re.escape(func_name)}\s*\([^)]*\)\s*\{{")

    # Look for the function starting from start_line
    func_start = None
    for i in range(start_line, len(lines)):
        if func_pattern.match(lines[i]):
            func_start = i
            break

    if func_start is None:
        return None

    # Find the start of JSDoc comment (look backwards for /**)
    # Also check for regular comments before the function
    doc_start = func_start
    for i in range(func_start - 1, max(0, func_start - 30), -1):
        line = lines[i].strip()
        if line.startswith("/**"):
            doc_start = i
            # Check if there are blank lines before the comment - include them
            while doc_start > 0 and lines[doc_start - 1].strip() == "":
                doc_start -= 1
            break
        elif line.startswith("//") and "Helper" in line or "from" in line.lower():
            # Might be a section comment, don't include it
            break
        elif line and not line.startswith("//") and not line.startswith("*"):
            # Hit actual code, stop looking
            break

    # Find the end of the function (matching braces)
    brace_count = 0
    func_end = None
    in_function = False
    in_string = False
    string_char = None

    for i in range(func_start, len(lines)):
        line = lines[i]

        # Simple string detection (not perfect but good enough for JS)
        j = 0
        while j < len(line):
            char = line[j]

            # Handle string literals
            if char in ('"', "'", "`") and (j == 0 or line[j - 1] != "\\"):
                if not in_string:
                    in_string = True
                    string_char = char
                elif char == string_char:
                    in_string = False
                    string_char = None

            # Only count braces when not in string
            if not in_string:
                if char == "{":
                    brace_count += 1
                    in_function = True
                elif char == "}":
                    brace_count -= 1
                    if in_function and brace_count == 0:
                        func_end = i + 1  # Include the closing brace line
                        break

            j += 1

        if func_end is not None:
            break

    if func_end is None:
        print(
            f"Warning: Could not find end of function {func_name} starting at line {func_start + 1}"
        )
        return None

    # Include trailing blank line if present
    if func_end < len(lines) and lines[func_end].strip() == "":
        func_end += 1

    return (doc_start, func_end)


def remove_duplicate_functions(file_path):
    """Remove duplicate helper functions from Section 3."""

    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    # Find where Section 3 starts
    section_3_start = None
    for i, line in enumerate(lines):
        if "SECTION 3: MAJOR OPERATIONS" in line:
            section_3_start = i
            break

    if section_3_start is None:
        print("Error: Could not find Section 3 start marker")
        return False

    print(f"Found Section 3 starting at line {section_3_start + 1}")

    # Track removals
    removed_functions = []
    total_removed_lines = 0

    # Process functions in reverse order to maintain line numbers
    for func_name in reversed(HELPER_FUNCTIONS_TO_REMOVE):
        # Find all occurrences of this function in Section 3
        func_def = find_function_definition(lines, func_name, section_3_start)

        if func_def:
            start_idx, end_idx = func_def
            # Only remove if it's in Section 3 (after section_3_start)
            if start_idx >= section_3_start:
                removed_lines = end_idx - start_idx
                print(f"Removing {func_name} (lines {start_idx + 1}-{end_idx})")

                # Remove the function
                del lines[start_idx:end_idx]
                removed_functions.append(func_name)
                total_removed_lines += removed_lines
            else:
                print(
                    f"Skipping {func_name} - found before Section 3 (line {start_idx + 1})"
                )
        else:
            print(f"Function {func_name} not found in Section 3")

    # Write the cleaned file
    if removed_functions:
        with open(file_path, "w", encoding="utf-8") as f:
            f.writelines(lines)

        print(
            f"\n✅ Successfully removed {len(removed_functions)} duplicate functions:"
        )
        for func in removed_functions:
            print(f"  - {func}")
        print(f"\nTotal lines removed: {total_removed_lines}")
        return True
    else:
        print("\nNo duplicate functions found to remove.")
        return False


if __name__ == "__main__":
    file_path = "/Users/matthewthompson/Documents/DEVELOPMENT/betterdiscord-dev/plugins/CriticalHit.plugin.js"

    print("Removing duplicate helper functions from Section 3...")
    print("=" * 60)

    success = remove_duplicate_functions(file_path)

    if success:
        print("\n✅ Cleanup complete!")
    else:
        print("\n⚠️  No changes made.")
        sys.exit(1)
