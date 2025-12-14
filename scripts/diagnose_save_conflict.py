#!/usr/bin/env python3
"""
Diagnostic script to investigate save conflicts in CriticalHit.plugin.js
"""

import os
import subprocess
from pathlib import Path


def check_git_status():
    """Check git status for conflicts or issues."""
    print("=" * 60)
    print("GIT STATUS CHECK")
    print("=" * 60)

    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=os.path.dirname(__file__),
            capture_output=True,
            text=True,
        )

        if result.returncode == 0:
            output = result.stdout.strip()
            if output:
                print("Git status shows changes:")
                print(output)
            else:
                print("✅ No uncommitted changes")
        else:
            print(f"Error running git status: {result.stderr}")
    except Exception as e:
        print(f"Error checking git status: {e}")


def check_merge_conflicts():
    """Check for merge conflict markers in the file."""
    print("\n" + "=" * 60)
    print("MERGE CONFLICT CHECK")
    print("=" * 60)

    file_path = Path(__file__).parent / "CriticalHit.plugin.js"

    if not file_path.exists():
        print(f"❌ File not found: {file_path}")
        return

    conflict_markers = ["<<<<<<<", "=======", ">>>>>>>"]
    found_conflicts = []

    with open(file_path, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, 1):
            for marker in conflict_markers:
                if marker in line:
                    found_conflicts.append((line_num, marker, line.strip()))

    if found_conflicts:
        print(f"❌ Found {len(found_conflicts)} conflict markers:")
        for line_num, marker, content in found_conflicts[:10]:  # Show first 10
            print(f"  Line {line_num}: {marker} - {content[:80]}")
    else:
        print("✅ No merge conflict markers found")


def check_file_permissions():
    """Check file permissions and locking."""
    print("\n" + "=" * 60)
    print("FILE PERMISSIONS CHECK")
    print("=" * 60)

    file_path = Path(__file__).parent / "CriticalHit.plugin.js"

    if not file_path.exists():
        print(f"❌ File not found: {file_path}")
        return

    stat = file_path.stat()
    print(f"File: {file_path}")
    print(f"Size: {stat.st_size:,} bytes")
    print(f"Permissions: {oct(stat.st_mode)}")
    print(f"Readable: {os.access(file_path, os.R_OK)}")
    print(f"Writable: {os.access(file_path, os.W_OK)}")

    # Check if file is locked (macOS specific)
    try:
        # Try to open in append mode to check for locks
        with open(file_path, "a"):
            print("✅ File is not locked (can open in append mode)")
    except PermissionError:
        print("❌ File appears to be locked (cannot open in append mode)")
    except Exception as e:
        print(f"⚠️  Could not check file lock: {e}")


def check_file_integrity():
    """Check if file has valid structure."""
    print("\n" + "=" * 60)
    print("FILE INTEGRITY CHECK")
    print("=" * 60)

    file_path = Path(__file__).parent / "CriticalHit.plugin.js"

    if not file_path.exists():
        print(f"❌ File not found: {file_path}")
        return

    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
        lines = content.split("\n")

    print(f"Total lines: {len(lines):,}")
    print(f"Total characters: {len(content):,}")

    # Check for balanced braces
    open_braces = content.count("{")
    close_braces = content.count("}")
    print(f"Open braces: {open_braces}")
    print(f"Close braces: {close_braces}")

    if open_braces == close_braces:
        print("✅ Braces are balanced")
    else:
        print(f"❌ Braces are unbalanced (difference: {open_braces - close_braces})")

    # Check for class definition
    if "module.exports = class CriticalHit" in content:
        print("✅ Class definition found")
    else:
        print("❌ Class definition not found")

    # Check for Section 2 helpers
    section2_markers = [
        "MESSAGE HISTORY HELPERS",
        "CHANNEL RESTORATION HELPERS",
        "STYLE APPLICATION HELPERS",
        "CRIT DETECTION HELPERS",
        "RESTORATION DETECTION HELPERS",
        "RESTORATION EXECUTION HELPERS",
        "SETTINGS PANEL HELPERS",
    ]

    found_sections = []
    for marker in section2_markers:
        if marker in content:
            found_sections.append(marker)

    print(
        f"\nSection 2 helper categories found: {len(found_sections)}/{len(section2_markers)}"
    )
    for section in found_sections:
        print(f"  ✅ {section}")


def check_helper_functions():
    """Check if helper functions are properly organized."""
    print("\n" + "=" * 60)
    print("HELPER FUNCTION ORGANIZATION CHECK")
    print("=" * 60)

    file_path = Path(__file__).parent / "CriticalHit.plugin.js"

    helper_functions = [
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

    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
        lines = content.split("\n")

    # Find Section 2 start (after "SECTION 2: CONFIGURATION & HELPERS")
    section2_start = None
    section3_start = None

    for i, line in enumerate(lines):
        if "SECTION 2: CONFIGURATION & HELPERS" in line:
            section2_start = i
        if "SECTION 3: MAJOR OPERATIONS" in line:
            section3_start = i
            break

    if not section2_start or not section3_start:
        print("❌ Could not find Section 2 or Section 3 markers")
        return

    print(f"Section 2 starts at line {section2_start + 1}")
    print(f"Section 3 starts at line {section3_start + 1}")

    # Check each helper function
    functions_in_section2 = []
    functions_in_section3 = []
    functions_not_found = []

    for func_name in helper_functions:
        pattern = f"{func_name}("
        occurrences = []

        for i, line in enumerate(lines):
            if (
                pattern in line
                and f" {func_name}(" in line
                or f"  {func_name}(" in line
            ):
                occurrences.append(i + 1)

        if not occurrences:
            functions_not_found.append(func_name)
        else:
            for line_num in occurrences:
                if section2_start < line_num < section3_start:
                    functions_in_section2.append((func_name, line_num))
                elif line_num >= section3_start:
                    functions_in_section3.append((func_name, line_num))

    print(f"\n✅ Functions in Section 2: {len(functions_in_section2)}")
    print(f"❌ Functions in Section 3 (duplicates): {len(functions_in_section3)}")
    print(f"⚠️  Functions not found: {len(functions_not_found)}")

    if functions_in_section3:
        print("\n⚠️  DUPLICATE FUNCTIONS FOUND IN SECTION 3:")
        for func_name, line_num in functions_in_section3:
            print(f"  - {func_name} at line {line_num}")

    if functions_not_found:
        print("\n⚠️  MISSING FUNCTIONS:")
        for func_name in functions_not_found:
            print(f"  - {func_name}")


def main():
    """Run all diagnostic checks."""
    print("CriticalHit.plugin.js Save Conflict Diagnostic")
    print("=" * 60)

    check_git_status()
    check_merge_conflicts()
    check_file_permissions()
    check_file_integrity()
    check_helper_functions()

    print("\n" + "=" * 60)
    print("DIAGNOSTIC COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    main()
    main()
