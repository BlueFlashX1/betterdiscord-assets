module.exports = {
  getAchievementDefinitions() {
    // Check cache first (static definitions never change)
    if (this._cache.achievementDefinitions) {
      return this._cache.achievementDefinitions;
    }
  
    // ACHIEVEMENT DEFINITIONS (791 lines)
    // CATEGORIES:
    // 1. Early Game (E-Rank) - Lines 5505-5550
    // 2. Mid Game (D-C Rank) - Lines 5550-5650
    // 3. Advanced (B-A Rank) - Lines 5650-5800
    // 4. Elite (S-SS Rank) - Lines 5800-6000
    // 5. Legendary (SSS+ & NH) - Lines 6000-6150
    // 6. Monarch Tier - Lines 6150-6250
    // 7. Special Achievements - Lines 6250-6291
    const achievements = [
      // CATEGORY 1: EARLY GAME (E-RANK)
      {
        id: 'weakest_hunter',
        name: 'The Weakest Hunter',
        description: 'Send 50 messages',
        condition: { type: 'messages', value: 50 },
        title: 'The Weakest Hunter',
        titleBonus: { xp: 0.03, strengthPercent: 0.05 }, // +3% XP, +5% Strength
      },
      {
        id: 'e_rank',
        name: 'E-Rank Hunter',
        description: 'Send 200 messages',
        condition: { type: 'messages', value: 200 },
        title: 'E-Rank Hunter',
        titleBonus: { xp: 0.08, strengthPercent: 0.05 }, // +8% XP, +5% STR
      },
  
      // CATEGORY 2: MID GAME (D-C RANK)
      {
        id: 'd_rank',
        name: 'D-Rank Hunter',
        description: 'Send 500 messages',
        condition: { type: 'messages', value: 500 },
        title: 'D-Rank Hunter',
        titleBonus: { xp: 0.12, agilityPercent: 0.05 }, // +12% XP, +5% AGI
      },
      {
        id: 'c_rank',
        name: 'C-Rank Hunter',
        description: 'Send 1,000 messages',
        condition: { type: 'messages', value: 1000 },
        title: 'C-Rank Hunter',
        titleBonus: { xp: 0.18, critChance: 0.01, strengthPercent: 0.05 }, // +18% XP, +1% Crit, +5% STR
      },
  
      // CATEGORY 3: ADVANCED (B-A RANK)
      {
        id: 'b_rank',
        name: 'B-Rank Hunter',
        description: 'Send 2,500 messages',
        condition: { type: 'messages', value: 2500 },
        title: 'B-Rank Hunter',
        titleBonus: { xp: 0.25, critChance: 0.02, agilityPercent: 0.05, intelligencePercent: 0.05 }, // +25% XP, +2% Crit, +5% AGI, +5% INT
      },
      {
        id: 'a_rank',
        name: 'A-Rank Hunter',
        description: 'Send 5,000 messages',
        condition: { type: 'messages', value: 5000 },
        title: 'A-Rank Hunter',
        titleBonus: { xp: 0.32, critChance: 0.02, strengthPercent: 0.05, agilityPercent: 0.05 }, // +32% XP, +2% Crit, +5% STR, +5% AGI
      },
  
      // CATEGORY 4: ELITE (S-SS RANK)
      {
        id: 's_rank',
        name: 'S-Rank Hunter',
        description: 'Send 10,000 messages',
        condition: { type: 'messages', value: 10000 },
        title: 'S-Rank Hunter',
        titleBonus: { xp: 0.4, strengthPercent: 0.1, critChance: 0.02 }, // +40% XP, +10% Strength, +2% Crit Chance
      },
      // Character/Writing Milestones
      {
        id: 'shadow_extraction',
        name: 'Shadow Extraction',
        description: 'Type 25,000 characters — the Shadow Monarch\'s core power to raise the dead',
        condition: { type: 'characters', value: 25000 },
        title: 'Shadow Extraction',
        titleBonus: { xp: 0.15, intelligencePercent: 0.1, critChance: 0.01 }, // Shadow Extraction: necromantic INT ability
      },
      {
        id: 'domain_expansion',
        name: 'Domain Expansion',
        description: 'Reach Level 100 and type 75,000 characters — territorial dominance amplifying all power within',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 100 }, { type: 'characters', value: 75000 }] },
        title: 'Domain Expansion',
        titleBonus: { xp: 0.3, intelligencePercent: 0.15, vitalityPercent: 0.1, perceptionPercent: 0.05, critChance: 0.02 }, // Domain: area control INT, endurance, battlefield awareness
      },
      {
        id: 'ruler_authority',
        name: "Ruler's Authority",
        description: 'Reach Level 200 and type 150,000 characters — the telekinetic power wielded by the Rulers',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 200 }, { type: 'characters', value: 150000 }] },
        title: "Ruler's Authority",
        titleBonus: { xp: 0.5, intelligencePercent: 0.2, perceptionPercent: 0.15, critChance: 0.03 }, // Ruler's Authority: telekinetic INT mastery, cosmic perception
      },
      // Level Milestones (1-2000)
      {
        id: 'first_steps',
        name: 'First Steps',
        description: 'Reach Level 1',
        condition: { type: 'level', value: 1 },
        title: 'First Steps',
        titleBonus: { xp: 0.02, critChance: 0.005 }, // +2% XP, +0.5% Crit
      },
      {
        id: 'novice_hunter',
        name: 'Novice Hunter',
        description: 'Reach Level 5',
        condition: { type: 'level', value: 5 },
        title: 'Novice Hunter',
        titleBonus: { xp: 0.05, critChance: 0.01, strengthPercent: 0.05 }, // +5% XP, +1% Crit, +5% STR
      },
      {
        id: 'rising_hunter',
        name: 'Rising Hunter',
        description: 'Reach Level 10',
        condition: { type: 'level', value: 10 },
        title: 'Rising Hunter',
        titleBonus: { xp: 0.08, critChance: 0.01, agilityPercent: 0.05 }, // +8% XP, +1% Crit, +5% AGI
      },
      {
        id: 'awakened',
        name: 'The Awakened',
        description: 'Reach Level 15',
        condition: { type: 'level', value: 15 },
        title: 'The Awakened',
        titleBonus: { xp: 0.12, critChance: 0.015, strengthPercent: 0.05, agilityPercent: 0.05 }, // +12% XP, +1.5% Crit, +5% STR/AGI
      },
      {
        id: 'experienced_hunter',
        name: 'Experienced Hunter',
        description: 'Reach Level 20',
        condition: { type: 'level', value: 20 },
        title: 'Experienced Hunter',
        titleBonus: {
          xp: 0.15,
          critChance: 0.02,
          strengthPercent: 0.05,
          intelligencePercent: 0.05,
        }, // +15% XP, +2% Crit, +5% STR/INT
      },
      {
        id: 'shadow_army',
        name: 'Shadow Army Commander',
        description: 'Reach Level 50 — commander of the shadow soldiers, Jin-Woo\'s extracted army',
        condition: { type: 'level', value: 50 },
        title: 'Shadow Army Commander',
        titleBonus: { xp: 0.22, intelligencePercent: 0.1, agilityPercent: 0.05, critChance: 0.02 }, // Shadow Commander: INT to command army, tactical mobility
      },
      {
        id: 'elite_hunter',
        name: 'Elite Hunter',
        description: 'Reach Level 40',
        condition: { type: 'level', value: 40 },
        title: 'Elite Hunter',
        titleBonus: {
          xp: 0.25,
          critChance: 0.025,
          strengthPercent: 0.1,
          agilityPercent: 0.05,
          intelligencePercent: 0.05,
        }, // +25% XP, +2.5% Crit, +10% STR, +5% AGI/INT
      },
      {
        id: 'necromancer',
        name: 'Necromancer',
        description: 'Reach Level 100 — the forbidden class obtained after Jin-Woo\'s job change quest',
        condition: { type: 'level', value: 100 },
        title: 'Necromancer',
        titleBonus: {
          xp: 0.35,
          intelligencePercent: 0.15,
          vitalityPercent: 0.05,
          agilityPercent: 0.05,
          critChance: 0.02,
        }, // Necromancer class: heavy INT (shadow magic), some endurance and mobility
      },
      {
        id: 'national_level',
        name: 'National Level Hunter',
        description: 'Reach Level 300 — one of the elite few hunters who represent an entire nation\'s power',
        condition: { type: 'level', value: 300 },
        title: 'National Level Hunter',
        titleBonus: {
          xp: 0.8,
          strengthPercent: 0.2,
          agilityPercent: 0.15,
          intelligencePercent: 0.15,
          vitalityPercent: 0.1,
          critChance: 0.06,
        }, // National Level: elite above S-rank, strong all-round with combat focus
      },
      {
        id: 'monarch_candidate',
        name: 'Monarch Candidate',
        description: 'Reach Level 500 — on the threshold of transcending mortal hunter limits',
        condition: { type: 'level', value: 500 },
        title: 'Monarch Candidate',
        titleBonus: {
          xp: 1.2,
          strengthPercent: 0.25,
          agilityPercent: 0.25,
          intelligencePercent: 0.2,
          vitalityPercent: 0.2,
          critChance: 0.1,
        }, // Monarch Candidate: approaching transcendence, strong across all stats
      },
      {
        id: 'high_rank_hunter',
        name: 'High-Rank Hunter',
        description: 'Reach Level 150',
        condition: { type: 'level', value: 150 },
        title: 'High-Rank Hunter',
        titleBonus: {
          xp: 0.6,
          critChance: 0.06,
          strengthPercent: 0.15,
          agilityPercent: 0.15,
          intelligencePercent: 0.15,
          vitalityPercent: 0.1,
        }, // +60% XP, +6% Crit, +15% STR/AGI/INT, +10% VIT
      },
      {
        id: 's_rank_elite',
        name: 'S-Rank Elite',
        description: 'Reach Level 200',
        condition: { type: 'level', value: 200 },
        title: 'S-Rank Elite',
        titleBonus: {
          xp: 0.7,
          critChance: 0.07,
          strengthPercent: 0.2,
          agilityPercent: 0.2,
          intelligencePercent: 0.15,
          vitalityPercent: 0.15,
        }, // +70% XP, +7% Crit, +20% STR/AGI, +15% INT/VIT
      },
      {
        id: 'transcendent_hunter',
        name: 'Transcendent Hunter',
        description: 'Reach Level 250',
        condition: { type: 'level', value: 250 },
        title: 'Transcendent Hunter',
        titleBonus: {
          xp: 0.8,
          critChance: 0.08,
          strengthPercent: 0.2,
          agilityPercent: 0.2,
          intelligencePercent: 0.2,
          vitalityPercent: 0.15,
        }, // +80% XP, +8% Crit, +20% All Stats, +15% VIT
      },
      {
        id: 'legendary_hunter',
        name: 'Legendary Hunter',
        description: 'Reach Level 300',
        condition: { type: 'level', value: 300 },
        title: 'Legendary Hunter',
        titleBonus: {
          xp: 0.9,
          critChance: 0.09,
          strengthPercent: 0.25,
          agilityPercent: 0.25,
          intelligencePercent: 0.2,
          vitalityPercent: 0.2,
        }, // +90% XP, +9% Crit, +25% STR/AGI, +20% INT/VIT
      },
      {
        id: 'mythic_hunter',
        name: 'Mythic Hunter',
        description: 'Reach Level 400',
        condition: { type: 'level', value: 400 },
        title: 'Mythic Hunter',
        titleBonus: {
          xp: 1.05,
          critChance: 0.1,
          strengthPercent: 0.25,
          agilityPercent: 0.25,
          intelligencePercent: 0.25,
          vitalityPercent: 0.2,
        }, // +105% XP, +10% Crit, +25% All Stats, +20% VIT
      },
      {
        id: 'divine_hunter',
        name: 'Divine Hunter',
        description: 'Reach Level 500',
        condition: { type: 'level', value: 500 },
        title: 'Divine Hunter',
        titleBonus: {
          xp: 1.2,
          critChance: 0.12,
          strengthPercent: 0.3,
          agilityPercent: 0.3,
          intelligencePercent: 0.25,
          vitalityPercent: 0.25,
        }, // +120% XP, +12% Crit, +30% STR/AGI, +25% INT/VIT
      },
      {
        id: 'celestial_hunter',
        name: 'Celestial Hunter',
        description: 'Reach Level 600',
        condition: { type: 'level', value: 600 },
        title: 'Celestial Hunter',
        titleBonus: {
          xp: 1.35,
          critChance: 0.13,
          strengthPercent: 0.3,
          agilityPercent: 0.3,
          intelligencePercent: 0.3,
          vitalityPercent: 0.25,
        }, // +135% XP, +13% Crit, +30% All Stats, +25% VIT
      },
      {
        id: 'national_hunter_elite',
        name: 'National Hunter Elite',
        description: 'Reach Level 700',
        condition: { type: 'level', value: 700 },
        title: 'National Hunter Elite',
        titleBonus: {
          xp: 1.5,
          critChance: 0.15,
          strengthPercent: 0.35,
          agilityPercent: 0.35,
          intelligencePercent: 0.3,
          vitalityPercent: 0.3,
        }, // +150% XP, +15% Crit, +35% STR/AGI, +30% INT/VIT
      },
      {
        id: 'monarch_aspirant',
        name: 'Monarch Aspirant',
        description: 'Reach Level 800',
        condition: { type: 'level', value: 800 },
        title: 'Monarch Aspirant',
        titleBonus: {
          xp: 1.65,
          critChance: 0.16,
          strengthPercent: 0.35,
          agilityPercent: 0.35,
          intelligencePercent: 0.35,
          vitalityPercent: 0.3,
        }, // +165% XP, +16% Crit, +35% All Stats, +30% VIT
      },
      {
        id: 'monarch_heir',
        name: 'Monarch Heir',
        description: 'Reach Level 900',
        condition: { type: 'level', value: 900 },
        title: 'Monarch Heir',
        titleBonus: {
          xp: 1.8,
          critChance: 0.18,
          strengthPercent: 0.4,
          agilityPercent: 0.4,
          intelligencePercent: 0.35,
          vitalityPercent: 0.35,
        }, // +180% XP, +18% Crit, +40% STR/AGI, +35% INT/VIT
      },
      {
        id: 'true_monarch',
        name: 'True Monarch',
        description: 'Reach Level 1000',
        condition: { type: 'level', value: 1000 },
        title: 'True Monarch',
        titleBonus: {
          xp: 2.0,
          critChance: 0.2,
          strengthPercent: 0.4,
          agilityPercent: 0.4,
          intelligencePercent: 0.4,
          vitalityPercent: 0.35,
        }, // +200% XP, +20% Crit, +40% All Stats, +35% VIT
      },
      {
        id: 'monarch_transcendent',
        name: 'Monarch Transcendent',
        description: 'Reach Level 1200',
        condition: { type: 'level', value: 1200 },
        title: 'Monarch Transcendent',
        titleBonus: {
          xp: 2.25,
          critChance: 0.22,
          strengthPercent: 0.45,
          agilityPercent: 0.45,
          intelligencePercent: 0.4,
          vitalityPercent: 0.4,
        }, // +225% XP, +22% Crit, +45% STR/AGI, +40% INT/VIT
      },
      {
        id: 'monarch_supreme',
        name: 'Monarch Supreme',
        description: 'Reach Level 1500',
        condition: { type: 'level', value: 1500 },
        title: 'Monarch Supreme',
        titleBonus: {
          xp: 2.5,
          critChance: 0.25,
          strengthPercent: 0.45,
          agilityPercent: 0.45,
          intelligencePercent: 0.45,
          vitalityPercent: 0.4,
        }, // +250% XP, +25% Crit, +45% All Stats, +40% VIT
      },
      {
        id: 'monarch_ultimate',
        name: 'Monarch Ultimate',
        description: 'Reach Level 1800',
        condition: { type: 'level', value: 1800 },
        title: 'Monarch Ultimate',
        titleBonus: {
          xp: 2.75,
          critChance: 0.27,
          strengthPercent: 0.5,
          agilityPercent: 0.5,
          intelligencePercent: 0.45,
          vitalityPercent: 0.45,
        }, // +275% XP, +27% Crit, +50% STR/AGI, +45% INT/VIT
      },
      {
        id: 'shadow_monarch_final',
        name: 'Shadow Monarch (Final)',
        description: 'Reach Level 2000',
        condition: { type: 'level', value: 2000 },
        title: 'Shadow Monarch (Final)',
        titleBonus: {
          xp: 3.0,
          critChance: 0.3,
          strengthPercent: 0.5,
          agilityPercent: 0.5,
          intelligencePercent: 0.5,
          vitalityPercent: 0.5,
        }, // +300% XP, +30% Crit, +50% All Stats
      },
      // Activity/Time Milestones
      {
        id: 'dungeon_grinder',
        name: 'Dungeon Grinder',
        description: 'Be active for 5 hours',
        condition: { type: 'time', value: 300 }, // minutes
        title: 'Dungeon Grinder',
        titleBonus: { xp: 0.06, vitalityPercent: 0.05 }, // +6% XP, +5% VIT
      },
      {
        id: 'gate_explorer',
        name: 'Gate Explorer',
        description: 'Be active for 20 hours',
        condition: { type: 'time', value: 1200 },
        title: 'Gate Explorer',
        titleBonus: { xp: 0.14, vitalityPercent: 0.05, agilityPercent: 0.05 }, // +14% XP, +5% VIT, +5% AGI
      },
      {
        id: 'raid_veteran',
        name: 'Raid Veteran',
        description: 'Be active for 50 hours',
        condition: { type: 'time', value: 3000 },
        title: 'Raid Veteran',
        titleBonus: { xp: 0.24, vitalityPercent: 0.1, strengthPercent: 0.05 }, // +24% XP, +10% VIT, +5% STR
      },
      {
        id: 'eternal_hunter',
        name: 'Eternal Hunter',
        description: 'Be active for 100 hours',
        condition: { type: 'time', value: 6000 },
        title: 'Eternal Hunter',
        titleBonus: { xp: 0.33, vitalityPercent: 0.1, strengthPercent: 0.05, agilityPercent: 0.05 }, // +33% XP, +10% VIT, +5% STR, +5% AGI
      },
      // Channel/Exploration Milestones
      {
        id: 'gate_traveler',
        name: 'Gate Traveler',
        description: 'Visit 5 unique channels',
        condition: { type: 'channels', value: 5 },
        title: 'Gate Traveler',
        titleBonus: { xp: 0.04, agilityPercent: 0.05 }, // +4% XP, +5% AGI
      },
      {
        id: 'dungeon_master',
        name: 'Dungeon Master',
        description: 'Visit 15 unique channels',
        condition: { type: 'channels', value: 15 },
        title: 'Dungeon Master',
        titleBonus: { xp: 0.11, intelligencePercent: 0.05, agilityPercent: 0.05 }, // +11% XP, +5% INT, +5% AGI
      },
      {
        id: 'dimension_walker',
        name: 'Dimension Walker',
        description: 'Visit 30 unique channels',
        condition: { type: 'channels', value: 30 },
        title: 'Dimension Walker',
        titleBonus: { xp: 0.19, intelligencePercent: 0.1, agilityPercent: 0.05, critChance: 0.01 }, // +19% XP, +10% INT, +5% AGI, +1% Crit
      },
      {
        id: 'realm_conqueror',
        name: 'Realm Conqueror',
        description: 'Visit 50 unique channels',
        condition: { type: 'channels', value: 50 },
        title: 'Realm Conqueror',
        titleBonus: { xp: 0.27, intelligencePercent: 0.1, agilityPercent: 0.1, critChance: 0.02 }, // +27% XP, +10% INT, +10% AGI, +2% Crit
      },
      // Special Titles (High Requirements)
      {
        id: 'shadow_monarch',
        name: 'Shadow Monarch',
        description: 'Reach Shadow Monarch rank (Lv 2000) — Ashborn, the King of the Dead, supreme ruler of all shadows',
        condition: { type: 'level', value: 2000 },
        title: 'Shadow Monarch',
        titleBonus: { xp: 5.0, strengthPercent: 1.0, agilityPercent: 1.0, intelligencePercent: 1.0, vitalityPercent: 1.0, perceptionPercent: 1.0, critChance: 0.3 }, // ASHBORN: supreme god-tier — 100% ALL stats, 500% XP, 30% Crit
      },
      {
        id: 'monarch_of_destruction',
        name: 'Monarch of Destruction',
        description: 'Reach Monarch+ rank (Lv 1500) — Antares, the King of Dragons and ultimate adversary',
        condition: { type: 'level', value: 1500 },
        title: 'Monarch of Destruction',
        titleBonus: { xp: 2.5, strengthPercent: 0.5, vitalityPercent: 0.4, intelligencePercent: 0.3, critChance: 0.2 }, // Antares: supreme destructive force, dragon durability, breath attacks, devastating strikes
      },
      {
        id: 'the_ruler',
        name: 'The Ruler',
        description: 'Reach National Hunter rank (Lv 700) and be active for 200 hours — emissary of the Absolute Being',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 700 }, { type: 'time', value: 12000 }] },
        title: 'The Ruler',
        titleBonus: {
          xp: 1.4,
          intelligencePercent: 0.35,
          perceptionPercent: 0.3,
          vitalityPercent: 0.2,
          strengthPercent: 0.15,
          critChance: 0.1,
        }, // Ruler: divine telekinetic power, cosmic awareness, light endurance
      },
      // Character-Based Titles
      {
        id: 'sung_jin_woo',
        name: 'Sung Jin-Woo',
        description: 'Reach S-Rank (Lv 200) and send 10,000 messages — the Hunter who defied fate',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 200 }, { type: 'messages', value: 10000 }] },
        title: 'Sung Jin-Woo',
        titleBonus: { xp: 0.5, strengthPercent: 0.1, agilityPercent: 0.15, intelligencePercent: 0.1, critChance: 0.05 }, // Jin-Woo: assassin AGI/Crit, growing INT, balanced warrior
      },
      {
        id: 'the_weakest',
        name: 'The Weakest',
        description: 'Send your first 10 messages',
        condition: { type: 'messages', value: 10 },
        title: 'The Weakest',
        titleBonus: { xp: 0.02, perceptionPercent: 0.05 }, // +2% XP, +5% Perception
      },
      {
        id: 's_rank_jin_woo',
        name: 'S-Rank Hunter Jin-Woo',
        description: 'Reach S-Rank (Lv 200) — Korea\'s 10th S-Rank Hunter',
        condition: { type: 'level', value: 200 },
        title: 'S-Rank Hunter Jin-Woo',
        titleBonus: {
          xp: 0.55,
          agilityPercent: 0.15,
          strengthPercent: 0.1,
          intelligencePercent: 0.1,
          critChance: 0.06,
          perceptionPercent: 0.05,
        }, // S-Rank Jin-Woo: assassin speed, dual dagger crits, shadow INT, combat awareness
      },
      {
        id: 'shadow_sovereign',
        name: 'Shadow Sovereign',
        description: 'Reach Monarch+ rank (Lv 1500) and send 18,000 messages — heir to the shadow throne',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 1500 }, { type: 'messages', value: 18000 }] },
        title: 'Shadow Sovereign',
        titleBonus: { xp: 2.3, intelligencePercent: 0.4, agilityPercent: 0.3, strengthPercent: 0.25, critChance: 0.15 }, // Shadow heir: necromantic INT, shadow speed, growing power
      },
      {
        id: 'ashborn_successor',
        name: "Ashborn's Successor",
        description: 'Reach Monarch+ rank (Lv 1500) and type 500,000 characters — chosen vessel of the Shadow Monarch',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 1500 }, { type: 'characters', value: 500000 }] },
        title: "Ashborn's Successor",
        titleBonus: { xp: 2.4, intelligencePercent: 0.45, agilityPercent: 0.3, strengthPercent: 0.25, vitalityPercent: 0.2, critChance: 0.15 }, // Ashborn's vessel: inheriting shadow necromancy, combat prowess, shadow endurance
      },
      // Ability/Skill Titles
      {
        id: 'arise',
        name: 'Arise',
        description: 'Unlock 10 achievements — the iconic command to summon shadow soldiers from the dead',
        condition: { type: 'achievements', value: 10 },
        title: 'Arise',
        titleBonus: { xp: 0.12, intelligencePercent: 0.1, critChance: 0.01 }, // Arise: invocation of shadow extraction, pure INT
      },
      {
        id: 'shadow_exchange',
        name: 'Shadow Exchange',
        description: 'Send 3,000 messages — instant teleportation by swapping position with a shadow soldier',
        condition: { type: 'messages', value: 3000 },
        title: 'Shadow Exchange',
        titleBonus: { xp: 0.2, agilityPercent: 0.15, critChance: 0.02 }, // Shadow Exchange: instant repositioning, pure AGI mobility
      },
      {
        id: 'dagger_throw_master',
        name: 'Dagger Throw Master',
        description:
          'Land 1,000 critical hits. Special: Agility-scaled (capped) chance for 150x crit multiplier! — Jin-Woo\'s lethal ranged precision',
        condition: { type: 'crits', value: 1000 },
        title: 'Dagger Throw Master',
        titleBonus: { xp: 0.25, critChance: 0.06, agilityPercent: 0.1, perceptionPercent: 0.1 }, // Dagger Throw: speed + precision + lethal accuracy
      },
      {
        id: 'stealth_master',
        name: 'Stealth Master',
        description: 'Be active for 30 hours during off-peak hours — Jin-Woo\'s ability to erase his presence completely',
        condition: { type: 'time', value: 1800 },
        title: 'Stealth Master',
        titleBonus: { xp: 0.18, agilityPercent: 0.1, perceptionPercent: 0.1, critChance: 0.03 }, // Stealth: evasion + counter-detection + ambush crits
      },
      {
        id: 'mana_manipulator',
        name: 'Mana Manipulator',
        description: 'Reach 15 Intelligence stat — mastery over raw mana energy',
        condition: { type: 'stat', stat: 'intelligence', value: 15 },
        title: 'Mana Manipulator',
        titleBonus: { xp: 0.22, intelligencePercent: 0.15, perceptionPercent: 0.05 }, // Mana Mastery: heavy INT + mana sense (PER)
      },
      {
        id: 'shadow_storage',
        name: 'Shadow Storage',
        description: 'Visit 25 unique channels — storing shadow soldiers in a pocket dimension across locations',
        condition: { type: 'channels', value: 25 },
        title: 'Shadow Storage',
        titleBonus: { xp: 0.16, intelligencePercent: 0.1, agilityPercent: 0.05 }, // Shadow Storage: INT to manage pocket dimension, cross-location mobility
      },
      {
        id: 'beast_monarch',
        name: 'Beast Monarch',
        description: 'Reach Monarch rank (Lv 1000) and 30 Strength stat — Rakan, the King of Beasts',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 1000 }, { type: 'stat', stat: 'strength', value: 30 }] },
        title: 'Beast Monarch',
        titleBonus: { xp: 1.8, strengthPercent: 0.45, agilityPercent: 0.25, vitalityPercent: 0.2, perceptionPercent: 0.3, critChance: 0.2 }, // Rakan: raw STR beast, predatory senses + lethal crits
      },
      {
        id: 'frost_monarch',
        name: 'Frost Monarch',
        description: 'Reach Monarch rank (Lv 1000) and send 15,000 messages — Sillad, the King of Snow Folk',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 1000 }, { type: 'messages', value: 15000 }] },
        title: 'Frost Monarch',
        titleBonus: { xp: 1.8, intelligencePercent: 0.45, vitalityPercent: 0.25, perceptionPercent: 0.25, critChance: 0.1 }, // Sillad: cold intelligence, endurance, strategic awareness
      },
      {
        id: 'plague_monarch',
        name: 'Plague Monarch',
        description: 'Reach Monarch rank (Lv 1000) and 30 Intelligence stat — Querehsha, the Queen of Insects',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 1000 }, { type: 'stat', stat: 'intelligence', value: 30 }] },
        title: 'Plague Monarch',
        titleBonus: { xp: 1.8, intelligencePercent: 0.4, perceptionPercent: 0.3, vitalityPercent: 0.25, critChance: 0.08 }, // Querehsha: swarm intelligence, omnisensory awareness, attrition endurance
      },
      {
        id: 'monarch_white_flames',
        name: 'Monarch of White Flames',
        description: 'Reach Monarch rank (Lv 1000) and land 3,000 critical hits — Baran, the King of Demons',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 1000 }, { type: 'crits', value: 3000 }] },
        title: 'Monarch of White Flames',
        titleBonus: { xp: 1.9, strengthPercent: 0.35, intelligencePercent: 0.3, vitalityPercent: 0.2, critChance: 0.18 }, // Baran: brute STR + lightning/fire magic, devastating crits
      },
      {
        id: 'monarch_transfiguration',
        name: 'Monarch of Transfiguration',
        description: 'Reach Monarch rank (Lv 1000) and type 500,000 characters — Yogumunt, the King of Demonic Spectres',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 1000 }, { type: 'characters', value: 500000 }] },
        title: 'Monarch of Transfiguration',
        titleBonus: { xp: 1.8, intelligencePercent: 0.45, agilityPercent: 0.25, perceptionPercent: 0.3, critChance: 0.1 }, // Yogumunt: master illusionist/schemer, spectral evasion, deception awareness
      },
      // Solo Leveling Lore Titles
      {
        id: 'shadow_soldier',
        name: 'Shadow Soldier',
        description: 'Land 100 critical hits — a loyal soldier extracted from the fallen',
        condition: { type: 'crits', value: 100 },
        title: 'Shadow Soldier',
        titleBonus: { xp: 0.08, strengthPercent: 0.05, agilityPercent: 0.05, critChance: 0.01 }, // Shadow Soldier: basic combat stats, loyal fighter
      },
      {
        id: 'kamish_slayer',
        name: 'Kamish Slayer',
        description: 'Reach Level 200 and land 2,000 critical hits — the dragon Kamish required National Level Hunters to defeat',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 200 }, { type: 'crits', value: 2000 }] },
        title: 'Kamish Slayer',
        titleBonus: { xp: 0.5, strengthPercent: 0.15, agilityPercent: 0.1, vitalityPercent: 0.1, critChance: 0.05 }, // Kamish Slayer: dragon-killing STR, survival VIT, decisive strikes
      },
      {
        id: 'demon_tower_conqueror',
        name: 'Demon Tower Conqueror',
        description: 'Reach Level 100 and visit 40 unique channels — conqueror of the Demon King Baran\'s tower',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 100 }, { type: 'channels', value: 40 }] },
        title: 'Demon Tower Conqueror',
        titleBonus: { xp: 0.35, strengthPercent: 0.1, intelligencePercent: 0.1, vitalityPercent: 0.1, critChance: 0.03 }, // Baran's tower: balanced combat (physical + magic demons), endurance gauntlet
      },
      {
        id: 'double_awakening',
        name: 'Double Awakening',
        description: 'Reach Level 50 and send 3,500 messages — the rare phenomenon of awakening a second time, unlocking unlimited growth',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 50 }, { type: 'messages', value: 3500 }] },
        title: 'Double Awakening',
        titleBonus: { xp: 0.2, strengthPercent: 0.05, agilityPercent: 0.05, intelligencePercent: 0.05, vitalityPercent: 0.05, perceptionPercent: 0.05, critChance: 0.02 }, // Double Awakening: ALL stats unlocked (unlimited growth potential)
      },
      {
        id: 'system_user',
        name: 'System User',
        description: 'Unlock 15 achievements — fully interfacing with the System that grants unlimited growth',
        condition: { type: 'achievements', value: 15 },
        title: 'System User',
        titleBonus: { xp: 0.25, intelligencePercent: 0.1, perceptionPercent: 0.1 }, // System User: INT (system interface) + PER (system notifications/awareness)
      },
      {
        id: 'instant_dungeon_master',
        name: 'Instant Dungeon Master',
        description: 'Type 200,000 characters and be active for 75 hours — mastering the System\'s private training dimensions',
        condition: { type: 'compound', conditions: [{ type: 'characters', value: 200000 }, { type: 'time', value: 4500 }] },
        title: 'Instant Dungeon Master',
        titleBonus: { xp: 0.5, intelligencePercent: 0.1, vitalityPercent: 0.1, strengthPercent: 0.05, agilityPercent: 0.05 }, // Instant Dungeon: grinding master, balanced growth from endless training
      },
      {
        id: 'shadow_army_general',
        name: 'Shadow Army General',
        description: 'Reach Level 100 and land 750 critical hits — commanding the shadow army\'s elite forces',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 100 }, { type: 'crits', value: 750 }] },
        title: 'Shadow Army General',
        titleBonus: { xp: 0.35, intelligencePercent: 0.15, strengthPercent: 0.1, agilityPercent: 0.05, critChance: 0.03 }, // Shadow General: strategic INT command, combat STR, tactical strikes
      },
      {
        id: 'monarch_of_beasts',
        name: 'Monarch of Fangs',
        description: 'Reach Monarch rank (Lv 1000) and 40 Strength stat — Rakan, the King of Beasts unleashed',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 1000 }, { type: 'stat', stat: 'strength', value: 40 }] },
        title: 'Monarch of Fangs',
        titleBonus: { xp: 2.0, strengthPercent: 0.5, agilityPercent: 0.3, perceptionPercent: 0.35, critChance: 0.22 }, // Rakan unleashed: apex predator, maximum STR/Crit, hunting instincts
      },
      {
        id: 'monarch_of_plagues',
        name: 'Monarch of Plagues',
        description: 'Reach Monarch+ rank (Lv 1500) and send 20,000 messages — Querehsha, the Queen of Insects ascended',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 1500 }, { type: 'messages', value: 20000 }] },
        title: 'Monarch of Plagues',
        titleBonus: { xp: 2.3, intelligencePercent: 0.45, perceptionPercent: 0.35, vitalityPercent: 0.3, agilityPercent: 0.15, critChance: 0.1 }, // Querehsha ascended: plague mastery, swarm omniscience, corrosive endurance
      },
      {
        id: 'monarch_of_iron_body',
        name: 'Monarch of Iron Body',
        description: 'Reach Monarch rank (Lv 1000) and 35 Vitality stat — Tarnak, the King of Monstrous Humanoids',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 1000 }, { type: 'stat', stat: 'vitality', value: 35 }] },
        title: 'Monarch of Iron Body',
        titleBonus: { xp: 1.8, vitalityPercent: 0.5, strengthPercent: 0.3, critChance: 0.05 }, // Tarnak: indestructible defense, massive VIT, secondary STR
      },
      {
        id: 'monarch_of_beginning',
        name: 'Monarch of Beginning',
        description: 'Reach Monarch rank (Lv 1000) and unlock 30 achievements — Legia, the King of Giants (weakest Monarch)',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 1000 }, { type: 'achievements', value: 30 }] },
        title: 'Monarch of Beginning',
        titleBonus: {
          xp: 1.5,
          strengthPercent: 0.3,
          vitalityPercent: 0.25,
          critChance: 0.05,
        }, // Legia: weakest Monarch, brute force giant, durable but slow and unrefined
      },
      {
        id: 'absolute_ruler',
        name: 'Absolute Ruler',
        description: 'Reach Monarch rank (Lv 1000) and type 600,000 characters — wielder of the Rulers\' full authority',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 1000 }, { type: 'characters', value: 600000 }] },
        title: 'Absolute Ruler',
        titleBonus: {
          xp: 2.0,
          intelligencePercent: 0.45,
          perceptionPercent: 0.35,
          vitalityPercent: 0.3,
          strengthPercent: 0.2,
          agilityPercent: 0.15,
          critChance: 0.12,
        }, // Absolute Ruler: full divine authority, supreme cosmic awareness, immortal endurance
      },
      {
        id: 'shadow_sovereign_heir',
        name: 'Shadow Sovereign Heir',
        description: 'Reach Monarch+ rank (Lv 1500) and land 5,000 critical hits — on the cusp of inheriting the shadow',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 1500 }, { type: 'crits', value: 5000 }] },
        title: 'Shadow Sovereign Heir',
        titleBonus: { xp: 2.3, agilityPercent: 0.35, critChance: 0.2, intelligencePercent: 0.3, strengthPercent: 0.2 }, // Shadow heir through combat: assassin crits, shadow magic, dagger mastery
      },
      {
        id: 'ruler_of_chaos',
        name: 'Ruler of Chaos',
        description: 'Reach National Hunter rank (Lv 700) and be active for 300 hours — power beyond mortal comprehension',
        condition: { type: 'compound', conditions: [{ type: 'level', value: 700 }, { type: 'time', value: 18000 }] },
        title: 'Ruler of Chaos',
        titleBonus: {
          xp: 1.5,
          intelligencePercent: 0.3,
          perceptionPercent: 0.3,
          agilityPercent: 0.2,
          strengthPercent: 0.15,
          critChance: 0.12,
        }, // Chaotic Ruler: unpredictable divine power, heightened awareness, cosmic speed
      },
    ];
  
    // Cache the result (static definitions never change)
    this._cache.achievementDefinitions = achievements;
    return achievements;
  }
};
