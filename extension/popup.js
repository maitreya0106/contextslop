const $ = (id) => document.getElementById(id);
const isPost = (u) => /^https:\/\/(x|twitter|mobile\.x)\.com\/[^/]+\/status\/\d+/.test(u || "");

chrome.runtime.sendMessage({ type: "health" }, (r) => {
  $("status").className = r?.ok ? "ok" : "bad";
  $("status").textContent = r?.ok ? `${r.count} saved` : "server offline";
});

// Prefill: current tab if it's a post, else clipboard if it holds a post link.
chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
  if (isPost(tab?.url)) return ($("url").value = tab.url);
  try {
    const clip = (await navigator.clipboard.readText()).trim();
    if (isPost(clip)) $("url").value = clip;
  } catch {}
});

$("save").addEventListener("click", () => {
  const url = $("url").value.trim();
  if (!url) return ($("msg").textContent = "Paste a link first.");
  $("save").disabled = true;
  const item = {
    url,
    note: $("note").value.trim(),
    tags: $("tags").value.split(/[\s,]+/).filter(Boolean),
    source: "popup",
  };
  chrome.runtime.sendMessage({ type: "save", item }, (r) => {
    $("save").disabled = false;
    $("msg").style.color = r?.ok ? "#00ba7c" : "#f4212e";
    $("msg").textContent = r?.ok ? `${r.status === "updated" ? "Updated" : "Saved"} — ${r.total} total` : r?.error || "Failed";
    if (r?.ok) { $("note").value = ""; $("tags").value = ""; }
  });
});
