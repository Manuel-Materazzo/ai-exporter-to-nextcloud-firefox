/* Shared helpers, loaded by background, content script, and options page. */

const DEFAULT_CONFIG = {
  nextcloud: {
    baseUrl: "",        // e.g. https://cloud.example.com
    username: "",
    appPassword: "",    // Nextcloud "app password", not your real password
    remoteFolder: "AI-Chats"
  },
  autoExport: {
    enabled: true,
    delaySeconds: 10
  },
  notifications: {
    enabled: true
  },
  filterSync: {
    enabled: false,     // when true, profiles are synced to/from Nextcloud
    filename: ".filter-settings.json",  // file inside remoteFolder
    lastPushed: 0       // ms timestamp of last successful push
  },
  // Profiles let you tune extraction per-site. First matching hostnamePattern wins.
  profiles: [
    {
      id: "claude",
      hostnamePattern: "claude\\.ai",
      delaySeconds: 20,
      containerSelector: "",
      excludeSelectors: ["nav", "header", "footer", "button", "form"],
      userMessageSelector: "",
      startDelimiters: [],
      endDelimiters: [],
      maskRules: []
    },
    {
      id: "gemini",
      hostnamePattern: "gemini\\.google\\.com",
      delaySeconds: null,
      containerSelector: "",
      excludeSelectors: ["nav", "header", "footer", "button", "form"],
      userMessageSelector: "",
      startDelimiters: [],
      endDelimiters: [],
      maskRules: []
    },
    {
      id: "chatgpt",
      hostnamePattern: "chatgpt\\.com",
      delaySeconds: null,
      containerSelector: "",
      excludeSelectors: ["nav", "header", "footer", "button", "form"],
      userMessageSelector: "",
      startDelimiters: [],
      endDelimiters: [],
      maskRules: []
    },
    {
      id: "perplexity",
      hostnamePattern: "(www\\.)?perplexity\\.ai",
      delaySeconds: 20,
      containerSelector: "",
      excludeSelectors: ["nav", "header", "footer", "button", "form"],
      userMessageSelector: "",
      startDelimiters: [],
      endDelimiters: [],
      maskRules: []
    },
    {
      id: "deepseek",
      hostnamePattern: "chat\\.deepseek\\.com",
      delaySeconds: null,
      containerSelector: "",
      excludeSelectors: ["nav", "header", "footer", "button", "form"],
      userMessageSelector: "",
      startDelimiters: [],
      endDelimiters: [],
      maskRules: []
    },
    {
      id: "qwen",
      hostnamePattern: "chat\\.qwen\\.ai",
      delaySeconds: null,
      containerSelector: "",
      excludeSelectors: ["nav", "header", "footer", "button", "form"],
      userMessageSelector: "",
      startDelimiters: [],
      endDelimiters: [],
      maskRules: []
    },
    {
      id: "kimi",
      hostnamePattern: "(www\\.)?kimi\\.com",
      delaySeconds: null,
      containerSelector: "",
      excludeSelectors: ["nav", "header", "footer", "button", "form"],
      userMessageSelector: "",
      startDelimiters: [],
      endDelimiters: [],
      maskRules: []
    },
    {
      id: "mistral",
      hostnamePattern: "chat\\.mistral\\.ai",
      delaySeconds: null,
      containerSelector: "",
      excludeSelectors: ["nav", "header", "footer", "button", "form"],
      userMessageSelector: "",
      startDelimiters: [],
      endDelimiters: [],
      maskRules: []
    }
  ],
  urlMap: {}   // url -> { filename, updated } -- persisted mapping so re-exports hit the same remote file
};

function sanitizeFilename(name) {
  return (name || "untitled")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "untitled";
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

async function getConfig() {
  const stored = await browser.storage.local.get("config");
  const cfg = stored.config || {};
  return {
    nextcloud: { ...DEFAULT_CONFIG.nextcloud, ...(cfg.nextcloud || {}) },
    autoExport: { ...DEFAULT_CONFIG.autoExport, ...(cfg.autoExport || {}) },
    notifications: { ...DEFAULT_CONFIG.notifications, ...(cfg.notifications || {}) },
    filterSync: { ...DEFAULT_CONFIG.filterSync, ...(cfg.filterSync || {}) },
    profiles: (cfg.profiles && cfg.profiles.length) ? cfg.profiles : DEFAULT_CONFIG.profiles,
    urlMap: cfg.urlMap || {}
  };
}

async function setConfig(cfg) {
  await browser.storage.local.set({ config: cfg });
}

function matchProfile(profiles, hostname) {
  for (const p of profiles) {
    try {
      const re = new RegExp(p.hostnamePattern);
      if (re.test(hostname)) return p;
    } catch (e) {
      /* invalid regex in a profile: skip it */
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Filter-settings sync helpers (shared by background and options page)
// ---------------------------------------------------------------------------

/**
 * Build the WebDAV URL for the filter-settings JSON file.
 */
function filterSyncDavUrl(config) {
  const base = config.nextcloud.baseUrl.replace(/\/+$/, "");
  const user = encodeURIComponent(config.nextcloud.username);
  const folder = config.nextcloud.remoteFolder.replace(/^\/+|\/+$/g, "");
  const filename = config.filterSync.filename || DEFAULT_CONFIG.filterSync.filename;
  const remotePath = folder ? `${folder}/${filename}` : filename;
  const encodedPath = remotePath.split("/").map(encodeURIComponent).join("/");
  return `${base}/remote.php/dav/files/${user}/${encodedPath}`;
}

function filterSyncAuthHeader(config) {
  return "Basic " + btoa(`${config.nextcloud.username}:${config.nextcloud.appPassword}`);
}

/**
 * Push the current profiles (and autoExport/notifications) to Nextcloud.
 * Returns { ok, updatedAt } or throws.
 */
async function pushFilterSettings(config) {
  const davUrl = filterSyncDavUrl(config);
  const now = Date.now();
  const payload = JSON.stringify({
    updatedAt: now,
    profiles: config.profiles,
    autoExport: config.autoExport,
    notifications: config.notifications
  }, null, 2);

  const res = await fetch(davUrl, {
    method: "PUT",
    headers: {
      Authorization: filterSyncAuthHeader(config),
      "Content-Type": "application/json; charset=utf-8"
    },
    body: payload,
    credentials: "omit"
  });
  if (!res.ok) throw new Error(`PUT failed: ${res.status} ${res.statusText}`);
  return { ok: true, updatedAt: now };
}

/**
 * Pull the remote filter settings.
 * Returns null if the file does not exist, or the parsed object.
 */
async function pullFilterSettings(config) {
  const davUrl = filterSyncDavUrl(config);
  const res = await fetch(davUrl, {
    method: "GET",
    headers: { Authorization: filterSyncAuthHeader(config) },
    credentials: "omit"
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET failed: ${res.status} ${res.statusText}`);
  return await res.json();
}

/**
 * Sync filter settings with Nextcloud using date/time to decide what to keep.
 *
 * Strategy:
 *   - If the remote file doesn't exist → push current local settings.
 *   - If remote.updatedAt > config.filterSync.lastPushed → remote is newer → pull.
 *   - Otherwise → local is newer (or equal) → push.
 *
 * Returns { action: 'push'|'pull'|'none', updatedAt, profiles?, autoExport?, notifications? }
 */
async function syncFilterSettings(config) {
  const remote = await pullFilterSettings(config);

  // Nothing on the server yet → push immediately.
  if (!remote) {
    const { updatedAt } = await pushFilterSettings(config);
    return { action: "push", updatedAt };
  }

  const remoteTs = remote.updatedAt || 0;
  const localTs  = config.filterSync.lastPushed || 0;

  // On initial sync (lastPushed === 0) or whenever remote is newer, adopt remote settings.
  if (localTs === 0 || remoteTs > localTs) {
    return {
      action: "pull",
      updatedAt: remoteTs,
      profiles: remote.profiles,
      autoExport: remote.autoExport,
      notifications: remote.notifications
    };
  }

  // Local is newer → push.
  const { updatedAt } = await pushFilterSettings(config);
  return { action: "push", updatedAt };
}
