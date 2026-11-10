---
name: x-saves
description: The user's saved X/Twitter posts (tools, libraries, prompts, tips, videos) collected with the ContextSlop extension. Use when the user mentions something they "saw on Twitter/X", "saved", "bookmarked", or asks whether they have a resource/reference for what they're building — and proactively when picking a library, tool, or technique, to check if they saved something relevant.
---

# Saved X posts (ContextSlop)

The user saves X posts from their browser into a local file:

- **Readable:** `{{DATA_DIR}}/SAVES.md` (newest first; author, URL, date, tags, note, links, media, full post text)
- **Structured:** `{{DATA_DIR}}/saves.jsonl` (one JSON object per line: id, url, author, handle, text, postedAt, links[], media[], note, tags[], savedAt)

How to use:
1. Grep first, don't read the whole file: e.g. `grep -i -n -B2 -A20 "react query" "{{DATA_DIR}}/SAVES.md"` or search tags with `#tagname`.
2. Each post's `Links:` contain the actual resources (GitHub repos, docs). Follow them with WebFetch when you need details.
3. Posts with `Media: video` only have the post URL — the content is in the video; say so rather than guessing.
4. Cite the post URL when you use something from it.

If the files don't exist yet, the user hasn't saved anything — say so briefly.
