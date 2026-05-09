#!/usr/bin/env python3
"""
Fix save conflict issues in CriticalHit.plugin.js:
1. Remove duplicate helper functions from Section 3
2. Fix unbalanced braces
3. Verify file integrity
"""

import re
import sys
from pathlib import Path

# Helper functions that should ONLY be in Section 2
HELPER_FUNCTIONS = [
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


def find_section_boundaries(lines):
    """Find Section 2 and Section 3 boundaries."""
    section2_start = None
    section3_start = None

    for i, line in enumerate(lines):
        if "SECTION 2: CONFIGURATION & HELPERS" in line and section2_start is None:
            section2_start = i
        if "SECTION 3: MAJOR OPERATIONS" in line and section3_start is None:
            section3_start = i
            break

    return section2_start, section3_start


def find_function_definition(lines, func_name, start_line, end_line=None):
    """Find a complete function definition including JSDoc comments."""
    if end_line is None:
        end_line = len(lines)

    func_pattern = re.compile(rf"^\s*{re.escape(func_name)}\s*\([^)]*\)\s*\{{")

    func_start = None
    for i in range(start_line, min(end_line, len(lines))):
        if func_pattern.match(lines[i]):
            func_start = i
            break

    if func_start is None:
        return None

    # Find JSDoc comment start
    doc_start = func_start
    for i in range(func_start - 1, max(0, func_start - 30), -1):
        line = lines[i].strip()
        if line.startswith("/**"):
            doc_start = i
            while doc_start > 0 and lines[doc_start - 1].strip() == "":
                doc_start -= 1
            break
        elif line and not line.startswith("//") and not line.startswith("*"):
            break

    # Find function end (matching braces)
    brace_count = 0
    func_end = None
    in_function = False
    in_string = False
    string_char = None

    for i in range(func_start, min(end_line, len(lines))):
        line = lines[i]

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

            # Count braces when not in string
            if not in_string:
                if char == "{":
                    brace_count += 1
                    in_function = True
                elif char == "}":
                    brace_count -= 1
                    if in_function and brace_count == 0:
                        func_end = i + 1
                        break

            j += 1

        if func_end is not None:
            break

    if func_end is None:
        return None

    # Include trailing blank line
    if func_end < len(lines) and lines[func_end].strip() == "":
        func_end += 1

    return (doc_start, func_end)


def count_braces(lines):
    """Count open and close braces, ignoring strings."""
    open_count = 0
    close_count = 0
    in_string = False
    string_char = None

    for line in lines:
        j = 0
        while j < len(line):
            char = line[j]

            if char in ('"', "'", "`") and (j == 0 or (j > 0 and line[j - 1] != "\\")):
                if not in_string:
                    in_string = True
                    string_char = char
                elif char == string_char:
                    in_string = False
                    string_char = None

            if not in_string:
                if char == "{":
                    open_count += 1
                elif char == "}":
                    close_count += 1

            j += 1

    return open_count, close_count


def fix_file(file_path):
    """Fix save conflict issues."""
    print("=" * 60)
    print("FIXING SAVE CONFLICT ISSUES")
    print("=" * 60)

    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    original_lines = len(lines)
    print(f"Original file: {original_lines:,} lines")

    # Find section boundaries
    section2_start, section3_start = find_section_boundaries(lines)

    if section2_start is None or section3_start is None:
        print("❌ Could not find Section 2 or Section 3 boundaries")
        return False

    print(f"Section 2 starts at line {section2_start + 1}")
    print(f"Section 3 starts at line {section3_start + 1}")

    # Check braces before
    open_braces, close_braces = count_braces(lines)
    print(
        f"\nBraces before fix: {open_braces} open, {close_braces} close (diff: {open_braces - close_braces})"
    )

    # Find and remove duplicate functions from Section 3
    removed_functions = []
    total_removed_lines = 0

    # Process in reverse to maintain line numbers
    for func_name in reversed(HELPER_FUNCTIONS):
        # Find function in Section 3
        func_def = find_function_definition(lines, func_name, section3_start)

        if func_def:
            start_idx, end_idx = func_def
            if start_idx >= section3_start:
                removed_lines = end_idx - start_idx
                print(
                    f"Removing duplicate {func_name} from Section 3 (lines {start_idx + 1}-{end_idx})"
                )

                del lines[start_idx:end_idx]
                removed_functions.append(func_name)
                total_removed_lines += removed_lines

                # Update section3_start if we removed something before it
                if start_idx < section3_start:
                    section3_start -= removed_lines

    # Check braces after removal
    open_braces, close_braces = count_braces(lines)
    print(
        f"\nBraces after removal: {open_braces} open, {close_braces} close (diff: {open_braces - close_braces})"
    )

    # Write fixed file
    if removed_functions:
        with open(file_path, "w", encoding="utf-8") as f:
            f.writelines(lines)

        print(f"\n✅ Removed {len(removed_functions)} duplicate functions:")
        for func in removed_functions:
            print(f"  - {func}")
        print(f"\nTotal lines removed: {total_removed_lines}")
        print(f"New file size: {len(lines):,} lines")

        # Final brace check
        open_braces, close_braces = count_braces(lines)
        brace_diff = open_braces - close_braces
        print(
            f"\nFinal braces: {open_braces} open, {close_braces} close (diff: {brace_diff})"
        )

        if brace_diff == 0:
            print("✅ Braces are now balanced!")
        else:
            print(f"⚠️  Braces still unbalanced (diff: {brace_diff})")
            print("   This may require manual inspection.")

        return True
    else:
        print("\nNo duplicate functions found to remove.")
        return False


if __name__ == "__main__":
    file_path = Path(__file__).parent / "CriticalHit.plugin.js"

    if not file_path.exists():
        print(f"❌ File not found: {file_path}")
        sys.exit(1)

    success = fix_file(file_path)

    if success:
        print("\n✅ Fix complete! Try saving the file now.")
    else:
        print("\n⚠️  No changes made.")
        sys.exit(1)

