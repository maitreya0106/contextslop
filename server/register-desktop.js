#!/usr/bin/env node
// Adds the ContextSlop MCP server to the Claude desktop app config.
// The desktop app rewrites its config on quit, so this must run while the app is CLOSED.
//   node server/register-desktop.js          → waits for Claude to quit, patches, reopens Claude
//   node server/register-desktop.js --now    → patch immediately (only if Claude is not running)
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");

const CONFIG = path.join(os.homedir(), "Library/Application Support/Claude/claude_desktop_config.json");
const NODE = ["/opt/homebrew/bin/node", "/usr/local/bin/node"].find((p) => fs.existsSync(p)) || process.execPath;
const MCP = path.join(__dirname, "mcp.js");
const LOG = path.join(__dirname, "..", "data", "register-desktop.log");
const log = (m) => fs.appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`);

const claudeRunning = () => {
  try { execSync('pgrep -x Claude', { stdio: "ignore" }); return true; } catch { return false; }
};

function patch() {
  const c = fs.existsSync(CONFIG) ? JSON.parse(fs.readFileSync(CONFIG, "utf8")) : {};
  c.mcpServers = c.mcpServers || {};
  c.mcpServers.contextslop = { command: NODE, args: [MCP] };
  fs.writeFileSync(CONFIG, JSON.stringify(c, null, 2));
  log(`patched ${CONFIG}`);
}

(async () => {
  if (!process.argv.includes("--now")) {
    log("waiting for Claude to quit…");
    while (claudeRunning()) await new Promise((r) => setTimeout(r, 1000));
    await new Promise((r) => setTimeout(r, 2000)); // let it finish writing config on exit
  } else if (claudeRunning()) {
    console.error("Claude is running — quit it first (it overwrites the config on exit).");
    process.exit(1);
  }
  patch();
  if (!process.argv.includes("--now")) {
    execSync('open -a Claude');
    log("reopened Claude");
  }
  // If launched via `launchctl submit`, remove the job so it doesn't run again.
  try { execSync("launchctl remove com.contextslop.register", { stdio: "ignore" }); } catch {}
  console.log("Done. ContextSlop is registered in Claude desktop.");
})();
