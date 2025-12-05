#!/usr/bin/env python3
"""
Function Extractor for SoloLevelingStats v2.3.0
Automatically extracts functions from original file and organizes them by section
"""

import re
from typing import Dict, List


class FunctionExtractor:
    def __init__(self, source_file: str):
        self.source_file = source_file
        self.source_content = ""
        self.functions = []

    def load_source(self):
        """Load source file"""
        with open(self.source_file, "r", encoding="utf-8") as f:
            self.source_content = f.read()
            self.lines = self.source_content.split("\n")
        print(f"✅ Loaded {len(self.lines)} lines from {self.source_file}")

    def find_functions(self):
        """Find all function definitions and their implementations"""
        functions = []
        in_function = False
        current_function = None
        brace_count = 0

        for i, line in enumerate(self.lines, 1):
            # Match function definition: "  functionName(...) {"
            match = re.match(r"^  ([a-z][a-zA-Z0-9]*)\((.*?)\) \{", line)

            if match and not in_function:
                # Start of new function
                func_name = match.group(1)
                func_params = match.group(2)
                current_function = {
                    "name": func_name,
                    "params": func_params,
                    "start_line": i,
                    "lines": [line],
                    "category": self.categorize_function(func_name),
                }
                in_function = True
                brace_count = 1

            elif in_function:
                # Inside function, track braces
                current_function["lines"].append(line)

                # Count braces
                brace_count += line.count("{") - line.count("}")

                # Function ends when braces balance
                if brace_count == 0:
                    current_function["end_line"] = i
                    current_function["implementation"] = "\n".join(
                        current_function["lines"]
                    )
                    functions.append(current_function)
                    in_function = False
                    current_function = None

        self.functions = functions
        print(f"✅ Found {len(functions)} functions")
        return functions

    def categorize_function(self, name: str) -> str:
        """Categorize function by name pattern"""
        # Performance helpers
        if name in [
            "throttle",
            "debounce",
            "initDOMCache",
            "getCachedElement",
            "invalidateDOMCache",
        ]:
            return "2.4.1_performance"

        # Lookup helpers
        if name.startswith("get") and (
            "Rank" in name or "Quest" in name or "Achievement" in name
        ):
            if name in [
                "getRankColor",
                "getRankXPMultiplier",
                "getRankStatPoints",
                "getQuestData",
            ]:
                return "2.4.2_lookup"

        # Calculation helpers
        if (
            name.startswith("calculate")
            or name.startswith("getXP")
            or name.startswith("getHP")
            or name.startswith("getMana")
        ):
            return "2.4.3_calculation"

        # Formatting helpers
        if name.startswith("format") or "Format" in name:
            return "2.4.4_formatting"

        # Validation helpers
        if (
            name.startswith("validate")
            or name.startswith("isValid")
            or name.startswith("check")
        ):
            return "2.4.5_validation"

        # Event helpers
        if (
            name.startswith("emit")
            or name.startswith("on")
            or name.startswith("off")
            or "Event" in name
        ):
            return "2.4.7_event"

        # Lifecycle
        if name in ["start", "stop", "initialize", "cleanup"]:
            return "3.1_lifecycle"

        # Settings
        if (
            "Settings" in name
            or "Storage" in name
            or name in ["loadSettings", "saveSettings", "getSettingsPanel"]
        ):
            return "3.2_settings"

        # Activity tracking
        if (
            "track" in name.lower()
            or "activity" in name.lower()
            or "observe" in name.lower()
        ):
            return "3.3_tracking"

        # XP & Leveling
        if "xp" in name.lower() or "level" in name.lower() or "rank" in name.lower():
            return "3.4_leveling"

        # Stats
        if "stat" in name.lower() or "allocate" in name.lower():
            return "3.5_stats"

        # Quests
        if "quest" in name.lower() or "daily" in name.lower():
            return "3.6_quests"

        # Achievements
        if "achievement" in name.lower() or "title" in name.lower():
            return "3.7_achievements"

        # HP/Mana
        if "hp" in name.lower() or "mana" in name.lower() or "shadow" in name.lower():
            return "3.8_hp_mana"

        # UI
        if (
            "render" in name.lower()
            or "create" in name.lower()
            or "inject" in name.lower()
            or "ui" in name.lower()
            or "display" in name.lower()
        ):
            return "3.9_ui"

        # Debug
        if name.startswith("debug") or name.startswith("log"):
            return "4.1_debug"

        # Default to utility
        return "2.4.6_utility"

    def group_by_category(self) -> Dict[str, List]:
        """Group functions by category"""
        grouped = {}
        for func in self.functions:
            category = func["category"]
            if category not in grouped:
                grouped[category] = []
            grouped[category].append(func)

        # Sort each category by line number
        for category in grouped:
            grouped[category].sort(key=lambda f: f["start_line"])

        return grouped

    def print_summary(self):
        """Print extraction summary"""
        grouped = self.group_by_category()

        print("\n" + "=" * 70)
        print("FUNCTION EXTRACTION SUMMARY")
        print("=" * 70)

        section_order = [
            "2.4.1_performance",
            "2.4.2_lookup",
            "2.4.3_calculation",
            "2.4.4_formatting",
            "2.4.5_validation",
            "2.4.6_utility",
            "2.4.7_event",
            "3.1_lifecycle",
            "3.2_settings",
            "3.3_tracking",
            "3.4_leveling",
            "3.5_stats",
            "3.6_quests",
            "3.7_achievements",
            "3.8_hp_mana",
            "3.9_ui",
            "4.1_debug",
        ]

        section_names = {
            "2.4.1_performance": "2.4.1 Performance Helpers",
            "2.4.2_lookup": "2.4.2 Lookup Helpers",
            "2.4.3_calculation": "2.4.3 Calculation Helpers",
            "2.4.4_formatting": "2.4.4 Formatting Helpers",
            "2.4.5_validation": "2.4.5 Validation Helpers",
            "2.4.6_utility": "2.4.6 Utility Helpers",
            "2.4.7_event": "2.4.7 Event Helpers",
            "3.1_lifecycle": "3.1 Plugin Lifecycle",
            "3.2_settings": "3.2 Settings Management",
            "3.3_tracking": "3.3 Activity Tracking",
            "3.4_leveling": "3.4 XP & Leveling",
            "3.5_stats": "3.5 Stats System",
            "3.6_quests": "3.6 Quest System",
            "3.7_achievements": "3.7 Achievement System",
            "3.8_hp_mana": "3.8 HP/Mana System",
            "3.9_ui": "3.9 UI Management",
            "4.1_debug": "4.1 Debug Logging",
        }

        total = 0
        for section in section_order:
            if section in grouped:
                funcs = grouped[section]
                total += len(funcs)
                print(
                    f"\n{section_names.get(section, section)}: {len(funcs)} functions"
                )
                for func in funcs:
                    print(
                        f"  - {func['name']}({func['params']}) [Line {func['start_line']}]"
                    )

        print("\n" + "=" * 70)
        print(f"TOTAL: {total} functions extracted")
        print("=" * 70)

    def generate_organized_code(self) -> str:
        """Generate organized code with functions in correct sections"""
        grouped = self.group_by_category()

        output = []

        # Add helpers in Section 2
        helper_sections = [
            ("2.4.1_performance", "2.4.1 PERFORMANCE HELPERS"),
            ("2.4.2_lookup", "2.4.2 LOOKUP HELPERS"),
            ("2.4.3_calculation", "2.4.3 CALCULATION HELPERS"),
            ("2.4.4_formatting", "2.4.4 FORMATTING HELPERS"),
            ("2.4.5_validation", "2.4.5 VALIDATION HELPERS"),
            ("2.4.6_utility", "2.4.6 UTILITY HELPERS"),
            ("2.4.7_event", "2.4.7 EVENT HELPERS"),
        ]

        output.append(
            "  // ============================================================================"
        )
        output.append("  // 2.4 HELPER FUNCTIONS")
        output.append(
            "  // ============================================================================\n"
        )

        for section_key, section_name in helper_sections:
            if section_key in grouped:
                output.append("  /**")
                output.append(f"   * {section_name}")
                output.append("   */\n")

                for func in grouped[section_key]:
                    output.append(func["implementation"])
                    output.append("")  # Blank line between functions

        # Add operations in Section 3
        operation_sections = [
            ("3.1_lifecycle", "3.1 PLUGIN LIFECYCLE"),
            ("3.2_settings", "3.2 SETTINGS MANAGEMENT"),
            ("3.3_tracking", "3.3 ACTIVITY TRACKING"),
            ("3.4_leveling", "3.4 XP & LEVELING SYSTEM"),
            ("3.5_stats", "3.5 STATS SYSTEM"),
            ("3.6_quests", "3.6 QUEST SYSTEM"),
            ("3.7_achievements", "3.7 ACHIEVEMENT SYSTEM"),
            ("3.8_hp_mana", "3.8 HP/MANA SYSTEM"),
            ("3.9_ui", "3.9 UI MANAGEMENT"),
        ]

        output.append(
            "\n  // ============================================================================"
        )
        output.append("  // SECTION 3: MAJOR OPERATIONS")
        output.append(
            "  // ============================================================================\n"
        )

        for section_key, section_name in operation_sections:
            if section_key in grouped:
                output.append("  /**")
                output.append(f"   * {section_name}")
                output.append("   */\n")

                for func in grouped[section_key]:
                    output.append(func["implementation"])
                    output.append("")  # Blank line between functions

        return "\n".join(output)


if __name__ == "__main__":
    source_file = "plugins/SoloLevelingStats.plugin.js"

    print("=" * 70)
    print("SoloLevelingStats Function Extractor")
    print("=" * 70)

    extractor = FunctionExtractor(source_file)
    extractor.load_source()
    extractor.find_functions()
    extractor.print_summary()

    # Generate organized code
    print("\n" + "=" * 70)
    print("Generating organized code...")
    print("=" * 70)

    organized_code = extractor.generate_organized_code()

    # Save to output file
    output_file = "plugins/EXTRACTED_FUNCTIONS.js"
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(organized_code)

    print(f"✅ Saved organized functions to {output_file}")
    print(f"📊 Total: {len(extractor.functions)} functions")
    print("\nNext steps:")
    print("1. Review EXTRACTED_FUNCTIONS.js")
    print("2. Copy sections into SoloLevelingStats.plugin.v2.3.0.js")
    print("3. Test the plugin")
