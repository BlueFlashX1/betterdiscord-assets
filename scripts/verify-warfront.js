/**
 * Warfront model verification — asserts the aggregate army-vs-host math obeys
 * Solo Leveling's combat lore, then prints a scenario table for eyeballing.
 *
 * Lore anchors (researched 2026-07-15):
 *  - "It takes 10 C-Ranks to possibly overpower a B-Rank" → one rank step
 *    ≈ 10:1 in mass-battle effectiveness.
 *  - Rank gaps are "walls"; 2+ ranks is functionally a different species —
 *    fodder cannot meaningfully cull a higher host, and elites annihilate
 *    hosts far beneath them (capped 100×).
 *  - At EVEN rank, numbers decide (linear in army size).
 *
 * Mirrors _processWarfrontTick math in src/Dungeons/difficulty-contributions.js.
 * Run: node scripts/verify-warfront.js  (exits non-zero on invariant failure)
 */
const { RANK_ORDER } = require('../src/shared/rank-utils');

const RATE = 0.015;           // warfrontKillRatePerShadow default
const PER_TICK_CAP = 5000;    // warfrontMaxKillsPerTick default
const TICK_S = 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const idx = (r) => RANK_ORDER.indexOf(r);

// histogram entries: "Rank" or ["Rank", count, gradeBump] via helper below.
// GRADE BUMP mirrors production: General +0.5, Marshal +1, Grand Marshal +2 —
// lore: named marshals are monarch-tier individuals (Beru, Igris).
function tick(histogram, hostRank, reserves, { participating = false } = {}) {
  const hostIdx = idx(hostRank);
  let effPower = 0, casualtyWeight = 0;
  for (const [key, count] of Object.entries(histogram)) {
    const [rank, bumpStr] = key.split('|');
    const diff = idx(rank) + (parseFloat(bumpStr) || 0) - hostIdx;
    effPower += count * clamp(Math.pow(10, diff), 0.001, 100);
    casualtyWeight += count * clamp(Math.pow(10, -diff), 0.001, 100);
  }
  if (participating) effPower *= 1.25; // commander's presence
  // SOVEREIGN'S COMMAND: Grand-Marshal-led species share of the army.
  const { ledOffenseShare = 0, ledDefenseShare = 0 } = arguments[3] || {};
  effPower *= 1 + 0.2 * ledOffenseShare;
  casualtyWeight *= 1 - 0.4 * ledDefenseShare;
  const kills = Math.min(reserves, PER_TICK_CAP, Math.floor(effPower * RATE));
  const surplus = Object.values(histogram).reduce((a, b) => a + b, 0);
  const fallen = Math.min(surplus, Math.floor(casualtyWeight * 0.0003));
  return { kills, fallen };
}

let failures = 0;
const assert = (cond, name) => {
  console.log((cond ? '  ✅ ' : '  ❌ ') + name);
  if (!cond) failures++;
};

console.log('── Invariants ──');
// 1. Even rank: numbers decide (linear).
const k10k = tick({ S: 10000 }, 'S', 1e9).kills;
const k20k = tick({ S: 20000 }, 'S', 1e9).kills;
assert(Math.abs(k20k - 2 * k10k) <= 1, `even rank is linear in numbers (10k→${k10k}, 20k→${k20k})`);
// 2. One rank step ≈ 10:1 (10 C-ranks ≈ 1 B-rank).
const oneBelow10x = tick({ A: 100000 }, 'S', 1e9).kills;
const even10x = tick({ S: 10000 }, 'S', 1e9).kills;
assert(Math.abs(oneBelow10x - even10x) <= 1, `10× army one rank below ≈ even-rank army (${oneBelow10x} vs ${even10x})`);
// 3. Species wall: 3 ranks below is fodder (100k E vs S host ≈ nothing).
const fodder = tick({ E: 100000 }, 'S', 1e9).kills;
assert(fodder < even10x / 50, `3+ ranks below ≈ fodder (100k E vs S host: ${fodder} kills/tick)`);
// 4. One rank above = 10× even; 2+ above capped at 100×.
const oneAbove = tick({ SS: 10000 }, 'S', 1e9).kills;
assert(Math.abs(oneAbove - 10 * even10x) <= 10, `one above = 10× even (${oneAbove} vs ${10 * even10x})`);
const farAbove = tick({ Monarch: 1000 }, 'C', 1e9).kills;
const capRef = Math.floor(1000 * 100 * RATE);
assert(farAbove === Math.min(PER_TICK_CAP, capRef), `far above capped at 100× (${farAbove})`);
// 5. Casualties invert: fodder bleeds, elites don't.
const fodderFallen = tick({ E: 100000 }, 'S', 1e9).fallen;
const eliteFallen = tick({ SS: 100000 }, 'S', 1e9).fallen;
const evenFallen = tick({ S: 100000 }, 'S', 1e9).fallen;
assert(fodderFallen > evenFallen && evenFallen > eliteFallen,
  `casualties invert with rank (fodder ${fodderFallen} > even ${evenFallen} > elite ${eliteFallen} per tick)`);

console.log('\n── Scenario table (gate = 10% of host, valve = 600s) ──');
const scenarios = [
  ['20k S-shadows vs S host (10k)', { S: 20000 }, 'S', 10000, {}],
  ['100k mixed (60k SS/30k S/10k A) vs SSS host (50k)', { SS: 60000, S: 30000, A: 10000 }, 'SSS', 50000, {}],
  ['150k SSS+ (20k Marshal, 5k GM) vs Monarch host (250k), Monarch on field',
    { 'SSS+': 125000, 'SSS+|1': 20000, 'SSS+|2': 5000 }, 'Monarch', 250000, { participating: true }],
  ['100k E fodder vs Monarch host (250k)', { E: 100000 }, 'Monarch', 250000, {}],
  ['50k Monarch-rank (10k Marshal) vs Monarch+ host (500k), on field',
    { Monarch: 40000, 'Monarch|1': 10000 }, 'Monarch+', 500000, { participating: true }],
];
for (const [name, hist, hostRank, host, opts] of scenarios) {
  const { kills, fallen } = tick(hist, hostRank, host, opts);
  const gate = Math.floor(host * 0.10);
  const gateS = kills > 0 ? Math.ceil(gate / kills) * TICK_S : Infinity;
  const hostMin = kills > 0 ? Math.round((host / kills) * TICK_S / 60) : Infinity;
  console.log(
    `  ${name}\n    ${kills.toLocaleString()} kills/tick · gate(${gate.toLocaleString()}) in ${
      gateS === Infinity ? 'NEVER (10-min valve opens it)' : gateS + 's'
    } · host falls in ${hostMin === Infinity ? '∞ (frontline only)' : '~' + hostMin + 'min'} · ${fallen.toLocaleString()} shadows fall/tick`
  );
}

// 6. Grade bump: a Marshal fights one rank up at parity; Grand Marshal two.
const marshals = tick({ 'S|1': 10000 }, 'SS', 1e9).kills;
const evenSS = tick({ SS: 10000 }, 'SS', 1e9).kills;
assert(Math.abs(marshals - evenSS) <= 1, `Marshal grade = +1 effective rank (${marshals} vs ${evenSS})`);
// 7. Sovereign's Command: an offense-led army out-kills an identical unled one
//    by the leadership bonus; a defense-led army bleeds 40% less.
const unled = tick({ S: 50000 }, 'S', 1e9, {});
const offLed = tick({ S: 50000 }, 'S', 1e9, { ledOffenseShare: 1 });
const defLed = tick({ S: 50000 }, 'S', 1e9, { ledDefenseShare: 1 });
assert(Math.abs(offLed.kills - Math.floor(unled.kills * 1.2)) <= 1,
  `offense sovereign: +20% war output (${offLed.kills} vs ${unled.kills} unled)`);
assert(defLed.fallen <= Math.ceil(unled.fallen * 0.6),
  `defense sovereign: -40% casualties (${defLed.fallen} vs ${unled.fallen} unled)`);

console.log(failures === 0 ? '\nALL INVARIANTS PASS' : `\n${failures} INVARIANT(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
