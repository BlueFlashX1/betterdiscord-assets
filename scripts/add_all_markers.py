#!/usr/bin/env python3
"""
Add all MOVE markers to CriticalHit.plugin.js with distinct names for precision
"""

import re

file_path = '/Users/matthewthompson/Documents/DEVELOPMENT/betterdiscord-dev/plugins/CriticalHit.plugin.js'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

def find_method_end(start_idx, method_name):
    """Find where a method ends"""
    depth = 0
    started = False
    for i in range(start_idx, min(start_idx + 1000, len(lines))):
        line = lines[i]
        if method_name in line and '(' in line:
            started = True
        if started:
            depth += line.count('{') - line.count('}')
            if depth == 0 and started and '}' in line:
                return i
    return None

def find_line(lines, pattern):
    """Find line number matching pattern"""
    for i, line in enumerate(lines, 1):
        if re.search(pattern, line):
            return i
    return None

def insert_marker(lines, line_num, marker, before=True):
    """Insert a marker at a specific line number (1-indexed)"""
    idx = line_num - 1
    if before:
        lines.insert(idx, marker)
    else:
        lines.insert(idx + 1, marker)

# Phase 1: Message ID & React Fiber - Target: After ID normalization (line 220)
target_line = 220
insert_marker(lines, target_line, "  // MOVE HERE: msg_id_getMessageIdFromElement\n", before=False)
insert_marker(lines, target_line, "  // MOVE HERE: msg_id_getAuthorId\n", before=False)
insert_marker(lines, target_line, "  // MOVE HERE: react_fiber_getReactFiber\n", before=False)
insert_marker(lines, target_line, "  // MOVE HERE: react_fiber_traverseFiber\n", before=False)
insert_marker(lines, target_line, "  // MOVE HERE: msg_id_getMessageIdentifier\n", before=False)
insert_marker(lines, target_line, "  // MOVE HERE: msg_id_getMessageId\n", before=False)
insert_marker(lines, target_line, "  // MOVE HERE: msg_id_getUserId\n", before=False)

# Mark getMessageIdFromElement (406)
insert_marker(lines, 406, "  // MOVE START: msg_id_getMessageIdFromElement\n", before=True)
msg_id_end = find_method_end(405, 'getMessageIdFromElement')
if msg_id_end:
    insert_marker(lines, msg_id_end + 1, "  // MOVE END: msg_id_getMessageIdFromElement\n", before=False)

# Mark getAuthorId (678)
insert_marker(lines, 678, "  // MOVE START: msg_id_getAuthorId\n", before=True)
author_id_end = find_method_end(677, 'getAuthorId')
if author_id_end:
    insert_marker(lines, author_id_end + 1, "  // MOVE END: msg_id_getAuthorId\n", before=False)

# Mark getReactFiber (7067)
insert_marker(lines, 7067, "  // MOVE START: react_fiber_getReactFiber\n", before=True)
react_fiber_end = find_method_end(7066, 'getReactFiber')
if react_fiber_end:
    insert_marker(lines, react_fiber_end + 1, "  // MOVE END: react_fiber_getReactFiber\n", before=False)

# Mark traverseFiber (7396)
insert_marker(lines, 7396, "  // MOVE START: react_fiber_traverseFiber\n", before=True)
traverse_end = find_method_end(7395, 'traverseFiber')
if traverse_end:
    insert_marker(lines, traverse_end + 1, "  // MOVE END: react_fiber_traverseFiber\n", before=False)

# Mark getMessageIdentifier (7418)
insert_marker(lines, 7418, "  // MOVE START: msg_id_getMessageIdentifier\n", before=True)
msg_ident_end = find_method_end(7417, 'getMessageIdentifier')
if msg_ident_end:
    insert_marker(lines, msg_ident_end + 1, "  // MOVE END: msg_id_getMessageIdentifier\n", before=False)

# Mark getMessageId (7429)
insert_marker(lines, 7429, "  // MOVE START: msg_id_getMessageId\n", before=True)
msg_id_wrapper_end = find_method_end(7428, 'getMessageId')
if msg_id_wrapper_end:
    insert_marker(lines, msg_id_wrapper_end + 1, "  // MOVE END: msg_id_getMessageId\n", before=False)

# Mark getUserId (7439)
insert_marker(lines, 7439, "  // MOVE START: msg_id_getUserId\n", before=True)
user_id_end = find_method_end(7438, 'getUserId')
if user_id_end:
    insert_marker(lines, user_id_end + 1, "  // MOVE END: msg_id_getUserId\n", before=False)

# Phase 2: Animation helpers - Target: Start of Section 3 (line 1141)
target_line_anim = 1141
insert_marker(lines, target_line_anim, "  // MOVE HERE: anim_hasDuplicateInDOM\n", before=False)
insert_marker(lines, target_line_anim, "  // MOVE HERE: anim_getRandomSpawnPosition\n", before=False)
insert_marker(lines, target_line_anim, "  // MOVE HERE: anim_createAnimationElement\n", before=False)

# Mark animation helpers
insert_marker(lines, 1026, "  // MOVE START: anim_hasDuplicateInDOM\n", before=True)
anim_dup_end = find_method_end(1025, 'hasDuplicateInDOM')
if anim_dup_end:
    insert_marker(lines, anim_dup_end + 1, "  // MOVE END: anim_hasDuplicateInDOM\n", before=False)

insert_marker(lines, 1068, "  // MOVE START: anim_getRandomSpawnPosition\n", before=True)
anim_pos_end = find_method_end(1067, 'getRandomSpawnPosition')
if anim_pos_end:
    insert_marker(lines, anim_pos_end + 1, "  // MOVE END: anim_getRandomSpawnPosition\n", before=False)

insert_marker(lines, 1093, "  // MOVE START: anim_createAnimationElement\n", before=True)
anim_create_end = find_method_end(1092, 'createAnimationElement')
if anim_create_end:
    insert_marker(lines, anim_create_end + 1, "  // MOVE END: anim_createAnimationElement\n", before=False)

# Phase 3: CSS & Fonts
# Font loading before CSS injection (target: before injectCritCSS at 4975)
target_css = 4975
insert_marker(lines, target_css, "  // MOVE HERE: font_getFontsFolderPath\n", before=True)
insert_marker(lines, target_css, "  // MOVE HERE: font_loadLocalFont\n", before=True)
insert_marker(lines, target_css, "  // MOVE HERE: font_loadGoogleFont\n", before=True)
insert_marker(lines, target_css, "  // MOVE HERE: font_loadCritFont\n", before=True)
insert_marker(lines, target_css, "  // MOVE HERE: css_injectSettingsCSS\n", before=True)
insert_marker(lines, target_css, "  // MOVE HERE: css_injectAnimationCSS\n", before=True)

# Mark font loading methods
font_folder_start = find_line(lines, r'^\s*getFontsFolderPath\(')
if font_folder_start:
    insert_marker(lines, font_folder_start, "  // MOVE START: font_getFontsFolderPath\n", before=True)
    font_folder_end = find_method_end(font_folder_start - 1, 'getFontsFolderPath')
    if font_folder_end:
        insert_marker(lines, font_folder_end + 1, "  // MOVE END: font_getFontsFolderPath\n", before=False)

font_local_start = find_line(lines, r'^\s*loadLocalFont\(')
if font_local_start:
    insert_marker(lines, font_local_start, "  // MOVE START: font_loadLocalFont\n", before=True)
    font_local_end = find_method_end(font_local_start - 1, 'loadLocalFont')
    if font_local_end:
        insert_marker(lines, font_local_end + 1, "  // MOVE END: font_loadLocalFont\n", before=False)

font_google_start = find_line(lines, r'^\s*loadGoogleFont\(')
if font_google_start:
    insert_marker(lines, font_google_start, "  // MOVE START: font_loadGoogleFont\n", before=True)
    font_google_end = find_method_end(font_google_start - 1, 'loadGoogleFont')
    if font_google_end:
        insert_marker(lines, font_google_end + 1, "  // MOVE END: font_loadGoogleFont\n", before=False)

font_crit_start = find_line(lines, r'^\s*loadCritFont\(')
if font_crit_start:
    insert_marker(lines, font_crit_start, "  // MOVE START: font_loadCritFont\n", before=True)
    font_crit_end = find_method_end(font_crit_start - 1, 'loadCritFont')
    if font_crit_end:
        insert_marker(lines, font_crit_end + 1, "  // MOVE END: font_loadCritFont\n", before=False)

# Mark injectSettingsCSS (5259)
insert_marker(lines, 5259, "  // MOVE START: css_injectSettingsCSS\n", before=True)
settings_css_end = find_method_end(5258, 'injectSettingsCSS')
if settings_css_end:
    insert_marker(lines, settings_css_end + 1, "  // MOVE END: css_injectSettingsCSS\n", before=False)

# Mark injectAnimationCSS (8393)
insert_marker(lines, 8393, "  // MOVE START: css_injectAnimationCSS\n", before=True)
anim_css_end = find_method_end(8392, 'injectAnimationCSS')
if anim_css_end:
    insert_marker(lines, anim_css_end + 1, "  // MOVE END: css_injectAnimationCSS\n", before=False)

# Write back
with open(file_path, 'w', encoding='utf-8') as f:
    f.write(''.join(lines))

print("Added all MOVE markers with distinct names")
