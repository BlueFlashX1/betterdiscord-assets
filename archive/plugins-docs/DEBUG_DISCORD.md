# How to Check Discord Console for Errors

## For Discord Desktop App (macOS)

### Method 1: Keyboard Shortcut (Easiest)
1. Open Discord desktop app
2. Press **`Cmd + Option + I`** (Mac) or **`Ctrl + Shift + I`** (Windows/Linux)
3. This opens Developer Tools (same as Chrome DevTools)
4. Click the **"Console"** tab
5. Look for messages starting with `[SoloLevelingStats]` or `SoloLevelingStats:`

### Method 2: Menu Bar
1. Open Discord desktop app
2. Go to **View** → **Toggle Developer Tools** (or **Developer** → **Toggle Developer Tools**)
3. Click the **"Console"** tab

### Method 3: BetterDiscord Console
1. Open Discord desktop app
2. Press **`Ctrl + \`** (Mac: `Cmd + \`) or check BetterDiscord settings for console shortcut
3. This opens BetterDiscord's console

### Method 4: Check Debug Log File (No Console Needed)
The debug log file is located at:
- **macOS**: `~/Library/Application Support/BetterDiscord/data/stable/debug.log`
- **Windows**: `%APPDATA%\BetterDiscord\data\stable\debug.log`

All `console.warn()` and `console.error()` messages appear here!

## What to Look For

### Good Signs (Plugin Working):
```
SoloLevelingStats: Started! Level X, Y XP
SoloLevelingStats: Processing message (X chars)
SoloLevelingStats: Loaded data - Level X, Y total XP
```

### Errors to Watch For:
```
SoloLevelingStats: Error loading settings
SoloLevelingStats: Error saving settings
SoloLevelingStats: Error processing message
```

### Debug Messages:
- If you see "Processing message" → Plugin is detecting messages
- If you DON'T see it → Message detection isn't working

## Testing Steps

1. Open Console (Cmd+Option+I)
2. Clear console (right-click → Clear console)
3. Send a test message in Discord
4. Watch for `SoloLevelingStats: Processing message` log
5. Check if XP increases in the chat UI

## If No Logs Appear

The message detection might not be working. We may need to:
- Use Discord's internal message events
- Try a different detection method
- Check if BetterDiscord is blocking the plugin
