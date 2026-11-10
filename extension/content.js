// Injects a "Save" button into every post's action bar on x.com.
// Click = quick save. Shift/Alt-click = save with a note + tags.

const MARK = "data-contextslop";

function extract(article) {
  const timeEl = article.querySelector('a[href*="/status/"] time');
  const link = timeEl?.closest("a");
  const url = link ? new URL(link.getAttribute("href"), location.origin).href : location.href;

  const nameBlock = article.querySelector('[data-testid="User-Name"]');
  const spans = nameBlock ? [...nameBlock.querySelectorAll("span")].map((s) => s.textContent.trim()) : [];
  const handle = spans.find((t) => t.startsWith("@")) || "";
  const author = spans.find((t) => t && !t.startsWith("@") && t !== "·") || "";

  const textEl = article.querySelector('[data-testid="tweetText"]');
  const text = textEl?.innerText?.trim() || "";

  const links = [];
  textEl?.querySelectorAll("a[href]").forEach((a) => {
    const href = a.href;
    if (/\/hashtag\/|^https:\/\/(x|twitter)\.com\/[^/]+$/.test(href)) return; // skip hashtags & @mentions
    links.push({ text: a.innerText.replace(/…$/, "").trim(), href });
  });
  article.querySelectorAll('[data-testid="card.wrapper"] a[href]').forEach((a) => {
    if (!links.some((l) => l.href === a.href)) links.push({ text: a.innerText.split("\n")[0]?.trim() || "", href: a.href });
  });

  const media = [];
  article.querySelectorAll('[data-testid="tweetPhoto"] img').forEach((img) => {
    media.push({ type: "image", url: img.src.replace(/name=\w+/, "name=large") });
  });
  if (article.querySelector('video, [data-testid="videoPlayer"], [data-testid="videoComponent"]')) {
    const v = article.querySelector("video");
    media.push({ type: "video", url: url, poster: v?.poster || "" });
  }
  if (article.querySelector('[data-testid="tweetGif"], [aria-label="Embedded video"][data-testid*="gif"]')) {
    media.push({ type: "gif", url });
  }

  return {
    url,
    author,
    handle,
    text,
    postedAt: timeEl?.getAttribute("datetime") || "",
    links,
    media,
    source: "x-button",
  };
}

function toast(msg, ok = true) {
  const t = document.createElement("div");
  t.className = "contextslop-toast" + (ok ? "" : " err");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

function makeButton(article) {
  const btn = document.createElement("button");
  btn.className = "contextslop-btn";
  btn.type = "button";
  btn.title = "Save to ContextSlop (Shift-click to add note/tags)";
  btn.innerHTML =
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M5 3h11l3 3v15H5V3zm2 2v4h8V5H7zm5 7a3 3 0 100 6 3 3 0 000-6z"/></svg>';

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const item = extract(article);
    if (e.shiftKey || e.altKey) {
      const note = prompt("Note (why is this useful?)", "");
      if (note === null) return;
      const tags = prompt("Tags (space or comma separated)", "") || "";
      item.note = note;
      item.tags = tags.split(/[\s,]+/).filter(Boolean);
    }
    btn.classList.add("busy");
    chrome.runtime.sendMessage({ type: "save", item }, (r) => {
      btn.classList.remove("busy");
      if (r?.ok) {
        btn.classList.add("saved");
        toast(r.status === "updated" ? "Updated in ContextSlop" : `Saved (${r.total} total)`);
      } else {
        toast(r?.error || "Save failed", false);
      }
    });
  });
  return btn;
}

function inject(root = document) {
  root.querySelectorAll(`article[data-testid="tweet"]:not([${MARK}])`).forEach((article) => {
    const bar = article.querySelector('[role="group"]');
    if (!bar) return;
    article.setAttribute(MARK, "1");
    const wrap = document.createElement("div");
    wrap.className = "contextslop-wrap";
    wrap.appendChild(makeButton(article));
    bar.appendChild(wrap);
  });
}

inject();
new MutationObserver(() => inject()).observe(document.body, { childList: true, subtree: true });
