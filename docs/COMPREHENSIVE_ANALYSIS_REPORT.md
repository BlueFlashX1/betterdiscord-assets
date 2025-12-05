# SoloLevelingStats Comprehensive Analysis Report

## File Statistics

### SYNTAX_ISSUES
- var_declarations: 0
- double_equals: 0
- console_logs: 0
- todo_comments: 0
- fixme_comments: 0
- empty_functions: 0
- long_functions: 8
- deep_nesting: 0

### SECTIONS
- section_1: 114
- section_2: 120
- section_3: 2142
- section_4: 330
- constructor: 126

### FUNCTIONS
- total: 98
- unique: 98
- duplicates: {}

### CODE_QUALITY
- total_lines: 8162
- code_lines: 6313
- comment_lines: 957
- blank_lines: 892
- max_line_length: 285
- long_lines: 34
- if_else_chains: 52
- for_loops: 22
- while_loops: 2
- forEach_calls: 19
- querySelector_calls: 94
- setTimeout_calls: 24
- setInterval_calls: 6

### DEPENDENCIES
- BdApi: 18
- ShadowArmy: 11
- Dungeons: 1
- CriticalHit: 23
- IndexedDB: 0
- localStorage: 0
- document: 59
- window: 15

### PERFORMANCE
- dom_cache_usage: 20
- throttle_usage: 3
- debounce_usage: 1
- lookup_map_usage: 6
- if_else_chains_3plus: 0
- nested_loops: 0

### UNUSED
- set()

## Issues Found

## Warnings

### LONG_FUNCTIONS
- Line 126: constructor() is 202 lines (consider breaking down)
- Line 1273: startObserving() is 421 lines (consider breaking down)
- Line 2681: injectSettingsCSS() is 514 lines (consider breaking down)
- Line 3763: awardXP() is 339 lines (consider breaking down)
- Line 4165: resetLevelTo() is 265 lines (consider breaking down)
- Line 5476: getAchievementDefinitions() is 791 lines (consider breaking down)
- Line 7096: updateChatUI() is 273 lines (consider breaking down)
- Line 7370: injectChatUICSS() is 791 lines (consider breaking down)

### PERFORMANCE
- High querySelector count (94) - consider DOM caching

### STYLE
- Many for loops (22) - consider functional methods

