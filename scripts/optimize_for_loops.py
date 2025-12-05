#!/usr/bin/env python3
"""
For-Loop Optimizer
Finds for-loops and suggests functional method replacements
"""

import re

def analyze_for_loops(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    print("="*70)
    print("FOR-LOOP ANALYSIS & OPTIMIZATION")
    print("="*70)

    for_loops = []
    i = 0

    while i < len(lines):
        line = lines[i]

        # Find for loop
        if re.search(r'\bfor\s*\(', line):
            loop_start = i
            loop_lines = [line]

            # Extract loop body
            brace_count = line.count('{') - line.count('}')
            j = i + 1

            while j < len(lines) and brace_count > 0:
                loop_lines.append(lines[j])
                brace_count += lines[j].count('{') - lines[j].count('}')
                j += 1

            loop_end = j
            loop_code = ''.join(loop_lines)

            # Analyze loop pattern
            loop_type = determine_loop_type(loop_code)
            suggestion = get_functional_replacement(loop_code, loop_type)

            for_loops.append({
                'start': loop_start + 1,
                'end': loop_end,
                'lines': len(loop_lines),
                'type': loop_type,
                'code': loop_code[:200],
                'suggestion': suggestion
            })

            i = j
        else:
            i += 1

    print(f"\nFound {len(for_loops)} for-loops\n")

    # Group by type
    by_type = {}
    for loop in for_loops:
        loop_type = loop['type']
        if loop_type not in by_type:
            by_type[loop_type] = []
        by_type[loop_type].append(loop)

    # Print categorized loops
    for loop_type, loops in by_type.items():
        print(f"\n{loop_type.upper()} LOOPS: {len(loops)}")
        print("-" * 70)
        for loop in loops:
            print(f"\nLine {loop['start']}-{loop['end']} ({loop['lines']} lines)")
            print(f"Pattern: {loop['type']}")
            print(f"Suggestion: {loop['suggestion']}")
            print(f"Code preview: {loop['code'][:100]}...")

    return for_loops

def determine_loop_type(code):
    """Determine what type of loop this is"""
    # Accumulator pattern (sum, count, etc.)
    if re.search(r'\+=|count\+\+|\+= 1', code):
        return 'accumulator'

    # Array building pattern (push to array)
    if '.push(' in code:
        return 'array_building'

    # Transformation pattern (modifying each element)
    if re.search(r'\[i\]\s*=', code):
        return 'transformation'

    # Search pattern (finding element)
    if 'break' in code and ('return' in code or '=' in code):
        return 'search'

    # Iteration pattern (side effects only)
    return 'iteration'

def get_functional_replacement(code, loop_type):
    """Suggest functional replacement"""
    if loop_type == 'accumulator':
        return ".reduce((sum, item) => sum + item, 0)"
    elif loop_type == 'array_building':
        if 'if (' in code:
            return ".filter(item => condition)"
        else:
            return ".map(item => transformedItem)"
    elif loop_type == 'transformation':
        return ".map(item => transformedItem)"
    elif loop_type == 'search':
        return ".find(item => condition)"
    else:
        return ".forEach(item => { /* side effects */ })"

if __name__ == '__main__':
    analyze_for_loops('plugins/SoloLevelingStats.plugin.js')
