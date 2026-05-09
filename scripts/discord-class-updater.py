#!/usr/bin/env python3
"""
Discord Class Updater for BetterDiscord Themes

Automatically detects and updates broken Discord CSS classes in BetterDiscord themes
using the DiscordClasses repository maintained by IBeSarah.

Author: BlueFlashXS
Version: 1.0.0
"""

import json
import re
import sys
import urllib.request
from pathlib import Path
from typing import Dict, Set, Tuple


class DiscordClassUpdater:
    """Handles Discord class detection and updates in BetterDiscord themes."""

    DISCORDCLASSES_URL = "https://raw.githubusercontent.com/IBeSarah/DiscordClasses/main/discordclasses.json"

    def __init__(self, theme_path: Path, classes_json_path: Path = None):
        """
        Initialize the updater.

        Args:
            theme_path: Path to the BetterDiscord theme CSS file
            classes_json_path: Optional path to local discordclasses.json
        """
        self.theme_path = Path(theme_path)
        self.classes_json_path = classes_json_path
        self.discord_classes = {}
        self.reverse_mapping = {}

    def fetch_discord_classes(self) -> Dict:
        """Download and parse the latest DiscordClasses JSON."""
        if self.classes_json_path and self.classes_json_path.exists():
            print(f"Loading Discord classes from: {self.classes_json_path}")
            with open(self.classes_json_path) as f:
                return json.load(f)

        print("Fetching latest Discord classes from GitHub...")
        with urllib.request.urlopen(self.DISCORDCLASSES_URL) as response:
            data = response.read()
            return json.loads(data)

    def build_class_mappings(self):
        """Build forward and reverse class mappings."""
        self.discord_classes = self.fetch_discord_classes()

        # Build reverse mapping: hashed_class -> semantic_name
        for module_id, class_map in self.discord_classes.items():
            for semantic_name, hashed_class in class_map.items():
                self.reverse_mapping[hashed_class] = semantic_name

        print(f"Loaded {len(self.discord_classes)} module mappings")
        print(f"Total class mappings: {len(self.reverse_mapping)}")

    def extract_classes_from_theme(self, content: str) -> Set[str]:
        """
        Extract all Discord class names from theme CSS.

        Returns:
            Set of class names found in the theme
        """
        classes = set()

        # Pattern 1: .className-hash format (e.g., .container_ae16b8)
        pattern1 = r"\.[a-zA-Z][a-zA-Z0-9]*_[a-f0-9]{6}\b"

        # Pattern 2: [class*="className"] format
        pattern2 = r'\[class\*="([a-zA-Z][a-zA-Z0-9]*(?:_[a-f0-9]{6})?)"\]'

        # Find all matches
        matches1 = re.findall(pattern1, content)
        matches2 = re.findall(pattern2, content)

        # Clean and add to set
        for match in matches1:
            classes.add(match.lstrip("."))

        for match in matches2:
            if "_" in match and len(match.split("_")[-1]) == 6:
                classes.add(match)

        return classes

    def find_broken_classes(
        self, theme_classes: Set[str]
    ) -> Dict[str, Tuple[str, str]]:
        """
        Find classes that exist in theme but don't match current Discord classes.

        Returns:
            Dict mapping old_class -> (semantic_name, new_class)
        """
        broken = {}
        current_hashed_classes = set(self.reverse_mapping.keys())

        for old_class in theme_classes:
            # Check if this class is outdated
            if old_class not in current_hashed_classes:
                # Extract semantic name (remove hash)
                parts = old_class.split("_")
                if len(parts) == 2:
                    semantic_name = parts[0]

                    # Find current class for this semantic name
                    for module_id, class_map in self.discord_classes.items():
                        if semantic_name in class_map:
                            new_class = class_map[semantic_name]
                            broken[old_class] = (semantic_name, new_class)
                            break

        return broken

    def update_theme(
        self, dry_run: bool = False
    ) -> Tuple[str, Dict[str, Tuple[str, str]]]:
        """
        Update theme file with new class names.

        Args:
            dry_run: If True, don't save changes, just return updated content

        Returns:
            Tuple of (updated_content, broken_classes_dict)
        """
        # Read theme
        content = self.theme_path.read_text(encoding="utf-8")

        # Extract classes from theme
        theme_classes = self.extract_classes_from_theme(content)
        print(f"\nFound {len(theme_classes)} Discord classes in theme")

        # Find broken classes
        broken = self.find_broken_classes(theme_classes)

        if not broken:
            print("\n✅ All classes are up to date!")
            return content, {}

        print(f"\n⚠️  Found {len(broken)} broken classes")

        # Replace broken classes
        updated_content = content
        for old_class, (semantic_name, new_class) in broken.items():
            # Replace in .className format
            updated_content = updated_content.replace(f".{old_class}", f".{new_class}")

            # Replace in [class*="className"] format
            updated_content = updated_content.replace(
                f'[class*="{old_class}"]', f'[class*="{new_class}"]'
            )

            print(f"  {old_class} → {new_class} ({semantic_name})")

        if not dry_run:
            # Create backup
            backup_path = self.theme_path.with_suffix(".theme.css.bak")
            backup_path.write_text(content, encoding="utf-8")
            print(f"\n💾 Backup saved: {backup_path.name}")

            # Save updated theme
            self.theme_path.write_text(updated_content, encoding="utf-8")
            print(f"✅ Theme updated: {self.theme_path.name}")
        else:
            print("\n🔍 DRY RUN - No changes saved")

        return updated_content, broken

    def generate_report(self, broken: Dict[str, Tuple[str, str]]) -> str:
        """Generate a detailed report of class updates."""
        if not broken:
            return "All classes are up to date!"

        report = ["Discord Class Update Report", "=" * 50, ""]
        report.append(f"Total broken classes: {len(broken)}\n")

        # Group by semantic name
        by_semantic = {}
        for old_class, (semantic_name, new_class) in broken.items():
            if semantic_name not in by_semantic:
                by_semantic[semantic_name] = []
            by_semantic[semantic_name].append((old_class, new_class))

        report.append("Grouped by semantic name:")
        for semantic_name, updates in sorted(by_semantic.items()):
            report.append(f"\n{semantic_name}:")
            for old_class, new_class in updates:
                old_hash = old_class.split("_")[-1]
                new_hash = new_class.split("_")[-1]
                report.append(f"  {old_hash} → {new_hash}")

        return "\n".join(report)


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Update broken Discord classes in BetterDiscord themes"
    )
    parser.add_argument("theme", type=Path, help="Path to theme CSS file")
    parser.add_argument(
        "--classes-json",
        type=Path,
        help="Path to local discordclasses.json (downloads if not provided)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be updated without making changes",
    )
    parser.add_argument(
        "--report", action="store_true", help="Generate detailed update report"
    )

    args = parser.parse_args()

    if not args.theme.exists():
        print(f"Error: Theme file not found: {args.theme}")
        sys.exit(1)

    # Create updater
    updater = DiscordClassUpdater(args.theme, args.classes_json)

    # Build mappings
    updater.build_class_mappings()

    # Update theme
    updated_content, broken = updater.update_theme(dry_run=args.dry_run)

    # Generate report
    if args.report and broken:
        print("\n" + updater.generate_report(broken))


if __name__ == "__main__":
    main()
