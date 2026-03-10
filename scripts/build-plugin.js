#!/usr/bin/env node
/**
 * Build plugin bundles from src/<PluginName>/ → plugins/<PluginName>.plugin.js
 * Usage:
 *   node scripts/build-plugin.js <PluginName> [--watch]
 *   node scripts/build-plugin.js --all [--watch]
 *
 * Example: node scripts/build-plugin.js UserPanelDockMover
 *          node scripts/build-plugin.js UserPanelDockMover --watch
 *          node scripts/build-plugin.js --all
 */

const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC_ROOT = path.join(ROOT, "src");
const args = process.argv.slice(2);
const watchMode = args.includes("--watch");
const allMode = args.includes("--all");
const pluginName = args.find(arg => !arg.startsWith("--"));

if (allMode && pluginName) {
  console.error("Do not pass a plugin name when using --all.");
  process.exit(1);
}

if (!allMode && !pluginName) {
  console.error("Usage: node scripts/build-plugin.js <PluginName> [--watch]");
  console.error("   or: node scripts/build-plugin.js --all [--watch]");
  process.exit(1);
}

function getPluginPaths(name) {
  const srcDir = path.join(SRC_ROOT, name);
  return {
    srcDir,
    entryPoint: path.join(srcDir, "index.js"),
    manifestPath: path.join(srcDir, "manifest.json"),
    outFile: path.join(ROOT, "plugins", `${name}.plugin.js`)
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
  for (const [key, value] of Object.entries(manifest)) {
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
    await esbuild.build(getBuildOptions(name));
    console.log(`Built -> plugins/${name}.plugin.js`);
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
            console.log(`[${new Date().toLocaleTimeString()}] Rebuilt -> plugins/${name}.plugin.js`);
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
