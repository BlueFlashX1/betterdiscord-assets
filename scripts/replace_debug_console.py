#!/usr/bin/env python3
"""
Replace all debug console.log statements with this.debugConsole()
FUNCTIONAL APPROACH - NO IF-ELSE!
"""

import re

# Read the file
with open('plugins/SoloLevelingStats.plugin.js', 'r') as f:
    content = f.read()

# Patterns to replace (debug console logs only)
patterns = [
    # Constructor
    (r"console\.log\('🔧 \[CONSTRUCTOR\]'", "this.debugConsole('🔧 [CONSTRUCTOR]'"),

    # Load
    (r"console\.log\('💾 \[LOAD\]'", "this.debugConsole('💾 [LOAD]'"),
    (r"console\.log\('🔍 \[LOAD\]'", "this.debugConsole('🔍 [LOAD]'"),
    (r"console\.log\('✅ \[LOAD\]'", "this.debugConsole('✅ [LOAD]'"),
    (r"console\.log\('🎯 \[LOAD\]'", "this.debugConsole('🎯 [LOAD]'"),

    # Save
    (r"console\.log\('💾 \[SAVE\]'", "this.debugConsole('💾 [SAVE]'"),
    (r"console\.log\('✅ \[SAVE\]'", "this.debugConsole('✅ [SAVE]'"),

    # Periodic
    (r"console\.log\('💾 \[PERIODIC\]'", "this.debugConsole('💾 [PERIODIC]'"),

    # Shadow XP
    (r"console\.log\(`🌟 \[SHADOW XP\]", "this.debugConsole('🌟 [SHADOW XP]', `"),

    # Stop
    (r"console\.log\('💾 \[STOP\]'", "this.debugConsole('💾 [STOP]'"),
]

# Apply replacements
for pattern, replacement in patterns:
    content = re.sub(pattern, replacement, content)

# Write back
with open('plugins/SoloLevelingStats.plugin.js', 'w') as f:
    f.write(content)

print("✅ Replaced all debug console.log statements!")
print(f"✅ Total patterns replaced: {len(patterns)}")
