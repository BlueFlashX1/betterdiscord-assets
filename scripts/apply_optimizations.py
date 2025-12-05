#!/usr/bin/env python3
"""
Apply batch optimizations to CriticalHit.plugin.js
"""
import re
from pathlib import Path

def find_and_replace_patterns(file_path):
    """Find and replace optimizable patterns"""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content
    changes = 0

    # Pattern 1: if (match) { pureMessageId = match[0]; } → match && (pureMessageId = match[0]);
    pattern1 = r'(\s+)if \(match\) \{\s*\n\s+pureMessageId = match\[0\];\s*\n\s+\}'
    replacement1 = r'\1match && (pureMessageId = match[0]);'
    content, n = re.subn(pattern1, replacement1, content)
    changes += n

    # Pattern 2: if (isCrit) { this._cachedCritHistory = null; } → isCrit && (this._cachedCritHistory = null);
    pattern2 = r'(\s+)if \(isCrit\) \{\s*\n\s+this\._cachedCritHistory = null;\s*\n\s+\}'
    replacement2 = r'\1isCrit && (this._cachedCritHistory = null);'
    content, n = re.subn(pattern2, replacement2, content)
    changes += n

    # Pattern 3: if (debugContext) { this.debugLog(...); } → debugContext && this.debugLog(...);
    pattern3 = r'(\s+)if \(debugContext\) \{\s*\n\s+(this\.debugLog\([^;]+\);)\s*\n\s+\}'
    replacement3 = r'\1debugContext && \2'
    content, n = re.subn(pattern3, replacement3, content)
    changes += n

    # Pattern 4: if (normalizedMsgId) { this.markAsProcessed(...); } → normalizedMsgId && this.markAsProcessed(...);
    pattern4 = r'(\s+)if \(normalizedMsgId\) \{\s*\n\s+(this\.markAsProcessed\([^;]+\);)\s*\n\s+\}'
    replacement4 = r'\1normalizedMsgId && \2'
    content, n = re.subn(pattern4, replacement4, content)
    changes += n

    # Pattern 5: if (this.historyCleanupInterval) { clearInterval(...); }
    pattern5 = r'(\s+)if \(this\.historyCleanupInterval\) \{\s*\n\s+(clearInterval\([^;]+\);)\s*\n\s+\}'
    replacement5 = r'\1this.historyCleanupInterval && \2'
    content, n = re.subn(pattern5, replacement5, content)
    changes += n

    # Pattern 6: if (this.settings.autoCleanupHistory) { this.cleanupOldHistory(...); }
    pattern6 = r'(\s+)if \(this\.settings\.autoCleanupHistory\) \{\s*\n\s+(this\.cleanupOldHistory\([^;]+\);)\s*\n\s+\}'
    replacement6 = r'\1this.settings.autoCleanupHistory && \2'
    content, n = re.subn(pattern6, replacement6, content)
    changes += n

    # Pattern 7: if (this.processedMessages.size > max) { this.cleanupProcessedMessages(); }
    pattern7 = r'(\s+)if \(this\.processedMessages\.size > this\.maxProcessedMessages\) \{\s*\n\s+(this\.cleanupProcessedMessages\(\);)\s*\n\s+\}'
    replacement7 = r'\1this.processedMessages.size > this.maxProcessedMessages && \2'
    content, n = re.subn(pattern7, replacement7, content)
    changes += n

    # Pattern 8: if (messageId) { this._processingCrits.add(messageId); }
    pattern8 = r'(\s+)if \(messageId\) \{\s*\n\s+(this\._processingCrits\.add\(messageId\);)\s*\n\s+\}'
    replacement8 = r'\1messageId && \2'
    content, n = re.subn(pattern8, replacement8, content)
    changes += n

    # Pattern 9: if (contentHash) { this._comboUpdatedContentHashes.add(contentHash); }
    pattern9 = r'(\s+)if \(contentHash\) \{\s*\n\s+(this\._comboUpdatedContentHashes\.add\(contentHash\);)\s*\n\s+\}'
    replacement9 = r'\1contentHash && \2'
    content, n = re.subn(pattern9, replacement9, content)
    changes += n

    # Pattern 10: Multi-line guard clause returns (keep single line)
    pattern10 = r'(\s+)if \(([^)]+)\) \{\s*\n\s+(return[^;]*;)\s*\n\s+\}'
    replacement10 = r'\1if (\2) \3'
    content, n = re.subn(pattern10, replacement10, content)
    changes += n

    # Pattern 11: if (msgEl) { return msgEl.closest(...); }
    pattern11 = r'(\s+)if \(msgEl\) \{\s*\n\s+(return msgEl\.[^;]+;)\s*\n\s+\}'
    replacement11 = r'\1if (msgEl) \2'
    content, n = re.subn(pattern11, replacement11, content)
    changes += n

    # Pattern 12: if (hasReplyWrapper) { return true; }
    pattern12 = r'(\s+)if \(hasReplyWrapper\) \{\s*\n\s+return true;\s*\n\s+\}'
    replacement12 = r'\1if (hasReplyWrapper) return true;'
    content, n = re.subn(pattern12, replacement12, content)
    changes += n

    # Pattern 13: if (x) { this.styleObservers.get(x).disconnect(); }
    pattern13 = r'(\s+)if \(this\.styleObservers\.has\(([^)]+)\)\) \{\s*\n\s+this\.styleObservers\.get\(\2\)\.disconnect\(\);\s*\n\s+\}'
    replacement13 = r'\1this.styleObservers.has(\2) && this.styleObservers.get(\2).disconnect();'
    content, n = re.subn(pattern13, replacement13, content)
    changes += n

    # Pattern 14: Any if (x) { single return; } → if (x) return;
    pattern14 = r'(\s+)if \(([^)]+)\) \{\s*\n\s+(return[^;]*;)\s*\n\s+\}'
    replacement14 = r'\1if (\2) \3'
    content, n = re.subn(pattern14, replacement14, content)
    changes += n

    # Pattern 15: if (x) { method.add(y); }
    pattern15 = r'(\s+)if \((\w+)\) \{\s*\n\s+([^;]+\.(add|set|push)\([^;]+\);)\s*\n\s+\}'
    replacement15 = r'\1\2 && \3'
    content, n = re.subn(pattern15, replacement15, content)
    changes += n

    # Pattern 16: if (condition) { this.someMethod(); }
    pattern16 = r'(\s+)if \(([^)]+)\) \{\s*\n\s+(this\.\w+\([^;]*\);)\s*\n\s+\}'
    replacement16 = r'\1\2 && \3'
    content, n = re.subn(pattern16, replacement16, content)
    changes += n

    return content, changes, content != original_content

def main():
    plugin_path = Path(__file__).parent.parent / "plugins" / "CriticalHit.plugin.js"

    print("="*80)
    print("APPLYING BATCH OPTIMIZATIONS")
    print("="*80)
    print()

    content, changes, modified = find_and_replace_patterns(plugin_path)

    if modified:
        # Write back to file
        with open(plugin_path, 'w', encoding='utf-8') as f:
            f.write(content)

        print(f"✅ Applied {changes} optimizations successfully!")
        print(f"✅ File updated: {plugin_path}")

        # Count remaining if-statements
        lines = content.split('\n')
        if_count = sum(1 for line in lines if re.match(r'^\s*if \([^)]+\) \{?\s*$', line) and not line.strip().startswith('//'))
        print(f"\n📊 Remaining if-statements: {if_count}")
        print(f"📊 Eliminated: {570 - if_count} ({(570 - if_count) * 100 / 570:.1f}%)")
    else:
        print("No changes needed!")

    print()
    print("="*80)

if __name__ == "__main__":
    main()
