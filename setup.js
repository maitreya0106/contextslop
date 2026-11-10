#!/usr/bin/env node
// One-time setup for ContextSlop (macOS). Safe to re-run.
//   1. Installs the `x-saves` skill for Claude Code      (~/.claude/skills/x-saves/SKILL.md)
//   2. Adds a short pointer to global Claude Code memory  (~/.claude/CLAUDE.md)
//   3. Starts the save server at login                    (LaunchAgent)
//   4. Registers the MCP server with the Claude desktop app (waits for you to quit Claude if it's open)
// Flags: --skip-autostart  --skip-desktop
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync, spawnSync } = require("child_process");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const HOME = os.homedir();
const args = process.argv.slice(2);
const NODE = ["/opt/homebrew/bin/node", "/usr/local/bin/node"].find((p) => fs.existsSync(p)) || process.execPath;
fs.mkdirSync(DATA_DIR, { recursive: true });

// 1. Skill
const skillDir = path.join(HOME, ".claude/skills/x-saves");
fs.mkdirSync(skillDir, { recursive: true });
const skill = fs.readFileSync(path.join(ROOT, "claude/x-saves.SKILL.md"), "utf8").replaceAll("{{DATA_DIR}}", DATA_DIR);
fs.writeFileSync(path.join(skillDir, "SKILL.md"), skill);
console.log(`✓ Skill installed → ${skillDir}/SKILL.md`);

// 2. Global CLAUDE.md pointer (between markers, so re-running replaces instead of duplicating)
const claudeMd = path.join(HOME, ".claude/CLAUDE.md");
const START = "<!-- contextslop:start -->", END = "<!-- contextslop:end -->";
const block = `${START}
# Saved X posts (ContextSlop)

I save useful X/Twitter posts (tools, libraries, prompts, checklists, videos) to
\`${DATA_DIR}/SAVES.md\` (structured: \`saves.jsonl\` in the same folder).
When I mention something I saw/saved on X, or when you're choosing a tool, library, technique or
checklist for my project, grep that file first and cite the post URL. See the \`x-saves\` skill for details.
${END}`;
let md = fs.existsSync(claudeMd) ? fs.readFileSync(claudeMd, "utf8") : "";
if (md.includes(START)) md = md.replace(new RegExp(`${START}[\\s\\S]*?${END}`), block);
else if (md.includes("# Saved X posts (ContextSlop)")) md = md.replace(/# Saved X posts \(ContextSlop\)[\s\S]*?x-saves` skill for details\.\n?/, block + "\n");
else md = (md.trim() ? md.trimEnd() + "\n\n" : "") + block + "\n";
fs.writeFileSync(claudeMd, md);
console.log(`✓ Pointer added → ${claudeMd}`);

// 3. Autostart
if (!args.includes("--skip-autostart")) {
  spawnSync(NODE, [path.join(ROOT, "server/install-launchd.js")], { stdio: "inherit" });
  console.log("✓ Save server runs at login (http://127.0.0.1:7777)");
}

// 4. Claude desktop MCP
if (!args.includes("--skip-desktop")) {
  let running = false;
  try { execSync("pgrep -x Claude", { stdio: "ignore" }); running = true; } catch {}
  const reg = path.join(ROOT, "server/register-desktop.js");
  if (!running) {
    spawnSync(NODE, [reg, "--now"], { stdio: "inherit" });
  } else {
    // Claude rewrites its config on quit, so patch after it exits (runs detached under launchd).
    try { execSync("launchctl remove com.contextslop.register", { stdio: "ignore" }); } catch {}
    execSync(`launchctl submit -l com.contextslop.register -- "${NODE}" "${reg}"`);
    console.log("→ Claude desktop is open. Quit it (⌘Q): the MCP server will be registered and Claude reopened automatically.");
  }
}

console.log(`
Next: load the extension — arc://extensions or chrome://extensions → Developer mode → Load unpacked → ${path.join(ROOT, "extension")}`);
