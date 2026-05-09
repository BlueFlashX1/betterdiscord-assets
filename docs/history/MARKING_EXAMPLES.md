# How to Mark Sections in CriticalHit.plugin.js

## Example 1: Mark Lifecycle Methods (to move to end of Section 3)

**Find this section (around line 8476):**

```javascript
  // ============================================================================
  // BETTERDISCORD PLUGIN LIFECYCLE METHODS
  // ============================================================================
  // Required by BetterDiscord: start() and stop() methods
  // ============================================================================

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
```

**Add markers like this:**

```javascript
  // ============================================================================
  // BETTERDISCORD PLUGIN LIFECYCLE METHODS
  // ============================================================================
  // Required by BetterDiscord: start() and stop() methods
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

## Example 2: Mark Settings Management (to move to Section 3)

**Find this section (around line 8658):**

```javascript
  // ============================================================================
  // SETTINGS MANAGEMENT
  // ============================================================================

  /**
   * Loads settings from BetterDiscord storage
   */
  loadSettings() {
    // ... code ...
  }

  /**
   * Saves settings to BetterDiscord storage
   */
  saveSettings() {
    // ... code ...
  }
```

**Add markers like this:**

```javascript
  // ============================================================================
  // SETTINGS MANAGEMENT
  // ============================================================================

  // MOVE START: settings_management
  /**
   * Loads settings from BetterDiscord storage
   */
  loadSettings() {
    // ... code ...
  }

  /**
   * Saves settings to BetterDiscord storage
   */
  saveSettings() {
    // ... code ...
  }
  // MOVE END: settings_management
```

## Example 3: Mark Settings Panel Listeners (to move to Section 3)

**Find this section (around line 8830):**

```javascript
  // ============================================================================
  // SETTINGS PANEL EVENT LISTENERS
  // ============================================================================

  /**
   * Attaches event listeners for basic settings
   */
  attachBasicSettingsListeners(container) {
    // ... code ...
  }

  // ... more listener functions ...
```

**Add markers like this:**

```javascript
  // ============================================================================
  // SETTINGS PANEL EVENT LISTENERS
  // ============================================================================

  // MOVE START: settings_panel_listeners
  /**
   * Attaches event listeners for basic settings
   */
  attachBasicSettingsListeners(container) {
    // ... code ...
  }

  // ... more listener functions ...
  // MOVE END: settings_panel_listeners
```

## Usage

1. **Mark all sections** you want to move with `// MOVE START: name` and `// MOVE END: name`

2. **Test with dry run:**

   ```bash
   cd betterdiscord-dev/scripts
   python reorganize_code.py ../plugins/CriticalHit.plugin.js ../plugins/CriticalHit.plugin.js.reorganized --dry-run
   ```

3. **Actually reorganize:**

   ```bash
   python reorganize_code.py ../plugins/CriticalHit.plugin.js ../plugins/CriticalHit.plugin.js.reorganized --config reorganize_criticalhit.json
   ```

4. **Review the output file**, then replace original if satisfied:
   ```bash
   mv CriticalHit.plugin.js.reorganized CriticalHit.plugin.js
   ```

## Important Notes

- **Section names must match** between START and END
- **Markers are removed** after moving (clean code)
- **All code between markers** is preserved exactly
- **You can mark multiple sections** and move them all at once
- **Always test with --dry-run first!**
