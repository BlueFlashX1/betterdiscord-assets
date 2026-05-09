#!/usr/bin/env python3
"""
Analyze CriticalHit.plugin.js and organize Section 2 (Configuration & Helpers)
Finds all helper functions, variables, utilities and generates proper organization
"""

import re
from pathlib import Path
from collections import defaultdict

def analyze_plugin(file_path):
    """Analyze the plugin and categorize methods"""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
        lines = content.split('\n')

    # Find all methods (functions defined in class)
    method_pattern = r'^\s{2}([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)\s*\{'
    methods = []

    for i, line in enumerate(lines, 1):
        match = re.match(method_pattern, line)
        if match:
            method_name = match.group(1)
            methods.append({
                'name': method_name,
                'line': i,
                'content': line.strip()
            })

    # Categorize methods
    categories = {
        'Settings': [],
        'Message Identification': [],
        'Crit Detection': [],
        'Crit Styling': [],
        'History Management': [],
        'Channel Management': [],
        'DOM Queries': [],
        'React Fiber': [],
        'Caching': [],
        'Throttling': [],
        'Stats & Tracking': [],
        'Utilities': [],
        'Animation': [],
        'Uncategorized': []
    }

    # Categorization rules
    for method in methods:
        name = method['name']

        # Settings
        if any(x in name.lower() for x in ['settings', 'loadsettings', 'savesettings']):
            categories['Settings'].append(method)

        # Message Identification
        elif any(x in name.lower() for x in ['getmessageid', 'getmessageidentifier', 'extractmessageid']):
            categories['Message Identification'].append(method)

        # Crit Detection
        elif any(x in name.lower() for x in ['iscrit', 'shouldcrit', 'rollcrit', 'checkcrit']):
            categories['Crit Detection'].append(method)

        # Crit Styling
        elif any(x in name.lower() for x in ['applycrit', 'removecrit', 'updatecrit', 'restorecrit', 'style']):
            categories['Crit Styling'].append(method)

        # History Management
        elif any(x in name.lower() for x in ['history', 'save', 'load', 'cleanup']):
            categories['History Management'].append(method)

        # Channel Management
        elif any(x in name.lower() for x in ['channel', 'getchannelid', 'switchchannel']):
            categories['Channel Management'].append(method)

        # DOM Queries
        elif any(x in name.lower() for x in ['getall', 'find', 'query', 'element', 'container']):
            categories['DOM Queries'].append(method)

        # React Fiber
        elif any(x in name.lower() for x in ['fiber', 'react', 'traverse']):
            categories['React Fiber'].append(method)

        # Caching
        elif any(x in name.lower() for x in ['cache', 'cached']):
            categories['Caching'].append(method)

        # Throttling
        elif any(x in name.lower() for x in ['throttle', 'debounce', 'ratelimit']):
            categories['Throttling'].append(method)

        # Stats
        elif any(x in name.lower() for x in ['stats', 'count', 'update']):
            categories['Stats & Tracking'].append(method)

        # Animation
        elif any(x in name.lower() for x in ['animation', 'animate', 'particle', 'combo', 'shake']):
            categories['Animation'].append(method)

        # Utilities
        elif any(x in name.lower() for x in ['hash', 'generate', 'create', 'format', 'parse']):
            categories['Utilities'].append(method)

        # Lifecycle (skip - goes in Section 3)
        elif name in ['start', 'stop', 'constructor', 'getSettingsPanel']:
            continue

        # Debug (skip - goes in Section 4)
        elif name in ['debugLog', 'debugError']:
            continue

        else:
            categories['Uncategorized'].append(method)

    return categories, methods

def generate_section2_structure(categories):
    """Generate organized Section 2 structure"""
    print("\n" + "="*80)
    print("SECTION 2: CONFIGURATION & HELPERS - ORGANIZATION PLAN")
    print("="*80 + "\n")

    order = [
        'Settings',
        'Message Identification',
        'Crit Detection',
        'Crit Styling',
        'History Management',
        'Channel Management',
        'DOM Queries',
        'React Fiber',
        'Caching',
        'Throttling',
        'Stats & Tracking',
        'Animation',
        'Utilities',
        'Uncategorized'
    ]

    for category in order:
        methods = categories[category]
        if not methods:
            continue

        print(f"\n{'─'*80}")
        print(f"  {category.upper()} ({len(methods)} methods)")
        print(f"{'─'*80}")

        for method in methods:
            print(f"  • {method['name']:40s} (Line {method['line']})")

    # Summary
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    total = sum(len(methods) for methods in categories.values())
    print(f"Total helper methods found: {total}")
    print(f"\nBy category:")
    for category in order:
        count = len(categories[category])
        if count > 0:
            print(f"  {category:30s}: {count:3d} methods")

def generate_headers_insert():
    """Generate code snippet for section headers"""
    print("\n" + "="*80)
    print("SUGGESTED SECTION 2 SUBSECTION HEADERS")
    print("="*80 + "\n")

    headers = [
        ("SETTINGS MANAGEMENT", "loadSettings, saveSettings"),
        ("MESSAGE IDENTIFICATION", "getMessageId, extractMessageId, etc."),
        ("CRIT DETECTION", "isCrit, shouldCrit, rollCrit"),
        ("CRIT STYLING", "applyCritStyle, removeCritStyle, etc."),
        ("HISTORY MANAGEMENT", "saveMessageHistory, loadMessageHistory, cleanup"),
        ("CHANNEL MANAGEMENT", "getCurrentChannelId, switchChannel"),
        ("DOM QUERIES", "getAllMessages, findMessageContainer"),
        ("REACT FIBER UTILITIES", "traverseFiber, extractFromFiber"),
        ("CACHING", "getCachedMessages, invalidateCache"),
        ("THROTTLING", "throttleOperation, debounce"),
        ("STATS & TRACKING", "updateStats, getStats"),
        ("ANIMATION HELPERS", "createAnimation, updateCombo"),
        ("UTILITIES", "generateHash, formatString, etc."),
    ]

    for header, description in headers:
        print(f"// ============================================================================")
        print(f"// HELPER METHODS - {header}")
        print(f"// ============================================================================")
        print(f"// {description}\n")

if __name__ == "__main__":
    plugin_path = Path(__file__).parent.parent / "plugins" / "CriticalHit.plugin.js"

    print(f"Analyzing: {plugin_path}")
    print(f"File size: {plugin_path.stat().st_size // 1024}KB")

    categories, all_methods = analyze_plugin(plugin_path)

    generate_section2_structure(categories)
    generate_headers_insert()

    print("\n" + "="*80)
    print("✅ Analysis complete!")
    print("="*80)
    print("\nUse this information to organize Section 2 with proper subsection headers.")
