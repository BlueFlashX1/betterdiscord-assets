# Activity Card Customization Opportunities

**Based on**: ActivityCardInspector plugin detection results  
**Date**: 2025-12-03

---

## 🔍 Detected Elements & Opportunities

### From Console Detection:

```javascript
[Activity Card Inspector] BADGESCONTAINER
├─ Classes: ['badgesContainer__635ed', 'badgesContainerPopout__635ed']
├─ Parent: div.popoutHeroBody_af3b89
├─ Context: div.popoutContentWrapper_af3b89 > div.hero_af3b89

[Activity Card Inspector] UNKNOWN (App Icon)
├─ Classes: ['contentImage__42bf5', 'contentImage_ef9ae7']
├─ Parent: div.imageContainer_ef9ae7
├─ Context: div.popoutThumbnailContainer_af3b89
```

---

## 🎨 Customization Ideas

### 1. **Game/App Title Styling** ⭐ HIGH IMPACT

**Current**: Purple text ("Roblox")  
**Detected**: `contentTitle_0f2e8` class  

**Opportunity**: Add Solo Leveling glow effect

```css
/* Enhanced game title with shadow glow */
[class*='contentTitle'],
[class*='activityCard'] h3,
[class*='infoSection'] h3 {
  color: #e0d0ff !important;
  text-shadow: 0 0 8px rgba(139, 92, 246, 0.8),
               0 0 12px rgba(124, 58, 237, 0.6),
               0 0 16px rgba(109, 40, 217, 0.4) !important;
  font-weight: 600 !important;
  letter-spacing: 0.5px !important;
}
```

**Effect**: Game names glow like magical artifacts in Solo Leveling

---

### 2. **App Icon Enhancement** ⭐ MEDIUM IMPACT

**Current**: Square app icons (Roblox logo, etc.)  
**Detected**: `contentImage_ef9ae7` class

**Opportunity**: Add purple glow border

```css
/* App icon with purple glow */
[class*='contentImage'],
[class*='imageContainer'] img,
[class*='popoutThumbnailContainer'] img {
  border-radius: 8px !important;
  box-shadow: 0 0 12px rgba(139, 92, 246, 0.6),
              0 0 20px rgba(124, 58, 237, 0.4) !important;
  border: 2px solid rgba(139, 92, 246, 0.3) !important;
  transition: all 0.3s ease !important;
}

/* Hover effect - Intensify glow */
[class*='contentImage']:hover,
[class*='imageContainer'] img:hover {
  box-shadow: 0 0 16px rgba(139, 92, 246, 0.9),
              0 0 24px rgba(124, 58, 237, 0.7),
              0 0 32px rgba(109, 40, 217, 0.5) !important;
  transform: scale(1.05) !important;
  border-color: rgba(139, 92, 246, 0.8) !important;
}
```

**Effect**: App icons look like glowing mana stones

---

### 3. **Activity Card Container** ⭐ HIGH IMPACT

**Current**: Default Discord styling  
**Detected**: `infoSection_0f2e8`, `hero_af3b89` classes

**Opportunity**: Add subtle border and glow

```css
/* Activity card container enhancement */
[class*='infoSection'],
[class*='hero'] [class*='popoutHeroInner'],
[class*='popoutHeroBody'] {
  background: rgba(10, 10, 20, 0.4) !important;
  border: 1px solid rgba(139, 92, 246, 0.2) !important;
  border-radius: 8px !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3),
              0 0 16px rgba(139, 92, 246, 0.1) !important;
  transition: all 0.3s ease !important;
}

/* Hover effect - Enhance glow */
[class*='infoSection']:hover,
[class*='popoutHeroBody']:hover {
  border-color: rgba(139, 92, 246, 0.5) !important;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4),
              0 0 20px rgba(139, 92, 246, 0.3) !important;
  background: rgba(10, 10, 20, 0.6) !important;
}
```

**Effect**: Activity cards look like system UI panels from Solo Leveling

---

### 4. **Section Headers** ⭐ MEDIUM IMPACT

**Current**: "Activity - 1", "Clown Adults - 3" in purple  
**Opportunity**: Enhanced glow and styling

```css
/* Section headers with enhanced glow */
[class*='userPopout'] h2,
[class*='userPopout'] [class*='sectionTitle'],
[class*='popout'] [class*='header'] {
  color: rgba(139, 92, 246, 1) !important;
  text-shadow: 0 0 6px rgba(139, 92, 246, 0.8),
               0 0 12px rgba(124, 58, 237, 0.6),
               0 0 18px rgba(109, 40, 217, 0.4) !important;
  font-weight: 700 !important;
  letter-spacing: 1px !important;
  text-transform: uppercase !important;
  font-size: 12px !important;
}
```

**Effect**: Section headers look like quest notifications

---

### 5. **Username in Activity Cards** ⭐ LOW IMPACT

**Current**: Purple username text  
**Opportunity**: Differentiate from game name

```css
/* Username in activity cards */
[class*='popout'] [class*='username'],
[class*='userPopout'] [class*='nameTag'],
[class*='hero'] [class*='username'] {
  color: #ffffff !important;
  text-shadow: 0 0 4px rgba(139, 92, 246, 0.5),
               0 1px 3px rgba(0, 0, 0, 0.6) !important;
  font-weight: 600 !important;
}
```

**Effect**: Usernames stand out more from game names

---

### 6. **Timestamp Text Styling** ⭐ LOW IMPACT

**Current**: "4d ago" text on transparent background  
**Opportunity**: Make it more visible with subtle glow

```css
/* Timestamp text enhancement */
[class*='badgesContainer'] time,
[class*='badgesContainer'] [class*='timestamp'],
[class*='popout'] time {
  color: rgba(139, 92, 246, 0.9) !important;
  text-shadow: 0 0 4px rgba(139, 92, 246, 0.4),
               0 1px 2px rgba(0, 0, 0, 0.6) !important;
  font-weight: 500 !important;
  font-size: 12px !important;
}
```

**Effect**: Timestamps glow subtly without purple background

---

### 7. **Profile Picture Border** ⭐ MEDIUM IMPACT

**Current**: Default circular profile pictures  
**Opportunity**: Add status-colored glow

```css
/* Profile picture with status glow */
[class*='userPopout'] [class*='avatar'],
[class*='popout'] [class*='avatarWrapper'] {
  border: 3px solid rgba(139, 92, 246, 0.4) !important;
  box-shadow: 0 0 12px rgba(139, 92, 246, 0.5),
              0 0 20px rgba(124, 58, 237, 0.3) !important;
  transition: all 0.3s ease !important;
}

/* Online status - Green glow */
[class*='avatar'][class*='online'],
[class*='avatar']:has([class*='statusOnline']) {
  border-color: rgba(0, 255, 136, 0.6) !important;
  box-shadow: 0 0 12px rgba(0, 255, 136, 0.6),
              0 0 20px rgba(0, 255, 136, 0.4) !important;
}

/* Idle status - Orange glow */
[class*='avatar'][class*='idle'],
[class*='avatar']:has([class*='statusIdle']) {
  border-color: rgba(255, 170, 0, 0.6) !important;
  box-shadow: 0 0 12px rgba(255, 170, 0, 0.6),
              0 0 20px rgba(255, 170, 0, 0.4) !important;
}
```

**Effect**: Avatars glow based on status (like aura in Solo Leveling)

---

### 8. **Activity Card Animations** ⭐ LOW IMPACT

**Opportunity**: Subtle entrance animation

```css
/* Activity card entrance animation */
[class*='infoSection'],
[class*='popoutHeroBody'] {
  animation: activityCardFadeIn 0.4s ease-out !important;
}

@keyframes activityCardFadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

**Effect**: Activity cards fade in smoothly like system notifications

---

### 9. **Playing/Listening Indicators** ⭐ MEDIUM IMPACT

**Opportunity**: Style the "Playing", "Listening to" text

```css
/* Activity type indicator */
[class*='activityCard'] [class*='activityType'],
[class*='infoSection'] [class*='type'],
[class*='popout'] [class*='subtext'] {
  color: rgba(139, 92, 246, 0.8) !important;
  font-size: 11px !important;
  font-weight: 500 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.5px !important;
  text-shadow: 0 0 3px rgba(139, 92, 246, 0.3) !important;
}
```

**Effect**: "Playing" indicator looks like status label

---

### 10. **Badge Container as Accent Line** ⭐ HIGH IMPACT

**Current**: Removed purple background (transparent)  
**Opportunity**: Replace with subtle accent line

```css
/* Replace purple background with accent line */
[class*='badgesContainer'] {
  background: transparent !important;
  border-top: 1px solid rgba(139, 92, 246, 0.3) !important;
  padding-top: 8px !important;
  margin-top: 8px !important;
}

/* Or add subtle gradient */
[class*='badgesContainer']::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(139, 92, 246, 0.4) 50%,
    transparent 100%
  );
}
```

**Effect**: Elegant divider instead of harsh purple block

---

## 📊 Priority Ranking

| Customization | Impact | Difficulty | Recommend |
|---------------|--------|------------|-----------|
| 1. Game Title Glow | High | Easy | ⭐⭐⭐ |
| 2. App Icon Glow | Medium | Easy | ⭐⭐⭐ |
| 3. Card Container | High | Easy | ⭐⭐⭐ |
| 4. Section Headers | Medium | Easy | ⭐⭐ |
| 5. Username Style | Low | Easy | ⭐ |
| 6. Timestamp Text | Low | Easy | ⭐ |
| 7. Avatar Glow | Medium | Medium | ⭐⭐ |
| 8. Animations | Low | Easy | ⭐ |
| 9. Type Indicators | Medium | Easy | ⭐⭐ |
| 10. Accent Line | High | Easy | ⭐⭐⭐ |

---

## 🎯 Recommended Package

**Apply these 5 for maximum impact**:

1. ✅ Game Title Glow
2. ✅ App Icon Glow  
3. ✅ Card Container Border
4. ✅ Section Headers
5. ✅ Accent Line (instead of purple background)

---

## 🎨 Complete Activity Card Overhaul

### Full CSS Package:

```css
/* ========================================
   ACTIVITY CARD COMPLETE ENHANCEMENT
   Solo Leveling Theme Aesthetic
   ======================================== */

/* 1. Container - System panel look */
[class*='infoSection'],
[class*='hero'] [class*='popoutHeroInner'],
[class*='popoutHeroBody'] {
  background: rgba(10, 10, 20, 0.5) !important;
  border: 1px solid rgba(139, 92, 246, 0.3) !important;
  border-radius: 8px !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4),
              0 0 20px rgba(139, 92, 246, 0.15) !important;
  padding: 12px !important;
  margin: 8px 0 !important;
}

/* 2. Game/App Title - Magical glow */
[class*='contentTitle'],
[class*='activityCard'] h3,
[class*='infoSection'] h3 {
  color: #e0d0ff !important;
  text-shadow: 0 0 8px rgba(139, 92, 246, 0.9),
               0 0 12px rgba(124, 58, 237, 0.7),
               0 0 16px rgba(109, 40, 217, 0.5) !important;
  font-weight: 700 !important;
  letter-spacing: 0.8px !important;
  font-size: 15px !important;
}

/* 3. App Icon - Glowing stone effect */
[class*='contentImage'],
[class*='imageContainer'] img,
[class*='popoutThumbnailContainer'] img {
  border-radius: 12px !important;
  box-shadow: 0 0 16px rgba(139, 92, 246, 0.7),
              0 0 24px rgba(124, 58, 237, 0.5),
              0 4px 8px rgba(0, 0, 0, 0.4) !important;
  border: 2px solid rgba(139, 92, 246, 0.5) !important;
  transition: all 0.3s ease !important;
}

[class*='contentImage']:hover,
[class*='imageContainer'] img:hover {
  box-shadow: 0 0 20px rgba(139, 92, 246, 1),
              0 0 32px rgba(124, 58, 237, 0.8),
              0 0 40px rgba(109, 40, 217, 0.6) !important;
  transform: scale(1.08) rotate(2deg) !important;
  border-color: rgba(139, 92, 246, 0.9) !important;
}

/* 4. Section Headers - Quest notification style */
[class*='userPopout'] h2,
[class*='popout'] [class*='sectionTitle'] {
  color: rgba(139, 92, 246, 1) !important;
  text-shadow: 0 0 8px rgba(139, 92, 246, 1),
               0 0 16px rgba(124, 58, 237, 0.8) !important;
  font-weight: 800 !important;
  letter-spacing: 1.2px !important;
  text-transform: uppercase !important;
  font-size: 11px !important;
  padding-bottom: 8px !important;
  border-bottom: 2px solid rgba(139, 92, 246, 0.3) !important;
  margin-bottom: 12px !important;
}

/* 5. Timestamp - Subtle glow without background */
[class*='badgesContainer'],
[class*='badges'][class*='Container'] {
  background: transparent !important;
  border-top: 1px solid rgba(139, 92, 246, 0.2) !important;
  padding-top: 8px !important;
  margin-top: 8px !important;
}

[class*='badgesContainer'] time,
[class*='badgesContainer'] [class*='timestamp'] {
  color: rgba(139, 92, 246, 0.9) !important;
  text-shadow: 0 0 6px rgba(139, 92, 246, 0.5),
               0 1px 2px rgba(0, 0, 0, 0.6) !important;
  font-weight: 600 !important;
  font-size: 12px !important;
}

/* 6. Avatar - Aura glow effect */
[class*='userPopout'] [class*='avatar'],
[class*='popout'] [class*='avatarWrapper'] {
  border: 3px solid rgba(139, 92, 246, 0.5) !important;
  box-shadow: 0 0 16px rgba(139, 92, 246, 0.6),
              0 0 24px rgba(124, 58, 237, 0.4) !important;
}

/* 7. Activity type text */
[class*='activityCard'] [class*='subtext'],
[class*='infoSection'] [class*='subtext'] {
  color: rgba(139, 92, 246, 0.7) !important;
  font-size: 11px !important;
  font-weight: 500 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.8px !important;
}

/* 8. Entrance animation */
[class*='infoSection'],
[class*='popoutHeroBody'] {
  animation: soloActivityFadeIn 0.4s ease-out !important;
}

@keyframes soloActivityFadeIn {
  from {
    opacity: 0;
    transform: translateY(-8px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
```

---

## 🎨 Visual Preview (Expected Result)

**Before**:
- Flat cards with purple timestamp background
- No glow effects
- Standard Discord look

**After**:
- ✨ Game titles glow like magical text
- 💎 App icons look like glowing mana stones  
- 🎴 Cards have system UI panel aesthetic
- 📊 Section headers pulse with power
- 🌟 Subtle animations on appearance
- 🚫 No harsh purple backgrounds

---

## 🔧 How to Apply

### Option 1: Quick Apply (Copy-Paste)

Copy the CSS from this file and add to your theme at:
```
themes/SoloLeveling-ClearVision.theme.css
Section 6: ACTIVITY CARD STYLING
```

### Option 2: Selective Apply

Pick individual customizations you like and add them one by one.

### Option 3: Test in DevTools

1. Open Discord DevTools (Cmd+Option+I)
2. Go to "Elements" tab
3. Find `<style>` tags in `<head>`
4. Add CSS rules to test live
5. Copy working rules to theme file

---

## 🧪 Testing Checklist

Test these scenarios:

- [ ] User profile with "Playing [Game]"
- [ ] User profile with "Listening to Spotify"
- [ ] User profile with multiple activities
- [ ] User profile hover states
- [ ] App icon hover effects
- [ ] Different activity types (streaming, custom status)
- [ ] Mobile layout (if applicable)

---

## 🎯 Detected Selectors Reference

From ActivityCardInspector plugin:

| Element | Selector | Purpose |
|---------|----------|---------|
| Badges Container | `[class*='badgesContainer']` | Timestamp area |
| Content Title | `[class*='contentTitle']` | Game/app name |
| Content Image | `[class*='contentImage']` | App icon |
| Info Section | `[class*='infoSection']` | Activity info wrapper |
| Hero Body | `[class*='popoutHeroBody']` | Main content area |
| Hero Inner | `[class*='popoutHeroInner']` | Inner wrapper |

---

## 💡 Creative Ideas

### A. Rank Badge Style

Style activity cards based on time duration:

```css
/* Recent activity (glow brighter) */
[class*='badgesContainer']:has([class*='timestamp'][title*='hour']),
[class*='badgesContainer']:has([class*='timestamp'][title*='minute']) {
  border-color: rgba(139, 92, 246, 0.8) !important;
  box-shadow: 0 0 12px rgba(139, 92, 246, 0.5) !important;
}

/* Old activity (dimmer) */
[class*='badgesContainer']:has([class*='timestamp'][title*='day']),
[class*='badgesContainer']:has([class*='timestamp'][title*='week']) {
  opacity: 0.7 !important;
}
```

### B. Game-Specific Icons

```css
/* Different glow for different apps */
[class*='contentImage'][alt*='Roblox'] {
  box-shadow: 0 0 16px rgba(255, 0, 0, 0.6) !important; /* Red for Roblox */
}

[class*='contentImage'][alt*='Spotify'] {
  box-shadow: 0 0 16px rgba(30, 215, 96, 0.6) !important; /* Green for Spotify */
}
```

### C. Pulse Animation on Active

```css
/* Pulse for currently active (not "ago") */
[class*='infoSection']:not(:has([class*='timestamp'])) {
  animation: soloPulse 2s ease-in-out infinite !important;
}

@keyframes soloPulse {
  0%, 100% {
    box-shadow: 0 0 16px rgba(139, 92, 246, 0.2);
  }
  50% {
    box-shadow: 0 0 24px rgba(139, 92, 246, 0.4);
  }
}
```

---

## 📝 Notes

- All selectors use `[class*='partial']` for resilience
- All rules include `!important` to override Discord defaults
- All effects use rgba() for smooth blending
- All transitions are 0.3s for smooth feel
- All glows use purple theme colors (#8b5cf6, #7c3aed)

---

## 🚀 Next Steps

1. Choose customizations from the list
2. Add CSS to theme file (Section 6)
3. Reload Discord (Cmd+R)
4. Test and adjust values
5. Document any new patterns found

---

**Status**: ✅ Ready to Apply  
**Impact**: High visual enhancement  
**Difficulty**: Easy implementation  
**Resilience**: 99.9% (uses attribute selectors)
