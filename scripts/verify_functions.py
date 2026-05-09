#!/usr/bin/env python3
"""
Temporary script to verify all functions in CriticalHit.plugin.js are:
1. Defined
2. Utilized/Used
3. Functional (syntax check)
"""

import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

# File to analyze
JS_FILE = Path(__file__).parent / "CriticalHit.plugin.js"

# Patterns for function definitions
FUNCTION_PATTERNS = [
    # Method definitions: methodName() { or methodName(param) {
    (r"^\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*\{", "method"),
    # Getter definitions: get propertyName() {
    (r"^\s*get\s+([A-Z_][A-Z0-9_]*)\s*\(\)\s*\{", "getter"),
    # Arrow functions assigned: const func = () => or const func = (param) =>
    (r"const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*\([^)]*\)\s*=>", "arrow"),
    # Function declarations: function funcName() or function funcName(param)
    (r"function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)", "function"),
]

# Patterns for function calls - more specific to avoid false positives
CALL_PATTERNS = [
    # this.methodName( or this._methodName(
    (r"this\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(", "this_method"),
    # this.getProperty (getter access - must be followed by whitespace, semicolon, or end)
    (r"this\.([A-Z_][A-Z0-9_]*)\s*(?:[;,\s\)]|$)", "getter_access"),
]

# Functions to exclude from analysis
EXCLUDED_FUNCTIONS = {
    # Built-in JavaScript
    "console",
    "document",
    "window",
    "Array",
    "Object",
    "String",
    "Number",
    "Math",
    "Date",
    "JSON",
    "parseInt",
    "parseFloat",
    "isNaN",
    "isFinite",
    "setTimeout",
    "clearTimeout",
    "setInterval",
    "clearInterval",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    # BetterDiscord API
    "BdApi",
    "module",
    "exports",
    "require",
    # DOM APIs
    "getElementById",
    "querySelector",
    "querySelectorAll",
    "createElement",
    "addEventListener",
    "removeEventListener",
    "appendChild",
    "removeChild",
    "classList",
    "getAttribute",
    "setAttribute",
    "removeAttribute",
    "getBoundingClientRect",
    "getComputedStyle",
    "offsetHeight",
    "offsetWidth",
    # React Fiber
    "getReactFiber",
    "traverseFiber",
    # Standard methods
    "toString",
    "valueOf",
    "hasOwnProperty",
    "toFixed",
    "toLowerCase",
    "toUpperCase",
    "trim",
    "substring",
    "substr",
    "split",
    "join",
    "push",
    "pop",
    "shift",
    "unshift",
    "map",
    "filter",
    "reduce",
    "find",
    "findIndex",
    "some",
    "every",
    "forEach",
    "includes",
    "indexOf",
    "lastIndexOf",
    "replace",
    "match",
    "test",
    "exec",
    "keys",
    "values",
    "entries",
    "has",
    "get",
    "set",
    "delete",
    "clear",
    "length",
    "textContent",
    "innerHTML",
    "style",
    "isConnected",
    "parentNode",
    "parentElement",
    "childNodes",
    "children",
    "nextSibling",
    "previousSibling",
    "firstChild",
    "lastChild",
    "cloneNode",
    "contains",
    "matches",
    # Event handlers
    "preventDefault",
    "stopPropagation",
    "stopImmediatePropagation",
    # URL and other globals
    "URL",
    "Error",
    "TypeError",
    "ReferenceError",
}

# Methods that are intentionally unused (private helpers, lifecycle methods)
INTENTIONALLY_UNUSED = {
    "start",
    "stop",
    "getSettingsPanel",  # Lifecycle methods called by BetterDiscord
    "loadSettings",
    "saveSettings",  # Called by BetterDiscord
    "onLoad",
    "onUnload",  # Event handlers
}

# Getters are accessed via this.PROPERTY_NAME, not this.PROPERTY_NAME()
GETTER_PATTERN = re.compile(r"this\.([A-Z_][A-Z0-9_]*)\b")


def remove_comments_and_strings(content):
    """Remove comments and string literals to avoid false positives."""
    # Remove single-line comments
    content = re.sub(r"//.*", "", content)
    # Remove multi-line comments
    content = re.sub(r"/\*.*?\*/", "", content, flags=re.DOTALL)
    # Remove string literals (simple approach - may miss some edge cases)
    content = re.sub(r'"[^"]*"', '""', content)
    content = re.sub(r"'[^']*'", "''", content)
    content = re.sub(r"`[^`]*`", "``", content)
    return content


def extract_functions(content):
    """Extract all function definitions from JavaScript content."""
    functions = defaultdict(list)
    # Remove comments/strings first
    clean_content = remove_comments_and_strings(content)
    lines = clean_content.split("\n")

    for line_num, line in enumerate(lines, 1):
        # Skip lines that are clearly not function definitions
        if re.search(r"^\s*(//|/\*|\*)", line):
            continue

        for pattern, func_type in FUNCTION_PATTERNS:
            matches = re.finditer(pattern, line)
            for match in matches:
                func_name = match.group(1)
                if func_name not in EXCLUDED_FUNCTIONS and len(func_name) > 1:
                    functions[func_name].append(
                        {
                            "type": func_type,
                            "line": line_num,
                            "signature": line.strip()[:80],
                        }
                    )

    return functions


def extract_calls(content):
    """Extract all function calls from JavaScript content."""
    calls = defaultdict(list)
    # Remove comments/strings first
    clean_content = remove_comments_and_strings(content)
    lines = clean_content.split("\n")

    for line_num, line in enumerate(lines, 1):
        # Skip lines that are clearly comments
        if re.search(r"^\s*(//|/\*|\*)", line):
            continue

        # Extract method calls: this.methodName(
        for pattern, call_type in CALL_PATTERNS:
            matches = re.finditer(pattern, line)
            for match in matches:
                func_name = match.group(1)
                if func_name not in EXCLUDED_FUNCTIONS and len(func_name) > 1:
                    calls[func_name].append(
                        {
                            "type": call_type,
                            "line": line_num,
                            "context": line.strip()[:80],
                        }
                    )

        # Extract getter access: this.PROPERTY_NAME (without parentheses)
        for match in GETTER_PATTERN.finditer(line):
            getter_name = match.group(1)
            # Check it's not followed by ( to avoid double-counting method calls
            pos = match.end()
            if pos >= len(line) or line[pos : pos + 1] not in "([":
                if getter_name not in EXCLUDED_FUNCTIONS:
                    calls[getter_name].append(
                        {
                            "type": "getter",
                            "line": line_num,
                            "context": line.strip()[:80],
                        }
                    )

    return calls


def check_syntax(file_path):
    """Check JavaScript syntax using node."""
    try:
        result = subprocess.run(
            ["node", "-c", str(file_path)], capture_output=True, text=True, timeout=10
        )
        return result.returncode == 0, result.stderr
    except subprocess.TimeoutExpired:
        return False, "Syntax check timed out"
    except FileNotFoundError:
        return False, "Node.js not found. Install Node.js to check syntax."
    except Exception as e:
        return False, f"Syntax check error: {str(e)}"


def analyze_functions():
    """Main analysis function."""
    print("=" * 80)
    print("CriticalHit.plugin.js Function Verification")
    print("=" * 80)
    print()

    # Read file
    try:
        content = JS_FILE.read_text(encoding="utf-8")
        print(f"✓ File loaded: {JS_FILE}")
        print(f"  Total lines: {len(content.splitlines())}")
    except Exception as e:
        print(f"✗ Error reading file: {e}")
        return False

    # Extract functions and calls
    print("\n[1/4] Extracting function definitions...")
    functions = extract_functions(content)
    print(f"  Found {len(functions)} unique function definitions")

    print("\n[2/4] Extracting function calls...")
    calls = extract_calls(content)
    print(f"  Found {len(calls)} unique function calls")

    # Check syntax
    print("\n[3/4] Checking JavaScript syntax...")
    syntax_ok, syntax_error = check_syntax(JS_FILE)
    if syntax_ok:
        print("  ✓ Syntax is valid")
    else:
        print("  ✗ Syntax errors found:")
        print(f"    {syntax_error}")

    # Analyze usage
    print("\n[4/4] Analyzing function usage...")
    print()

    # Functions defined but not called
    defined_not_called = (
        set(functions.keys()) - set(calls.keys()) - INTENTIONALLY_UNUSED
    )
    # Separate getters from methods
    getters_not_called = {
        f
        for f in defined_not_called
        if any(d["type"] == "getter" for d in functions[f])
    }
    methods_not_called = defined_not_called - getters_not_called

    if methods_not_called:
        print(f"⚠️  {len(methods_not_called)} methods defined but never called:")
        for func in sorted(methods_not_called)[:20]:  # Show first 20
            defs = functions[func]
            print(
                f"   - {func} (defined at line {defs[0]['line']}, type: {defs[0]['type']})"
            )
        if len(methods_not_called) > 20:
            print(f"   ... and {len(methods_not_called) - 20} more")
        print()

    if getters_not_called:
        print(f"⚠️  {len(getters_not_called)} getters defined but never accessed:")
        for func in sorted(getters_not_called)[:10]:  # Show first 10
            defs = functions[func]
            print(f"   - {func} (defined at line {defs[0]['line']})")
        if len(getters_not_called) > 10:
            print(f"   ... and {len(getters_not_called) - 10} more")
        print()

    # Functions called but not defined
    called_not_defined = set(calls.keys()) - set(functions.keys())
    if called_not_defined:
        print(f"✗ {len(called_not_defined)} functions called but not defined:")
        for func in sorted(called_not_defined):
            call_sites = calls[func]
            print(
                f"   - {func} (called at lines: {', '.join(str(c['line']) for c in call_sites[:5])})"
            )
        print()

    # Functions properly used
    properly_used = set(functions.keys()) & set(calls.keys())
    print(f"✓ {len(properly_used)} functions properly defined and used")

    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Total functions defined: {len(functions)}")
    print(f"Total functions called: {len(calls)}")
    print(f"Functions properly used: {len(properly_used)}")
    print(f"Functions defined but not called: {len(defined_not_called)}")
    print(f"Functions called but not defined: {len(called_not_defined)}")
    print(f"Syntax valid: {'✓ Yes' if syntax_ok else '✗ No'}")
    print()

    # Return success status
    success = (
        syntax_ok and len(called_not_defined) == 0 and len(defined_not_called) == 0
    )

    if success:
        print("✓ All checks passed!")
    else:
        print("✗ Some issues found. Review the output above.")

    return success


if __name__ == "__main__":
    success = analyze_functions()
    sys.exit(0 if success else 1)
