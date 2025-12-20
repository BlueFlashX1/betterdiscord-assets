#!/usr/bin/env python3
"""
Add missing MOVE START/END markers for methods that only have MOVE HERE markers
"""

import re

file_path = "/Users/matthewthompson/Documents/DEVELOPMENT/betterdiscord-dev/plugins/CriticalHit.plugin.js"

with open(file_path, "r", encoding="utf-8") as f:
    lines = f.readlines()


def find_method_end(start_line_num):
    """Find where a method ends by tracking braces (1-indexed line number)"""
    start_idx = start_line_num - 1
    brace_depth = 0
    in_method = False

    for i in range(start_idx, min(start_idx + 1000, len(lines))):
        line = lines[i]
        # Check if this is the method declaration line
        if i == start_idx and "{" in line:
            in_method = True
            brace_depth = line.count("{") - line.count("}")
            continue

        if in_method:
            brace_depth += line.count("{") - line.count("}")
            # Method ends when brace depth returns to 0
            if brace_depth == 0 and "}" in line:
                return i + 1  # Return 1-indexed line number
    return None


def find_line_num(pattern):
    """Find line number matching pattern"""
    for i, line in enumerate(lines, 1):
        if re.search(pattern, line):
            return i
    return None


# Methods that need START/END markers
methods_to_mark = [
    (
        "getMessageIdFromElement",
        "msg_id_getMessageIdFromElement",
        r"^\s*getMessageIdFromElement\(",
    ),
    ("getAuthorId", "msg_id_getAuthorId", r"^\s*getAuthorId\("),
    ("getReactFiber", "react_fiber_getReactFiber", r"^\s*getReactFiber\("),
    ("traverseFiber", "react_fiber_traverseFiber", r"^\s*traverseFiber\("),
    (
        "getMessageIdentifier",
        "msg_id_getMessageIdentifier",
        r"^\s*getMessageIdentifier\(",
    ),
    ("getMessageId", "msg_id_getMessageId", r"^\s*getMessageId\("),
    ("getUserId", "msg_id_getUserId", r"^\s*getUserId\("),
    ("hasDuplicateInDOM", "anim_hasDuplicateInDOM", r"^\s*hasDuplicateInDOM\("),
    (
        "getRandomSpawnPosition",
        "anim_getRandomSpawnPosition",
        r"^\s*getRandomSpawnPosition\(",
    ),
    (
        "createAnimationElement",
        "anim_createAnimationElement",
        r"^\s*createAnimationElement\(",
    ),
    ("injectAnimationCSS", "css_injectAnimationCSS", r"^\s*injectAnimationCSS\("),
]


# Check if markers already exist
def has_markers(section_name):
    """Check if START/END markers already exist for this section"""
    for line in lines:
        if f"MOVE START: {section_name}" in line or f"MOVE END: {section_name}" in line:
            return True
    return False


# Add markers for each method
for method_name, section_name, pattern in methods_to_mark:
    if has_markers(section_name):
        print(f"⚠️  {section_name} already has markers, skipping")
        continue

    method_start = find_line_num(pattern)
    if not method_start:
        print(f"❌ Could not find {method_name}")
        continue

    method_end = find_method_end(method_start)
    if not method_end:
        print(f"❌ Could not find end of {method_name}")
        continue

    # Insert START marker before method
    lines.insert(method_start - 1, f"  // MOVE START: {section_name}\n")
    # Insert END marker after method (adjust for the START marker we just added)
    lines.insert(method_end + 1, f"  // MOVE END: {section_name}\n")

    print(
        f"✅ Marked {method_name} ({section_name}): lines {method_start}-{method_end}"
    )

# Write back
with open(file_path, "w", encoding="utf-8") as f:
    f.write("".join(lines))

print("\n✅ All missing markers added!")













































