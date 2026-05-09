# Cursor Rule Added: If-Else & For-Loop Alternatives

**Date**: 2025-12-05
**Location**: `.cursor/rules/if-else-alternatives.mdc`
**Scope**: Workspace-level (all projects)

---

## ✅ **What Was Added**

A comprehensive Cursor rule that automatically suggests functional programming alternatives for:

### **If-Else Alternatives (12 techniques):**
1. Switch Statements / Lookup Maps
2. Polymorphism
3. Strategy Design Pattern
4. Pattern Matching
5. Lookup Tables
6. Guard Clauses
7. Short-Circuit Evaluation
8. Ternary Operator
9. Optional Chaining
10. classList.toggle()
11. Array Methods
12. Nullish Coalescing

### **For-Loop Alternatives (8 methods):**
1. `.find()` - Search for element
2. `.filter()` - Filter elements
3. `.map()` - Transform elements
4. `.reduce()` - Reduce to single value
5. `.forEach()` - Execute for each
6. `Array.from()` - Create elements
7. `.some()` / `.every()` - Boolean checks
8. Method chaining

---

## 🎯 **How It Works**

### **Always Active:**
The rule is set with `alwaysApply: true`, meaning Cursor will **automatically** suggest these patterns when you write code.

### **File Types:**
Applies to:
- `**/*.js` - JavaScript
- `**/*.ts` - TypeScript
- `**/*.py` - Python
- `**/*.jsx` - React JSX
- `**/*.tsx` - React TypeScript

### **Automatic Suggestions:**
When Cursor sees:
- ❌ `for (let i = 0; i < arr.length; i++)`
- ✅ Suggests: `arr.find()`, `arr.filter()`, `arr.map()`, etc.

When Cursor sees:
- ❌ `if (condition) { ... } else { ... }`
- ✅ Suggests: Ternary, short-circuit, lookup map, etc.

---

## 📊 **Real Examples Included**

All examples are from the actual BetterDiscord plugin optimizations:

### **From SoloLevelingStats:**
- Rank color lookup map (13 if-else → 1 lookup)
- Debug logging short-circuit
- Milestone multiplier reduce
- Perception buff Array.from
- Rank search .find()

### **From LevelProgressBar:**
- Sparkle creation Array.from
- Milestone filtering .filter().forEach()
- Compact toggle classList.toggle()
- Event listener mapper Object.entries()

---

## 🚀 **Benefits**

### **For Developers:**
- ✅ Automatic suggestions
- ✅ Learn functional patterns
- ✅ Consistent code style
- ✅ Less manual refactoring

### **For Code Quality:**
- ✅ More readable
- ✅ Less error-prone
- ✅ Better performance (O(1) lookups)
- ✅ Maintainable

### **For Projects:**
- ✅ Consistent patterns across all files
- ✅ Modern JavaScript/TypeScript
- ✅ Professional code style
- ✅ Easy onboarding for new developers

---

## 📚 **Documentation**

The rule includes:
- **When to use** each alternative
- **Performance comparisons**
- **Readability metrics**
- **Real code examples**
- **Priority order** for refactoring
- **When NOT to refactor** (guard clauses, complex logic)

---

## 🎯 **How to Use**

### **Cursor Will Automatically:**
1. Detect if-else chains
2. Suggest functional alternatives
3. Show examples from the rule
4. Help you refactor

### **You Can:**
1. Accept suggestions
2. Learn patterns
3. Apply consistently
4. Build better code

---

## ✅ **Verification**

The rule is now active! Test it:

1. Create a new JavaScript file
2. Write an if-else chain:
   ```javascript
   if (rank === 'E') return '#808080';
   else if (rank === 'D') return '#8B4513';
   ```
3. Cursor should suggest:
   ```javascript
   const rankColors = { E: '#808080', D: '#8B4513' };
   return rankColors[rank];
   ```

---

## 🎉 **Success!**

Your workspace now has:
- ✅ Comprehensive functional programming guide
- ✅ Always-active Cursor rule
- ✅ Real examples from your optimizations
- ✅ Automatic suggestions
- ✅ Consistent code style

**Cursor will help you write functional code automatically!** 🚀✨

