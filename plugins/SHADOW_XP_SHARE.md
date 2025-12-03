# Shadow XP Share System

## Overview
All shadows in your army now gain XP when YOU gain XP! This creates a passive progression system where your entire army grows stronger as you progress.

---

## How It Works

### Core Concept
When you gain XP from any activity, ALL shadows in your army receive a bonus percentage of that XP.

**Important:** User XP is NOT split! Shadows get BONUS XP on top of your normal gains.

---

## Share Rates by Source

| Source | Share Rate | Example |
|--------|------------|---------|
| **Messages** | 5% | You: +100 XP → Each shadow: +5 XP |
| **Quests** | 10% | You: +5,000 XP → Each shadow: +500 XP |
| **Achievements** | 15% | You: +10,000 XP → Each shadow: +1,500 XP |
| **Dungeons** | 20% | You: +20,000 XP → Each shadow: +4,000 XP |
| **Milestones** | 25% | You: +50,000 XP → Each shadow: +12,500 XP |

---

## Current Implementation Status

### ✅ **Implemented:**
1. **Message XP Share** (5%)
   - Every message you send grants shadows 5% of your XP
   - Passive growth through normal Discord activity
   
2. **Quest XP Share** (10%)
   - Daily quest completion grants shadows 10% of reward XP
   - Encourages quest completion
   - Higher rate than messages (quests are more meaningful)

### 🔜 **Future Implementation:**
3. **Achievement XP Share** (15%)
   - Currently, achievements don't grant user XP
   - When implemented, will share 15%

4. **Dungeon XP Share** (20%)
   - Currently, dungeons only grant shadow army XP
   - When user XP from dungeons is implemented, will share 20%

5. **Milestone XP Share** (25%)
   - Special events (level milestones, rank promotions)
   - Highest share rate for major achievements

---

## Example Scenarios

### Scenario 1: Message Activity
```
User sends a quality message:
- User gains: 250 XP
- Each shadow gains: 12 XP (5% of 250)
- 300 shadows total: 3,600 XP distributed
- User keeps full 250 XP!
```

### Scenario 2: Daily Quest Completion
```
User completes "Message Master" quest:
- User gains: 5,000 XP
- Each shadow gains: 500 XP (10% of 5,000)
- 300 shadows total: 150,000 XP distributed
- User keeps full 5,000 XP!
```

### Scenario 3: Mixed Activity (One Day)
```
Activities:
- 100 messages: ~15,000 user XP → 750 shadow XP each
- 5 quests: ~25,000 user XP → 2,500 shadow XP each
- Total per shadow: 3,250 XP
- Total to army (300 shadows): 975,000 XP!
- User total: 40,000 XP (kept 100%)
```

---

## Smart Notifications

### When Shadows Gain XP:
- **Silent:** Normal XP gains (no spam)
- **Summary:** Shows progress when shadows level/rank up
- **Notification Example:**
  ```
  Shadow Army Growth
  300 shadows gained 500 XP
  15 shadow(s) leveled up
  3 shadow(s) ranked up
  ```

---

## Benefits

### 1. **Passive Progression** ✅
- All shadows grow, not just active dungeon shadows
- Even benched shadows benefit from your activities

### 2. **No XP Loss** ✅
- User keeps 100% of XP
- Shadows get BONUS XP on top
- Win-win system

### 3. **Activity Diversity** ✅
- Different activities = different share rates
- Quests more rewarding than messages
- Encourages varied gameplay

### 4. **Lore-Accurate** ✅
- Shadows linked to Shadow Monarch's power
- As you grow stronger, they grow stronger
- Just like Sung Jin-Woo in Solo Leveling

### 5. **Army-Wide Growth** ✅
- No need to manually level each shadow
- Entire army progresses together
- New shadows catch up faster

---

## Technical Implementation

### Method: `shareShadowXP(userXP, source)`

**Location:** `SoloLevelingStats.plugin.js`

**Parameters:**
- `userXP` (number): Amount of XP user gained
- `source` (string): Source of XP (message, quest, achievement, dungeon, milestone)

**Process:**
1. Get ShadowArmy plugin instance
2. Calculate share percentage based on source
3. Calculate shadow XP gain: `userXP * sharePercentage`
4. Get all shadows from army
5. Grant XP to each shadow
6. Track level-ups and rank-ups
7. Show summary notification if significant progress

**Code:**
```javascript
async shareShadowXP(userXP, source = 'message') {
  const shareRates = {
    message: 0.05,    // 5%
    quest: 0.10,      // 10%
    achievement: 0.15, // 15%
    dungeon: 0.20,    // 20%
    milestone: 0.25,  // 25%
  };
  
  const sharePercentage = shareRates[source] || 0.05;
  const shadowXPGain = Math.floor(userXP * sharePercentage);
  
  // Grant to all shadows
  const shadows = await shadowArmy.getAllShadows();
  for (const shadow of shadows) {
    await shadowArmy.grantShadowXP(shadow.id, shadowXPGain, false, false);
  }
}
```

### Integration Points:

1. **Messages:** `awardXP()` method
   - After user XP is granted
   - Calls: `this.shareShadowXP(xp, 'message')`

2. **Quests:** `completeQuest()` method
   - After quest XP is granted
   - Calls: `this.shareShadowXP(xpReward, 'quest')`

3. **Future:** Achievements, dungeons, milestones
   - Similar integration points
   - Higher share percentages

---

## Performance Considerations

### Asynchronous Processing:
- Shadow XP sharing is async
- Doesn't block UI or user XP gain
- Processes in background

### Batch Notifications:
- Individual shadow gains are silent
- Only shows summary when significant progress
- Prevents notification spam

### Error Handling:
- If ShadowArmy plugin not loaded, silently skips
- Errors logged but don't interrupt user XP gain
- Graceful degradation

---

## Configuration

### Current Settings:
```javascript
const shareRates = {
  message: 0.05,     // 5% from messages
  quest: 0.10,       // 10% from quests
  achievement: 0.15, // 15% from achievements (future)
  dungeon: 0.20,     // 20% from dungeons (future)
  milestone: 0.25,   // 25% from milestones (future)
};
```

### Customization:
To adjust share rates, edit the `shareRates` object in `shareShadowXP()` method.

**Recommended ranges:**
- Passive activities (messages): 3-10%
- Active activities (quests): 8-15%
- Major events (achievements): 12-20%
- Combat (dungeons): 15-25%
- Milestones: 20-30%

---

## Future Enhancements

### Planned:
1. **User XP from Dungeons**
   - Grant user XP for dungeon completion
   - Share 20% with shadow army

2. **Achievement XP Rewards**
   - Grant user XP for achievements
   - Share 15% with shadow army

3. **Milestone Bonuses**
   - Special XP bonuses at milestones
   - Share 25% with shadow army

4. **Configurable Share Rates**
   - User settings to adjust percentages
   - Per-source customization

5. **Shadow XP Multipliers**
   - Bonus rates for favorite shadows
   - Bonus rates for generals
   - Skill tree bonuses for shadow XP

---

## FAQ

### Q: Does this reduce my XP?
**A:** No! You keep 100% of your XP. Shadows get BONUS XP on top.

### Q: Do all shadows gain XP or just active ones?
**A:** ALL shadows gain XP, even benched/resting shadows.

### Q: What if I have 1000+ shadows?
**A:** System handles any number. XP per shadow is calculated, not total XP pool.

### Q: Can I disable this?
**A:** Currently, always active. Future update may add toggle.

### Q: Do shadows level up automatically?
**A:** Yes! Shadows auto-level and auto-rank-up when they gain enough XP.

### Q: What happens if ShadowArmy plugin is disabled?
**A:** Share system silently skips. Your XP gain is unaffected.

---

## Changelog

### v1.0.0 (2025-12-03)
- ✅ Implemented Shadow XP Share system
- ✅ Message XP sharing (5%)
- ✅ Quest XP sharing (10%)
- ✅ Smart summary notifications
- ✅ Asynchronous processing
- ✅ Error handling and graceful degradation

### Future Versions:
- 🔜 Achievement XP sharing (15%)
- 🔜 Dungeon XP sharing (20%)
- 🔜 Milestone XP sharing (25%)
- 🔜 User configuration options
- 🔜 Shadow XP multipliers

---

**Your shadows grow with you! Keep grinding to build the ultimate shadow army!** 👑⚔️✨

