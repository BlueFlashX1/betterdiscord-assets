#!/usr/bin/env python3
"""
Create a comprehensive optimization plan for remaining patterns
"""
import re
from pathlib import Path

plugin = Path("plugins/CriticalHit.plugin.js")
with open(plugin, 'r') as f:
    lines = f.readlines()

# Categorize remaining patterns by optimization strategy
strategies = {
    'keep_as_is': [],  # Guard clauses, validation - KEEP
    'short_circuit': [],  # Can use && for simple assignments
    'optional_chain': [],  # Can use ?. for property access
    'review_needed': [],  # Complex patterns needing careful review
}

for i, line in enumerate(lines, 1):
    stripped = line.strip()
    
    # Guard clauses - KEEP
    if re.match(r'if\s*\(!.*\)\s*return', stripped):
        strategies['keep_as_is'].append((i, 'guard_clause', stripped[:80]))
    
    # Simple assignments after if
    elif re.search(r'if\s*\(.*&&.*\)\s*\{', stripped):
        # Check next line
        if i < len(lines):
            next_line = lines[i].strip()
            if '=' in next_line or '.set(' in next_line or '.add(' in next_line:
                strategies['short_circuit'].append((i, stripped[:80]))
    
    # Property access without ?.
    elif re.search(r'if\s*\(\w+\s*&&\s*\w+\.\w+', stripped) and '?.' not in line:
        strategies['optional_chain'].append((i, stripped[:80]))

print("=== OPTIMIZATION STRATEGY ===\n")
print(f"Keep as-is (good code): {len(strategies['keep_as_is'])}")
print(f"Short-circuit candidates: {len(strategies['short_circuit'])}")
print(f"Optional chain candidates: {len(strategies['optional_chain'])}")
print()
print("SHORT-CIRCUIT CANDIDATES (first 10):")
for line_num, code in strategies['short_circuit'][:10]:
    print(f"  Line {line_num}: {code}")
