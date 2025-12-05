#!/usr/bin/env python3
"""
Long Function Splitter
Analyzes long functions and suggests how to split them
"""

import re

def analyze_long_functions(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    print("="*70)
    print("LONG FUNCTION ANALYSIS")
    print("="*70)

    long_functions = []
    i = 0

    while i < len(lines):
        line = lines[i]

        # Find function definition
        match = re.match(r'^\s+([a-z][a-zA-Z0-9]*)\(.*\) \{', line)
        if match:
            func_name = match.group(1)
            func_start = i
            func_lines = [line]
            brace_count = 1

            j = i + 1
            while j < len(lines) and brace_count > 0:
                func_lines.append(lines[j])
                brace_count += lines[j].count('{') - lines[j].count('}')
                j += 1

            func_end = j
            func_length = len(func_lines)

            if func_length > 200:
                # Analyze function for split opportunities
                sections = analyze_function_sections(''.join(func_lines), func_name)

                long_functions.append({
                    'name': func_name,
                    'start': func_start + 1,
                    'end': func_end,
                    'lines': func_length,
                    'sections': sections,
                    'code': ''.join(func_lines)
                })

            i = j
        else:
            i += 1

    print(f"\nFound {len(long_functions)} functions > 200 lines\n")

    for func in long_functions:
        print("\n" + "="*70)
        print(f"FUNCTION: {func['name']}()")
        print("="*70)
        print(f"Lines {func['start']}-{func['end']} ({func['lines']} lines)")
        print(f"\n📋 SUGGESTED SPLIT INTO {len(func['sections'])} FUNCTIONS:")
        for i, section in enumerate(func['sections'], 1):
            print(f"\n  {i}. {section['name']}() - {section['purpose']}")
            print(f"     Lines: ~{section['estimated_lines']}")
            print(f"     Extract: {section['extract_hint']}")

    return long_functions

def analyze_function_sections(code, func_name):
    """Analyze function and suggest how to split it"""
    sections = []

    # Common patterns to extract
    patterns = [
        {
            'pattern': r'// Initialize|// Setup|// Load settings',
            'name': f'{func_name}_initialize',
            'purpose': 'Initialization logic',
            'extract_hint': 'Extract setup/initialization code'
        },
        {
            'pattern': r'// Validation|// Check|// Verify',
            'name': f'{func_name}_validate',
            'purpose': 'Validation logic',
            'extract_hint': 'Extract validation checks'
        },
        {
            'pattern': r'// Calculate|// Compute',
            'name': f'{func_name}_calculate',
            'purpose': 'Calculation logic',
            'extract_hint': 'Extract calculation code'
        },
        {
            'pattern': r'// Update|// Render|// Display',
            'name': f'{func_name}_updateUI',
            'purpose': 'UI update logic',
            'extract_hint': 'Extract UI update code'
        },
        {
            'pattern': r'// Cleanup|// Clear',
            'name': f'{func_name}_cleanup',
            'purpose': 'Cleanup logic',
            'extract_hint': 'Extract cleanup code'
        },
    ]

    # Special cases by function name
    if func_name == 'constructor':
        sections = [
            {'name': 'initializeDefaults', 'purpose': 'Set default settings', 'estimated_lines': 50, 'extract_hint': 'Extract default settings object creation'},
            {'name': 'initializeState', 'purpose': 'Initialize state variables', 'estimated_lines': 30, 'extract_hint': 'Extract state variable initialization'},
            {'name': 'initializeLookupMaps', 'purpose': 'Create lookup maps', 'estimated_lines': 40, 'extract_hint': 'Extract rankData, questData maps'},
            {'name': 'initializeDebugSystem', 'purpose': 'Setup debug system', 'estimated_lines': 20, 'extract_hint': 'Extract debug config'},
        ]
    elif func_name == 'startObserving':
        sections = [
            {'name': 'setupMessageObserver', 'purpose': 'Setup MutationObserver for messages', 'estimated_lines': 100, 'extract_hint': 'Extract observer setup'},
            {'name': 'handleMessageMutation', 'purpose': 'Handle mutation events', 'estimated_lines': 150, 'extract_hint': 'Extract mutation handling logic'},
            {'name': 'processNewMessage', 'purpose': 'Process detected message', 'estimated_lines': 100, 'extract_hint': 'Extract message processing'},
            {'name': 'trackMessageActivity', 'purpose': 'Track activity metrics', 'estimated_lines': 50, 'extract_hint': 'Extract activity tracking'},
        ]
    elif 'inject' in func_name.lower() and 'CSS' in func_name:
        sections = [
            {'name': f'{func_name}_baseStyles', 'purpose': 'Base CSS styles', 'estimated_lines': 200, 'extract_hint': 'Extract base styles to separate function'},
            {'name': f'{func_name}_componentStyles', 'purpose': 'Component-specific styles', 'estimated_lines': 200, 'extract_hint': 'Extract component styles'},
            {'name': f'{func_name}_animations', 'purpose': 'Animation keyframes', 'estimated_lines': 100, 'extract_hint': 'Extract animations'},
        ]
    elif func_name == 'getAchievementDefinitions':
        sections = [
            {'name': 'getBasicAchievements', 'purpose': 'Basic achievement definitions', 'estimated_lines': 200, 'extract_hint': 'Extract basic achievements array'},
            {'name': 'getAdvancedAchievements', 'purpose': 'Advanced achievement definitions', 'estimated_lines': 200, 'extract_hint': 'Extract advanced achievements'},
            {'name': 'getTitleAchievements', 'purpose': 'Title-granting achievements', 'estimated_lines': 200, 'extract_hint': 'Extract title achievements'},
            {'name': 'getMilestoneAchievements', 'purpose': 'Milestone achievements', 'estimated_lines': 200, 'extract_hint': 'Extract milestone achievements'},
        ]
    elif func_name == 'awardXP':
        sections = [
            {'name': 'calculateXPBonuses', 'purpose': 'Calculate all XP bonuses', 'estimated_lines': 100, 'extract_hint': 'Extract bonus calculation'},
            {'name': 'applyXPGain', 'purpose': 'Apply XP and check level-ups', 'estimated_lines': 100, 'extract_hint': 'Extract XP application'},
            {'name': 'notifyXPGain', 'purpose': 'Show XP gain notification', 'estimated_lines': 50, 'extract_hint': 'Extract notification logic'},
            {'name': 'updateQuestProgress', 'purpose': 'Update quest progress', 'estimated_lines': 50, 'extract_hint': 'Extract quest update'},
        ]
    elif func_name == 'updateChatUI':
        sections = [
            {'name': 'updateChatStats', 'purpose': 'Update stats display', 'estimated_lines': 100, 'extract_hint': 'Extract stats update'},
            {'name': 'updateChatQuests', 'purpose': 'Update quests display', 'estimated_lines': 80, 'extract_hint': 'Extract quests update'},
            {'name': 'updateChatActivity', 'purpose': 'Update activity display', 'estimated_lines': 90, 'extract_hint': 'Extract activity update'},
        ]
    elif func_name == 'resetLevelTo':
        sections = [
            {'name': 'calculateNewStats', 'purpose': 'Calculate stats for target level', 'estimated_lines': 80, 'extract_hint': 'Extract stat calculation'},
            {'name': 'updatePlayerState', 'purpose': 'Update player state', 'estimated_lines': 80, 'extract_hint': 'Extract state update'},
            {'name': 'refreshAllDisplays', 'purpose': 'Refresh all UI displays', 'estimated_lines': 60, 'extract_hint': 'Extract UI refresh'},
        ]
    else:
        # Generic split suggestions
        code_sections = re.split(r'//.*(?:Step \d|STEP \d|Phase \d)', code)
        sections = [
            {'name': f'{func_name}_part{i+1}', 'purpose': f'Sub-operation {i+1}',
             'estimated_lines': len(section.split('\n')), 'extract_hint': 'Extract this logical section'}
            for i, section in enumerate(code_sections) if len(section.strip()) > 50
        ]

    return sections

if __name__ == '__main__':
    analyze_for_loops('plugins/SoloLevelingStats.plugin.js')
