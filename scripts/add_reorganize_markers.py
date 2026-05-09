#!/usr/bin/env python3
"""
Add MOVE markers to CriticalHit.plugin.js for reorganization
Uses distinct names for each section for precision
"""

file_path = "/Users/matthewthompson/Documents/DEVELOPMENT/betterdiscord-dev/plugins/CriticalHit.plugin.js"

with open(file_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

# Phase 1: Message ID & React Fiber (Section 2)
# Target location: After ID normalization helpers (line ~220)
markers_to_add = [
    # MOVE HERE markers (insertion points)
    (
        220,
        "  // MOVE HERE: msg_id_getMessageIdFromElement\n  // MOVE HERE: msg_id_getAuthorId\n  // MOVE HERE: react_fiber_getReactFiber\n  // MOVE HERE: react_fiber_traverseFiber\n  // MOVE HERE: msg_id_getMessageIdentifier\n  // MOVE HERE: msg_id_getMessageId\n  // MOVE HERE: msg_id_getUserId\n",
    ),
    # MOVE START/END for getMessageIdFromElement (406 - ~677)
    (405, "  // MOVE START: msg_id_getMessageIdFromElement\n"),
    (677, "  // MOVE END: msg_id_getMessageIdFromElement\n"),
    # MOVE START/END for getAuthorId (678 - ~760)
    (677, "  // MOVE START: msg_id_getAuthorId\n"),
    (760, "  // MOVE END: msg_id_getAuthorId\n"),
    # MOVE START/END for getReactFiber (7067 - ~7084)
    (7066, "  // MOVE START: react_fiber_getReactFiber\n"),
    (7084, "  // MOVE END: react_fiber_getReactFiber\n"),
    # MOVE START/END for traverseFiber (7085 - ~7106)
    (7084, "  // MOVE START: react_fiber_traverseFiber\n"),
    (7106, "  // MOVE END: react_fiber_traverseFiber\n"),
    # MOVE START/END for getMessageIdentifier (7107 - ~7118)
    (7106, "  // MOVE START: msg_id_getMessageIdentifier\n"),
    (7118, "  // MOVE END: msg_id_getMessageIdentifier\n"),
    # MOVE START/END for getMessageId (7118 - ~7129)
    (7117, "  // MOVE START: msg_id_getMessageId\n"),
    (7129, "  // MOVE END: msg_id_getMessageId\n"),
    # MOVE START/END for getUserId (7128 - ~7153)
    (7127, "  // MOVE START: msg_id_getUserId\n"),
    (7153, "  // MOVE END: msg_id_getUserId\n"),
]

# Phase 2: Animation helpers from Section 2
# Target: Start of Section 3 (after line ~1140)
markers_to_add.extend(
    [
        (
            1140,
            "  // MOVE HERE: anim_hasDuplicateInDOM\n  // MOVE HERE: anim_getRandomSpawnPosition\n  // MOVE HERE: anim_createAnimationElement\n",
        ),
        (1025, "  // MOVE START: anim_hasDuplicateInDOM\n"),
        (1065, "  // MOVE END: anim_hasDuplicateInDOM\n"),
        (1067, "  // MOVE START: anim_getRandomSpawnPosition\n"),
        (1091, "  // MOVE END: anim_getRandomSpawnPosition\n"),
        (1093, "  // MOVE START: anim_createAnimationElement\n"),
        (1137, "  // MOVE END: anim_createAnimationElement\n"),
    ]
)

# Phase 3: CSS & Fonts
# Need to find exact line numbers for method endings
# Will add these after reading the file structure

print(f"Prepared {len(markers_to_add)} marker additions")
print("Note: This is a template - need to verify exact line numbers for method endings")
