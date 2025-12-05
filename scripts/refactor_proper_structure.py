#!/usr/bin/env python3
"""
Proper Structure Refactoring Script
Reorganizes SoloLevelingStats into clean 4-section structure with correct order
"""

import re
from typing import List, Dict, Tuple

class ProperRefactor:
    def __init__(self, source_file: str):
        self.source_file = source_file
        self.lines = []
        self.header = []
        self.constructor_lines = []
        self.debug_functions = []
        self.helper_functions = {}
        self.operation_functions = {}

    def load_source(self):
        """Load source file"""
        with open(self.source_file, 'r', encoding='utf-8') as f:
            self.lines = f.readlines()
        print(f"✅ Loaded {len(self.lines)} lines")

    def extract_header(self):
        """Extract header (everything before class declaration)"""
        for i, line in enumerate(self.lines):
            if 'module.exports = class' in line:
                self.header = self.lines[:i]
                return i
        return 0

    def extract_constructor(self):
        """Extract complete constructor"""
        in_constructor = False
        brace_count = 0

        for i, line in enumerate(self.lines):
            if re.match(r'^\s+constructor\(\) \{', line):
                in_constructor = True
                brace_count = 1
                self.constructor_lines.append(line)
            elif in_constructor:
                self.constructor_lines.append(line)
                brace_count += line.count('{') - line.count('}')
                if brace_count == 0:
                    break

        print(f"✅ Extracted constructor ({len(self.constructor_lines)} lines)")

    def extract_function(self, start_line: int) -> Tuple[List[str], str]:
        """Extract a complete function starting at line"""
        func_lines = [self.lines[start_line]]
        brace_count = 1

        # Get function name
        match = re.match(r'^\s+([a-z][a-zA-Z0-9]*)\(', self.lines[start_line])
        func_name = match.group(1) if match else 'unknown'

        i = start_line + 1
        while i < len(self.lines) and brace_count > 0:
            line = self.lines[i]
            func_lines.append(line)
            brace_count += line.count('{') - line.count('}')
            i += 1

        return func_lines, func_name

    def categorize_function(self, name: str) -> str:
        """Categorize function"""
        # Debug
        if name in ['debugLog', 'debugError']:
            return 'debug'

        # Performance
        if name in ['throttle', 'debounce', 'initDOMCache', 'getCachedElement', 'invalidateDOMCache']:
            return 'performance'

        # Lookup
        if name in ['getRankColor', 'getRankXPMultiplier', 'getRankStatPoints', 'getQuestData']:
            return 'lookup'

        # Calculation
        if name.startswith('calculate') or name.startswith('getXP') or name.startswith('getHP') or name.startswith('getMana') or name.startswith('getCurrent') or name.startswith('getTotal') or name.startswith('getRankMultiplier') or name.startswith('getRankRequirements'):
            return 'calculation'

        # Event
        if name.startswith('emit') or name == 'on' or name == 'off':
            return 'event'

        # Lifecycle
        if name in ['start', 'stop']:
            return 'lifecycle'

        # Settings
        if 'Settings' in name or 'Storage' in name or name == 'getSettingsPanel':
            return 'settings'

        # Tracking
        if 'track' in name.lower() or 'observe' in name.lower() or 'activity' in name.lower():
            return 'tracking'

        # Leveling
        if 'xp' in name.lower() or 'level' in name.lower() or 'rank' in name.lower():
            return 'leveling'

        # Stats
        if 'stat' in name.lower() or 'allocate' in name.lower():
            return 'stats'

        # Quests
        if 'quest' in name.lower():
            return 'quests'

        # Achievements
        if 'achievement' in name.lower() or 'title' in name.lower():
            return 'achievements'

        # HP/Mana
        if 'hp' in name.lower() or 'mana' in name.lower() or 'shadow' in name.lower():
            return 'hp_mana'

        # UI
        if 'render' in name.lower() or 'create' in name.lower() or 'inject' in name.lower() or 'ui' in name.lower() or 'display' in name.lower() or 'attach' in name.lower():
            return 'ui'

        # Default to utility
        return 'utility'

    def extract_all_functions(self):
        """Extract all functions"""
        i = 0
        while i < len(self.lines):
            line = self.lines[i]

            # Skip constructor (already extracted)
            if re.match(r'^\s+constructor\(\) \{', line):
                # Skip to end of constructor
                brace_count = 1
                i += 1
                while i < len(self.lines) and brace_count > 0:
                    brace_count += self.lines[i].count('{') - self.lines[i].count('}')
                    i += 1
                continue

            # Match function definition
            if re.match(r'^\s+([a-z][a-zA-Z0-9]*)\(.*\) \{', line):
                func_lines, func_name = self.extract_function(i)
                category = self.categorize_function(func_name)

                if category == 'debug':
                    self.debug_functions.append((func_name, func_lines))
                elif category in ['performance', 'lookup', 'calculation', 'event', 'utility']:
                    if category not in self.helper_functions:
                        self.helper_functions[category] = []
                    self.helper_functions[category].append((func_name, func_lines))
                else:
                    if category not in self.operation_functions:
                        self.operation_functions[category] = []
                    self.operation_functions[category].append((func_name, func_lines))

                i += len(func_lines)
                continue

            i += 1

        print(f"✅ Extracted {len(self.debug_functions)} debug functions")
        print(f"✅ Extracted {sum(len(v) for v in self.helper_functions.values())} helper functions")
        print(f"✅ Extracted {sum(len(v) for v in self.operation_functions.values())} operation functions")

    def generate_proper_file(self) -> str:
        """Generate properly structured file"""
        output = []

        # 1. Header
        output.extend(self.header)

        # 2. Class declaration
        output.append('module.exports = class SoloLevelingStats {\n')
        output.append('  \n')

        # 3. Section 1: Imports
        output.append('  // ============================================================================\n')
        output.append('  // SECTION 1: IMPORTS & DEPENDENCIES\n')
        output.append('  // ============================================================================\n')
        output.append('  // Reserved for future external library imports\n')
        output.append('  // Currently all functionality is self-contained\n')
        output.append('  \n')

        # 4. Section 2: Configuration & Helpers
        output.append('  // ============================================================================\n')
        output.append('  // SECTION 2: CONFIGURATION & HELPERS\n')
        output.append('  // ============================================================================\n')
        output.append('  \n')
        output.append('  /**\n')
        output.append('   * 2.1 CONSTRUCTOR & DEFAULT SETTINGS\n')
        output.append('   */\n')
        output.extend(self.constructor_lines)
        output.append('  \n')

        # 5. Section 4: Debug (MUST come after constructor but before other functions)
        output.append('  // ============================================================================\n')
        output.append('  // SECTION 4: DEBUGGING & DEVELOPMENT (OFF BY DEFAULT)\n')
        output.append('  // ============================================================================\n')
        output.append('  \n')
        output.append('  /**\n')
        output.append('   * 4.1 DEBUG LOGGING\n')
        output.append('   */\n')
        output.append('  \n')
        for func_name, func_lines in self.debug_functions:
            output.extend(func_lines)
            output.append('  \n')

        # 6. Section 2.4: Helper Functions
        output.append('  // ============================================================================\n')
        output.append('  // 2.4 HELPER FUNCTIONS\n')
        output.append('  // ============================================================================\n')
        output.append('  \n')

        helper_order = ['performance', 'lookup', 'calculation', 'event', 'utility']
        helper_names = {
            'performance': '2.4.1 PERFORMANCE HELPERS',
            'lookup': '2.4.2 LOOKUP HELPERS',
            'calculation': '2.4.3 CALCULATION HELPERS',
            'event': '2.4.7 EVENT HELPERS',
            'utility': '2.4.6 UTILITY HELPERS'
        }

        for category in helper_order:
            if category in self.helper_functions:
                output.append('  /**\n')
                output.append(f'   * {helper_names[category]}\n')
                output.append('   */\n')
                output.append('  \n')
                for func_name, func_lines in self.helper_functions[category]:
                    output.extend(func_lines)
                    output.append('  \n')

        # 7. Section 3: Major Operations
        output.append('  // ============================================================================\n')
        output.append('  // SECTION 3: MAJOR OPERATIONS\n')
        output.append('  // ============================================================================\n')
        output.append('  \n')

        operation_order = ['lifecycle', 'settings', 'tracking', 'leveling', 'stats', 'quests', 'achievements', 'hp_mana', 'ui']
        operation_names = {
            'lifecycle': '3.1 PLUGIN LIFECYCLE',
            'settings': '3.2 SETTINGS MANAGEMENT',
            'tracking': '3.3 ACTIVITY TRACKING',
            'leveling': '3.4 XP & LEVELING SYSTEM',
            'stats': '3.5 STATS SYSTEM',
            'quests': '3.6 QUEST SYSTEM',
            'achievements': '3.7 ACHIEVEMENT SYSTEM',
            'hp_mana': '3.8 HP/MANA SYSTEM',
            'ui': '3.9 UI MANAGEMENT'
        }

        for category in operation_order:
            if category in self.operation_functions:
                output.append('  /**\n')
                output.append(f'   * {operation_names[category]}\n')
                output.append('   */\n')
                output.append('  \n')
                for func_name, func_lines in self.operation_functions[category]:
                    output.extend(func_lines)
                    output.append('  \n')

        # 8. Close class
        output.append('};\n')

        return ''.join(output)

if __name__ == '__main__':
    source = 'backups/solo-leveling-stats/SoloLevelingStats.plugin.BACKUP_v2.3.0_clean.js'
    output = 'plugins/SoloLevelingStats.plugin.REFACTORED.js'

    print("="*70)
    print("PROPER STRUCTURE REFACTORING")
    print("="*70)
    print("")

    refactor = ProperRefactor(source)
    refactor.load_source()

    print("\nExtracting components...")
    header_end = refactor.extract_header()
    print(f"✅ Extracted header ({header_end} lines)")

    refactor.extract_constructor()
    refactor.extract_all_functions()

    print("\nGenerating properly structured file...")
    proper_code = refactor.generate_proper_file()

    with open(output, 'w', encoding='utf-8') as f:
        f.write(proper_code)

    print(f"✅ Saved to {output}")
    print(f"📊 Total lines: {len(proper_code.splitlines())}")

    print("\n" + "="*70)
    print("STRUCTURE:")
    print("="*70)
    print("1. Header")
    print("2. Section 1: Imports (reserved)")
    print("3. Section 2: Configuration & Helpers")
    print("   - Constructor FIRST")
    print("   - Then Section 4: Debug functions")
    print("   - Then Section 2.4: Helper functions")
    print("4. Section 3: Major Operations")
    print("5. Close class")
    print("")
    print("✅ Ready to test and deploy!")
