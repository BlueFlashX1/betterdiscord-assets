#!/usr/bin/env python3
"""
Find specific optimizable patterns in CriticalHit.plugin.js
Focus on high-impact patterns that can actually be improved
"""
import re
from pathlib import Path

plugin_path = Path("plugins/CriticalHit.plugin.js")
with open(plugin_path, 'r') as f:
    lines = f.readlines()

patterns = {
    'multi_condition_property_access': [],  # if (a && b.prop)
    'double_condition': [],  # if (a && b)
    'else_if_chains': [],  # else if
    'type_checks': [],  # typeof
}

for i, line in enumerate(lines, 1):
    stripped = line.strip()
    
    # Multi-condition with property access (not already optimized)
    if re.search(r'if\s*\([^?]*&&[^?]*&&', stripped) and '?.' not in line:
        patterns['multi_condition_property_access'].append((i, stripped[:100]))
    
    # Double conditions worth checking
    elif re.search(r'if\s*\(\w+\s*&&\s*\w+', stripped) and '?.' not in line:
        patterns['double_condition'].append((i, stripped[:100]))
    
    # else if chains (can become lookup maps)
    elif 'else if' in stripped:
        patterns['else_if_chains'].append((i, stripped[:100]))
    
    # typeof checks (can use ??)
    elif 'typeof' in stripped and 'if' in stripped:
        patterns['type_checks'].append((i, stripped[:100]))

print("=== OPTIMIZABLE PATTERNS FOUND ===\n")
for pattern_name, items in patterns.items():
    if items:
        print(f"{pattern_name.upper().replace('_', ' ')}: {len(items)}")
        for line_num, code in items[:10]:
            print(f"  Line {line_num:5d}: {code}")
        if len(items) > 10:
            print(f"  ... and {len(items) - 10} more")
        print()

total = sum(len(v) for v in patterns.values())
print(f"\n📊 TOTAL OPTIMIZABLE: {total} patterns")
