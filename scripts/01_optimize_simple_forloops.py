#!/usr/bin/env python3
"""
Step 1: Optimize Simple For-Loops
Replaces 8 safe for-loops with functional methods
"""

import re

def optimize_simple_loops(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content
    changes = 0

    print("="*70)
    print("STEP 1: OPTIMIZING SIMPLE FOR-LOOPS")
    print("="*70)

    # Optimization 1: Line ~3918 - Object.entries with filter
    pattern1 = r'''for \(const \[milestone, multiplier\] of Object\.entries\(milestoneMultipliers\)\) \{
\s+if \(this\.settings\.level >= parseInt\(milestone\)\) \{
\s+activeMultipliers\.push\(multiplier\);
\s+\}
\s+\}'''

    replacement1 = '''const activeMultipliers = Object.entries(milestoneMultipliers)
      .filter(([milestone]) => this.settings.level >= parseInt(milestone))
      .map(([_, multiplier]) => multiplier);'''

    if re.search(pattern1, content):
        content = re.sub(pattern1, replacement1, content)
        changes += 1
        print("✅ Optimized: Object.entries loop → .filter().map()")

    # Optimization 2: Line ~3529 - Simple iteration
    pattern2 = r'for \(let i = 0; i < levelsGained; i\+\+\) \{\s+this\.processNaturalStatGrowth\(\);\s+\}'
    replacement2 = '''Array.from({ length: levelsGained }).forEach(() => {
            this.processNaturalStatGrowth();
          });'''

    if re.search(pattern2, content):
        content = re.sub(pattern2, replacement2, content)
        changes += 1
        print("✅ Optimized: Simple iteration → .forEach()")

    # Optimization 3: Line ~4278 - Array generation
    pattern3 = r'''for \(let i = 0; i < baseStats\.perception; i\+\+\) \{
\s+const randomBuff = Math\.random\(\) \* 5 \+ 1;
\s+this\.settings\.perceptionBuffs\.push\(randomBuff\);
\s+\}'''

    replacement3 = '''this.settings.perceptionBuffs = Array.from(
          { length: baseStats.perception },
          () => Math.random() * 5 + 1
        );'''

    if re.search(pattern3, content):
        content = re.sub(pattern3, replacement3, content)
        changes += 1
        print("✅ Optimized: Array generation → Array.from()")

    # Optimization 4 & 5: Lines ~4909, ~5002 - Accumulator loops (just add directly!)
    pattern4 = r'for \(let i = 0; i < growthToAdd; i\+\+\) \{\s+shadow\.growthStats\[stat\] = \(shadow\.growthStats\[stat\] \|\| 0\) \+ 1;\s+\}'
    replacement4 = 'shadow.growthStats[stat] = (shadow.growthStats[stat] || 0) + growthToAdd;'

    if re.search(pattern4, content):
        content = re.sub(pattern4, replacement4, content)
        changes += 1
        print("✅ Optimized: Accumulator loop → Direct addition (growthStats)")

    pattern5 = r'for \(let i = 0; i < growthAmount; i\+\+\) \{\s+shadow\.naturalGrowthStats\[stat\] = \(shadow\.naturalGrowthStats\[stat\] \|\| 0\) \+ 1;\s+\}'
    replacement5 = 'shadow.naturalGrowthStats[stat] = (shadow.naturalGrowthStats[stat] || 0) + growthAmount;'

    if re.search(pattern5, content):
        content = re.sub(pattern5, replacement5, content)
        changes += 1
        print("✅ Optimized: Accumulator loop → Direct addition (naturalGrowthStats)")

    # Optimization 6: Line ~5272 - Quest card search
    pattern6 = r'''for \(const card of questCards\) \{
\s+const cardText = card\.textContent \|\| '';
\s+if \(cardText\.includes\(questName\)\) \{
\s+return card;
\s+\}
\s+\}'''

    replacement6 = '''return Array.from(questCards).find(card =>
        (card.textContent || '').includes(questName)
      );'''

    if re.search(pattern6, content):
        content = re.sub(pattern6, replacement6, content)
        changes += 1
        print("✅ Optimized: Quest card search → .find()")

    # Optimization 7: Line ~5338 - Particle creation
    pattern7 = r'''for \(let i = 0; i < particleCount; i\+\+\) \{
\s+const particle = document\.createElement\('div'\);
\s+particle\.className = 'sls-particle';'''

    replacement7 = '''Array.from({ length: particleCount }).forEach(() => {
      const particle = document.createElement('div');
      particle.className = 'sls-particle';'''

    if re.search(pattern7, content):
        content = re.sub(pattern7, replacement7, content)
        changes += 1
        print("✅ Optimized: Particle creation → .forEach()")

    # Save if changes were made
    if changes > 0:
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"\n✅ Applied {changes} optimizations")
        print(f"✅ Saved to {filename}")
    else:
        print("\n⚠️  No patterns matched - may need manual optimization")

    return changes

if __name__ == '__main__':
    changes = optimize_simple_loops('plugins/SoloLevelingStats.plugin.js')
    print("\n" + "="*70)
    if changes > 0:
        print("SUCCESS! Test the plugin in Discord now.")
    else:
        print("No automatic changes made. Patterns may have changed.")
    print("="*70)
