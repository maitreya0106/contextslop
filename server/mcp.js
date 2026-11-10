#!/usr/bin/env node
// ContextSlop MCP server — zero dependencies, stdio transport.
// Lets Claude (desktop Chat, or any MCP client) search the user's saved X posts.
// Reads data/saves.jsonl directly, so it works even if the HTTP save server is stopped.

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const DATA_DIR = process.env.CONTEXTSLOP_DATA || path.join(__dirname, "..", "data");
const JSONL = path.join(DATA_DIR, "saves.jsonl");

const INSTRUCTIONS =
  "The user saves useful X/Twitter posts (tools, libraries, prompts, checklists, tips, videos) with their ContextSlop extension. " +
  "Use these tools whenever the user mentions something they saw or saved on X/Twitter, asks if they have a resource for something, " +
  "or when you are recommending a tool, library, technique or checklist — check their saves first and cite the post URL. " +
  "Call list_x_saves to see what's there, search_x_saves to find by keyword/tag, get_x_save for one post in full.";

function loadAll() {
  if (!fs.existsSync(JSONL)) return [];
  return fs
    .readFileSync(JSONL, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean)
    .sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
}

function full(s) {
  const lines = [`## ${s.author || "Unknown"} (@${s.handle || "?"})`, `URL: ${s.url}`];
  if (s.postedAt) lines.push(`Posted: ${s.postedAt}`);
  lines.push(`Saved: ${s.savedAt}`);
  if (s.tags?.length) lines.push(`Tags: ${s.tags.map((t) => "#" + t).join(" ")}`);
  if (s.note) lines.push(`User's note: ${s.note}`);
  if (s.media?.length) lines.push(`Media: ${s.media.map((m) => m.type).join(", ")}${s.media.some((m) => m.type === "video") ? " (video content itself is not stored — only the post)" : ""}`);
  if (s.links?.length) lines.push("Links:\n" + s.links.map((l) => `- ${l.text ? l.text + " → " : ""}${l.href}`).join("\n"));
  if (s.text) lines.push("", s.text);
  return lines.join("\n");
}

function oneLine(s) {
  const first = (s.text || s.note || "(no text)").replace(/\s+/g, " ").slice(0, 140);
  const tags = s.tags?.length ? "  " + s.tags.map((t) => "#" + t).join(" ") : "";
  return `- [${s.id}] @${s.handle || "?"}: ${first}${tags}\n  ${s.url}`;
}

const TOOLS = [
  {
    name: "list_x_saves",
    description: "List the user's saved X posts, newest first, one line each (id, author, first line of text, tags, URL).",
    inputSchema: { type: "object", properties: { limit: { type: "number", description: "Max posts (default 50)" } } },
    run: ({ limit = 50 } = {}) => {
      const all = loadAll();
      if (!all.length) return "No saved posts yet.";
      return `${all.length} saved post(s):\n\n` + all.slice(0, limit).map(oneLine).join("\n");
    },
  },
  {
    name: "search_x_saves",
    description:
      "Search the user's saved X posts by keywords (all words must match across text, author, note, tags, links) and/or a tag. Returns full posts.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keywords, e.g. 'seo checklist' or 'react state'" },
        tag: { type: "string", description: "Only posts with this tag (without #)" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
    },
    run: ({ query = "", tag = "", limit = 10 } = {}) => {
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      const t = tag.toLowerCase().replace(/^#/, "");
      const hits = loadAll().filter((s) => {
        if (t && !(s.tags || []).some((x) => x.toLowerCase() === t)) return false;
        const hay = [s.text, s.author, s.handle, s.note, ...(s.tags || []), ...(s.links || []).flatMap((l) => [l.text, l.href])]
          .join(" ")
          .toLowerCase();
        return words.every((w) => hay.includes(w));
      });
      if (!hits.length) return `No saved posts match${query ? ` "${query}"` : ""}${t ? ` #${t}` : ""}. Try fewer words or list_x_saves.`;
      return `${hits.length} match(es):\n\n` + hits.slice(0, limit).map(full).join("\n\n---\n\n");
    },
  },
  {
    name: "get_x_save",
    description: "Get one saved X post in full by its id or URL.",
    inputSchema: { type: "object", properties: { id: { type: "string", description: "Post id or URL" } }, required: ["id"] },
    run: ({ id = "" } = {}) => {
      const key = (String(id).match(/(\d{5,})/) || [])[1] || id;
      const s = loadAll().find((x) => x.id === key || x.url === id);
      return s ? full(s) : `No saved post with id ${id}.`;
    },
  },
];

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}
function fail(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");
}

readline.createInterface({ input: process.stdin }).on("line", (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;
  if (id === undefined) return; // notification (e.g. notifications/initialized)

  switch (method) {
    case "initialize":
      return reply(id, {
        protocolVersion: params?.protocolVersion || "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "contextslop", version: "0.1.0" },
        instructions: INSTRUCTIONS,
      });
    case "ping":
      return reply(id, {});
    case "tools/list":
      return reply(id, { tools: TOOLS.map(({ run, ...t }) => t) });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === params?.name);
      if (!tool) return fail(id, -32602, `Unknown tool ${params?.name}`);
      try {
        return reply(id, { content: [{ type: "text", text: tool.run(params.arguments || {}) }] });
      } catch (e) {
        return reply(id, { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true });
      }
    }
    default:
      return fail(id, -32601, `Method not found: ${method}`);
  }
});
