#!/usr/bin/env node
/**
 * Build a plugin from src/<PluginName>/ → plugins/<PluginName>.plugin.js
 * Usage: node scripts/build-plugin.js <PluginName> [--watch]
 *
 * Example: node scripts/build-plugin.js UserPanelDockMover
 *          node scripts/build-plugin.js UserPanelDockMover --watch
 */

const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const pluginName = process.argv[2];
const watchMode = process.argv.includes("--watch");

if (!pluginName) {
  console.error("Usage: node scripts/build-plugin.js <PluginName> [--watch]");
  process.exit(1);
}

const srcDir = path.join(ROOT, "src", pluginName);
const entryPoint = path.join(srcDir, "index.js");
const manifestPath = path.join(srcDir, "manifest.json");
const outFile = path.join(ROOT, "plugins", `${pluginName}.plugin.js`);

if (!fs.existsSync(entryPoint)) {
  console.error(`❌ Entry point not found: ${entryPoint}`);
  process.exit(1);
}

// Build metadata banner from manifest.json
function buildBanner() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const lines = ["/**"];
  for (const [key, value] of Object.entries(manifest)) {
    lines.push(` * @${key} ${value}`);
  }
  lines.push(" */");
  return lines.join("\n");
}

const buildOptions = {
  entryPoints: [entryPoint],
  outfile: outFile,
  bundle: true,
  format: "cjs",
  platform: "node",   // keeps fs/path/crypto external (BD polyfills them)
  target: "node16",
  minify: false,      // BD guidelines: no minification
  sourcemap: false,
  loader: { ".css": "text" },  // import styles.css → string
  banner: { js: buildBanner() },
  logLevel: "info",
};

async function build() {
  try {
    await esbuild.build(buildOptions);
    console.log(`✅ Built → plugins/${pluginName}.plugin.js`);
  } catch (err) {
    console.error("❌ Build failed:", err.message);
    process.exit(1);
  }
}

async function watch() {
  const ctx = await esbuild.context({
    ...buildOptions,
    plugins: [{
      name: "rebuild-logger",
      setup(build) {
        build.onEnd(result => {
          if (result.errors.length === 0) {
            console.log(`✅ [${new Date().toLocaleTimeString()}] Rebuilt → plugins/${pluginName}.plugin.js`);
          }
        });
      }
    }]
  });

  await ctx.watch();
  console.log(`👀 Watching src/${pluginName}/ for changes... (Ctrl+C to stop)`);
}

if (watchMode) {
  watch();
} else {
  build();
}
