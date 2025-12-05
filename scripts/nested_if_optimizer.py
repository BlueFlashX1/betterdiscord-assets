#!/usr/bin/env python3
"""
Optimize nested if-statements by flattening with &&
"""
import re
from pathlib import Path

def optimize_nested_ifs(file_path):
    """Flatten nested if-statements"""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    changes = 0
    
    # Pattern 1: Flatten simple nested ifs
    # if (a) { if (b) { ... } }  →  if (a && b) { ... }
    p1 = r'(\s+)if \(([^)]+)\) \{\s*\n(\s+)if \(([^)]+)\) \{'
    
    # Only flatten if both conditions are simple (no complex logic)
    def replace_nested(match):
        indent1 = match.group(1)
        cond1 = match.group(2)
        indent2 = match.group(3)
        cond2 = match.group(4)
        
        # Safety check: don't flatten if conditions are too complex
        if len(cond1) > 60 or len(cond2) > 60:
            return match.group(0)
        if '||' in cond1 or '||' in cond2:
            return match.group(0)
        
        # Flatten to single if
        return f'{indent1}if ({cond1} && {cond2}) {{'
    
    content, n = re.subn(p1, replace_nested, content, count=20)
    changes += n
    
    # Pattern 2: Remove empty if blocks
    p2 = r'(\s+)if \([^)]+\) \{\s*\n\s*\}'
    content, n = re.subn(p2, '', content)
    changes += n
    
    return content, changes

def main():
    plugin_path = Path(__file__).parent.parent / "plugins" / "CriticalHit.plugin.js"
    
    print("="*80)
    print("NESTED IF OPTIMIZER")
    print("="*80)
    print()
    
    content, changes = optimize_nested_ifs(plugin_path)
    
    if changes > 0:
        with open(plugin_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        print(f"✅ Applied {changes} nested if optimizations!")
        
        lines = content.split('\n')
        if_count = sum(1 for line in lines if re.match(r'^\s*if \([^)]+\) \{?\s*$', line) and not line.strip().startswith('//'))
        print(f"📊 Remaining: {if_count} if-statements")
        print(f"📊 Total eliminated: {570 - if_count} ({(570 - if_count) * 100 / 570:.1f}%)")
        print(f"📊 Lines: {len(lines)} (saved: {8859 - len(lines)})")
    else:
        print("No nested ifs found to optimize")
    
    print("="*80)

if __name__ == "__main__":
    main()

