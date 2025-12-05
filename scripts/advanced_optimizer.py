#!/usr/bin/env python3
"""
Advanced pattern optimizer for remaining patterns
"""
import re
from pathlib import Path

def apply_advanced_optimizations(file_path):
    """Apply advanced optimizations"""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    changes = 0
    
    # Pattern 1: if (this.messageObserver) { this.messageObserver.disconnect(); }
    p1 = r'(\s+)if \(this\.messageObserver\) \{\s*\n\s+this\.messageObserver\.disconnect\(\);\s*\n\s+\}'
    content, n = re.subn(p1, r'\1this.messageObserver?.disconnect();', content)
    changes += n
    
    # Pattern 2: if (this.urlObserver) { this.urlObserver.disconnect(); }
    p2 = r'(\s+)if \(this\.urlObserver\) \{\s*\n\s+this\.urlObserver\.disconnect\(\);\s*\n\s+\}'
    content, n = re.subn(p2, r'\1this.urlObserver?.disconnect();', content)
    changes += n
    
    # Pattern 3: if (this._forceNovaInterval) { clearInterval(this._forceNovaInterval); }
    p3 = r'(\s+)if \(this\._forceNovaInterval\) \{\s*\n\s+clearInterval\(this\._forceNovaInterval\);\s*\n\s+\}'
    content, n = re.subn(p3, r'\1this._forceNovaInterval && clearInterval(this._forceNovaInterval);', content)
    changes += n
    
    # Pattern 4: if (this._displayUpdateInterval) { clearInterval(this._displayUpdateInterval); }
    p4 = r'(\s+)if \(this\._displayUpdateInterval\) \{\s*\n\s+clearInterval\(this\._displayUpdateInterval\);\s*\n\s+\}'
    content, n = re.subn(p4, r'\1this._displayUpdateInterval && clearInterval(this._displayUpdateInterval);', content)
    changes += n
    
    # Pattern 5: Remove unnecessary else after return
    p5 = r'(\s+return[^;]*;)\s*\n(\s+)}\s*else\s*\{'
    content, n = re.subn(p5, r'\1\n\2}', content)
    changes += n
    
    # Pattern 6: if (arr.length > 0) → if (arr.length)
    p6 = r'if \(([^)]+)\.length > 0\)'
    content, n = re.subn(p6, r'if (\1.length)', content)
    changes += n
    
    # Pattern 7: if (arr.length === 0) → if (!arr.length)
    p7 = r'if \(([^)]+)\.length === 0\)'
    content, n = re.subn(p7, r'if (!\1.length)', content)
    changes += n
    
    # Pattern 8: Boolean assignments
    p8 = r'(\s+)let (\w+) = false;\s*\n\s+if \(([^)]+)\) \{\s*\n\s+\2 = true;\s*\n\s+\}'
    content, n = re.subn(p8, r'\1const \2 = \3;', content)
    changes += n
    
    # Pattern 9: if (condition) { single_line_call; }
    p9 = r'(\s+)if \(([^)]+)\) \{\s*\n\s+([\w.]+\([^;]*\);)\s*\n\s+\}'
    content, n = re.subn(p9, r'\1\2 && \3', content)
    changes += n
    
    # Pattern 10: typeof checks → optional chaining
    p10 = r'if \((\w+) && typeof \1 === [\'"]object[\'"]\)'
    content, n = re.subn(p10, r'if (\1?.constructor === Object)', content)
    changes += n
    
    return content, changes

def main():
    plugin_path = Path(__file__).parent.parent / "plugins" / "CriticalHit.plugin.js"
    
    print("="*80)
    print("ADVANCED PATTERN OPTIMIZER")
    print("="*80)
    print()
    
    content, changes = apply_advanced_optimizations(plugin_path)
    
    if changes > 0:
        with open(plugin_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        print(f"✅ Applied {changes} advanced optimizations!")
        
        # Count remaining
        lines = content.split('\n')
        if_count = sum(1 for line in lines if re.match(r'^\s*if \([^)]+\) \{?\s*$', line) and not line.strip().startswith('//'))
        print(f"📊 Remaining if-statements: {if_count}")
        print(f"📊 Total eliminated: {570 - if_count} ({(570 - if_count) * 100 / 570:.1f}%)")
    else:
        print("No changes applied")
    
    print("="*80)

if __name__ == "__main__":
    main()

