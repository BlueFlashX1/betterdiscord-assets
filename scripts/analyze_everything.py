#!/usr/bin/env python3
"""
Comprehensive File Analyzer
Systematically analyzes entire SoloLevelingStats plugin for:
- Broken functions
- Old code patterns
- Structure issues
- Performance problems
- Code quality issues
- Best practice violations
"""

import re
from collections import defaultdict, Counter
from typing import List, Dict, Set, Tuple

class ComprehensiveAnalyzer:
    def __init__(self, source_file: str):
        self.source_file = source_file
        self.lines = []
        self.issues = defaultdict(list)
        self.warnings = defaultdict(list)
        self.stats = {}

    def load_source(self):
        """Load source file"""
        with open(self.source_file, 'r', encoding='utf-8') as f:
            self.lines = f.readlines()
        print(f"✅ Loaded {len(self.lines)} lines")

    def analyze_syntax_patterns(self):
        """Check for syntax issues and old patterns"""
        print("\n" + "="*70)
        print("1. SYNTAX & PATTERN ANALYSIS")
        print("="*70)

        # Check for common issues
        issues = {
            'var_declarations': 0,
            'double_equals': 0,
            'console_logs': 0,
            'todo_comments': 0,
            'fixme_comments': 0,
            'empty_functions': 0,
            'long_functions': 0,
            'deep_nesting': 0,
        }

        for i, line in enumerate(self.lines, 1):
            # Old var declarations (should use let/const)
            if re.search(r'\bvar\s+\w+', line):
                issues['var_declarations'] += 1
                self.warnings['var_declarations'].append(f"Line {i}: Found 'var' (use 'let' or 'const')")

            # Double equals (should use ===)
            if re.search(r'[^=!]==[^=]', line) and not '//' in line[:line.find('==')]:
                issues['double_equals'] += 1
                self.warnings['double_equals'].append(f"Line {i}: Found '==' (use '===')")

            # Console.log (should use debug system)
            if 'console.log(' in line and 'debugLog' not in self.lines[max(0,i-2):i]:
                issues['console_logs'] += 1
                self.warnings['console_logs'].append(f"Line {i}: console.log found")

            # TODO/FIXME comments
            if re.search(r'//.*TODO|//.*FIXME', line, re.IGNORECASE):
                issues['todo_comments'] += 1
                self.warnings['todo_comments'].append(f"Line {i}: {line.strip()}")

        # Check function lengths
        in_function = False
        func_start = 0
        func_name = ""
        brace_count = 0

        for i, line in enumerate(self.lines, 1):
            if re.match(r'^\s+([a-z][a-zA-Z0-9]*)\(.*\) \{', line):
                match = re.match(r'^\s+([a-z][a-zA-Z0-9]*)\(', line)
                func_name = match.group(1)
                func_start = i
                in_function = True
                brace_count = 1
            elif in_function:
                brace_count += line.count('{') - line.count('}')
                if brace_count == 0:
                    func_length = i - func_start + 1
                    if func_length > 200:
                        issues['long_functions'] += 1
                        self.warnings['long_functions'].append(
                            f"Line {func_start}: {func_name}() is {func_length} lines (consider breaking down)"
                        )
                    if func_length < 3:
                        issues['empty_functions'] += 1
                    in_function = False

        self.stats['syntax_issues'] = issues

        # Print summary
        print(f"\n{'var declarations:':<25} {issues['var_declarations']}")
        print(f"{'== instead of ===':<25} {issues['double_equals']}")
        print(f"{'console.log():':<25} {issues['console_logs']}")
        print(f"{'TODO/FIXME comments:':<25} {issues['todo_comments']}")
        print(f"{'Empty functions:':<25} {issues['empty_functions']}")
        print(f"{'Long functions (>200):':<25} {issues['long_functions']}")

    def analyze_structure(self):
        """Analyze file structure"""
        print("\n" + "="*70)
        print("2. STRUCTURE ANALYSIS")
        print("="*70)

        # Find sections
        sections = {}
        for i, line in enumerate(self.lines, 1):
            if 'SECTION 1:' in line:
                sections['section_1'] = i
            elif 'SECTION 2:' in line:
                sections['section_2'] = i
            elif 'SECTION 3:' in line:
                sections['section_3'] = i
            elif 'SECTION 4:' in line:
                sections['section_4'] = i
            elif re.match(r'^\s+constructor\(\) \{', line):
                sections['constructor'] = i

        print(f"\n{'Section 1 (Imports):':<30} Line {sections.get('section_1', 'NOT FOUND')}")
        print(f"{'Section 2 (Config/Helpers):':<30} Line {sections.get('section_2', 'NOT FOUND')}")
        print(f"{'Constructor:':<30} Line {sections.get('constructor', 'NOT FOUND')}")
        print(f"{'Section 4 (Debug):':<30} Line {sections.get('section_4', 'NOT FOUND')}")
        print(f"{'Section 3 (Operations):':<30} Line {sections.get('section_3', 'NOT FOUND')}")

        # Check order
        if sections.get('constructor', 0) < sections.get('section_4', 0):
            print("\n✅ Constructor comes BEFORE Section 4 (correct!)")
        else:
            print("\n❌ Constructor comes AFTER Section 4 (wrong!)")
            self.issues['structure'].append("Constructor should come before Section 4")

        self.stats['sections'] = sections

    def analyze_functions(self):
        """Analyze all functions"""
        print("\n" + "="*70)
        print("3. FUNCTION ANALYSIS")
        print("="*70)

        functions = []
        func_names = []

        for i, line in enumerate(self.lines, 1):
            match = re.match(r'^\s+([a-z][a-zA-Z0-9]*)\(.*\) \{', line)
            if match:
                func_name = match.group(1)
                functions.append((func_name, i))
                func_names.append(func_name)

        # Check for duplicates
        name_counts = Counter(func_names)
        duplicates = {name: count for name, count in name_counts.items() if count > 1}

        print(f"\nTotal functions: {len(functions)}")
        print(f"Unique functions: {len(set(func_names))}")
        print(f"Duplicate functions: {len(duplicates)}")

        if duplicates:
            print("\n⚠️  DUPLICATES FOUND:")
            for name, count in duplicates.items():
                print(f"  - {name}() appears {count} times")
                self.issues['duplicates'].append(f"{name}() appears {count} times")

        self.stats['functions'] = {
            'total': len(functions),
            'unique': len(set(func_names)),
            'duplicates': duplicates
        }

    def analyze_code_quality(self):
        """Analyze code quality metrics"""
        print("\n" + "="*70)
        print("4. CODE QUALITY ANALYSIS")
        print("="*70)

        metrics = {
            'total_lines': len(self.lines),
            'code_lines': 0,
            'comment_lines': 0,
            'blank_lines': 0,
            'max_line_length': 0,
            'long_lines': 0,
            'if_else_chains': 0,
            'for_loops': 0,
            'while_loops': 0,
            'forEach_calls': 0,
            'querySelector_calls': 0,
            'setTimeout_calls': 0,
            'setInterval_calls': 0,
        }

        for i, line in enumerate(self.lines, 1):
            # Line classification
            stripped = line.strip()
            if not stripped:
                metrics['blank_lines'] += 1
            elif stripped.startswith('//') or stripped.startswith('/*') or stripped.startswith('*'):
                metrics['comment_lines'] += 1
            else:
                metrics['code_lines'] += 1

            # Line length
            line_len = len(line.rstrip())
            if line_len > metrics['max_line_length']:
                metrics['max_line_length'] = line_len
            if line_len > 120:
                metrics['long_lines'] += 1

            # Pattern counts
            if '} else if' in line or '} else {' in line:
                metrics['if_else_chains'] += 1
            if re.search(r'\bfor\s*\(', line):
                metrics['for_loops'] += 1
            if re.search(r'\bwhile\s*\(', line):
                metrics['while_loops'] += 1
            if '.forEach(' in line:
                metrics['forEach_calls'] += 1
            if 'querySelector' in line:
                metrics['querySelector_calls'] += 1
            if 'setTimeout(' in line:
                metrics['setTimeout_calls'] += 1
            if 'setInterval(' in line:
                metrics['setInterval_calls'] += 1

        print(f"\n{'Total lines:':<30} {metrics['total_lines']}")
        print(f"{'Code lines:':<30} {metrics['code_lines']} ({metrics['code_lines']/metrics['total_lines']*100:.1f}%)")
        print(f"{'Comment lines:':<30} {metrics['comment_lines']} ({metrics['comment_lines']/metrics['total_lines']*100:.1f}%)")
        print(f"{'Blank lines:':<30} {metrics['blank_lines']} ({metrics['blank_lines']/metrics['total_lines']*100:.1f}%)")
        print(f"{'Max line length:':<30} {metrics['max_line_length']}")
        print(f"{'Long lines (>120 chars):':<30} {metrics['long_lines']}")
        print(f"\n{'if-else patterns:':<30} {metrics['if_else_chains']}")
        print(f"{'for loops:':<30} {metrics['for_loops']}")
        print(f"{'while loops:':<30} {metrics['while_loops']}")
        print(f"{'forEach calls:':<30} {metrics['forEach_calls']}")
        print(f"{'querySelector calls:':<30} {metrics['querySelector_calls']}")
        print(f"{'setTimeout calls:':<30} {metrics['setTimeout_calls']}")
        print(f"{'setInterval calls:':<30} {metrics['setInterval_calls']}")

        self.stats['code_quality'] = metrics

        # Warnings
        if metrics['querySelector_calls'] > 20:
            self.warnings['performance'].append(f"High querySelector count ({metrics['querySelector_calls']}) - consider DOM caching")
        if metrics['for_loops'] > 10:
            self.warnings['style'].append(f"Many for loops ({metrics['for_loops']}) - consider functional methods")
        if metrics['long_lines'] > 50:
            self.warnings['style'].append(f"Many long lines ({metrics['long_lines']}) - consider breaking up")

    def analyze_dependencies(self):
        """Analyze plugin dependencies and external calls"""
        print("\n" + "="*70)
        print("5. DEPENDENCY ANALYSIS")
        print("="*70)

        dependencies = {
            'BdApi': 0,
            'ShadowArmy': 0,
            'Dungeons': 0,
            'CriticalHit': 0,
            'IndexedDB': 0,
            'localStorage': 0,
            'document': 0,
            'window': 0,
        }

        for line in self.lines:
            if 'BdApi.' in line:
                dependencies['BdApi'] += 1
            if 'ShadowArmy' in line:
                dependencies['ShadowArmy'] += 1
            if 'Dungeons' in line:
                dependencies['Dungeons'] += 1
            if 'CriticalHit' in line:
                dependencies['CriticalHit'] += 1
            if 'IndexedDB' in line or 'indexedDB' in line:
                dependencies['IndexedDB'] += 1
            if 'localStorage' in line:
                dependencies['localStorage'] += 1
            if 'document.' in line:
                dependencies['document'] += 1
            if 'window.' in line:
                dependencies['window'] += 1

        print("\nExternal Dependencies:")
        for dep, count in dependencies.items():
            if count > 0:
                print(f"  {dep:<20} {count} references")

        self.stats['dependencies'] = dependencies

    def analyze_performance(self):
        """Analyze performance patterns"""
        print("\n" + "="*70)
        print("6. PERFORMANCE ANALYSIS")
        print("="*70)

        perf = {
            'dom_cache_usage': 0,
            'throttle_usage': 0,
            'debounce_usage': 0,
            'lookup_map_usage': 0,
            'if_else_chains_3plus': 0,
            'nested_loops': 0,
        }

        # Check for optimization patterns
        for i, line in enumerate(self.lines):
            if 'getCachedElement' in line or 'this.domCache' in line:
                perf['dom_cache_usage'] += 1
            if 'this.throttled.' in line:
                perf['throttle_usage'] += 1
            if 'this.debounced.' in line:
                perf['debounce_usage'] += 1
            if 'this.rankData' in line or 'this.questData' in line:
                perf['lookup_map_usage'] += 1

        # Count if-else chains
        i = 0
        while i < len(self.lines):
            if 'if (' in self.lines[i]:
                chain_length = 1
                j = i + 1
                while j < len(self.lines) and '} else if (' in self.lines[j]:
                    chain_length += 1
                    j += 1
                if chain_length >= 3:
                    perf['if_else_chains_3plus'] += 1
                    self.warnings['performance'].append(f"Line {i+1}: if-else chain with {chain_length} conditions")
                i = j
            i += 1

        print(f"\n{'DOM cache usage:':<30} {perf['dom_cache_usage']} calls")
        print(f"{'Throttle usage:':<30} {perf['throttle_usage']} calls")
        print(f"{'Debounce usage:':<30} {perf['debounce_usage']} calls")
        print(f"{'Lookup map usage:':<30} {perf['lookup_map_usage']} calls")
        print(f"{'Long if-else chains:':<30} {perf['if_else_chains_3plus']} (3+ conditions)")

        self.stats['performance'] = perf

    def analyze_structure_integrity(self):
        """Check if structure is correct"""
        print("\n" + "="*70)
        print("7. STRUCTURE INTEGRITY CHECK")
        print("="*70)

        checks = {
            'has_class_declaration': False,
            'has_constructor': False,
            'constructor_count': 0,
            'has_section_1': False,
            'has_section_2': False,
            'has_section_3': False,
            'has_section_4': False,
            'proper_closing': False,
            'section_order_correct': False,
        }

        constructor_lines = []
        section_lines = {}

        for i, line in enumerate(self.lines, 1):
            if 'module.exports = class' in line:
                checks['has_class_declaration'] = True
            if re.match(r'^\s+constructor\(\) \{', line):
                checks['constructor_count'] += 1
                constructor_lines.append(i)
            if 'SECTION 1:' in line:
                checks['has_section_1'] = True
                section_lines['section_1'] = i
            if 'SECTION 2:' in line:
                checks['has_section_2'] = True
                section_lines['section_2'] = i
            if 'SECTION 3:' in line:
                checks['has_section_3'] = True
                section_lines['section_3'] = i
            if 'SECTION 4:' in line:
                checks['has_section_4'] = True
                section_lines['section_4'] = i
            if line.strip() == '};' and i == len(self.lines):
                checks['proper_closing'] = True

        checks['has_constructor'] = checks['constructor_count'] == 1

        # Check section order
        if section_lines:
            expected_order = ['section_1', 'section_2', 'section_4', 'section_3']
            actual_order = sorted(section_lines.items(), key=lambda x: x[1])
            checks['section_order'] = [name for name, _ in actual_order]

        print(f"\n{'Class declaration:':<30} {'✅' if checks['has_class_declaration'] else '❌'}")
        print(f"{'Constructor (count):':<30} {checks['constructor_count']} {'✅' if checks['constructor_count'] == 1 else '❌'}")
        if constructor_lines:
            print(f"{'Constructor at line:':<30} {constructor_lines[0]}")
        print(f"{'Section 1 (Imports):':<30} {'✅' if checks['has_section_1'] else '❌'} (Line {section_lines.get('section_1', 'N/A')})")
        print(f"{'Section 2 (Config):':<30} {'✅' if checks['has_section_2'] else '❌'} (Line {section_lines.get('section_2', 'N/A')})")
        print(f"{'Section 3 (Operations):':<30} {'✅' if checks['has_section_3'] else '❌'} (Line {section_lines.get('section_3', 'N/A')})")
        print(f"{'Section 4 (Debug):':<30} {'✅' if checks['has_section_4'] else '❌'} (Line {section_lines.get('section_4', 'N/A')})")
        print(f"{'Proper closing (}}):':<30} {'✅' if checks['proper_closing'] else '❌'}")

        # Check if constructor comes before Section 4
        if 'constructor' in section_lines and 'section_4' in section_lines:
            if constructor_lines[0] < section_lines['section_4']:
                print(f"\n✅ Constructor (Line {constructor_lines[0]}) comes BEFORE Section 4 (Line {section_lines['section_4']})")
            else:
                print(f"\n❌ Constructor (Line {constructor_lines[0]}) comes AFTER Section 4 (Line {section_lines['section_4']})")
                self.issues['structure'].append("Constructor should come before debug functions")

        self.stats['structure'] = checks

    def find_unused_code(self):
        """Find potentially unused code"""
        print("\n" + "="*70)
        print("8. UNUSED CODE DETECTION")
        print("="*70)

        # Extract all function names
        defined_functions = set()
        for line in self.lines:
            match = re.match(r'^\s+([a-z][a-zA-Z0-9]*)\(.*\) \{', line)
            if match:
                defined_functions.add(match.group(1))

        # Check which functions are called
        called_functions = set()
        for line in self.lines:
            for func in defined_functions:
                if f'this.{func}(' in line or f'{func}(' in line:
                    called_functions.add(func)

        # Find unused (excluding lifecycle methods)
        lifecycle = {'start', 'stop', 'getSettingsPanel', 'loadSettings', 'saveSettings'}
        potentially_unused = defined_functions - called_functions - lifecycle

        print(f"\n{'Total functions:':<30} {len(defined_functions)}")
        print(f"{'Called functions:':<30} {len(called_functions)}")
        print(f"{'Potentially unused:':<30} {len(potentially_unused)}")

        if potentially_unused:
            print("\n⚠️  POTENTIALLY UNUSED FUNCTIONS:")
            for func in sorted(potentially_unused):
                print(f"  - {func}()")
                self.warnings['unused'].append(f"{func}() might be unused")

        self.stats['unused'] = potentially_unused

    def analyze_optimization_opportunities(self):
        """Find optimization opportunities"""
        print("\n" + "="*70)
        print("9. OPTIMIZATION OPPORTUNITIES")
        print("="*70)

        opportunities = []

        # Check for unoptimized patterns
        for i, line in enumerate(self.lines, 1):
            # querySelector without caching
            if 'querySelector' in line and 'domCache' not in self.lines[max(0,i-3):i+3]:
                opportunities.append(f"Line {i}: querySelector not using cache")

            # Direct this.settings saves (should use debounced)
            if 'this.saveSettings()' in line and 'debounced' not in self.lines[max(0,i-2):i]:
                opportunities.append(f"Line {i}: Direct save (consider debouncing)")

        print(f"\nFound {len(opportunities)} optimization opportunities")
        if opportunities[:5]:
            print("\nTop 5:")
            for opp in opportunities[:5]:
                print(f"  - {opp}")

        self.stats['optimizations'] = opportunities

    def generate_report(self):
        """Generate comprehensive report"""
        print("\n" + "="*70)
        print("ANALYSIS SUMMARY")
        print("="*70)

        total_issues = sum(len(v) for v in self.issues.values())
        total_warnings = sum(len(v) for v in self.warnings.values())

        print(f"\n{'CRITICAL ISSUES:':<30} {total_issues}")
        print(f"{'WARNINGS:':<30} {total_warnings}")

        if total_issues > 0:
            print("\n⚠️  CRITICAL ISSUES TO FIX:")
            for category, issues in self.issues.items():
                if issues:
                    print(f"\n  {category.upper()}:")
                    for issue in issues[:5]:
                        print(f"    - {issue}")

        if total_warnings > 0:
            print("\n💡 WARNINGS (Optional improvements):")
            for category, warnings in self.warnings.items():
                if warnings and len(warnings) <= 10:
                    print(f"\n  {category.upper()}:")
                    for warning in warnings:
                        print(f"    - {warning}")
                elif warnings:
                    print(f"\n  {category.upper()}: {len(warnings)} items (see details above)")

        # Overall health score
        health_score = 100
        health_score -= total_issues * 5
        health_score -= total_warnings * 1
        health_score = max(0, health_score)

        print("\n" + "="*70)
        print(f"OVERALL HEALTH SCORE: {health_score}/100")
        print("="*70)

        if health_score >= 90:
            print("✅ EXCELLENT - Code is in great shape!")
        elif health_score >= 75:
            print("✅ GOOD - Minor improvements possible")
        elif health_score >= 50:
            print("⚠️  FAIR - Several issues to address")
        else:
            print("❌ POOR - Significant refactoring needed")

    def save_detailed_report(self, filename: str):
        """Save detailed report to file"""
        with open(filename, 'w', encoding='utf-8') as f:
            f.write("# SoloLevelingStats Comprehensive Analysis Report\n\n")

            f.write("## File Statistics\n\n")
            for category, stats in self.stats.items():
                f.write(f"### {category.upper()}\n")
                if isinstance(stats, dict):
                    for key, value in stats.items():
                        f.write(f"- {key}: {value}\n")
                else:
                    f.write(f"- {stats}\n")
                f.write("\n")

            f.write("## Issues Found\n\n")
            for category, issues in self.issues.items():
                if issues:
                    f.write(f"### {category.upper()}\n")
                    for issue in issues:
                        f.write(f"- {issue}\n")
                    f.write("\n")

            f.write("## Warnings\n\n")
            for category, warnings in self.warnings.items():
                if warnings:
                    f.write(f"### {category.upper()}\n")
                    for warning in warnings:
                        f.write(f"- {warning}\n")
                    f.write("\n")

        print(f"\n✅ Detailed report saved to {filename}")

if __name__ == '__main__':
    source = 'plugins/SoloLevelingStats.plugin.js'
    report_file = 'docs/COMPREHENSIVE_ANALYSIS_REPORT.md'

    print("="*70)
    print("COMPREHENSIVE FILE ANALYSIS")
    print("="*70)
    print(f"Analyzing: {source}")
    print("")

    analyzer = ComprehensiveAnalyzer(source)
    analyzer.load_source()

    # Run all analyses
    analyzer.analyze_syntax_patterns()
    analyzer.analyze_structure()
    analyzer.analyze_functions()
    analyzer.analyze_code_quality()
    analyzer.analyze_dependencies()
    analyzer.analyze_performance()
    analyzer.find_unused_code()

    # Generate reports
    analyzer.generate_report()
    analyzer.save_detailed_report(report_file)

    print("\n" + "="*70)
    print("ANALYSIS COMPLETE!")
    print("="*70)
    print(f"\nDetailed report: {report_file}")
    print(f"Review issues and warnings above")
    print("")
