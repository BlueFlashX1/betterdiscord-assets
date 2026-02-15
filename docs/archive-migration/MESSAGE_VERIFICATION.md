# Message Detection Verification Guide

## How to Verify Messages Are Being Registered for XP

### Quick Verification Steps

1. **Open Discord Console:**
   - Press `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Option+I` (macOS)
   - Go to "Console" tab

2. **Run Verification Command:**
   ```javascript
   BdApi.Plugins.get('SoloLevelingStats').instance.verifyMessageDetection()
   ```

3. **Check the Output:**
   - Plugin Enabled: Should be `true`
   - Message Observer Active: Should be `true`
   - Input Handler Active: Should be `true`
   - Input Monitoring Active: Should be `true`

4. **Send a Test Message:**
   - Type a message in Discord and press Enter
   - Check if XP increases in the chat UI panel
   - Check console for `PROCESS_MESSAGE` logs

### Enable Debug Mode for Detailed Logs

1. Open Discord Settings → BetterDiscord → Plugins
2. Click on SoloLevelingStats plugin
3. Enable "Debug Mode" or set `debug.enabled` to `true`
4. Send a message and check console for detailed logs

### What to Look For

**Successful Message Detection:**
- Console shows: `[PROCESS_MESSAGE] Processing message`
- Console shows: `[AWARD_XP] XP calculated`
- XP increases in chat UI
- Messages Sent counter increases
- Characters Typed counter increases

**If Messages Are NOT Being Detected:**

1. **Check Plugin Status:**
   ```javascript
   const plugin = BdApi.Plugins.get('SoloLevelingStats');
   console.log('Plugin found:', !!plugin);
   console.log('Plugin enabled:', plugin?.instance?.settings?.enabled);
   ```

2. **Check Message Observer:**
   ```javascript
   const instance = BdApi.Plugins.get('SoloLevelingStats').instance;
   console.log('Observer active:', !!instance.messageObserver);
   console.log('Input handler active:', !!instance.messageInputHandler);
   ```

3. **Manually Trigger Detection (for testing):**
   ```javascript
   const instance = BdApi.Plugins.get('SoloLevelingStats').instance;
   instance.processMessageSent('test message');
   ```

### Common Issues

**Issue: Messages not detected**
- **Solution:** Reload Discord (Ctrl+R / Cmd+R)
- **Solution:** Disable and re-enable the plugin
- **Solution:** Check if BetterDiscord is properly installed

**Issue: XP not increasing**
- **Solution:** Check if plugin is enabled
- **Solution:** Check console for errors
- **Solution:** Verify message is not empty or system message

**Issue: Duplicate XP**
- **Solution:** This is prevented by duplicate detection
- **Solution:** Check `processedMessageIds` size in verification output

### Message Detection Methods

The plugin uses **two methods** to detect messages:

1. **Primary Method (Most Reliable):** Input monitoring
   - Detects when Enter key is pressed in message input
   - Captures message text before it's sent
   - Most accurate method

2. **Fallback Method:** MutationObserver
   - Watches for new messages appearing in chat
   - Verifies message belongs to current user
   - Used as backup if input monitoring fails

### Expected Behavior

- **Every message you send** should:
  - Increase XP (base 10 + bonuses)
  - Update Messages Sent counter
  - Update Characters Typed counter
  - Update daily quest progress
  - Trigger achievement checks
  - Save data immediately

- **Messages that DON'T count:**
  - Empty messages
  - System messages (joins, leaves, etc.)
  - Messages over 2000 characters (Discord limit)
  - Duplicate messages (within 2 seconds)

### Testing Checklist

- [ ] Plugin is enabled
- [ ] Debug mode is enabled (for detailed logs)
- [ ] Message Observer is active
- [ ] Input Handler is active
- [ ] Send a test message
- [ ] XP increases
- [ ] Console shows PROCESS_MESSAGE log
- [ ] Console shows AWARD_XP log
- [ ] No errors in console
