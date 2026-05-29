#!/usr/bin/env node
/**
 * Build plugin bundles from src/<PluginName>/ → plugins/<PluginName>.plugin.js
 * Usage:
 *   node scripts/build-plugin.js <PluginName> [--watch]
 *   node scripts/build-plugin.js --all [--watch]
 *   node scripts/build-plugin.js --changed
 *
 * Example: node scripts/build-plugin.js UserPanelDockMover
 *          node scripts/build-plugin.js UserPanelDockMover --watch
 *          node scripts/build-plugin.js --all
 *          node scripts/build-plugin.js --changed
 */

const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC_ROOT = path.join(ROOT, "src");
const args = process.argv.slice(2);
const watchMode = args.includes("--watch");
const allMode = args.includes("--all");
const changedMode = args.includes("--changed");
const pluginName = args.find(arg => !arg.startsWith("--"));

if ([allMode, changedMode, !!pluginName].filter(Boolean).length > 1) {
  console.error("Pick one: <PluginName>, --all, or --changed.");
  process.exit(1);
}

if (changedMode && watchMode) {
  console.error("--changed is a one-shot mode; use --all --watch for continuous rebuilds.");
  process.exit(1);
}

if (!allMode && !changedMode && !pluginName) {
  console.error("Usage: node scripts/build-plugin.js <PluginName> [--watch]");
  console.error("   or: node scripts/build-plugin.js --all [--watch]");
  console.error("   or: node scripts/build-plugin.js --changed");
  process.exit(1);
}

function getPluginPaths(name) {
  const srcDir = path.join(SRC_ROOT, name);
  const manifestPath = path.join(srcDir, "manifest.json");
  let outFileName = `${name}.plugin.js`;

  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (typeof manifest.outputFile === "string" && manifest.outputFile.trim()) {
        outFileName = manifest.outputFile.trim();
      }
    } catch (error) {
      console.warn(`[build-plugin] Failed to parse manifest for ${name}: ${error.message}`);
    }
  }

  return {
    srcDir,
    entryPoint: path.join(srcDir, "index.js"),
    manifestPath,
    outFile: path.join(ROOT, "plugins", outFileName)
  };
}

function getMigratedPluginNames() {
  if (!fs.existsSync(SRC_ROOT)) {
    return [];
  }

  return fs.readdirSync(SRC_ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => {
      const paths = getPluginPaths(name);
      return fs.existsSync(paths.entryPoint) && fs.existsSync(paths.manifestPath);
    })
    .sort();
}

// Build metadata banner from manifest.json
function buildBanner(manifestPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const lines = ["/**"];
  const manifestBuildFields = new Set(["outputFile"]);
  for (const [key, value] of Object.entries(manifest)) {
    if (manifestBuildFields.has(key)) continue;
    lines.push(` * @${key} ${value}`);
  }
  lines.push(" */");
  return lines.join("\n");
}

function getBuildOptions(name) {
  const paths = getPluginPaths(name);
  return {
    entryPoints: [paths.entryPoint],
    outfile: paths.outFile,
    bundle: true,
    format: "cjs",
    platform: "node",   // keeps fs/path/crypto external (BD polyfills them)
    target: "node16",
    minify: false,      // BD guidelines: no minification
    sourcemap: false,
    loader: { ".css": "text" },  // import styles.css → string
    banner: { js: buildBanner(paths.manifestPath) },
    logLevel: "info",
  };
}

async function build(name, exitOnFailure = true) {
  const paths = getPluginPaths(name);
  if (!fs.existsSync(paths.entryPoint)) {
    console.error(`Entry point not found: ${paths.entryPoint}`);
    if (exitOnFailure) {
      process.exit(1);
    }
    return false;
  }

  try {
    // Direct in-place write (esbuild default). Atomic rename was tested and
    // made things worse — `rename` events on macOS fs.watch hit a bug in BD's
    // addon manager where `loadAddon` is called on an already-loaded plugin,
    // throws "alreadyExists", and the catch block silently sets state to
    // disabled. Direct write fires `change` events which go through the safe
    // `reloadAddon` path. The companion PluginGuardian plugin re-enables
    // anything that slips through.
    await esbuild.build(getBuildOptions(name));
    console.log(`Built -> plugins/${path.basename(paths.outFile)}`);
    return true;
  } catch (err) {
    console.error(`Build failed for ${name}:`, err.message);
    if (exitOnFailure) {
      process.exit(1);
    }
    return false;
  }
}

async function watch(name) {
  const paths = getPluginPaths(name);
  if (!fs.existsSync(paths.entryPoint)) {
    throw new Error(`Entry point not found: ${paths.entryPoint}`);
  }

  const ctx = await esbuild.context({
    ...getBuildOptions(name),
    plugins: [{
      name: "rebuild-logger",
      setup(build) {
        build.onEnd(result => {
          if (result.errors.length === 0) {
            const outBase = path.basename(paths.outFile);
            console.log(`[${new Date().toLocaleTimeString()}] Rebuilt -> plugins/${outBase}`);
          }
        });
      }
    }]
  });

  await ctx.watch();
  console.log(`Watching src/${name}/ for changes... (Ctrl+C to stop)`);
  return ctx;
}

async function buildAll() {
  const names = getMigratedPluginNames();
  if (names.length === 0) {
    console.error("No migrated plugins found in src/.");
    process.exit(1);
  }

  console.log(`Building ${names.length} migrated plugins...`);
  let failed = false;
  for (const name of names) {
    const ok = await build(name, false);
    if (!ok) {
      failed = true;
    }
  }

  if (failed) {
    process.exit(1);
  }
}

function getDirMaxMtime(dir) {
  let max = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = getDirMaxMtime(p);
      if (sub > max) max = sub;
    } else {
      const mtime = fs.statSync(p).mtimeMs;
      if (mtime > max) max = mtime;
    }
  }
  return max;
}

function pluginNeedsRebuild(name) {
  const paths = getPluginPaths(name);
  if (!fs.existsSync(paths.outFile)) return true;
  const srcMtime = getDirMaxMtime(paths.srcDir);
  const outMtime = fs.statSync(paths.outFile).mtimeMs;
  return srcMtime > outMtime;
}

async function buildChanged() {
  const names = getMigratedPluginNames();
  if (names.length === 0) {
    console.error("No migrated plugins found in src/.");
    process.exit(1);
  }

  // src/shared/ is imported by many plugins; if it's newer than the oldest
  // plugin output, treat as a global rebuild trigger. Avoids stale plugins
  // when shared code changes.
  let rebuildAll = false;
  const sharedDir = path.join(SRC_ROOT, "shared");
  if (fs.existsSync(sharedDir)) {
    const sharedMtime = getDirMaxMtime(sharedDir);
    let oldestOut = Infinity;
    for (const name of names) {
      const outFile = getPluginPaths(name).outFile;
      if (fs.existsSync(outFile)) {
        const mt = fs.statSync(outFile).mtimeMs;
        if (mt < oldestOut) oldestOut = mt;
      } else {
        oldestOut = 0;
        break;
      }
    }
    if (sharedMtime > oldestOut) {
      rebuildAll = true;
      console.log("[changed] src/shared/ touched; rebuilding all plugins.");
    }
  }

  const toBuild = rebuildAll ? names : names.filter(pluginNeedsRebuild);

  if (toBuild.length === 0) {
    console.log(`[changed] All ${names.length} plugin(s) up to date.`);
    return;
  }

  console.log(`[changed] Rebuilding ${toBuild.length}/${names.length}: ${toBuild.join(", ")}`);
  let failed = false;
  for (const name of toBuild) {
    const ok = await build(name, false);
    if (!ok) failed = true;
  }
  if (failed) process.exit(1);
}

function installShutdownHandlers(contexts) {
  let shuttingDown = false;

  async function shutdown(signalName) {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`\nReceived ${signalName}; disposing watcher contexts...`);
    await Promise.all(contexts.map(ctx => ctx.dispose()));
    process.exit(0);
  }

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

async function watchAll() {
  const names = getMigratedPluginNames();
  if (names.length === 0) {
    console.error("No migrated plugins found in src/.");
    process.exit(1);
  }

  console.log(`Starting watch mode for ${names.length} migrated plugins...`);
  const contexts = [];
  try {
    for (const name of names) {
      const ctx = await watch(name);
      contexts.push(ctx);
    }
  } catch (err) {
    console.error("Failed to start watch mode:", err.message);
    await Promise.all(contexts.map(ctx => ctx.dispose()));
    process.exit(1);
  }

  installShutdownHandlers(contexts);
}

async function main() {
  if (changedMode) {
    await buildChanged();
    return;
  }

  if (allMode) {
    if (watchMode) {
      await watchAll();
    } else {
      await buildAll();
    }
    return;
  }

  if (watchMode) {
    await watch(pluginName);
  } else {
    await build(pluginName);
  }
}

main().catch(err => {
  console.error("Unexpected build script failure:", err);
  process.exit(1);
});
