#!/usr/bin/env node
// ContextSlop local save server — zero dependencies.
// Receives saved X/Twitter posts from the Chrome extension and stores them in:
//   data/saves.jsonl  (source of truth, one JSON object per line)
//   data/SAVES.md     (regenerated on every save; easy for Claude Code to read/grep)

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.CONTEXTSLOP_PORT || 7777);
const HOST = "127.0.0.1";
const DATA_DIR = process.env.CONTEXTSLOP_DATA || path.join(__dirname, "..", "data");
const JSONL = path.join(DATA_DIR, "saves.jsonl");
const MD = path.join(DATA_DIR, "SAVES.md");

fs.mkdirSync(DATA_DIR, { recursive: true });

function loadAll() {
  if (!fs.existsSync(JSONL)) return [];
  return fs
    .readFileSync(JSONL, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    })
    .filter(Boolean);
}

function writeAll(items) {
  fs.writeFileSync(JSONL, items.map((i) => JSON.stringify(i)).join("\n") + (items.length ? "\n" : ""));
  fs.writeFileSync(MD, renderMarkdown(items));
}

function renderMarkdown(items) {
  const sorted = [...items].sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
  const out = [
    "# ContextSlop — saved X posts",
    "",
    `${sorted.length} saved. Newest first. Source of truth: saves.jsonl (this file is regenerated).`,
    "",
  ];
  for (const s of sorted) {
    const who = [s.author, s.handle && `@${s.handle.replace(/^@/, "")}`].filter(Boolean).join(" ");
    out.push(`## ${who || "Unknown"} — ${s.id || ""}`);
    out.push("");
    out.push(`- URL: ${s.url}`);
    if (s.postedAt) out.push(`- Posted: ${s.postedAt}`);
    out.push(`- Saved: ${s.savedAt}`);
    if (s.tags?.length) out.push(`- Tags: ${s.tags.map((t) => `#${t}`).join(" ")}`);
    if (s.media?.length) {
      const kinds = s.media.map((m) => m.type);
      out.push(`- Media: ${kinds.join(", ")}`);
      for (const m of s.media) if (m.url) out.push(`  - ${m.type}: ${m.url}`);
    }
    if (s.links?.length) {
      out.push(`- Links:`);
      for (const l of s.links) out.push(`  - ${l.text ? `${l.text} → ` : ""}${l.href}`);
    }
    if (s.note) out.push(`- Note: ${s.note}`);
    out.push("");
    if (s.text) {
      out.push(s.text.split("\n").map((l) => `> ${l}`).join("\n"));
      out.push("");
    }
  }
  return out.join("\n");
}

function tweetId(url) {
  const m = String(url || "").match(/status(?:es)?\/(\d+)/);
  return m ? m[1] : null;
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    if (/(^|\.)(x|twitter)\.com$/.test(u.hostname)) {
      u.hostname = "x.com";
      u.search = "";
      u.hash = "";
      // Strip trailing /photo/1, /video/1, /analytics etc.
      u.pathname = u.pathname.replace(/(\/status\/\d+).*$/, "$1");
    }
    return u.toString();
  } catch {
    return url;
  }
}

// Best-effort: fill in author/text for pasted links using X's public oEmbed endpoint (no auth).
async function enrichFromOembed(item) {
  if (item.text || !item.id) return item;
  try {
    const res = await fetch(
      `https://publish.twitter.com/oembed?omit_script=1&url=${encodeURIComponent(item.url)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return item;
    const j = await res.json();
    const p = (j.html || "").match(/<p[^>]*>([\s\S]*?)<\/p>/);
    if (p) {
      item.text = p[1]
        .replace(/<br\s*\/?>/g, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .trim();
    }
    if (!item.author && j.author_name) item.author = j.author_name;
    if (!item.handle && j.author_url) item.handle = j.author_url.split("/").pop();
  } catch {
    /* offline or blocked — keep the bare link */
  }
  return item;
}

async function save(body) {
  if (!body?.url) throw new Error("url is required");
  const url = normalizeUrl(body.url.trim());
  const item = {
    id: tweetId(url),
    url,
    author: body.author || "",
    handle: (body.handle || "").replace(/^@/, ""),
    text: body.text || "",
    postedAt: body.postedAt || "",
    media: Array.isArray(body.media) ? body.media : [],
    links: Array.isArray(body.links) ? body.links : [],
    note: body.note || "",
    tags: Array.isArray(body.tags)
      ? body.tags.map((t) => String(t).trim().replace(/^#/, "")).filter(Boolean)
      : [],
    source: body.source || "extension",
    savedAt: new Date().toISOString(),
  };
  const all = loadAll();
  const idx = all.findIndex((s) => (item.id ? s.id === item.id : s.url === item.url));
  if (idx < 0 || !all[idx].text) await enrichFromOembed(item);
  let status = "created";
  if (idx >= 0) {
    // Merge: keep richer fields, union tags, append note.
    const old = all[idx];
    all[idx] = {
      ...old,
      ...Object.fromEntries(Object.entries(item).filter(([, v]) => v && (!Array.isArray(v) || v.length))),
      tags: [...new Set([...(old.tags || []), ...item.tags])],
      note: [old.note, item.note].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" | "),
      savedAt: old.savedAt,
      updatedAt: item.savedAt,
    };
    status = "updated";
  } else {
    all.push(item);
  }
  writeAll(all);
  return { status, item: idx >= 0 ? all[idx] : item, total: all.length };
}

function send(res, code, obj) {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://${HOST}`);
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.method === "GET" && u.pathname === "/health") return send(res, 200, { ok: true, count: loadAll().length });
  if (req.method === "GET" && u.pathname === "/saves") {
    const q = (u.searchParams.get("q") || "").toLowerCase();
    const all = loadAll();
    return send(res, 200, q ? all.filter((s) => JSON.stringify(s).toLowerCase().includes(q)) : all);
  }
  if (req.method === "POST" && u.pathname === "/save") {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 1e6) req.destroy();
    });
    req.on("end", async () => {
      try {
        const r = await save(JSON.parse(raw || "{}"));
        console.log(`[${r.status}] ${r.item.url}`);
        send(res, 200, r);
      } catch (e) {
        send(res, 400, { error: e.message });
      }
    });
    return;
  }
  send(res, 404, { error: "not found" });
});

server.listen(PORT, HOST, () => {
  console.log(`ContextSlop listening on http://${HOST}:${PORT}  →  ${DATA_DIR}`);
});
