#!/bin/bash
# Rebuild with PROPER structure

SOURCE="backups/solo-leveling-stats/SoloLevelingStats.plugin.BACKUP_v2.3.0_clean.js"
OUTPUT="plugins/SoloLevelingStats.plugin.PROPER.js"

echo "=== REBUILDING WITH CORRECT STRUCTURE ==="
echo ""

# 1. Header (lines 1-110)
echo "Step 1: Adding header..."
head -110 "$SOURCE" > "$OUTPUT"

# 2. Class declaration and Section 1
echo "Step 2: Adding class declaration and Section 1..."
cat >> "$OUTPUT" << 'SECTION1'

module.exports = class SoloLevelingStats {
  
  // ============================================================================
  // SECTION 1: IMPORTS & DEPENDENCIES
  // ============================================================================
  // Reserved for future external library imports
  // Currently all functionality is self-contained
  
  // ============================================================================
  // SECTION 2: CONFIGURATION & HELPERS
  // ============================================================================
  
  /**
   * 2.1 CONSTRUCTOR & DEFAULT SETTINGS
   */
SECTION1

# 3. Extract constructor (find line with "constructor() {" and extract until end of constructor)
echo "Step 3: Extracting constructor..."
sed -n '/^  constructor() {/,/^  }/p' "$SOURCE" | head -800 >> "$OUTPUT"

# 4. Add Section 4 (Debug functions)
echo "Step 4: Adding debug functions..."
cat >> "$OUTPUT" << 'SECTION4'

  // ============================================================================
  // SECTION 4: DEBUGGING & DEVELOPMENT (OFF BY DEFAULT)
  // ============================================================================
  
  /**
   * 4.1 DEBUG LOGGING
   */
SECTION4

sed -n '/^  debugLog(operation, message, data = null) {/,/^  }/p' "$SOURCE" >> "$OUTPUT"
echo "" >> "$OUTPUT"
sed -n '/^  debugError(operation, error, context = {}) {/,/^  }/p' "$SOURCE" >> "$OUTPUT"

# 5. Add rest of helpers and operations
echo "Step 5: Adding helpers and operations..."
sed -n '/^  \/\/ ============================================================================/,/^};$/p' "$SOURCE" | grep -v "constructor()" | grep -v "debugLog" | grep -v "debugError" >> "$OUTPUT"

echo ""
echo "✅ Rebuilt: $OUTPUT"
wc -l "$OUTPUT"
