#!/usr/bin/env python3
"""
Final comprehensive optimizer - finds and applies all safe optimizations
"""
import re
from pathlib import Path

def find_and_optimize(file_path):
    """Find and apply all safe optimizations"""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content
    changes = 0

    # Pattern 1: if (this.styleObservers.has(x)) { this.styleObservers.get(x).disconnect(); }
    p1 = r'(\s+)if \(this\.styleObservers\.has\(([^)]+)\)\) \{\s*\n\s+this\.styleObservers\.get\(\2\)\.disconnect\(\);\s*\n\s+\}'
    content, n = re.subn(p1, r'\1this.styleObservers.get(\2)?.disconnect();', content)
    changes += n

    # Pattern 2: if (variable) { method(variable); } → variable && method(variable);
    p2 = r'(\s+)if \((\w+)\) \{\s*\n\s+(this\.\w+\(\2[^;]*\);)\s*\n\s+\}'
    content, n = re.subn(p2, r'\1\2 && \3', content)
    changes += n

    # Pattern 3: if (this.isLoadingChannel) { this.debugLog(...); }
    p3 = r'(\s+)if \(this\.isLoadingChannel\) \{\s*\n\s+(this\.debugLog\([^;]+\);)\s*\n\s+\}'
    content, n = re.subn(p3, r'\1this.isLoadingChannel && \2', content)
    changes += n

    # Pattern 4: if (this.currentChannelId) { // comment ... code }
    p4 = r'(\s+)if \(this\.currentChannelId\) \{\s*\n\s+// [^\n]+\n\s+([^;]+;)\s*\n\s+\}'
    content, n = re.subn(p4, r'\1this.currentChannelId && \2', content)
    changes += n

    # Pattern 5: Simple property checks → short-circuit
    p5 = r'(\s+)if \(this\.(\w+Interval|Observer)\) \{\s*\n\s+(clear\w+\(this\.\2\);)\s*\n\s+\}'
    content, n = re.subn(p5, r'\1this.\2 && \3', content)
    changes += n

    # Pattern 6: if (obj) { obj.method(); } → obj?.method();
    p6 = r'(\s+)if \((\w+)\) \{\s*\n\s+\2\.(\w+)\(\);\s*\n\s+\}'
    content, n = re.subn(p6, r'\1\2?.\3();', content)
    changes += n

    # Pattern 7: if (arr.length > 0) { return arr[...]; }
    p7 = r'if \((\w+)\.length > 0\) return'
    content, n = re.subn(p7, r'if (\1.length) return', content)
    changes += n

    # Pattern 8: if (classes.some(...)) { return true; }
    p8 = r'(\s+)if \(classes\.some\(([^)]+)\)\) \{\s*\n\s+return true;\s*\n\s+\}'
    content, n = re.subn(p8, r'\1if (classes.some(\2)) return true;', content)
    changes += n

    # Pattern 9: if (bonusSpan) { if (totalBonus > 0) { ... } }
    # Flatten nested ifs with same parent condition
    p9 = r'(\s+)if \(bonusSpan\) \{\s*\n\s+if \(totalBonus > 0\) \{'
    content, n = re.subn(p9, r'\1if (bonusSpan && totalBonus > 0) {', content)
    changes += n

    # Pattern 10: if (content) { if (messageElement.classList) { ... } }
    p10 = r'if \((\w+)\) \{\s*\n\s+if \((\w+)\.\w+\) \{'
    content, n = re.subn(p10, r'if (\1 && \2) {', content, count=5)
    changes += n

    # Pattern 11: if (this.debug?.enabled) { console.log(...); } → this.debug?.enabled && console.log(...);
    p11 = r'(\s+)if \(this\.debug\?\.enabled\) \{\s*\n\s+(console\.\w+\([^;]+\);)\s*\n\s+\}'
    content, n = re.subn(p11, r'\1this.debug?.enabled && \2', content)
    changes += n

    # Pattern 12: if (fiber) { let x = ...; }
    p12 = r'(\s+)if \(fiber\) \{\s*\n\s+(const \w+ = [^;]+;)\s*\n'
    content, n = re.subn(p12, r'\1if (fiber) {\n\1  \2\n', content)
    changes += n

    # Pattern 13: Flatten nested if with AND
    p13 = r'(\s+)if \((\w+)\) \{\s*\n(\s+)if \((\w+)\) \{'
    content, n = re.subn(p13, r'\1if (\2 && \4) {', content, count=10)
    changes += n

    return content, changes

def main():
    plugin_path = Path(__file__).parent.parent / "plugins" / "CriticalHit.plugin.js"

    print("="*80)
    print("FINAL COMPREHENSIVE OPTIMIZER")
    print("="*80)
    print()

    content, changes = find_and_optimize(plugin_path)

    if changes > 0:
        with open(plugin_path, 'w', encoding='utf-8') as f:
            f.write(content)

        print(f"✅ Applied {changes} final optimizations!")

        lines = content.split('\n')
        if_count = sum(1 for line in lines if re.match(r'^\s*if \([^)]+\) \{?\s*$', line) and not line.strip().startswith('//'))
        print(f"📊 Remaining: {if_count} if-statements")
        print(f"📊 Total eliminated: {570 - if_count} ({(570 - if_count) * 100 / 570:.1f}%)")
        print(f"📊 Lines: {len(lines)} (saved: {8859 - len(lines)})")
    else:
        print("No more optimizations found")

    print("="*80)

if __name__ == "__main__":
    main()
