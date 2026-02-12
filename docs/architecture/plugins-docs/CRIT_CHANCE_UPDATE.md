# Critical Hit Chance Update

**Date**: 2025-12-01  
**Version**: 1.1.0  
**Changes**: Updated default crit chance and buff cap

## Changes Made

### 1. Default Crit Chance
- **Before**: 10% base
- **After**: 6% base
- **Reason**: Better balance for group chats, prevents spam

### 2. Maximum Crit Chance Cap
- **Before**: 90% maximum (way too high, causes spam)
- **After**: 25% maximum (balanced, prevents spam even with all buffs)
- **Reason**: Even with Agility + Luck + Skill Tree bonuses, won't spam in active channels

## Impact Analysis

### Solo Chat
- **6% base**: ~1 crit every 17 messages
- **With buffs (up to 25%)**: ~1 crit every 4 messages (still reasonable)

### Small Group (3-5 people)
- **6% base**: ~1 crit every 3-4 messages
- **With buffs (up to 25%)**: ~1 crit every 1-2 messages (balanced, not spammy)

### Active Group (5-10 people)
- **6% base**: ~1 crit every 4-5 messages
- **With buffs (up to 25%)**: ~1 crit every 1-2 messages (noticeable but not overwhelming)

## Files Updated
- `CriticalHit.plugin.js`:
  - Default `critChance`: 10 → 6
  - Maximum cap: 90% → 25%
  - All comments and UI text updated
  - Settings panel updated

## Testing
- [ ] Plugin loads with new default (6%)
- [ ] Settings panel shows correct max (25%)
- [ ] Effective crit chance calculation works correctly
- [ ] Cap prevents going above 25% even with all buffs
- [ ] Group chat doesn't spam with crits
