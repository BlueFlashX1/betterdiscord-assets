#!/usr/bin/env python3
"""
Deep analysis of CriticalHit.plugin.js to find ALL helper methods
Includes edge case detection: multi-line definitions, arrow functions, etc.
"""

import re
from pathlib import Path
from collections import defaultdict

def find_all_methods_comprehensive(file_path):
    """Find ALL methods using multiple detection strategies"""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
        lines = content.split('\n')
    
    methods = {}
    
    # ========================================
    # STRATEGY 1: Standard method definitions
    # ========================================
    pattern1 = r'^\s{2}([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)\s*\{'
    for i, line in enumerate(lines, 1):
        match = re.match(pattern1, line)
        if match:
            method_name = match.group(1)
            methods[method_name] = {
                'name': method_name,
                'line': i,
                'type': 'standard',
                'content': line.strip()
            }
    
    # ========================================
    # STRATEGY 2: Arrow function assignments
    # ========================================
    pattern2 = r'^\s{2}(const|let|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*\([^)]*\)\s*=>'
    for i, line in enumerate(lines, 1):
        match = re.match(pattern2, line)
        if match:
            method_name = match.group(2)
            if method_name not in methods:
                methods[method_name] = {
                    'name': method_name,
                    'line': i,
                    'type': 'arrow',
                    'content': line.strip()
                }
    
    # ========================================
    # STRATEGY 3: Function expressions
    # ========================================
    pattern3 = r'^\s{2}(const|let|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*function\s*\([^)]*\)'
    for i, line in enumerate(lines, 1):
        match = re.match(pattern3, line)
        if match:
            method_name = match.group(2)
            if method_name not in methods:
                methods[method_name] = {
                    'name': method_name,
                    'line': i,
                    'type': 'function_expr',
                    'content': line.strip()
                }
    
    # ========================================
    # STRATEGY 4: Async methods
    # ========================================
    pattern4 = r'^\s{2}async\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)\s*\{'
    for i, line in enumerate(lines, 1):
        match = re.match(pattern4, line)
        if match:
            method_name = match.group(1)
            if method_name not in methods:
                methods[method_name] = {
                    'name': method_name,
                    'line': i,
                    'type': 'async',
                    'content': line.strip()
                }
    
    # ========================================
    # STRATEGY 5: Getter/Setter methods
    # ========================================
    pattern5 = r'^\s{2}(get|set)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)\s*\{'
    for i, line in enumerate(lines, 1):
        match = re.match(pattern5, line)
        if match:
            method_name = f"{match.group(1)}_{match.group(2)}"
            if method_name not in methods:
                methods[method_name] = {
                    'name': method_name,
                    'line': i,
                    'type': 'getter_setter',
                    'content': line.strip()
                }
    
    return methods

def categorize_methods_advanced(methods):
    """Advanced categorization with edge case handling"""
    categories = {
        'Lifecycle': [],
        'Settings': [],
        'Message Identification': [],
        'Message Validation': [],
        'Crit Detection & Rolling': [],
        'Crit Styling & Application': [],
        'Crit Removal & Cleanup': [],
        'History Management': [],
        'Channel Management': [],
        'DOM Queries & Selectors': [],
        'React Fiber Utilities': [],
        'Caching & Performance': [],
        'Throttling & Rate Limiting': [],
        'Stats & Tracking': [],
        'Animation & Visual Effects': [],
        'Particle Effects': [],
        'Screen Effects': [],
        'Combo System': [],
        'CSS Injection': [],
        'Observers & Listeners': [],
        'User Identification': [],
        'Utilities & Helpers': [],
        'Hash Functions': [],
        'Validation': [],
        'Edge Case Handlers': [],
        'Uncategorized': []
    }
    
    # Comprehensive categorization rules
    for method_name, method_data in methods.items():
        name_lower = method_name.lower()
        
        # Lifecycle
        if method_name in ['start', 'stop', 'constructor', 'getName', 'getAuthor', 'getVersion', 'getDescription']:
            categories['Lifecycle'].append(method_data)
        
        # Settings
        elif any(x in name_lower for x in ['settings', 'loadsettings', 'savesettings', 'getsettingspanel']):
            categories['Settings'].append(method_data)
        
        # Message Identification
        elif any(x in name_lower for x in ['getmessageid', 'getmessageidentifier', 'extractmessageid', 'extractdiscordid']):
            categories['Message Identification'].append(method_data)
        
        # Message Validation
        elif any(x in name_lower for x in ['isvalidmessage', 'shouldfilter', 'isreply', 'issystem', 'isbot', 'isempty', 'isnewlyadded']):
            categories['Message Validation'].append(method_data)
        
        # Crit Detection
        elif any(x in name_lower for x in ['iscrit', 'shouldcrit', 'rollcrit', 'checkcrit', 'checkforcrit', 'testcrit', 'geteffectivecritchance']):
            categories['Crit Detection & Rolling'].append(method_data)
        
        # Crit Styling (Application)
        elif any(x in name_lower for x in ['applycrit', 'restorecrit', 'updatecrit', 'handlecritical']) and 'remove' not in name_lower:
            categories['Crit Styling & Application'].append(method_data)
        
        # Crit Removal
        elif any(x in name_lower for x in ['removecrit', 'removeallcrits', 'cleanupcrit']):
            categories['Crit Removal & Cleanup'].append(method_data)
        
        # History
        elif any(x in name_lower for x in ['history', 'savehistory', 'loadhistory', 'addtohistory', 'gethistory', 'cleanuphistory']):
            categories['History Management'].append(method_data)
        
        # Channel
        elif any(x in name_lower for x in ['channel', 'getchannelid', 'restorechannel', 'setupchannel']):
            categories['Channel Management'].append(method_data)
        
        # DOM Queries
        elif any(x in name_lower for x in ['getall', 'find', 'query', 'getelement', 'getcontainer', 'getmessagearea']):
            categories['DOM Queries & Selectors'].append(method_data)
        
        # React Fiber
        elif any(x in name_lower for x in ['fiber', 'react', 'traverse', 'getreact']):
            categories['React Fiber Utilities'].append(method_data)
        
        # Caching
        elif any(x in name_lower for x in ['cache', 'cached', 'getcached']):
            categories['Caching & Performance'].append(method_data)
        
        # Throttling
        elif any(x in name_lower for x in ['throttle', 'debounce', 'ratelimit']):
            categories['Throttling & Rate Limiting'].append(method_data)
        
        # Stats
        elif any(x in name_lower for x in ['stats', 'getstats', 'updatestats']):
            categories['Stats & Tracking'].append(method_data)
        
        # Animation
        elif any(x in name_lower for x in ['animation', 'animate', 'showanimation', 'fadeout']):
            categories['Animation & Visual Effects'].append(method_data)
        
        # Particles
        elif any(x in name_lower for x in ['particle', 'createparticle']):
            categories['Particle Effects'].append(method_data)
        
        # Screen effects
        elif any(x in name_lower for x in ['shake', 'screen']):
            categories['Screen Effects'].append(method_data)
        
        # Combo
        elif any(x in name_lower for x in ['combo', 'getusercombo', 'updatecombo']):
            categories['Combo System'].append(method_data)
        
        # CSS Injection
        elif any(x in name_lower for x in ['injectcss', 'inject']):
            categories['CSS Injection'].append(method_data)
        
        # Observers
        elif any(x in name_lower for x in ['observer', 'observe', 'listener', 'setup', 'start']) and 'start' not in method_name:
            categories['Observers & Listeners'].append(method_data)
        
        # User ID
        elif any(x in name_lower for x in ['getuserid', 'getauthorid', 'getcurrentuser', 'isownmessage']):
            categories['User Identification'].append(method_data)
        
        # Hash
        elif any(x in name_lower for x in ['hash', 'createhash', 'getcontent']):
            categories['Hash Functions'].append(method_data)
        
        # Validation
        elif any(x in name_lower for x in ['isvalid', 'isvaliddiscordid', 'isinheader']):
            categories['Validation'].append(method_data)
        
        # Edge cases
        elif any(x in name_lower for x in ['mark', 'ismarked', 'isduplicate', 'check', 'schedule']):
            categories['Edge Case Handlers'].append(method_data)
        
        # Utilities
        elif any(x in name_lower for x in ['create', 'generate', 'format', 'parse', 'get']):
            categories['Utilities & Helpers'].append(method_data)
        
        # Debug (skip - Section 4)
        elif method_name in ['debugLog', 'debugError']:
            continue
        
        else:
            categories['Uncategorized'].append(method_data)
    
    return categories

def compare_with_previous_analysis(current_methods):
    """Compare with previous analysis to find missed methods"""
    # Methods from first analysis
    previous_methods = {
        'loadSettings', 'saveSettings', 'applyCritStyleWithSettings', 'injectSettingsCSS', 'getSettingsPanel',
        'getMessageIdentifier', 'getMessageId',
        'applyCritStyle', 'updateCritChance', 'updateCritColor', 'updateCritFont', 'updateCritAnimation',
        'updateCritGradient', 'updateCritGlow',
        'saveMessageHistory', 'loadMessageHistory', 'addToHistory', 'getChannelHistory', 'getCritHistory',
        'cleanupProcessedMessages', 'startPeriodicCleanup', 'cleanupOldHistory', 'isMessageInHistory', 'scheduleCleanup',
        'getCurrentChannelId', 'restoreChannelCrits', 'setupChannelChangeListener',
        'findMessageContentElement', 'isElementValidForAnimation', 'getElementPosition', 'findElementByPosition',
        'findCritElementByPosition', 'createAnimationElement', 'getAnimationContainer',
        'getReactFiber', 'traverseFiber',
        'getCachedMessages',
        'updateStats', 'getStats', 'updateExistingCrits', 'updateUserCombo',
        'createParticleBurst', 'addToAnimatedMessages', 'showAnimation', 'fadeOutExistingAnimations',
        'getUserCombo', 'applyScreenShake', 'injectAnimationCSS',
        'createContentHash', 'getContentHash', 'simpleHash',
        'isValidDiscordId', 'extractDiscordId', 'isInHeaderArea', 'getAuthorId', 'markAsProcessed',
        'startObserving', 'processNode', 'isNewlyAdded', 'shouldFilterMessage', 'isReplyMessage',
        'isSystemMessage', 'isBotMessage', 'isEmptyMessage', 'checkForRestoration', 'checkExistingMessages',
        'checkForCrit', 'injectCritCSS', 'onCritHit', 'removeAllCrits', 'getEffectiveCritChance',
        'testCrit', 'getCurrentUserId', 'isOwnMessage', 'getUserId', 'getMessageTimestamp',
        'handleCriticalHit', 'markMessageAsRemoved', 'isDuplicateByPosition', 'hasDuplicateInDOM',
        'getMessageAreaPosition'
    }
    
    current_method_names = set(current_methods.keys())
    
    # Find new methods (in current but not in previous)
    new_methods = current_method_names - previous_methods
    
    # Find missed methods (in previous but not in current)
    missed_methods = previous_methods - current_method_names
    
    return new_methods, missed_methods

def generate_comprehensive_report(methods, categories):
    """Generate comprehensive report"""
    print("\n" + "="*80)
    print("DEEP ANALYSIS: ALL HELPER METHODS (INCLUDING EDGE CASES)")
    print("="*80 + "\n")
    
    print(f"📊 TOTAL METHODS FOUND: {len(methods)}\n")
    
    # Group by type
    by_type = defaultdict(list)
    for method in methods.values():
        by_type[method['type']].append(method)
    
    print("BY DETECTION TYPE:")
    for method_type, method_list in sorted(by_type.items()):
        print(f"  {method_type:20s}: {len(method_list):3d} methods")
    
    print("\n" + "="*80)
    print("CATEGORIZED METHODS")
    print("="*80 + "\n")
    
    total_categorized = 0
    for category, method_list in categories.items():
        if not method_list:
            continue
        
        print(f"\n{'─'*80}")
        print(f"  {category.upper()} ({len(method_list)} methods)")
        print(f"{'─'*80}")
        
        for method in sorted(method_list, key=lambda x: x['line']):
            print(f"  • {method['name']:40s} Line {method['line']:5d}  [{method['type']}]")
        
        total_categorized += len(method_list)
    
    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)
    print(f"Total methods found: {len(methods)}")
    print(f"Total categorized: {total_categorized}")
    print(f"Categorization rate: {(total_categorized/len(methods)*100):.1f}%")

def main():
    plugin_path = Path(__file__).parent.parent / "plugins" / "CriticalHit.plugin.js"
    
    print(f"Analyzing: {plugin_path}")
    print(f"File size: {plugin_path.stat().st_size // 1024}KB")
    
    # Find ALL methods
    methods = find_all_methods_comprehensive(plugin_path)
    
    # Categorize
    categories = categorize_methods_advanced(methods)
    
    # Compare with previous
    new_methods, missed_methods = compare_with_previous_analysis(methods)
    
    # Generate report
    generate_comprehensive_report(methods, categories)
    
    # Comparison report
    print("\n" + "="*80)
    print("COMPARISON WITH PREVIOUS ANALYSIS")
    print("="*80)
    print(f"\n✅ NEW methods found (not in previous analysis): {len(new_methods)}")
    if new_methods:
        for method in sorted(new_methods):
            print(f"  + {method}")
    
    print(f"\n⚠️  MISSED methods (in previous, not found now): {len(missed_methods)}")
    if missed_methods:
        for method in sorted(missed_methods):
            print(f"  - {method}")
    
    print("\n" + "="*80)
    print("✅ DEEP ANALYSIS COMPLETE!")
    print("="*80)
    print(f"\nTotal methods: {len(methods)}")
    print(f"New discoveries: {len(new_methods)}")
    print(f"Verification needed: {len(missed_methods)}")

if __name__ == "__main__":
    main()

