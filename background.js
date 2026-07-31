/* Owns all communication with Nextcloud (WebDAV) and the merge/de-dup logic. */

function getFilenameForUrl(config, url, title) {
  const existing = config.urlMap[url];
  if (existing && existing.filename) return existing.filename;
  const hash = simpleHash(url);
  return `${sanitizeFilename(title)} - ${hash}.md`;
}

function buildRemotePath(config, filename) {
  const folder = config.nextcloud.remoteFolder.replace(/^\/+|\/+$/g, "");
  return folder ? `${folder}/${filename}` : filename;
}

function buildDavUrl(config, path) {
  const base = config.nextcloud.baseUrl.replace(/\/+$/, "");
  const user = encodeURIComponent(config.nextcloud.username);
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/remote.php/dav/files/${user}/${encodedPath}`;
}

function authHeader(config) {
  return "Basic " + btoa(`${config.nextcloud.username}:${config.nextcloud.appPassword}`);
}

// Creates each folder segment via MKCOL. 201 = created, 405 = already exists; both fine.
async function ensureFolder(config) {
  const folder = config.nextcloud.remoteFolder.replace(/^\/+|\/+$/g, "");
  const segments = folder.split("/").filter(Boolean);
  let pathAcc = "";
  for (const seg of segments) {
    pathAcc += (pathAcc ? "/" : "") + seg;
    const url = buildDavUrl(config, pathAcc);
    try {
      await fetch(url, { method: "MKCOL", headers: { Authorization: authHeader(config) }, credentials: "omit" });
    } catch (e) {
      // network error creating a folder segment; PUT will fail loudly later if this mattered
    }
  }
}

async function fetchExisting(config, davUrl) {
  const res = await fetch(davUrl, { method: "GET", headers: { Authorization: authHeader(config) }, credentials: "omit" });
  if (res.status === 404) return "";
  if (!res.ok) throw new Error(`GET failed: ${res.status} ${res.statusText}`);
  return await res.text();
}

async function putContent(config, davUrl, content) {
  const res = await fetch(davUrl, {
    method: "PUT",
    headers: {
      Authorization: authHeader(config),
      "Content-Type": "text/markdown; charset=utf-8"
    },
    body: content,
	credentials: "omit"
  });
  if (!res.ok) throw new Error(`PUT failed: ${res.status} ${res.statusText}`);
}

// Block-level de-dup: split on blank lines, keep every old block, append any new
// block not already present. Since chat UIs sometimes only render the tail of a
// long conversation, genuinely-new blocks are (correctly) appended at the end.
function mergeDedup(oldText, newText) {
  const splitBlocks = (t) => t.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const oldBlocks = splitBlocks(oldText);
  const newBlocks = splitBlocks(newText);
  const seen = new Set(oldBlocks);
  const merged = oldBlocks.slice();
  for (const b of newBlocks) {
    if (!seen.has(b)) {
      merged.push(b);
      seen.add(b);
    }
  }
  return merged.join("\n\n") + "\n";
}

async function handleExport({ url, title, markdown }) {
  const config = await getConfig();

  if (!config.nextcloud.baseUrl || !config.nextcloud.username || !config.nextcloud.appPassword) {
    console.warn("[AI Exporter] Nextcloud is not configured yet (see extension options)");
    return { ok: false, reason: "not-configured" };
  }

  const filename = getFilenameForUrl(config, url, title);
  const path = buildRemotePath(config, filename);
  const davUrl = buildDavUrl(config, path);

  let existing = "";
  try {
    existing = await fetchExisting(config, davUrl);
  } catch (e) {
    // Folder may not exist yet on first run for this config -- create it and retry once.
    await ensureFolder(config);
    try {
      existing = await fetchExisting(config, davUrl);
    } catch (e2) {
      existing = "";
    }
  }

  const header = existing ? "" : `# ${title}\n\nSource: ${url}\n\n---\n\n`;
  const merged = mergeDedup(existing, markdown);
  const finalContent = existing ? merged : header + merged;

  await ensureFolder(config);
  await putContent(config, davUrl, finalContent);

  config.urlMap[url] = { filename, updated: Date.now() };
  await setConfig(config);

  try {
    await browser.notifications.create({
      type: "basic",
      title: "AI Chat exported",
      message: `${filename} updated on Nextcloud`
    });
  } catch (e) {
    /* notifications permission or platform quirk -- non-fatal */
  }

  return { ok: true, filename };
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "export-chat") {
    return handleExport(msg).catch((err) => {
      console.error("[AI Exporter] export error", err);
      return { ok: false, error: String(err) };
    });
  }
});
