/**
 * check-class-drift.mjs — DiscordClasses drift detector
 *
 * Usage:
 *   node scripts/check-class-drift.mjs                   # markdown report, no snapshot change
 *   node scripts/check-class-drift.mjs --update-snapshot  # write current state as new baseline
 *   node scripts/check-class-drift.mjs --json             # machine-readable JSON output
 *   node scripts/check-class-drift.mjs --quiet            # suppress "new classes" section
 *
 * After auditing renamed/removed findings, run --update-snapshot to acknowledge.
 *
 * Upstream sources:
 *   discordclasses.json — https://raw.githubusercontent.com/itmesarah/DiscordClasses/main/discordclasses.json
 *   classNamesMap.json  — https://raw.githubusercontent.com/fedeericodl/discord-update-classnames/data/classNamesMap.json
 *
 * Exit codes:  0 = no actionable drift  |  1 = removed/renamed classes referenced  |  2 = fetch error
 */

import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const SNAPSHOT_PATH = join(__dirname, ".class-drift-snapshot.json");

const DISCORD_CLASSES_URL =
  "https://raw.githubusercontent.com/itmesarah/DiscordClasses/main/discordclasses.json";
const RENAME_MAP_URL =
  "https://raw.githubusercontent.com/fedeericodl/discord-update-classnames/data/classNamesMap.json";

const SEARCH_ROOTS = [join(REPO_ROOT, "src"), join(REPO_ROOT, "plugins")];
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", "_backups", "backups", "archive"]);
const SEARCH_EXTENSIONS = new Set([".js", ".ts", ".jsx", ".tsx"]);

// Patterns that indicate a stem is being used as a Discord class reference.
// Matches: dc.sel.X, dc.cls.X, dc.fb.X, dc.query(..., 'X'), sel["X"],
//          getByKeys("X"), classNames.X, discord_classes.X etc.
// We only flag stems appearing in these contexts to avoid false positives on
// common JS variable names (content, container, header, etc).
const CLASS_CONTEXT_PATTERNS = [
  // dc.sel/cls/fb property access: dc.sel.chatContent
  /\bdc\s*\.\s*(?:sel|cls|fb|query)\s*[\.\[('"`]/,
  // sel["name"] or sel.name (standalone selector maps)
  /\bsel\s*[\.\[]/,
  // getByKeys("name", ...) — Webpack module lookup
  /getByKeys\s*\(/,
  // discord class object property access: discordClasses.X, DiscordClasses.X
  /discord[Cc]lasses?\s*[\.\[]/,
  // BdApi.Webpack style
  /Webpack\s*\.\s*get(?:ByKeys|Module)\s*\(/,
  // class*= attribute selectors in CSS strings: [class*="chatContent_"]
  /\[class\*=/,
  // dot-class selectors: ".chatContent_", '.chatContent'
  /['"]\s*\.[a-z]/i,
];

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

async function fetchJson(url, label) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${label}`);
  return res.json();
}

async function fetchRenameMap() {
  try {
    const res = await fetch(RENAME_MAP_URL);
    if (res.status === 404) { console.warn("[warn] classNamesMap.json 404 — skipping rename detection"); return null; }
    if (!res.ok) { console.warn(`[warn] classNamesMap.json HTTP ${res.status} — skipping rename detection`); return null; }
    return await res.json();
  } catch (err) {
    console.warn(`[warn] Failed to fetch classNamesMap.json: ${err.message} — skipping rename detection`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Parse discordclasses.json
// ---------------------------------------------------------------------------

function parseDiscordClasses(raw) {
  const stems = new Set();
  const fullNames = new Set();
  for (const [key, value] of Object.entries(raw)) {
    if (key === "host" || key === "channel") continue;
    if (typeof value !== "object" || value === null) continue;
    for (const [stem, fullName] of Object.entries(value)) {
      stems.add(stem);
      if (typeof fullName === "string") {
        for (const part of fullName.split(" ")) { if (part) fullNames.add(part); }
      }
    }
  }
  return { stems, fullNames };
}

function extractStem(fullName) {
  const m = fullName.match(/^(.+?)_+[a-z0-9]{4,}$/i);
  return m ? m[1] : null;
}

/**
 * Build rename index filtered to only stems that appear as Discord class
 * references in the codebase (not just as any identifier).
 */
function buildRenameIndex(renameMap, classRefTokens) {
  if (!renameMap) return new Map();
  const index = new Map();
  for (const [oldFull, newFull] of Object.entries(renameMap)) {
    if (typeof oldFull !== "string" || typeof newFull !== "string") continue;
    const oldStem = extractStem(oldFull);
    const newStem = extractStem(newFull);
    if (oldStem && newStem && oldStem !== newStem && classRefTokens.has(oldStem) && !index.has(oldStem)) {
      index.set(oldStem, { newStem });
    }
  }
  return index;
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

async function loadSnapshot() {
  if (!existsSync(SNAPSHOT_PATH)) return null;
  try { return JSON.parse(await readFile(SNAPSHOT_PATH, "utf8")); } catch { return null; }
}

async function writeSnapshot(data) {
  await writeFile(SNAPSHOT_PATH, JSON.stringify(data, null, 2), "utf8");
}

// ---------------------------------------------------------------------------
// File system scan
// ---------------------------------------------------------------------------

async function collectFiles(dir, files = []) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return files; }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await collectFiles(full, files);
    else if (entry.isFile() && SEARCH_EXTENSIONS.has(extname(entry.name))) files.push(full);
  }
  return files;
}

async function collectTopLevelPluginFiles(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return []; }
  return entries.filter(e => e.isFile() && e.name.endsWith(".plugin.js")).map(e => join(dir, e.name));
}

/**
 * Extract class-like stems from lines that contain Discord class reference patterns.
 * This constrains the rename index to only stems actually used as class names.
 */
async function extractClassRefTokens(filePath) {
  let content;
  try { content = await readFile(filePath, "utf8"); } catch { return new Set(); }
  const tokens = new Set();
  const lines = content.split("\n");
  const identRe = /\b([a-z][a-zA-Z]{2,59})\b/g;
  for (const line of lines) {
    const hasClassContext = CLASS_CONTEXT_PATTERNS.some(p => p.test(line));
    if (!hasClassContext) continue;
    let m;
    while ((m = identRe.exec(line)) !== null) tokens.add(m[1]);
    identRe.lastIndex = 0;
  }
  return tokens;
}

function escapeRegex(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/**
 * Grep a file for target stems, but ONLY on lines that contain Discord class
 * context patterns. This eliminates false positives from plain variable names.
 */
async function grepFile(filePath, targetNames, forRenames = false) {
  let content;
  try { content = await readFile(filePath, "utf8"); } catch { return []; }
  const lines = content.split("\n");
  const hits = [];
  const pattern = new RegExp(
    `(?<![\\w$])(${[...targetNames].map(escapeRegex).join("|")})(?![\\w$])`,
    "g"
  );

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // For rename detection: only match on lines with class reference context
    if (forRenames && !CLASS_CONTEXT_PATTERNS.some(p => p.test(line))) continue;
    const m = pattern.exec(line);
    if (m) {
      hits.push({ file: filePath, lineNumber: i + 1, line: line.trimEnd(), matchedName: m[1] });
      pattern.lastIndex = 0;
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function formatReport({ removed, renamed, added, hitsByName, timestamp, quiet }) {
  const out = [];
  out.push(`## DiscordClasses Drift Report — ${timestamp}\n`);

  out.push(`### Removed classes (${removed.length})`);
  if (!removed.length) { out.push("_None_"); } else {
    for (const name of removed) {
      const hits = hitsByName.get(name) || [];
      if (hits.length) {
        out.push(`- \`${name}\` — referenced in:`);
        for (const h of hits) { out.push(`  - ${relative(REPO_ROOT, h.file)}:${h.lineNumber}\n    \`${h.line.trim()}\``); }
      } else { out.push(`- \`${name}\` — no references found`); }
    }
  }
  out.push("");

  out.push(`### Renamed classes (${renamed.length})`);
  if (!renamed.length) { out.push("_None_"); } else {
    for (const { oldStem, newStem } of renamed) {
      const hits = hitsByName.get(oldStem) || [];
      if (hits.length) {
        out.push(`- \`${oldStem}\` → \`${newStem}\` — referenced in:`);
        for (const h of hits) { out.push(`  - ${relative(REPO_ROOT, h.file)}:${h.lineNumber}\n    \`${h.line.trim()}\``); }
      } else { out.push(`- \`${oldStem}\` → \`${newStem}\` — no references found`); }
    }
  }
  out.push("");

  if (!quiet) {
    out.push(`### New classes (${added.length}) [informational]`);
    if (!added.length) { out.push("_None_"); } else {
      for (const name of added.slice(0, 50)) out.push(`- \`${name}\``);
      if (added.length > 50) out.push(`- ... and ${added.length - 50} more`);
    }
    out.push("");
  }

  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const updateSnapshot = args.includes("--update-snapshot");
  const jsonOutput = args.includes("--json");
  const quiet = args.includes("--quiet");

  let discordClassesRaw, renameMap;
  try {
    [discordClassesRaw, renameMap] = await Promise.all([
      fetchJson(DISCORD_CLASSES_URL, "discordclasses.json"),
      fetchRenameMap(),
    ]);
  } catch (err) {
    console.error(`[error] ${err.message}`);
    process.exit(2);
  }

  const current = parseDiscordClasses(discordClassesRaw);
  const currentSnapshot = {
    fetchedAt: new Date().toISOString(),
    stems: [...current.stems].sort(),
    fullNames: [...current.fullNames].sort(),
  };

  if (updateSnapshot) {
    await writeSnapshot(currentSnapshot);
    console.log(`[ok] Snapshot updated — ${current.stems.size} stems, ${current.fullNames.size} full class names tracked.`);
    process.exit(0);
  }

  const snapshot = await loadSnapshot();
  if (!snapshot) {
    console.warn("[warn] No snapshot found — seeding initial snapshot now.");
    await writeSnapshot(currentSnapshot);
    console.log(`[ok] Initial snapshot written — ${current.stems.size} stems tracked.`);
    console.log(`     Run again (no flags) to generate your first drift report.`);
    process.exit(0);
  }

  const snapStems = new Set(snapshot.stems || []);
  const currStems = new Set(current.stems);
  const removed = [...snapStems].filter(s => !currStems.has(s));
  const added = [...currStems].filter(s => !snapStems.has(s));

  // Collect source files
  const srcFiles = [];
  for (const root of SEARCH_ROOTS) {
    if (!existsSync(root)) continue;
    if (root.endsWith("plugins")) {
      srcFiles.push(...await collectTopLevelPluginFiles(root));
      const entries = await readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !SKIP_DIRS.has(entry.name))
          await collectFiles(join(root, entry.name), srcFiles);
      }
    } else {
      await collectFiles(root, srcFiles);
    }
  }

  // Pre-scan: extract stems used specifically as class references in context
  let classRefTokens = new Set();
  if (renameMap) {
    const tokenSets = await Promise.all(srcFiles.map(extractClassRefTokens));
    for (const ts of tokenSets) for (const t of ts) classRefTokens.add(t);
  }

  // Build rename index constrained to class-reference stems only
  const renameIndex = buildRenameIndex(renameMap, classRefTokens);
  const renamedStems = [...renameIndex.entries()].map(([oldStem, { newStem }]) => ({ oldStem, newStem }));

  // Grep: removed stems (any context) + renamed stems (class-context only)
  const hitsByName = new Map();

  if (removed.length > 0) {
    for (const hit of (await Promise.all(srcFiles.map(f => grepFile(f, new Set(removed), false)))).flat()) {
      if (!hitsByName.has(hit.matchedName)) hitsByName.set(hit.matchedName, []);
      hitsByName.get(hit.matchedName).push(hit);
    }
  }

  if (renamedStems.length > 0) {
    const renameTargets = new Set(renamedStems.map(r => r.oldStem));
    for (const hit of (await Promise.all(srcFiles.map(f => grepFile(f, renameTargets, true)))).flat()) {
      if (!hitsByName.has(hit.matchedName)) hitsByName.set(hit.matchedName, []);
      hitsByName.get(hit.matchedName).push(hit);
    }
  }

  const actionableRemoved = removed.filter(n => hitsByName.has(n));
  const actionableRenamed = renamedStems.filter(r => hitsByName.has(r.oldStem));

  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

  if (jsonOutput) {
    console.log(JSON.stringify({
      timestamp,
      snapshotAge: snapshot.fetchedAt
        ? `${Math.round((Date.now() - new Date(snapshot.fetchedAt)) / 86400000)}d`
        : "unknown",
      removed: removed.map(name => ({
        name,
        referencedIn: (hitsByName.get(name) || []).map(h => ({
          file: relative(REPO_ROOT, h.file), line: h.lineNumber, text: h.line.trim(),
        })),
      })),
      renamed: renamedStems.map(({ oldStem, newStem }) => ({
        oldName: oldStem, newName: newStem,
        referencedIn: (hitsByName.get(oldStem) || []).map(h => ({
          file: relative(REPO_ROOT, h.file), line: h.lineNumber, text: h.line.trim(),
        })),
      })),
      added: quiet ? [] : added,
      stats: {
        totalStems: current.stems.size,
        snapshotStems: (snapshot.stems || []).length,
        filesScanned: srcFiles.length,
        renameMapAvailable: renameMap !== null,
        renamedStemsChecked: renamedStems.length,
      },
    }, null, 2));
  } else {
    process.stdout.write(formatReport({ removed, renamed: renamedStems, added, hitsByName, timestamp, quiet }));
    console.log("---");
    console.log(`Scanned ${srcFiles.length} files. Snapshot from ${snapshot.fetchedAt || "unknown"}.`);
    if (renameMap === null) console.log("[warn] Rename map unavailable — rename detection skipped.");
  }

  if (actionableRemoved.length > 0 || actionableRenamed.length > 0) process.exit(1);
  process.exit(0);
}

main().catch(err => { console.error(`[fatal] ${err.message}`); process.exit(2); });
