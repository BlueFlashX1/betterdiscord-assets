#!/usr/bin/env python3
"""
Automated Discord Class Monitor & Updater

Monitors DiscordClasses repo for changes and automatically updates BetterDiscord themes.
Can be run manually or scheduled via cron/launchd.

Features:
- Fetches latest DiscordClasses JSON
- Compares with cached version
- Detects changed classes
- Updates affected themes
- Generates change reports
- Sends notifications (optional)

Usage:
    # Check for updates (dry run)
    python auto-monitor-discord-classes.py --check

    # Update themes automatically
    python auto-monitor-discord-classes.py --update

    # Setup cron job (daily at 3 AM)
    python auto-monitor-discord-classes.py --setup-cron

Author: BlueFlashXS
Version: 1.0.0
"""

import hashlib
import json
import subprocess
import sys
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple


class DiscordClassMonitor:
    """Monitors Discord class changes and updates themes."""

    DISCORDCLASSES_URL = "https://raw.githubusercontent.com/IBeSarah/DiscordClasses/main/discordclasses.json"
    CACHE_DIR = Path.home() / ".cache" / "discord-class-monitor"
    CACHE_FILE = CACHE_DIR / "discordclasses.json"
    HASH_FILE = CACHE_DIR / "classes.sha256"

    def __init__(self, theme_paths: List[Path] = None):
        """
        Initialize monitor.

        Args:
            theme_paths: List of paths to BetterDiscord themes to monitor
        """
        self.theme_paths = theme_paths or []
        self.cache_dir = self.CACHE_DIR
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def fetch_latest_classes(self) -> Dict:
        """Download latest DiscordClasses JSON."""
        print("Fetching latest DiscordClasses...")
        with urllib.request.urlopen(self.DISCORDCLASSES_URL) as response:
            data = response.read()
            return json.loads(data)

    def get_cached_classes(self) -> Dict:
        """Load cached DiscordClasses."""
        if not self.CACHE_FILE.exists():
            return {}

        with open(self.CACHE_FILE) as f:
            return json.load(f)

    def save_cache(self, data: Dict):
        """Save DiscordClasses to cache."""
        with open(self.CACHE_FILE, "w") as f:
            json.dump(data, f, indent=2)

        # Save hash
        data_str = json.dumps(data, sort_keys=True)
        sha256 = hashlib.sha256(data_str.encode()).hexdigest()
        self.HASH_FILE.write_text(sha256)

    def detect_changes(self) -> Tuple[bool, Dict]:
        """
        Detect if DiscordClasses have changed.

        Returns:
            Tuple of (has_changes, change_details)
        """
        latest = self.fetch_latest_classes()
        cached = self.get_cached_classes()

        if not cached:
            print("No cache found - this is the first run")
            self.save_cache(latest)
            return False, {}

        # Compare
        changes = {"added": {}, "removed": {}, "modified": {}}

        # Check for changes
        latest_modules = set(latest.keys())
        cached_modules = set(cached.keys())

        # New modules
        for module_id in latest_modules - cached_modules:
            changes["added"][module_id] = latest[module_id]

        # Removed modules
        for module_id in cached_modules - latest_modules:
            changes["removed"][module_id] = cached[module_id]

        # Modified modules
        for module_id in latest_modules & cached_modules:
            if latest[module_id] != cached[module_id]:
                changes["modified"][module_id] = {
                    "old": cached[module_id],
                    "new": latest[module_id],
                }

        has_changes = bool(
            changes["added"] or changes["removed"] or changes["modified"]
        )

        if has_changes:
            self.save_cache(latest)

        return has_changes, changes

    def extract_class_changes(self, changes: Dict) -> List[Dict]:
        """Extract individual class changes from module changes."""
        class_changes = []

        # Handle modified modules
        for module_id, data in changes["modified"].items():
            old_classes = data["old"]
            new_classes = data["new"]

            for semantic_name, old_hashed in old_classes.items():
                new_hashed = new_classes.get(semantic_name)
                if new_hashed and new_hashed != old_hashed:
                    class_changes.append(
                        {
                            "semantic": semantic_name,
                            "old": old_hashed,
                            "new": new_hashed,
                            "module": module_id,
                        }
                    )

        return class_changes

    def update_themes(self, class_changes: List[Dict]) -> Dict[str, int]:
        """
        Update all monitored themes with class changes.

        Returns:
            Dict mapping theme_name -> number_of_updates
        """
        results = {}

        for theme_path in self.theme_paths:
            if not theme_path.exists():
                print(f"⚠️  Theme not found: {theme_path}")
                continue

            # Read theme
            content = theme_path.read_text(encoding="utf-8")
            updated_content = content
            update_count = 0

            # Apply all class changes
            for change in class_changes:
                old_class = change["old"]
                new_class = change["new"]

                # Replace in .className format
                if f".{old_class}" in updated_content:
                    updated_content = updated_content.replace(
                        f".{old_class}", f".{new_class}"
                    )
                    update_count += 1

                # Replace in [class*="className"] format
                if f'[class*="{old_class}"]' in updated_content:
                    updated_content = updated_content.replace(
                        f'[class*="{old_class}"]', f'[class*="{new_class}"]'
                    )
                    update_count += 1

            if update_count > 0:
                # Create backup
                backup_path = theme_path.with_suffix(".theme.css.bak")
                backup_path.write_text(content, encoding="utf-8")

                # Save updated theme
                theme_path.write_text(updated_content, encoding="utf-8")
                print(f"✅ Updated {theme_path.name}: {update_count} changes")
                results[theme_path.name] = update_count
            else:
                print(f"ℹ️  No updates needed for {theme_path.name}")
                results[theme_path.name] = 0

        return results

    def generate_report(self, changes: Dict, theme_results: Dict = None) -> str:
        """Generate detailed change report."""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        report = [
            "=" * 70,
            "Discord Class Change Report",
            "=" * 70,
            f"Generated: {timestamp}",
            "",
        ]

        # Module changes
        if changes.get("added"):
            report.append(f"\n📦 New Modules: {len(changes['added'])}")

        if changes.get("removed"):
            report.append(f"🗑️  Removed Modules: {len(changes['removed'])}")

        if changes.get("modified"):
            report.append(f"✏️  Modified Modules: {len(changes['modified'])}")

            class_changes = self.extract_class_changes(changes)
            if class_changes:
                report.append(f"\n🔄 Class Changes: {len(class_changes)}")
                report.append("")
                for change in class_changes:
                    report.append(f"  {change['semantic']}:")
                    report.append(f"    {change['old']} → {change['new']}")

        # Theme update results
        if theme_results:
            report.append("\n📝 Theme Updates:")
            report.append("")
            for theme_name, count in theme_results.items():
                if count > 0:
                    report.append(f"  ✅ {theme_name}: {count} updates")
                else:
                    report.append(f"  ℹ️  {theme_name}: No updates needed")

        report.append("\n" + "=" * 70)
        return "\n".join(report)

    def notify(self, message: str):
        """Send notification (macOS only)."""
        if sys.platform == "darwin":
            try:
                subprocess.run(
                    [
                        "osascript",
                        "-e",
                        f'display notification "{message}" with title "Discord Class Monitor"',
                    ],
                    check=True,
                )
            except Exception as e:
                print(f"Failed to send notification: {e}")

    def run_check(self) -> bool:
        """Run check for updates (dry run)."""
        has_changes, changes = self.detect_changes()

        if not has_changes:
            print("✅ No changes detected")
            return False

        print("⚠️  Changes detected!")
        print(self.generate_report(changes))

        class_changes = self.extract_class_changes(changes)
        if class_changes:
            self.notify(
                f"Discord class changes detected: {len(class_changes)} classes updated"
            )

        return True

    def run_update(self) -> bool:
        """Run update process."""
        has_changes, changes = self.detect_changes()

        if not has_changes:
            print("✅ No changes detected - themes are up to date")
            return False

        class_changes = self.extract_class_changes(changes)
        if not class_changes:
            print("ℹ️  Changes detected but no class updates needed")
            return False

        print(f"🔄 Applying {len(class_changes)} class changes...")
        theme_results = self.update_themes(class_changes)

        report = self.generate_report(changes, theme_results)
        print(report)

        # Save report
        report_dir = self.cache_dir / "reports"
        report_dir.mkdir(exist_ok=True)
        report_file = (
            report_dir / f"update_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        )
        report_file.write_text(report)

        total_updates = sum(theme_results.values())
        self.notify(f"Themes updated: {total_updates} changes applied")

        return True


def setup_cron():
    """Setup cron job for automatic monitoring."""
    script_path = Path(__file__).resolve()

    # Cron entry: Run daily at 3 AM
    cron_entry = f"0 3 * * * {sys.executable} {script_path} --update >> ~/discord-class-monitor.log 2>&1"

    print("Add this line to your crontab (crontab -e):")
    print(cron_entry)
    print("\nOr run this command:")
    print(f'(crontab -l 2>/dev/null; echo "{cron_entry}") | crontab -')


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Monitor and update Discord classes in BetterDiscord themes"
    )
    parser.add_argument(
        "--check", action="store_true", help="Check for updates without applying them"
    )
    parser.add_argument(
        "--update", action="store_true", help="Check for updates and apply them"
    )
    parser.add_argument(
        "--setup-cron",
        action="store_true",
        help="Show instructions for setting up automated monitoring",
    )
    parser.add_argument(
        "--themes",
        nargs="+",
        type=Path,
        help="Paths to themes to monitor (defaults to SoloLeveling-ClearVision.theme.css)",
    )

    args = parser.parse_args()

    # Default themes
    if not args.themes:
        default_theme = (
            Path.home()
            / "Documents/DEVELOPMENT/discord/betterdiscord/betterdiscord-dev/themes/SoloLeveling-ClearVision.theme.css"
        )
        args.themes = [default_theme] if default_theme.exists() else []

    if args.setup_cron:
        setup_cron()
        return

    if not args.check and not args.update:
        parser.print_help()
        return

    # Create monitor
    monitor = DiscordClassMonitor(args.themes)

    # Run action
    if args.check:
        monitor.run_check()
    elif args.update:
        monitor.run_update()


if __name__ == "__main__":
    main()
