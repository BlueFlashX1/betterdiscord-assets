# SoloLevelingStats Quest Modular Structure Plan

Date: 2026-03-03  
Scope: Planning only (no implementation in this document)

## 1. Goal
Design a modular quest system that expands beyond current lightweight quest logic while preserving plugin harmony, performance, and maintainability.

Target progression pillars:
- Daily Quests (repeatable short loop)
- Story Quests (chapter/arc progression)
- Demon Castle (floor/challenge progression)

## 2. Design Principles
- Keep `SoloLevelingStats` as the canonical source of player state.
- Build quests as separable modules, not one large mixed system.
- Use event-driven updates from existing plugins to avoid polling-heavy behavior.
- Keep reward writes centralized through one validated application path.
- Support future content packs without rewriting core quest logic.

## 3. Proposed Modular Architecture

### 3.1 Core Modules
- `QuestRegistry`
  - Registers quest definitions by type (`daily`, `story`, `demonCastle`).
  - Holds static schema, requirements, and reward definitions.

- `QuestStateStore`
  - Stores per-user runtime progress and completion state.
  - Persists active quests, completed milestones, and reset metadata.

- `QuestProgressEngine`
  - Consumes normalized gameplay events.
  - Evaluates requirement progress safely and incrementally.

- `QuestRewardEngine`
  - Applies rewards through one write gate.
  - Handles XP, gold/currency, stat points, skill points, item tokens, and buff flags.

- `QuestResetScheduler`
  - Daily reset logic (timezone-aware, deterministic rollover).
  - Rotation and seeding for daily task pools.

- `QuestPresentationAdapter`
  - Read-only projection for UI layers (compact summary + detail popup).
  - No direct writes to state.

### 3.2 Content Modules
- `DailyQuestModule`
  - Randomized/weighted daily objective generation.
  - Hard reset each day with anti-duplication checks.

- `StoryQuestModule`
  - Chapter -> quest chain with prerequisites and unlock conditions.
  - One-time completion + optional branch gates.

- `DemonCastleModule`
  - Floor-based progression and challenge rules.
  - Distinct progression keys, attempt limits, and reward bands.

## 4. Event Contract Layer (Plugin Harmony)
Introduce a normalized event bus contract so quests consume one schema regardless of source plugin:

- `combat.mob_killed`
- `dungeon.cleared`
- `dungeon.boss_defeated`
- `xp.gained`
- `shadow.extracted`
- `skill.used`
- `title.equipped` (optional progression hooks)

Event payload contract should include:
- `timestamp`
- `guildId` / `channelId` (when available)
- `sourcePlugin`
- `actorId`
- `context` (rank, biome, dungeon key, etc.)
- `delta` values for progress counting

## 5. Data Model (High Level)

### 5.1 Quest Definition
- `questId`
- `type` (`daily` | `story` | `demonCastle`)
- `title`, `description`
- `requirements[]` (typed conditions)
- `rewards[]` (typed outputs)
- `prerequisites[]`
- `version`

### 5.2 Player Quest State
- `activeQuests[]`
- `progressByQuestId`
- `completedQuestIds`
- `claimedRewardIds`
- `dailyResetAt`
- `storyCheckpoint`
- `demonCastleProgress` (highest floor, best clear, current attempt state)

## 6. Reward Governance
- Centralized reward application order:
  1. Validate quest completion and claim eligibility
  2. Lock quest state transaction
  3. Apply rewards to canonical stats/inventories
  4. Emit post-reward event for UI/toasts
  5. Persist + unlock

- Prevent duplicate claims with idempotency keys:
  - `rewardClaimKey = userId + questId + questVersion + claimIndex`

## 7. Reset and Rotation Strategy
- Daily reset at configurable local time boundary.
- Rotation pool per category (combat, dungeon, skill, social/utility).
- Weighted randomness + no immediate repeats for player experience quality.

## 8. Rollout Plan (Phased)

### Phase 1: Foundation
- Add quest module boundaries and internal contracts.
- Add normalized event adapter without changing gameplay behavior.

### Phase 2: Daily Quests
- Ship daily objectives + reset scheduler.
- Enable compact quest summary UI and claim flow.

### Phase 3: Story Quests
- Add chapter progression with prerequisite gates.
- Add chapter reward tiers.

### Phase 4: Demon Castle
- Add floor challenge progression.
- Add rank-scaled rewards and optional weekly challenge modifiers.

### Phase 5: Balance + Telemetry
- Tune objective counts, rewards, and completion pacing.
- Add lightweight diagnostics for completion rates and stalled objectives.

## 9. Performance and Safety Constraints
- No full quest reevaluation on every event; apply delta-only updates.
- Batch persistence where safe; avoid synchronous heavy writes in combat loops.
- Guard against malformed cross-plugin events.
- Keep debug logs throttled in high-frequency event paths.

## 10. Non-Goals (Initial Scope)
- No full cinematic narrative engine in first release.
- No global quest editor UI in first release.
- No complex multiplayer cooperative quest syncing in first release.

## 11. Open Design Questions (For Review)
- Should daily quests include rank-dependent generation tied to current strongest cleared dungeon rank?
- Should Demon Castle attempts reset daily or weekly?
- Should story quest rewards include unique unlockables (titles/skills) or stay mostly numeric first?
- Should quest progression pause in hidden/inactive Discord windows to reduce churn?

## 12. Acceptance Criteria for Plan Approval
- Clear module boundaries and ownership are agreed.
- Event contract is accepted by all connected plugin surfaces.
- Reward application path is idempotent and transaction-safe.
- Rollout order and scope are approved before implementation.
