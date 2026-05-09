# HP/Mana Regeneration Scaling

## Formula Changes

### Old Formula (v4.0.1 and earlier)
- **HP Regen**: `(vitality / 100) * 1% of max HP per second`
- **Mana Regen**: `(intelligence / 100) * 1% of max mana per second`

**Problem**: Too slow at lower levels, not noticeable

### New Formula (v4.0.2+)
- **Base**: 0.5% of max per second (minimum)
- **Stat Scaling**: `(stat / 50) * 0.5%` additional (1% per 100 stat points)
- **Level Scaling**: `(level / 10) * 0.2%` additional

**Total Rate** = `0.5% + (stat/50 * 0.5%) + (level/10 * 0.2%)`

## Example Regeneration Rates

### Low Level (Level 20, 100 Vitality, 2,000 Max HP)
- Base: 0.5% = **10 HP/sec**
- Stat: (100/50) * 0.5% = 1% = **20 HP/sec**
- Level: (20/10) * 0.2% = 0.4% = **8 HP/sec**
- **Total: 38 HP/sec (1.9% rate)**

Time to heal from 50% → 100%: ~26 seconds ✅ **Noticeable!**

### Mid Level (Level 50, 300 Vitality, 5,000 Max HP)
- Base: 0.5% = **25 HP/sec**
- Stat: (300/50) * 0.5% = 3% = **150 HP/sec**
- Level: (50/10) * 0.2% = 1% = **50 HP/sec**
- **Total: 225 HP/sec (4.5% rate)**

Time to heal from 50% → 100%: ~11 seconds ✅ **Fast recovery!**

### High Level (Level 100, 500 Vitality, 10,000 Max HP)
- Base: 0.5% = **50 HP/sec**
- Stat: (500/50) * 0.5% = 5% = **500 HP/sec**
- Level: (100/10) * 0.2% = 2% = **200 HP/sec**
- **Total: 750 HP/sec (7.5% rate)**

Time to heal from 50% → 100%: ~7 seconds ✅ **Very fast!**

### Shadow Monarch (Level 200, 1000 Vitality, 25,000 Max HP)
- Base: 0.5% = **125 HP/sec**
- Stat: (1000/50) * 0.5% = 10% = **2,500 HP/sec**
- Level: (200/10) * 0.2% = 4% = **1,000 HP/sec**
- **Total: 3,625 HP/sec (14.5% rate)**

Time to heal from 50% → 100%: ~3.5 seconds ✅ **Insane recovery!**

## Mana Regeneration

Mana uses the exact same formula but scales with **Intelligence** instead of Vitality:

### Example: Level 100, 600 Intelligence, 12,000 Max Mana
- Base: 0.5% = **60 Mana/sec**
- Stat: (600/50) * 0.5% = 6% = **720 Mana/sec**
- Level: (100/10) * 0.2% = 2% = **240 Mana/sec**
- **Total: 1,020 Mana/sec (8.5% rate)**

Perfect for shadow resurrection spam! 💀⚡

## Key Benefits

1. **✅ Always Noticeable**: Minimum 0.5% base regen ensures you always see progress
2. **✅ Scales with Power**: Higher stats = faster regeneration
3. **✅ Level Rewards**: Each level gives a small regeneration boost
4. **✅ Combat Ready**: Fast enough to recover between dungeon fights
5. **✅ Balanced**: Not instant healing, but fast enough to matter

## Debug Logging

When you reload the plugin, you'll see:
```
[Dungeons] ⏰ Starting HP/Mana regeneration interval (every 1 second)
[Dungeons] 🔄 Regeneration system active { level, vitality, intelligence, currentHP, maxHP, currentMana, maxMana }
[Dungeons] ❤️ HP Regen: +750/sec (7.50% rate) | 5000 → 5750 / 10000
[Dungeons] 💙 Mana Regen: +1020/sec (8.50% rate) | 3000 → 4020 / 12000
```

The first 3 HP and 3 Mana regeneration ticks will be logged so you can verify it's working!

## Changelog

**v4.0.2** (2025-12-04)
- ✅ Fixed multiplied regeneration from multiple dungeons
- ✅ Enhanced regeneration formula with level and stat scaling
- ✅ Added debug logging for regeneration system
- ✅ Improved regeneration rates to be noticeable at all levels
- ✅ Time to full heal: 3-26 seconds depending on level/stats
