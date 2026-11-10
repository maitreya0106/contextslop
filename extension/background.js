// Forwards saves to the local server. Content scripts on x.com can't reach
// http://127.0.0.1 directly (CSP / mixed content), so they go through here.
const API = "http://127.0.0.1:7777";

async function saveItem(item) {
  try {
    const res = await fetch(`${API}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || res.statusText };
    return { ok: true, ...data };
  } catch (e) {
    return { ok: false, error: "Local server not running (node server/server.js)" };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "save") {
    saveItem(msg.item).then(sendResponse);
    return true; // async response
  }
  if (msg?.type === "health") {
    fetch(`${API}/health`)
      .then((r) => r.json())
      .then((d) => sendResponse({ ok: true, ...d }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
});

// Right-click any link (anywhere on the web) that points to an X post → save it.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "contextslop-save-link",
    title: "Save X post to ContextSlop",
    contexts: ["link"],
    targetUrlPatterns: ["https://x.com/*/status/*", "https://twitter.com/*/status/*"],
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "contextslop-save-link") {
    saveItem({ url: info.linkUrl, source: "context-menu" });
  }
});
