# Perception Buff Range Analysis
**Date**: December 5, 2025  
**Current Range**: 1-5%

---

## 📊 Stat Value Comparison (1 Point)

### **Strength:**
```
1 point = +2% XP (up to 20 points)
1 point = +0.5% XP (after 20 points - diminishing)
```
**Effective Value:** +2% XP per point (early game)

---

### **Agility:**
```
1 point = +2% crit chance
Crit = 1.5x XP multiplier
Expected value = 2% * 0.5 = +1% average XP boost
```
**Effective Value:** ~+1% XP per point (on average)

---

### **Intelligence:**
```
1 point = +5% XP for long messages (up to 15 points)
1 point = +1% XP (after 15 points - diminishing)
```
**Effective Value:** +5% XP per point (long messages only)

---

### **Vitality:**
```
1 point = +5% quest rewards
Quest rewards = ~50-150 XP
```
**Effective Value:** +2.5-7.5 XP per quest (indirect)

---

### **Perception (Current: 1-5% to random stat):**
```
1 point = +1-5% to random stat
```
**Effective Value:** Varies by roll and target stat

---

## 🎲 Current Range Analysis (1-5%)

### **Outcomes:**

**Unlucky Roll (1-2%):**
```
+1.2% STR buff
Compared to direct STR allocation: +2%
Result: 60% as effective (BAD)
```

**Average Roll (2.5-3.5%):**
```
+3.0% STR buff
Compared to direct STR allocation: +2%
Result: 150% as effective (GOOD)
```

**Lucky Roll (4-5%):**
```
+4.8% AGI buff
Compared to direct AGI allocation: +2% crit (1% avg XP)
Result: 4.8x as effective (VERY GOOD!)
```

---

## ⚖️ Balance Evaluation

### **Current 1-5% Range:**

**Pros:**
- ✅ High variance (exciting, strategic)
- ✅ Average roll (~3%) beats direct STR allocation
- ✅ Bad rolls (1-2%) punish bad luck
- ✅ Prevents mindless Perception spam

**Cons:**
- ⚠️ Lucky rolls (4-5%) can be very strong
- ⚠️ 40% chance for bad rolls feels punishing
- ⚠️ Average expected value might be too low

---

## 💡 Alternative Ranges

### **Option A: 1-5% (Current) ⚖️**
```
Bad:     1-2% (40% chance) - 60% effective
Average: 2.5-3.5% (40% chance) - 150% effective
Good:    4-5% (20% chance) - 240% effective
Expected: ~2.8% average
```
**Verdict:** High risk, moderate reward. Strategic choice.

---

### **Option B: 2-4% (Narrower) ⚖️**
```
Bad:     2-2.5% (33% chance) - 100-125% effective
Average: 2.5-3.5% (33% chance) - 125-175% effective
Good:    3.5-4% (33% chance) - 175-200% effective
Expected: ~3% average
```
**Verdict:** More consistent, less punishing, still strategic.

---

### **Option C: 1-6% (Wider) 🎲**
```
Bad:     1-2% (33% chance) - 50-100% effective
Average: 3-4% (33% chance) - 150-200% effective
Good:    5-6% (33% chance) - 250-300% effective
Expected: ~3.5% average
```
**Verdict:** High risk, high reward. Very swingy.

---

### **Option D: 2-5% (Middle) ⚖️**
```
Bad:     2-2.5% (25% chance) - 100-125% effective
Average: 3-3.5% (50% chance) - 150-175% effective  
Good:    4-5% (25% chance) - 200-250% effective
Expected: ~3.25% average
```
**Verdict:** Balanced. No terrible rolls, still variable.

---

## 🎯 Recommended Range Analysis

### **Current 1-5%:**
**Risk Level:** High  
**Expected Value:** ~2.8% per point  
**vs Direct STR:** ~140% effective  
**vs Direct AGI:** ~280% effective (crit value)  
**vs Direct INT:** ~56% effective (long msg value)

**Issues:**
- 40% chance for 1-2% (feels bad)
- Can get unlucky streak (5 points all 1-2%)
- Makes Perception frustrating

---

### **Recommended: 2-5% ⚖️**
**Risk Level:** Medium  
**Expected Value:** ~3.25% per point  
**vs Direct STR:** ~163% effective  
**vs Direct AGI:** ~325% effective (crit value)  
**vs Direct INT:** ~65% effective (long msg value)

**Benefits:**
- ✅ No terrible rolls (minimum 2%)
- ✅ Still high variance (2-5%)
- ✅ Average roll beats STR allocation
- ✅ Lucky rolls still exciting
- ✅ Less frustrating, still strategic

**Math:**
```
Minimum: +2% (as good as 1 STR point)
Average: +3.25% (better than STR)
Maximum: +5% (very good!)
```

---

## 💡 Final Recommendation

### **Change Range: 1-5% → 2-5%**

**Why:**
1. **Minimum 2% = Fair floor** (matches 1 STR point)
2. **Maximum 5% = Still exciting** (2.5x a STR point)
3. **Less frustrating** (no 1% rolls)
4. **Still strategic** (variance 2-5%)
5. **Better expected value** (~3.25% vs ~2.8%)

**Expected Results (10 Perception points):**
- Bad luck: ~22% total buffs (mostly 2-3%)
- Average: ~32% total buffs (mix)
- Good luck: ~45% total buffs (mostly 4-5%)

**Comparison:**
- 10 STR points: +20% XP (reliable)
- 10 PER points: ~32% XP average (variable, distributed)

**Verdict:** 2-5% is more fun and less punishing!

---

## ✅ Final Verdict: **Use 2-5% Range**

**Benefits:**
- ✅ Fair minimum (2% = 1 STR point)
- ✅ Exciting maximum (5% = great roll!)
- ✅ Less frustrating (no 1% rolls)
- ✅ Still high variance (strategic)
- ✅ Better expected value

**Formula:** `Math.random() * 3 + 2` (generates 2-5%)
