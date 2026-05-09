# Code Section Markers Example

## How to Mark Sections for Moving

Wrap code sections you want to move with special comments:

```javascript
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

## Example: Moving Lifecycle Methods

**Before (in Section 3):**

```javascript
  // ============================================================================
  // BETTERDISCORD PLUGIN LIFECYCLE METHODS
  // ============================================================================

  // MOVE START: lifecycle_methods
  /**
   * BetterDiscord plugin start method
   */
  start() {
    // ... implementation ...
  }

  /**
   * BetterDiscord plugin stop method
   */
  stop() {
    // ... implementation ...
  }
  // MOVE END: lifecycle_methods
```

**After moving to end of Section 3:**

```javascript
  // ============================================================================
  // BETTERDISCORD PLUGIN LIFECYCLE METHODS
  // ============================================================================
  // (Moved to end of Section 3)

  // ... other code ...

  // ============================================================================
  // BETTERDISCORD PLUGIN LIFECYCLE METHODS
  // ============================================================================
  /**
   * BetterDiscord plugin start method
   */
  start() {
    // ... implementation ...
  }

  /**
   * BetterDiscord plugin stop method
   */
  stop() {
    // ... implementation ...
  }
```

## Example: Moving Settings Management

**Mark the section:**

```javascript
  // ============================================================================
  // SETTINGS MANAGEMENT
  // ============================================================================

  // MOVE START: settings_management
  /**
   * Loads settings from BetterDiscord storage
   */
  loadSettings() {
    // ... implementation ...
  }

  /**
   * Saves settings to BetterDiscord storage
   */
  saveSettings() {
    // ... implementation ...
  }
  // MOVE END: settings_management
```

## Running the Reorganizer

```bash
# Dry run (see what would happen)
python reorganize_code.py CriticalHit.plugin.js output.js --dry-run

# Actually reorganize
python reorganize_code.py CriticalHit.plugin.js output.js --config reorganize_criticalhit.json

# Or manually specify moves in the script
```

## Notes

- Section names must match between START and END markers
- Markers are case-insensitive
- The script preserves all code between markers
- Original markers are removed after moving
- You can move multiple sections in one run
