#!/usr/bin/env node
// Installs a macOS LaunchAgent so the save server starts at login.
// Uninstall: launchctl unload ~/Library/LaunchAgents/com.contextslop.server.plist && rm that file
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");

const label = "com.contextslop.server";
const plist = path.join(os.homedir(), "Library/LaunchAgents", `${label}.plist`);
const server = path.join(__dirname, "server.js");
// Prefer the stable Homebrew symlink so `brew upgrade node` doesn't break the agent.
const node = ["/opt/homebrew/bin/node", "/usr/local/bin/node"].find((p) => fs.existsSync(p)) || process.execPath;
const log = path.join(__dirname, "..", "data", "server.log");
fs.mkdirSync(path.dirname(log), { recursive: true });

fs.writeFileSync(
  plist,
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key><array><string>${node}</string><string>${server}</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${log}</string>
  <key>StandardErrorPath</key><string>${log}</string>
</dict></plist>
`
);
try { execSync(`launchctl unload "${plist}"`, { stdio: "ignore" }); } catch {}
execSync(`launchctl load "${plist}"`);
console.log(`Installed ${plist}\nServer will run at login. Logs: ${log}`);
