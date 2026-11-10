# ContextSlop

Save useful X/Twitter posts from your browser into a local store that **Claude Code** (every project) and the **Claude desktop app** (Chat) can search.

See a great tool, prompt or checklist on X → click save → later, in any project: *"check my X saves for a launch checklist"*.

- 100% local: no cloud, no database, no npm dependencies — just Node and two files.
- ~60 MB RAM idle, 0% CPU, ~1–2 KB disk per post.
- Works in any Chromium browser (Arc, Chrome, Brave, Edge). macOS for autostart + desktop setup.

## How it works

```
Browser (x.com)
  extension/content.js   save icon on every post → reads author, text, links, images/video, time
  extension/popup.js     paste any post link (+ note, tags)
  right-click menu       "Save X post to ContextSlop" on any X link
        │
        ▼  POST http://127.0.0.1:7777/save   (localhost only)
server/server.js         normalizes URL, de-dupes (merges tags/notes), fills text for
                         pasted links via X's public oEmbed, writes:
        │
        ▼
data/saves.jsonl         source of truth (one JSON per line)
data/SAVES.md            readable, regenerated on every save
        ▲                                   ▲
        │ grep                              │ reads directly
Claude Code                          server/mcp.js (MCP, stdio)
  ~/.claude/skills/x-saves             tools: list_x_saves, search_x_saves, get_x_save
  ~/.claude/CLAUDE.md pointer          used by Claude desktop Chat
```

## Install

Requires Node 18+.

```bash
git clone https://github.com/maitreya0106/contextslop.git
cd contextslop
node setup.js
```

`setup.js` (safe to re-run):

1. installs the `x-saves` skill → `~/.claude/skills/x-saves/SKILL.md`
2. adds a short pointer to `~/.claude/CLAUDE.md` so every Claude Code session knows your saves exist
3. starts the save server at login (macOS LaunchAgent)
4. registers the MCP server in the Claude desktop app. If Claude is open, quit it (⌘Q) — the app rewrites its config on quit, so setup waits, patches it, and reopens Claude.

Flags: `--skip-autostart`, `--skip-desktop`.

Then load the extension:

1. Open `arc://extensions` (Arc) or `chrome://extensions` (Chrome)
2. Turn on **Developer mode** → **Load unpacked** → select the `extension/` folder
3. In Arc, pin it from the extensions menu so the popup is handy

## Saving

| Where | How |
|---|---|
| On x.com | Click the save icon at the end of a post's action bar. **Shift-click** to add a note + tags. |
| Any link (incl. video posts) | Extension popup → paste link (auto-filled from current tab / clipboard) → Save |
| Anywhere on the web | Right-click a link to an X post → *Save X post to ContextSlop* |

Saving the same post again merges tags and notes instead of duplicating.
Videos: the post link and text are saved, not the video file.

## Using your saves

- **Claude Code (any project):** "did I save anything about auth libraries?", "use that PDF tool I saved from X". Claude also checks your saves when picking tools or libraries.
- **Claude desktop Chat:** start a new chat and ask "what have I saved from X?" — it uses the `contextslop` connector.
- **Yourself:** open `data/SAVES.md`, or `http://127.0.0.1:7777/saves?q=keyword` for JSON.

claude.ai on the web/phone can't reach your Mac, so it can't see local saves.

## Commands

```bash
npm start                  # run the save server in the foreground
npm run autostart          # (re)install the login LaunchAgent
npm run register-desktop   # re-register MCP in Claude desktop (waits for Claude to quit)
```

Uninstall autostart:

```bash
launchctl unload ~/Library/LaunchAgents/com.contextslop.server.plist && rm ~/Library/LaunchAgents/com.contextslop.server.plist
```

Remove from Claude desktop: delete `mcpServers.contextslop` from `~/Library/Application Support/Claude/claude_desktop_config.json` while Claude is quit.

## Config

| Env var | Default |
|---|---|
| `CONTEXTSLOP_PORT` | `7777` (the extension's `host_permissions` and `background.js` also use 7777) |
| `CONTEXTSLOP_DATA` | `./data` |

## Troubleshooting

- **Popup says "server offline"** → `curl 127.0.0.1:7777/health`; check `data/server.log`; run `npm run autostart`.
- **No save icon on x.com** → reload the extension and the X tab. X changes its markup occasionally; selectors live in `extension/content.js`.
- **Chat doesn't see saves** → confirm `contextslop` is in `claude_desktop_config.json` under `mcpServers`, then fully quit and reopen Claude. Logs: `~/Library/Logs/Claude/main.log`.

## Privacy

`data/` is git-ignored. Nothing leaves your machine except the optional oEmbed lookup to `publish.twitter.com` when you save a bare link.

## License

MIT
