/**
 * Dungeons — entry point and mixin assembly.
 *
 * ARCHITECTURE (read this before editing any Dungeons/*.js file)
 * -------------------------------------------------------------
 * This plugin is ONE class whose behaviour lives in 40 sibling files. Each of
 * those files exports a plain object of methods; the Object.assign block at the
 * bottom of this file merges them all onto Dungeons.prototype. Consequences a
 * reader will otherwise get wrong:
 *
 *  - Every method in every sibling file shares ONE `this`. A field set in
 *    init-state.js is read directly in combat-*.js. There are no per-module
 *    namespaces and no encapsulation.
 *  - A sibling file can call any other file's method as `this.method()` with no
 *    import. Grep by method name, not by import graph — the import graph is
 *    almost empty and tells you nothing.
 *  - Name collisions across files SILENTLY win by assignment order (the order
 *    in the Object.assign list below). Adding a method whose name already
 *    exists elsewhere replaces it with no warning.
 *  - `this.settings` is user-facing config; `constants.js` is tuning that is
 *    not user-facing. Both are read all over the combat path.
 *
 * WHERE THINGS HAPPEN
 *  - lifecycle.js ................ start()/stop(); the only place teardown belongs
 *  - init-state.js ............... every `this.*` field is declared here first,
 *                                  including the precomputed rank lookup tables
 *  - spawn-core.js / spawn-wave-builders.js .. dungeon + boss + mob creation
 *  - message-observer.js ......... Discord messages -> combat triggers
 *  - combat-primitives.js ........ shared math: rank multipliers, HP factors,
 *                                  handleUserDefeat
 *  - combat-shadow-execution.js .. the shadow army's attack tick (rotation)
 *  - combat-boss-mob.js .......... damage application, the boss damage cap
 *  - combat-role-damage.js ....... the single damage formula everything uses
 *  - difficulty-contributions.js . XP/essence batching + the WARFRONT aggregate
 *  - player-flow.js .............. join/leave/attack for the human player
 *  - player-sync-allocation.js ... how many shadows deploy where
 *  - resurrection-completion.js .. dungeon completion, payouts, revives
 *
 * COMBAT TICK, end to end (the chain most edits touch):
 *   corpse-tick-pipeline.js tick
 *     -> combat-shadow-execution.processShadowAttacks()   (rotating slice)
 *     -> combat-role-damage.calculateDamageBreakdown()    (the one formula)
 *     -> combat-boss-mob.applyDamageToBoss()              (resist, then cap)
 *     -> difficulty-contributions._processWarfrontTick()  (the mass battle)
 *
 * PERFORMANCE INVARIANTS — violating these has caused real, measured stalls:
 *  - Per-tick cost must NOT scale with army size. Combat processes a fixed
 *    TICK_BUDGET slice; the warfront reads an O(ranks) histogram.
 *  - Never full-scan the ShadowArmy store (~281k records ≈ 45-50s).
 *  - Message-driven work belongs on FluxDispatcher, not a DOM observer.
 */
const C = require('./constants');

const Dungeons = class Dungeons {
  static RANK_MULTIPLIERS = C.RANK_MULTIPLIERS;

  constructor() {
    this._initDefaults();
    this._initTimers();
    this._initCaches();
    this._initState();
    this._initUI();
  }
};

Object.assign(
  Dungeons.prototype,
  require('./init-state'),
  require('./corpse-tick-pipeline'),
  require('./lifecycle'),
  require('./ui-header-widget'),
  require('./ui-delegation'),
  require('./settings-persistence'),
  require('./stats-integration'),
  require('./channel-discovery'),
  require('./message-observer'),
  require('./sovereign-doctrines'),
  require('./spawn-core'),
  require('./spawn-wave-builders'),
  require('./player-flow'),
  require('./player-sync-allocation'),
  require('./difficulty-contributions'),
  require('./combat-primitives'),
  require('./combat-role-damage'),
  require('./combat-status-effects'),
  require('./combat-shadow-allocation'),
  require('./combat-shadow-execution'),
  require('./combat-shadow-support'),
  require('./combat-damage-calc'),
  require('./combat-boss-mob'),
  require('./resurrection-completion'),
  require('./arise-extraction'),
  require('./story-mode-core'),
  require('./story-mode-ui'),
  require('./ui-indicators'),
  require('./ui-bossbar'),
  require('./runtime-visibility'),
  require('./notifications-cleanup'),
  require('./restore-gc-toast'),
  require('./settings-layer-tag'),
  require('./css-management')
);

module.exports = Dungeons;
