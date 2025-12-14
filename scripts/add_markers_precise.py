#!/usr/bin/env python3
"""
Add MOVE markers with distinct names - precise version that finds method boundaries correctly
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

    for i in range(start_idx, min(start_idx + 500, len(lines))):
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


# Phase 1: Add MOVE HERE markers at target location (after ID normalization, line 220)
target_msg_id = 220
lines.insert(target_msg_id, "  // MOVE HERE: msg_id_getMessageIdFromElement\n")
lines.insert(target_msg_id + 1, "  // MOVE HERE: msg_id_getAuthorId\n")
lines.insert(target_msg_id + 2, "  // MOVE HERE: react_fiber_getReactFiber\n")
lines.insert(target_msg_id + 3, "  // MOVE HERE: react_fiber_traverseFiber\n")
lines.insert(target_msg_id + 4, "  // MOVE HERE: msg_id_getMessageIdentifier\n")
lines.insert(target_msg_id + 5, "  // MOVE HERE: msg_id_getMessageId\n")
lines.insert(target_msg_id + 6, "  // MOVE HERE: msg_id_getUserId\n")

# Mark getMessageIdFromElement (line 406)
msg_id_start = 406
msg_id_end = find_method_end(msg_id_start)
if msg_id_end:
    lines.insert(msg_id_start - 1, "  // MOVE START: msg_id_getMessageIdFromElement\n")
    lines.insert(msg_id_end, "  // MOVE END: msg_id_getMessageIdFromElement\n")
    print(f"Marked getMessageIdFromElement: {msg_id_start}-{msg_id_end}")

# Mark getAuthorId (line 678)
author_id_start = 678
author_id_end = find_method_end(author_id_start)
if author_id_end:
    lines.insert(author_id_start - 1, "  // MOVE START: msg_id_getAuthorId\n")
    lines.insert(author_id_end, "  // MOVE END: msg_id_getAuthorId\n")
    print(f"Marked getAuthorId: {author_id_start}-{author_id_end}")

# Mark getReactFiber (line 7067)
react_fiber_start = 7067
react_fiber_end = find_method_end(react_fiber_start)
if react_fiber_end:
    lines.insert(react_fiber_start - 1, "  // MOVE START: react_fiber_getReactFiber\n")
    lines.insert(react_fiber_end, "  // MOVE END: react_fiber_getReactFiber\n")
    print(f"Marked getReactFiber: {react_fiber_start}-{react_fiber_end}")

# Mark traverseFiber (line 7085)
traverse_start = 7085
traverse_end = find_method_end(traverse_start)
if traverse_end:
    lines.insert(traverse_start - 1, "  // MOVE START: react_fiber_traverseFiber\n")
    lines.insert(traverse_end, "  // MOVE END: react_fiber_traverseFiber\n")
    print(f"Marked traverseFiber: {traverse_start}-{traverse_end}")

# Mark getMessageIdentifier (line 7107)
msg_ident_start = 7107
msg_ident_end = find_method_end(msg_ident_start)
if msg_ident_end:
    lines.insert(msg_ident_start - 1, "  // MOVE START: msg_id_getMessageIdentifier\n")
    lines.insert(msg_ident_end, "  // MOVE END: msg_id_getMessageIdentifier\n")
    print(f"Marked getMessageIdentifier: {msg_ident_start}-{msg_ident_end}")

# Mark getMessageId (line 7118)
msg_id_wrapper_start = 7118
msg_id_wrapper_end = find_method_end(msg_id_wrapper_start)
if msg_id_wrapper_end:
    lines.insert(msg_id_wrapper_start - 1, "  // MOVE START: msg_id_getMessageId\n")
    lines.insert(msg_id_wrapper_end, "  // MOVE END: msg_id_getMessageId\n")
    print(f"Marked getMessageId: {msg_id_wrapper_start}-{msg_id_wrapper_end}")

# Mark getUserId (line 7128)
user_id_start = 7128
user_id_end = find_method_end(user_id_start)
if user_id_end:
    lines.insert(user_id_start - 1, "  // MOVE START: msg_id_getUserId\n")
    lines.insert(user_id_end, "  // MOVE END: msg_id_getUserId\n")
    print(f"Marked getUserId: {user_id_start}-{user_id_end}")

# Phase 2: Animation helpers - Target: Start of Section 3
target_anim = 1141
lines.insert(target_anim, "  // MOVE HERE: anim_hasDuplicateInDOM\n")
lines.insert(target_anim + 1, "  // MOVE HERE: anim_getRandomSpawnPosition\n")
lines.insert(target_anim + 2, "  // MOVE HERE: anim_createAnimationElement\n")

# Mark animation helpers
anim_dup_start = 1026
anim_dup_end = find_method_end(anim_dup_start)
if anim_dup_end:
    lines.insert(anim_dup_start - 1, "  // MOVE START: anim_hasDuplicateInDOM\n")
    lines.insert(anim_dup_end, "  // MOVE END: anim_hasDuplicateInDOM\n")
    print(f"Marked hasDuplicateInDOM: {anim_dup_start}-{anim_dup_end}")

anim_pos_start = 1068
anim_pos_end = find_method_end(anim_pos_start)
if anim_pos_end:
    lines.insert(anim_pos_start - 1, "  // MOVE START: anim_getRandomSpawnPosition\n")
    lines.insert(anim_pos_end, "  // MOVE END: anim_getRandomSpawnPosition\n")
    print(f"Marked getRandomSpawnPosition: {anim_pos_start}-{anim_pos_end}")

anim_create_start = 1093
anim_create_end = find_method_end(anim_create_start)
if anim_create_end:
    lines.insert(
        anim_create_start - 1, "  // MOVE START: anim_createAnimationElement\n"
    )
    lines.insert(anim_create_end, "  // MOVE END: anim_createAnimationElement\n")
    print(f"Marked createAnimationElement: {anim_create_start}-{anim_create_end}")

# Phase 3: CSS & Fonts
target_css = 4975
lines.insert(target_css - 1, "  // MOVE HERE: font_getFontsFolderPath\n")
lines.insert(target_css, "  // MOVE HERE: font_loadLocalFont\n")
lines.insert(target_css + 1, "  // MOVE HERE: font_loadGoogleFont\n")
lines.insert(target_css + 2, "  // MOVE HERE: font_loadCritFont\n")
lines.insert(target_css + 3, "  // MOVE HERE: css_injectSettingsCSS\n")
lines.insert(target_css + 4, "  // MOVE HERE: css_injectAnimationCSS\n")


# Find font methods
def find_line_num(pattern):
    for i, line in enumerate(lines, 1):
        if re.search(pattern, line):
            return i
    return None


font_folder_start = find_line_num(r"^\s*getFontsFolderPath\(")
if font_folder_start:
    font_folder_end = find_method_end(font_folder_start)
    if font_folder_end:
        lines.insert(
            font_folder_start - 1, "  // MOVE START: font_getFontsFolderPath\n"
        )
        lines.insert(font_folder_end, "  // MOVE END: font_getFontsFolderPath\n")
        print(f"Marked getFontsFolderPath: {font_folder_start}-{font_folder_end}")

font_local_start = find_line_num(r"^\s*loadLocalFont\(")
if font_local_start:
    font_local_end = find_method_end(font_local_start)
    if font_local_end:
        lines.insert(font_local_start - 1, "  // MOVE START: font_loadLocalFont\n")
        lines.insert(font_local_end, "  // MOVE END: font_loadLocalFont\n")
        print(f"Marked loadLocalFont: {font_local_start}-{font_local_end}")

font_google_start = find_line_num(r"^\s*loadGoogleFont\(")
if font_google_start:
    font_google_end = find_method_end(font_google_start)
    if font_google_end:
        lines.insert(font_google_start - 1, "  // MOVE START: font_loadGoogleFont\n")
        lines.insert(font_google_end, "  // MOVE END: font_loadGoogleFont\n")
        print(f"Marked loadGoogleFont: {font_google_start}-{font_google_end}")

font_crit_start = find_line_num(r"^\s*loadCritFont\(")
if font_crit_start:
    font_crit_end = find_method_end(font_crit_start)
    if font_crit_end:
        lines.insert(font_crit_start - 1, "  // MOVE START: font_loadCritFont\n")
        lines.insert(font_crit_end, "  // MOVE END: font_loadCritFont\n")
        print(f"Marked loadCritFont: {font_crit_start}-{font_crit_end}")

# Mark injectSettingsCSS (5259)
settings_css_start = 5259
settings_css_end = find_method_end(settings_css_start)
if settings_css_end:
    lines.insert(settings_css_start - 1, "  // MOVE START: css_injectSettingsCSS\n")
    lines.insert(settings_css_end, "  // MOVE END: css_injectSettingsCSS\n")
    print(f"Marked injectSettingsCSS: {settings_css_start}-{settings_css_end}")

# Mark injectAnimationCSS (8393)
anim_css_start = 8393
anim_css_end = find_method_end(anim_css_start)
if anim_css_end:
    lines.insert(anim_css_start - 1, "  // MOVE START: css_injectAnimationCSS\n")
    lines.insert(anim_css_end, "  // MOVE END: css_injectAnimationCSS\n")
    print(f"Marked injectAnimationCSS: {anim_css_start}-{anim_css_end}")

# Write back
with open(file_path, "w", encoding="utf-8") as f:
    f.write("".join(lines))

print("\nAll markers added with distinct names!")
