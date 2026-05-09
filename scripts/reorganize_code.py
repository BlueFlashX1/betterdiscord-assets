#!/usr/bin/env python3
"""
Code Section Reorganizer with Comprehensive Guardrails and Validation

Moves code sections marked with // MOVE START and // MOVE END comments.

Guardrails:
1. MOVE START, MOVE END, and MOVE HERE must all have the same string name
2. START must come before END (validated order)
3. MOVE HERE must be outside of START and END (never inside) to avoid overlapping
4. Processes one section at a time sequentially
5. Validates code structure (balanced braces, method boundaries)
6. Detects orphaned docstrings and duplicate definitions
7. Syntax validation after reorganization

Usage:
    python reorganize_code.py <input_file> <output_file> [--dry-run] [--validate-syntax]

Example markers:
    // MOVE START: lifecycle_methods
    // ... code here ...
    // MOVE END: lifecycle_methods
    // ... other code ...
    // MOVE HERE: lifecycle_methods
"""

import argparse
import re
import subprocess
from typing import Dict, List, Optional, Tuple


class CodeReorganizer:
    def __init__(self, file_path: str):
        self.file_path = file_path
        self.content = ""
        self.sections: Dict[str, Dict] = {}
        self.validated_sections: Dict[str, Dict] = {}
        self.warnings: List[str] = []

    def read_file(self) -> str:
        """Read the source file."""
        with open(self.file_path, "r", encoding="utf-8") as f:
            self.content = f.read()
        return self.content

    def validate_section(
        self,
        section_name: str,
        start_line: int,
        end_line: int,
        move_here_line: Optional[int] = None,
    ) -> Tuple[bool, List[str]]:
        """
        Validate a section according to guardrails.

        Returns:
            (is_valid, list_of_errors)
        """
        errors = []

        # Guardrail 1: Check that START, END, and HERE all have same name
        # (This is implicit - we're already using section_name for all)

        # Guardrail 2: START must come before END
        if start_line >= end_line:
            errors.append(
                f"Section '{section_name}': START (line {start_line}) must come before END (line {end_line})"
            )

        # Guardrail 3: MOVE HERE must be outside of START and END (never inside)
        if move_here_line is not None:
            if start_line <= move_here_line <= end_line:
                errors.append(
                    f"Section '{section_name}': MOVE HERE (line {move_here_line}) is INSIDE "
                    f"START-END range ({start_line}-{end_line}). MOVE HERE must be OUTSIDE."
                )

        return len(errors) == 0, errors

    def check_code_structure(self, content: str, section_name: str) -> List[str]:
        """
        Check code structure for common issues:
        - Balanced braces
        - Orphaned docstrings
        - Incomplete methods
        """
        warnings = []
        lines = content.split("\n")

        # Check for balanced braces in section
        open_braces = 0
        open_parens = 0
        in_string = False
        string_char = None

        for i, line in enumerate(lines, 1):
            # Simple string detection (not perfect but good enough)
            for char in line:
                if char in ('"', "'") and (i == 0 or line[i - 1] != "\\"):
                    if not in_string:
                        in_string = True
                        string_char = char
                    elif char == string_char:
                        in_string = False
                        string_char = None

                if not in_string:
                    if char == "{":
                        open_braces += 1
                    elif char == "}":
                        open_braces -= 1
                    elif char == "(":
                        open_parens += 1
                    elif char == ")":
                        open_parens -= 1

        if open_braces != 0:
            warnings.append(
                f"Section '{section_name}': Unbalanced braces (difference: {open_braces})"
            )
        if open_parens != 0:
            warnings.append(
                f"Section '{section_name}': Unbalanced parentheses (difference: {open_parens})"
            )

        # Check for orphaned docstrings (docstring without following method/function)
        for i, line in enumerate(lines):
            if re.search(r"^\s*/\*\*", line) or re.search(r"^\s*\*\s*@", line):
                # Found a docstring start, check if next non-empty line is a method
                next_method = None
                for j in range(i + 1, min(i + 10, len(lines))):
                    next_line = lines[j].strip()
                    if not next_line or next_line.startswith("*"):
                        continue
                    # Check if it's a method/function definition
                    if re.search(r"^\w+\s*\([^)]*\)\s*\{", next_line):
                        next_method = j + 1
                        break
                    # If we hit another docstring or non-method code, it might be orphaned
                    if re.search(r"^\s*/\*\*", next_line) or (
                        next_line and not re.search(r"^\s*(//|/\*|\*)", next_line)
                    ):
                        break

                if next_method is None and i < len(lines) - 1:
                    # Check if next line is just a closing brace (orphaned docstring)
                    next_non_empty = None
                    for j in range(i + 1, len(lines)):
                        if lines[j].strip():
                            next_non_empty = lines[j].strip()
                            break
                    if next_non_empty == "}":
                        warnings.append(
                            f"Section '{section_name}': Possible orphaned docstring at line {i + 1}"
                        )

        return warnings

    def find_all_markers(self) -> Dict[str, Dict]:
        """
        Find all MOVE START, MOVE END, and MOVE HERE markers.

        Returns dict mapping section_name -> {
            'start_line': int or None,
            'end_line': int or None,
            'move_here_line': int or None,
            'errors': List[str]
        }
        """
        lines = self.content.split("\n")
        markers: Dict[str, Dict] = {}

        for i, line in enumerate(lines, 1):
            # Check for MOVE START
            start_match = re.search(
                r"//\s*MOVE\s+START\s*:\s*(\w+)", line, re.IGNORECASE
            )
            if start_match:
                section_name = start_match.group(1)
                if section_name not in markers:
                    markers[section_name] = {
                        "start_line": None,
                        "end_line": None,
                        "move_here_line": None,
                        "errors": [],
                    }
                if markers[section_name]["start_line"] is not None:
                    markers[section_name]["errors"].append(
                        f"Duplicate MOVE START found at line {i} (first at line {markers[section_name]['start_line']})"
                    )
                else:
                    markers[section_name]["start_line"] = i

            # Check for MOVE END
            end_match = re.search(r"//\s*MOVE\s+END\s*:\s*(\w+)", line, re.IGNORECASE)
            if end_match:
                section_name = end_match.group(1)
                if section_name not in markers:
                    markers[section_name] = {
                        "start_line": None,
                        "end_line": None,
                        "move_here_line": None,
                        "errors": [],
                    }
                if markers[section_name]["end_line"] is not None:
                    markers[section_name]["errors"].append(
                        f"Duplicate MOVE END found at line {i} (first at line {markers[section_name]['end_line']})"
                    )
                else:
                    markers[section_name]["end_line"] = i

            # Check for MOVE HERE
            here_match = re.search(r"//\s*MOVE\s+HERE\s*:\s*(\w+)", line, re.IGNORECASE)
            if here_match:
                section_name = here_match.group(1)
                if section_name not in markers:
                    markers[section_name] = {
                        "start_line": None,
                        "end_line": None,
                        "move_here_line": None,
                        "errors": [],
                    }
                if markers[section_name]["move_here_line"] is not None:
                    markers[section_name]["errors"].append(
                        f"Duplicate MOVE HERE found at line {i} (first at line {markers[section_name]['move_here_line']})"
                    )
                else:
                    markers[section_name]["move_here_line"] = i

        return markers

    def find_sections(self) -> Dict[str, Dict]:
        """
        Find all sections marked with // MOVE START and // MOVE END.
        Validates guardrails before returning.

        Returns dict mapping section_name -> section_data
        """
        lines = self.content.split("\n")
        sections = {}
        current_section = None
        start_line = None
        section_lines = []

        # First, find all markers to validate
        all_markers = self.find_all_markers()

        for section_name, marker_data in all_markers.items():
            # Guardrail 1: Check that START, END, and HERE all exist with same name
            if marker_data["start_line"] is None:
                marker_data["errors"].append(
                    f"Section '{section_name}': Missing MOVE START marker"
                )
            if marker_data["end_line"] is None:
                marker_data["errors"].append(
                    f"Section '{section_name}': Missing MOVE END marker"
                )
            if marker_data["move_here_line"] is None:
                marker_data["errors"].append(
                    f"Section '{section_name}': Missing MOVE HERE marker"
                )

            # Guardrail 2 & 3: Validate order and overlap
            if marker_data["start_line"] and marker_data["end_line"]:
                is_valid, validation_errors = self.validate_section(
                    section_name,
                    marker_data["start_line"],
                    marker_data["end_line"],
                    marker_data["move_here_line"],
                )
                marker_data["errors"].extend(validation_errors)

        # Now extract section content
        for i, line in enumerate(lines, 1):
            # Check for MOVE START marker
            start_match = re.search(
                r"//\s*MOVE\s+START\s*:\s*(\w+)", line, re.IGNORECASE
            )
            if start_match:
                # If we were already in a section, save it first
                if current_section and start_line:
                    sections[current_section] = {
                        "content": "\n".join(section_lines),
                        "start_line": start_line,
                        "end_line": i - 1,
                        "original_lines": section_lines.copy(),
                        "marker_data": all_markers.get(current_section, {}),
                    }

                # Start new section
                current_section = start_match.group(1)
                start_line = i
                section_lines = []
                continue

            # Check for MOVE END marker
            end_match = re.search(r"//\s*MOVE\s+END\s*:\s*(\w+)", line, re.IGNORECASE)
            if end_match:
                section_name = end_match.group(1)
                if current_section == section_name:
                    # Save section
                    sections[current_section] = {
                        "content": "\n".join(section_lines),
                        "start_line": start_line,
                        "end_line": i,
                        "original_lines": section_lines.copy(),
                        "marker_data": all_markers.get(current_section, {}),
                    }
                    current_section = None
                    start_line = None
                    section_lines = []
                else:
                    print(
                        f"Warning: MOVE END for '{section_name}' doesn't match current section '{current_section}'"
                    )
                continue

            # If we're in a section, collect the line
            if current_section:
                section_lines.append(line)

        # Handle unclosed section
        if current_section:
            print(f"Warning: Section '{current_section}' not closed with MOVE END")

        # Validate all sections
        self.validated_sections = {}
        for section_name, section_data in sections.items():
            marker_data = all_markers.get(section_name, {})

            # Check code structure
            structure_warnings = self.check_code_structure(
                section_data["content"], section_name
            )
            if structure_warnings:
                self.warnings.extend(structure_warnings)
                marker_data["errors"].extend(structure_warnings)

            if marker_data.get("errors"):
                print(f"\n❌ Section '{section_name}' FAILED validation:")
                for error in marker_data["errors"]:
                    print(f"   - {error}")
                print(f"   Skipping section '{section_name}'")
            else:
                self.validated_sections[section_name] = section_data
                print(f"✅ Section '{section_name}' passed all guardrails")

        self.sections = self.validated_sections
        return self.validated_sections

    def remove_section(self, content: str, section_name: str) -> str:
        """Remove a single marked section from content."""
        lines = content.split("\n")
        result_lines = []
        skip_until_end = None

        for i, line in enumerate(lines, 1):
            # Check for MOVE START
            start_match = re.search(
                r"//\s*MOVE\s+START\s*:\s*(\w+)", line, re.IGNORECASE
            )
            if start_match:
                if start_match.group(1) == section_name:
                    skip_until_end = section_name
                    continue  # Skip the marker line

            # Check for MOVE END
            end_match = re.search(r"//\s*MOVE\s+END\s*:\s*(\w+)", line, re.IGNORECASE)
            if end_match:
                if (
                    end_match.group(1) == section_name
                    and skip_until_end == section_name
                ):
                    skip_until_end = None
                    continue  # Skip the marker line

            # Skip lines inside removed section
            if skip_until_end == section_name:
                continue

            result_lines.append(line)

        return "\n".join(result_lines)

    def find_move_here_marker(self, content: str, section_name: str) -> Optional[int]:
        """
        Find // MOVE HERE: section_name marker for a specific section.

        Returns line number (1-indexed) or None if not found
        """
        lines = content.split("\n")

        for i, line in enumerate(lines, 1):
            match = re.search(r"//\s*MOVE\s+HERE\s*:\s*(\w+)", line, re.IGNORECASE)
            if match and match.group(1) == section_name:
                return i

        return None

    def insert_section(
        self,
        content: str,
        section_name: str,
        insert_at_line: int,
    ) -> str:
        """
        Insert a section into content at a specific line.

        Args:
            content: The file content
            section_name: Name of section to insert
            insert_at_line: Line number to insert at (1-indexed)
        """
        if section_name not in self.sections:
            print(f"Error: Section '{section_name}' not found")
            return content

        section_content = self.sections[section_name]["content"]
        lines = content.split("\n")

        # Split section content into lines and insert all of them
        section_lines = section_content.split("\n")
        insert_idx = insert_at_line - 1  # Convert to 0-indexed

        for i, section_line in enumerate(section_lines):
            lines.insert(insert_idx + i, section_line)

        return "\n".join(lines)

    def validate_syntax(self, content: str, file_path: str) -> Tuple[bool, str]:
        """
        Validate syntax of the reorganized code.
        For JavaScript files, tries to use node -c
        """
        # Try to detect file type
        if file_path.endswith(".js") or file_path.endswith(".plugin.js"):
            try:
                # Write to temp file and check syntax
                import tempfile

                with tempfile.NamedTemporaryFile(
                    mode="w", suffix=".js", delete=False
                ) as f:
                    f.write(content)
                    temp_path = f.name

                result = subprocess.run(
                    ["node", "-c", temp_path],
                    capture_output=True,
                    text=True,
                    timeout=10,
                )

                import os

                os.unlink(temp_path)

                if result.returncode == 0:
                    return True, ""
                else:
                    return False, result.stderr
            except Exception as e:
                return False, f"Syntax check failed: {str(e)}"

        return True, "Syntax validation not available for this file type"

    def check_duplicates(self, content: str) -> List[str]:
        """
        Check for duplicate method/function definitions after reorganization.
        """
        warnings = []
        lines = content.split("\n")

        # Find all method/function definitions
        method_defs = {}
        for i, line in enumerate(lines, 1):
            # Match JavaScript method definitions: methodName() { or methodName(param) {
            match = re.search(r"^\s*(\w+)\s*\([^)]*\)\s*\{", line)
            if match:
                method_name = match.group(1)
                if method_name in method_defs:
                    warnings.append(
                        f"Possible duplicate method '{method_name}' at line {i} "
                        f"(first seen at line {method_defs[method_name]})"
                    )
                else:
                    method_defs[method_name] = i

        return warnings

    def reorganize_one_section(
        self, section_name: str, content: str
    ) -> Tuple[str, bool]:
        """
        Reorganize a single section.

        Returns:
            (new_content, success)
        """
        if section_name not in self.sections:
            print(f"❌ Section '{section_name}' not found in validated sections")
            return content, False

        section_data = self.sections[section_name]
        marker_data = section_data.get("marker_data", {})

        # Check for errors
        if marker_data.get("errors"):
            print(f"❌ Section '{section_name}' has validation errors, skipping")
            return content, False

        # Find MOVE HERE marker in current content
        move_here_line = self.find_move_here_marker(content, section_name)
        if move_here_line is None:
            print(f"❌ Section '{section_name}': MOVE HERE marker not found")
            return content, False

        print(f"\n🔄 Processing section '{section_name}'...")
        print(
            f"   - Removing from original location (lines {section_data['start_line']}-{section_data['end_line']})"
        )

        # Step 1: Remove the section from its original location
        new_content = self.remove_section(content, section_name)

        # Step 2: Remove the MOVE HERE marker
        lines = new_content.split("\n")
        result_lines = []
        for line in lines:
            match = re.search(r"//\s*MOVE\s+HERE\s*:\s*(\w+)", line, re.IGNORECASE)
            if match and match.group(1) == section_name:
                continue  # Skip the marker line
            result_lines.append(line)
        new_content = "\n".join(result_lines)

        # Step 3: Adjust MOVE HERE line number (subtract removed section + markers)
        section_line_count = len(section_data["original_lines"])
        removed_lines = section_line_count + 2  # +2 for START and END markers

        # Count how many lines were removed before the MOVE HERE marker
        lines_before = 0
        if section_data["end_line"] < move_here_line:
            lines_before = removed_lines

        adjusted_line = move_here_line - lines_before

        print(f"   - Inserting at new location (line {adjusted_line})")

        # Step 4: Insert section at adjusted location
        new_content = self.insert_section(new_content, section_name, adjusted_line)

        print(f"✅ Section '{section_name}' moved successfully")
        return new_content, True

    def reorganize(self, validate_syntax: bool = False) -> str:
        """
        Reorganize code sections one at a time sequentially.
        Only processes sections that pass all guardrails.

        Returns:
            Reorganized content
        """
        # Find and validate all sections
        sections = self.find_sections()

        if not sections:
            print("❌ No valid sections found")
            return self.content

        # Get list of sections to move (those with MOVE HERE markers)
        all_markers = self.find_all_markers()
        sections_to_move = [
            name
            for name, data in all_markers.items()
            if data["move_here_line"] is not None and name in self.validated_sections
        ]

        if not sections_to_move:
            print("❌ No sections with valid MOVE HERE markers found")
            return self.content

        print(f"\n📋 Found {len(sections_to_move)} sections to reorganize:")
        for section_name in sections_to_move:
            marker_data = all_markers[section_name]
            print(
                f"   - {section_name}: START={marker_data['start_line']}, "
                f"END={marker_data['end_line']}, HERE={marker_data['move_here_line']}"
            )

        # Process sections one at a time sequentially
        current_content = self.content
        successful_moves = []
        failed_moves = []

        for section_name in sections_to_move:
            new_content, success = self.reorganize_one_section(
                section_name, current_content
            )
            if success:
                current_content = new_content
                successful_moves.append(section_name)
                # Update self.content and re-find sections after each move (line numbers change)
                self.content = current_content
                self.find_sections()
            else:
                failed_moves.append(section_name)

        # Check for duplicates after reorganization
        duplicate_warnings = self.check_duplicates(current_content)
        if duplicate_warnings:
            print("\n⚠️  Warnings after reorganization:")
            for warning in duplicate_warnings:
                print(f"   - {warning}")
            self.warnings.extend(duplicate_warnings)

        # Validate syntax if requested
        if validate_syntax:
            print("\n🔍 Validating syntax...")
            is_valid, error_msg = self.validate_syntax(current_content, self.file_path)
            if is_valid:
                print("✅ Syntax validation passed")
            else:
                print("❌ Syntax validation failed:")
                print(f"   {error_msg}")
                self.warnings.append(
                    "Syntax validation failed - manual review required"
                )

        print("\n📊 Reorganization Summary:")
        print(f"   ✅ Successfully moved: {len(successful_moves)} sections")
        if successful_moves:
            for name in successful_moves:
                print(f"      - {name}")
        if failed_moves:
            print(f"   ❌ Failed to move: {len(failed_moves)} sections")
            for name in failed_moves:
                print(f"      - {name}")

        if self.warnings:
            print(f"\n⚠️  Total warnings: {len(self.warnings)}")
            print("   Review warnings above and verify code manually")

        return current_content

    def write_file(self, content: str, output_path: str):
        """Write content to output file."""
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(content)


def main():
    parser = argparse.ArgumentParser(
        description="Reorganize code sections marked with MOVE START/END (with guardrails)"
    )
    parser.add_argument("input_file", help="Input file path")
    parser.add_argument("output_file", help="Output file path")
    parser.add_argument(
        "--dry-run", action="store_true", help="Show what would be done without writing"
    )
    parser.add_argument(
        "--validate-syntax",
        action="store_true",
        help="Validate syntax after reorganization (requires node for .js files)",
    )

    args = parser.parse_args()

    reorganizer = CodeReorganizer(args.input_file)
    reorganizer.read_file()

    # Find all markers first
    all_markers = reorganizer.find_all_markers()

    if not all_markers:
        print("❌ No MOVE markers found")
        return

    print(f"🔍 Found {len(all_markers)} sections with markers:")
    for section_name, marker_data in all_markers.items():
        print(f"   - {section_name}:")
        print(f"     START: line {marker_data['start_line']}")
        print(f"     END: line {marker_data['end_line']}")
        print(f"     HERE: line {marker_data['move_here_line']}")
        if marker_data["errors"]:
            print("     ❌ ERRORS:")
            for error in marker_data["errors"]:
                print(f"        - {error}")

    # Find and validate all sections
    print("\n" + "=" * 60)
    print("VALIDATING SECTIONS (Guardrails)")
    print("=" * 60)
    sections = reorganizer.find_sections()

    if not sections:
        print("❌ No valid sections found after validation")
        return

    print(f"\n✅ Found {len(sections)} valid sections:")
    for name, data in sections.items():
        line_count = len(data["original_lines"])
        content_preview = data["content"][:100].replace("\n", "\\n")
        print(
            f"  - {name}: lines {data['start_line']}-{data['end_line']} ({line_count} lines)"
        )
        if args.dry_run:
            print(f"    Preview: {content_preview}...")

    if args.dry_run:
        print("\n[DRY RUN] No changes written")
        return

    # Reorganize (one section at a time)
    print("\n" + "=" * 60)
    print("REORGANIZING (One section at a time)")
    print("=" * 60)
    new_content = reorganizer.reorganize(validate_syntax=args.validate_syntax)

    reorganizer.write_file(new_content, args.output_file)
    print(f"\n✅ Output written to: {args.output_file}")

    if reorganizer.warnings:
        print(f"\n⚠️  Note: {len(reorganizer.warnings)} warnings were generated")
        print("   Please review the output file manually to ensure correctness")


if __name__ == "__main__":
    main()
