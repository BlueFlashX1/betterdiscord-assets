#!/usr/bin/env python3
"""
Batch optimizer for CriticalHit.plugin.js
Captures patterns and applies optimizations efficiently
"""
import re
from pathlib import Path

def analyze_patterns(file_path):
    """Analyze and categorize optimizable patterns"""
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    patterns = {
        'one_liner_candidates': [],  # if (x) { statement; }
        'short_circuit_assignments': [],  # if (x) { y = z; }
        'short_circuit_calls': [],  # if (x) { method(); }
        'multi_line_returns': [],  # if (x) { return y; }
        'cache_invalidations': [],  # if (x) { this._cache = null; }
        'simple_additions': [],  # if (x) { set.add(y); }
    }

    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Skip comments and already optimized
        if stripped.startswith('//') or '&&' in stripped and '(' in stripped:
            i += 1
            continue

        # Check for if (condition) { single_statement; }
        if_match = re.match(r'^(\s*)if \(([^)]+)\) \{\s*$', stripped)
        if if_match and i + 2 < len(lines):
            indent = if_match.group(1)
            condition = if_match.group(2)
            next_line = lines[i + 1].strip()
            closing = lines[i + 2].strip()

            if closing == '}' and next_line and not next_line.startswith('//'):
                # Categorize by statement type
                if 'return' in next_line:
                    patterns['multi_line_returns'].append({
                        'line': i + 1,
                        'condition': condition,
                        'statement': next_line,
                        'indent': indent
                    })
                elif '= ' in next_line or ' =' in next_line:
                    if 'null' in next_line or 'undefined' in next_line:
                        patterns['cache_invalidations'].append({
                            'line': i + 1,
                            'condition': condition,
                            'statement': next_line,
                            'indent': indent
                        })
                    else:
                        patterns['short_circuit_assignments'].append({
                            'line': i + 1,
                            'condition': condition,
                            'statement': next_line,
                            'indent': indent
                        })
                elif '.add(' in next_line or '.set(' in next_line or '.push(' in next_line:
                    patterns['simple_additions'].append({
                        'line': i + 1,
                        'condition': condition,
                        'statement': next_line,
                        'indent': indent
                    })
                elif '(' in next_line:
                    patterns['short_circuit_calls'].append({
                        'line': i + 1,
                        'condition': condition,
                        'statement': next_line,
                        'indent': indent
                    })
                else:
                    patterns['one_liner_candidates'].append({
                        'line': i + 1,
                        'condition': condition,
                        'statement': next_line,
                        'indent': indent
                    })

        i += 1

    return patterns, lines

def generate_optimizations(patterns):
    """Generate optimization replacements"""
    optimizations = []

    # One-liner returns: if (x) { return y; } → if (x) return y;
    for p in patterns['multi_line_returns']:
        old = f"{p['indent']}if ({p['condition']}) {{\n  {p['statement']}\n}}"
        new = f"{p['indent']}if ({p['condition']}) {p['statement']}"
        optimizations.append(('multi_line_return', p['line'], old, new))

    # Short-circuit assignments: if (x) { y = z; } → x && (y = z);
    for p in patterns['short_circuit_assignments']:
        old = f"{p['indent']}if ({p['condition']}) {{\n  {p['statement']}\n}}"
        new = f"{p['indent']}{p['condition']} && ({p['statement']});"
        optimizations.append(('short_circuit_assignment', p['line'], old, new))

    # Short-circuit calls: if (x) { method(); } → x && method();
    for p in patterns['short_circuit_calls']:
        old = f"{p['indent']}if ({p['condition']}) {{\n  {p['statement']}\n}}"
        new = f"{p['indent']}{p['condition']} && {p['statement']}"
        optimizations.append(('short_circuit_call', p['line'], old, new))

    # Cache invalidations: if (x) { this._cache = null; } → x && (this._cache = null);
    for p in patterns['cache_invalidations']:
        old = f"{p['indent']}if ({p['condition']}) {{\n  {p['statement']}\n}}"
        new = f"{p['indent']}{p['condition']} && ({p['statement']});"
        optimizations.append(('cache_invalidation', p['line'], old, new))

    # Simple additions: if (x) { set.add(y); } → x && set.add(y);
    for p in patterns['simple_additions']:
        old = f"{p['indent']}if ({p['condition']}) {{\n  {p['statement']}\n}}"
        new = f"{p['indent']}{p['condition']} && {p['statement']}"
        optimizations.append(('simple_addition', p['line'], old, new))

    return optimizations

def main():
    plugin_path = Path(__file__).parent.parent / "plugins" / "CriticalHit.plugin.js"

    print("="*80)
    print("BATCH OPTIMIZER - Pattern Analysis")
    print("="*80)
    print()

    patterns, lines = analyze_patterns(plugin_path)

    # Display found patterns
    for pattern_type, items in patterns.items():
        if items:
            print(f"\n{pattern_type.upper().replace('_', ' ')}: {len(items)} found")
            for item in items[:5]:
                print(f"  Line {item['line']:5d}: if ({item['condition'][:40]}...) {{ {item['statement'][:40]}... }}")
            if len(items) > 5:
                print(f"  ... and {len(items) - 5} more")

    total = sum(len(v) for v in patterns.values())
    print(f"\n{'='*80}")
    print(f"TOTAL OPTIMIZABLE PATTERNS: {total}")
    print(f"{'='*80}")

    # Generate optimizations
    optimizations = generate_optimizations(patterns)

    print(f"\nGenerated {len(optimizations)} optimization transformations")
    print("\nBy type:")
    from collections import Counter
    counts = Counter(opt[0] for opt in optimizations)
    for opt_type, count in counts.items():
        print(f"  {opt_type}: {count}")

    print(f"\nReady to apply optimizations!")
    print(f"Run with --apply flag to apply changes")

if __name__ == "__main__":
    main()
