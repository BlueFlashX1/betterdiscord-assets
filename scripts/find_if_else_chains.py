#!/usr/bin/env python3
"""Find if-else chains that can be optimized"""
import re

with open('plugins/SoloLevelingStats.plugin.js', 'r') as f:
    lines = f.readlines()

chains = []
current_chain = None
in_chain = False

for i, line in enumerate(lines, 1):
    # Start of if statement
    if re.search(r'^\s+if \(', line):
        if not in_chain:
            current_chain = {'start': i, 'lines': [line.strip()], 'count': 1}
            in_chain = True
        else:
            current_chain['lines'].append(line.strip())
    
    # else if
    elif re.search(r'^\s+\} else if \(', line) and in_chain:
        current_chain['lines'].append(line.strip())
        current_chain['count'] += 1
    
    # else
    elif re.search(r'^\s+\} else \{', line) and in_chain:
        current_chain['lines'].append(line.strip())
        current_chain['end'] = i
        if current_chain['count'] >= 2:  # Only chains with 2+ conditions
            chains.append(current_chain)
        in_chain = False
        current_chain = None
    
    # End of chain without else
    elif not re.search(r'^\s+\}', line) and in_chain and current_chain:
        if current_chain['count'] >= 2:
            current_chain['end'] = i - 1
            chains.append(current_chain)
        in_chain = False
        current_chain = None

# Sort by chain length (most conditions first)
chains.sort(key=lambda x: x['count'], reverse=True)

print("="*70)
print(f"FOUND {len(chains)} IF-ELSE CHAINS (2+ conditions)")
print("="*70)

for idx, chain in enumerate(chains[:15], 1):  # Show top 15
    print(f"\n{idx}. Line {chain['start']}: {chain['count']} conditions")
    print(f"   {chain['lines'][0][:60]}...")
    if len(chain['lines']) > 1:
        print(f"   {chain['lines'][1][:60]}...")

