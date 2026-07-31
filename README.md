# AI Chat → Nextcloud Exporter (Firefox)

Auto-exports AI chat pages (ChatGPT, Claude, etc.) to Markdown files on your
Nextcloud instance. Triggers automatically after you press Enter in the chat
box, waits a few seconds for the reply to render, extracts the page, crops
noise, masks secrets with regex, and merges the result into an existing
remote file (de-duplicated, append-only) — keyed by the page's URL.

## Install (temporary, for testing)

1. Open Firefox → `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select `manifest.json` from this folder.
4. The extension icon appears in the toolbar. Temporary add-ons are removed
   when Firefox restarts — see "Permanent install" below once you're happy
   with it.

## Configure

1. Click the toolbar icon → **Settings…** (or right-click the icon → Manage
   Extension → Preferences).
2. **Nextcloud base URL**: e.g. `https://cloud.example.com` (no trailing
   slash, no `/remote.php/...` suffix — the extension adds that).
3. **Username**: your Nextcloud login.
4. **App password**: don't use your real password. In Nextcloud go to
   **Settings → Security → Devices & sessions → Create new app password**,
   and paste the generated password here. This way the extension only ever
   holds a revocable, scoped credential.
5. **Remote folder**: where files get created, relative to your Nextcloud
   files root (e.g. `AI-Chats`). It's created automatically.
6. Click **Test connection** to confirm auth works before relying on it.
7. Set the **auto-export delay** (default 10s — how long to wait after Enter
   before scraping the page, to give the model time to finish responding).

### Extraction profiles (cropping / masking / scoping)

The **Extraction profiles** box is a JSON array. Each profile:

```json
{
  "id": "chatgpt",
  "hostnamePattern": "chat\\.openai\\.com|chatgpt\\.com",
  "containerSelector": "main",
  "excludeSelectors": ["nav", "aside", "header", "footer", "button", "form"],
  "startDelimiters": ["BEGIN_EXPORT"],
  "endDelimiters": ["END_EXPORT"],
  "maskRules": [
    { "pattern": "sk-[A-Za-z0-9]{20,}", "flags": "g", "replacement": "[REDACTED_KEY]" },
    { "pattern": "\\b\\d{3}-\\d{2}-\\d{4}\\b", "flags": "g", "replacement": "[REDACTED_SSN]" }
  ]
}
```

- `hostnamePattern` — regex tested against `location.hostname`. The **first**
  profile in the array whose pattern matches is used, so keep a catch-all
  profile with `hostnamePattern: ".*"` **last** in the array as a fallback.
- `containerSelector` — CSS selector to scope extraction to (e.g. the main
  conversation pane), cutting out sidebar/header noise entirely. Leave `""`
  to scan the whole page.
- `excludeSelectors` — CSS selectors to skip anywhere in the scoped tree.
- `startDelimiters` / `endDelimiters` — plain substrings. Everything before
  the **earliest** matching start delimiter is discarded; everything after
  the **earliest** matching end delimiter (searched in what's left) is
  discarded. Leave both empty arrays to disable cropping.
- `maskRules` — regexes applied in order, each with optional `flags`
  (default `"g"`) and a `replacement` string (supports `$1`-style capture
  group references, same as `String.prototype.replace`).

Click **Save settings** when done.

## How it triggers

- A capturing `keydown` listener on every page watches for **Enter** (no
  Shift) while focus is in a `<textarea>`, `<input>`, or `contenteditable`
  element — i.e. a chat prompt box. Nothing is prevented/intercepted; it
  only *observes*.
- On that keystroke it (re)starts a timer for your configured delay, then
  extracts + uploads.
- You can also click the toolbar icon → **Export this page now** for an
  immediate manual export (useful right after loading an old conversation
  you want captured once, without needing to press Enter).

## How the Nextcloud update works

- The first time a given URL is exported, the extension picks a filename
  (sanitized page title + a short hash of the URL) and remembers the
  mapping in local extension storage — so re-exports of the same
  conversation always update the *same* remote file, even if the page title
  changes later.
- On every export it does a WebDAV `GET` of the existing file (empty string
  if none exists / 404), splits both the existing content and the freshly
  extracted content into blocks (split on blank lines), and appends any
  **new** block not already present — preserving everything already saved.
  This is what makes it safe to run repeatedly even when a chat UI only
  renders the last few messages instead of full history: already-seen
  blocks are skipped, genuinely new ones are appended.
- The merged result is `PUT` back to the same path. The parent folder is
  created via `MKCOL` automatically if missing.

## Limitations / notes

- The block-based de-dup is a heuristic (exact-text match on
  blank-line-delimited chunks). If a chat UI re-wraps/re-renders identical
  text with different whitespace between exports, it could occasionally
  produce a near-duplicate block. Tightening this (e.g. per-site
  role/message markers) is possible if you tell me which site's DOM you're
  targeting.
- The app password is stored in `browser.storage.local`, which is not
  encrypted at rest by Firefox. Anyone with local profile access could read
  it — use a dedicated Nextcloud app password (not your login password) so
  you can revoke it independently if needed.
- `<all_urls>` host permission is required so the content script can run
  and the background script can reach your arbitrary Nextcloud domain
  without CORS issues. If you want to lock this down to only specific chat
  sites + your Nextcloud domain, tell me the exact domains and I can narrow
  `manifest.json` accordingly.
- Table markdown assumes simple `<table><tr><td>` structures; deeply nested
  or `colspan`/`rowspan` tables will lose that structure (cells are just
  flattened left-to-right).

## Permanent install

Temporary add-ons vanish on Firefox restart. To keep it installed:
- Simplest: keep using **Load Temporary Add-on** each session, or
- Package as a signed `.xpi` via
  [Mozilla's `web-ext` tool](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/)
  and submit for (self-)signing through
  [addons.mozilla.org](https://addons.mozilla.org/developers/) (can be
  unlisted/private), or
- Use Firefox Developer Edition / Nightly with
  `xpinstall.signatures.required` set to `false` in `about:config` to load
  unsigned `.xpi` files permanently (not recommended for a daily-driver
  profile).
