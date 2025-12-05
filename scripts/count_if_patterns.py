#!/usr/bin/env python3
"""
Analyze if-statement patterns in CriticalHit.plugin.js
Categorize them for targeted optimization
"""

import re
from pathlib import Path
from collections import defaultdict

def analyze_if_patterns(file_path):
    """Analyze if-statement patterns"""
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    patterns = {
        'guard_clauses': [],  # if (!x) return - KEEP THESE!
        'property_access': [],  # if (x && x.prop)
        'type_checks': [],  # if (typeof x === 'type')
        'existence_checks': [],  # if (x)
        'comparisons': [],  # if (x === y)
        'nested_if': [],  # if inside if
        'else_if': [],  # else if
        'ternary_candidates': [],  # simple if-else that could be ternary
    }
    
    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        
        # Guard clauses (KEEP!)
        if re.match(r'if\s*\(!.*\)\s*return', stripped):
            patterns['guard_clauses'].append((i, line.rstrip()))
        
        # Property access with &&
        elif '&&' in stripped and '.' in stripped and stripped.startswith('if'):
            patterns['property_access'].append((i, line.rstrip()))
        
        # Type checks
        elif 'typeof' in stripped and stripped.startswith('if'):
            patterns['type_checks'].append((i, line.rstrip()))
        
        # else if
        elif stripped.startswith('} else if') or stripped.startswith('else if'):
            patterns['else_if'].append((i, line.rstrip()))
    
    # Generate report
    print("="*80)
    print("IF-STATEMENT PATTERN ANALYSIS")
    print("="*80)
    print()
    
    print(f"Total if-statements found: {sum(len(v) for v in patterns.values())}")
    print()
    
    for pattern_name, occurrences in patterns.items():
        if occurrences:
            print(f"\n{pattern_name.upper().replace('_', ' ')} ({len(occurrences)} found):")
            print("-" * 80)
            for line_num, code in occurrences[:10]:  # Show first 10
                print(f"  Line {line_num:5d}: {code[:100]}")
            if len(occurrences) > 10:
                print(f"  ... and {len(occurrences) - 10} more")

def main():
    plugin_path = Path(__file__).parent.parent / "plugins" / "CriticalHit.plugin.js"
    analyze_if_patterns(plugin_path)

if __name__ == "__main__":
    main()
