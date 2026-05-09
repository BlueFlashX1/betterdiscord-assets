# Using // MOVE HERE Markers

## Overview

The `// MOVE HERE` marker allows you to specify exactly where a section should be moved to. This is more precise than `insert_after` or `insert_before`.

## How It Works

1. **Mark the section to move:**
   ```javascript
   // MOVE START: lifecycle_methods
   start() {
     // ... code ...
   }
   stop() {
     // ... code ...
   }
   // MOVE END: lifecycle_methods
   ```

2. **Mark where it should go:**
   ```javascript
   // ... other code ...

   // MOVE HERE: lifecycle_methods
   // (The section will be inserted here, replacing this marker)
   ```

3. **Run the script:**
   ```bash
   python reorganize_code.py input.js output.js --config config.json
   ```

## Example: Moving Lifecycle Methods

**Step 1: Mark the section to move (around line 8476):**
```javascript
  // ============================================================================
  // BETTERDISCORD PLUGIN LIFECYCLE METHODS
  // ============================================================================

  // MOVE START: lifecycle_methods
  /**
   * BetterDiscord plugin start method
   */
  start() {
    // ... code ...
  }

  /**
   * BetterDiscord plugin stop method
   */
  stop() {
    // ... code ...
  }
  // MOVE END: lifecycle_methods
```

**Step 2: Mark where it should go (e.g., at end of Section 3):**
```javascript
  // ... other code in Section 3 ...

  // MOVE HERE: lifecycle_methods
  // (Lifecycle methods will be inserted here)
```

**Step 3: Configure the move in JSON:**
```json
{
  "moves": [
    {
      "section": "lifecycle_methods",
      "move_here": "lifecycle_methods"
    }
  ]
}
```

**Result:** The lifecycle methods will be moved to the `// MOVE HERE: lifecycle_methods` location, and the marker will be replaced with the actual code.

## Benefits

- **Precise placement**: You control exactly where code goes
- **Visual markers**: Easy to see in your code where sections will move
- **No guessing**: No need to find line numbers or search for text
- **Clean output**: The `// MOVE HERE` marker is replaced with the actual code

## Priority Order

The script checks in this order:
1. `move_here` - Highest priority (most specific)
2. `insert_at_line` - Specific line number
3. `insert_after` - After a marker
4. `insert_before` - Before a marker
5. Default - Append to end

## Notes

- The `// MOVE HERE` marker is **replaced** with the section content
- Section names must match between `MOVE START/END` and `MOVE HERE`
- You can have multiple `MOVE HERE` markers for different sections
- The marker line is removed and replaced with the section
