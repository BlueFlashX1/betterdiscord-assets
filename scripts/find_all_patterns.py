#!/usr/bin/env python3
"""
Comprehensive pattern finder for remaining optimizations
"""
import re
from pathlib import Path

def find_all_optimizable_patterns(file_path):
    """Find ALL remaining optimizable patterns"""
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    patterns = {
        'nested_if_in_if': [],
        'if_else_ternary': [],
        'multiple_if_same_condition': [],
        'if_with_single_return': [],
        'if_with_continue': [],
        'unnecessary_else': [],
        'boolean_assignment': [],
        'length_checks': [],
        'type_checks_remaining': [],
        'property_existence': [],
    }
    
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith('//'):
            continue
        
        # Nested if inside if
        if re.match(r'^\s*if \(', line):
            if i + 1 < len(lines) and re.match(r'^\s*if \(', lines[i + 1]):
                patterns['nested_if_in_if'].append((i + 1, stripped[:70]))
        
        # if-else that could be ternary
        if '} else {' in stripped and i + 1 < len(lines):
            next_line = lines[i + 1].strip()
            if '=' in next_line or 'return' in next_line:
                patterns['if_else_ternary'].append((i + 1, stripped[:70]))
        
        # if (x) { return y; }
        if re.match(r'^\s*if \([^)]+\) \{\s*$', stripped):
            if i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                if next_line.startswith('return') and i + 2 < len(lines) and lines[i + 2].strip() == '}':
                    patterns['if_with_single_return'].append((i + 1, f"{stripped} {next_line}"))
        
        # Boolean assignments: let x = false; if (y) { x = true; }
        if re.search(r'let \w+ = (false|true);', stripped):
            var_name = re.search(r'let (\w+) =', stripped).group(1)
            # Check next few lines for if (condition) { var = !value; }
            for j in range(i + 1, min(i + 5, len(lines))):
                if f'{var_name} =' in lines[j]:
                    patterns['boolean_assignment'].append((i + 1, f"{stripped} -> check {j}"))
                    break
        
        # Length checks: if (arr.length > 0)
        if re.search(r'if \(.*\.length [><=]', stripped):
            patterns['length_checks'].append((i + 1, stripped[:70]))
        
        # Type checks: if (typeof x === 'string')
        if 'typeof' in stripped and 'if (' in stripped:
            patterns['type_checks_remaining'].append((i + 1, stripped[:70]))
        
        # Property existence: if (obj.prop)
        if re.search(r'if \(this\.\w+\) \{$', stripped):
            if i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                if next_line and len(next_line) < 80:
                    patterns['property_existence'].append((i + 1, f"{stripped[:50]} -> {next_line[:30]}"))
        
        # Unnecessary else after return
        if stripped == '} else {':
            if i > 0 and 'return' in lines[i - 1]:
                patterns['unnecessary_else'].append((i + 1, "Else after return"))
    
    return patterns

def main():
    plugin_path = Path(__file__).parent.parent / "plugins" / "CriticalHit.plugin.js"
    
    print("="*80)
    print("COMPREHENSIVE PATTERN FINDER")
    print("="*80)
    print()
    
    patterns = find_all_optimizable_patterns(plugin_path)
    
    total = 0
    for pattern_type, items in patterns.items():
        if items:
            total += len(items)
            print(f"\n{pattern_type.upper().replace('_', ' ')}: {len(items)}")
            for line, code in items[:10]:
                print(f"  Line {line:5d}: {code}")
            if len(items) > 10:
                print(f"  ... and {len(items) - 10} more")
    
    print(f"\n{'='*80}")
    print(f"TOTAL PATTERNS FOUND: {total}")
    print(f"{'='*80}")
    
    # Count current if-statements
    with open(plugin_path, 'r') as f:
        lines = f.readlines()
    if_count = sum(1 for line in lines if re.match(r'^\s*if \([^)]+\) \{?\s*$', line) and not line.strip().startswith('//'))
    
    print(f"\nCurrent if-statements: {if_count}")
    print(f"Eliminated so far: {570 - if_count} ({(570 - if_count) * 100 / 570:.1f}%)")
    print(f"Optimizable found: {total}")
    print(f"Expected after optimization: {if_count - total}")

if __name__ == "__main__":
    main()

