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
  // Profiles let you tune extraction per-site. First matching hostnamePattern wins.
  // Keep a catch-all "default" profile (hostnamePattern ".*") last.
  profiles: [
    {
      id: "default",
      hostnamePattern: ".*",
      containerSelector: "",              // CSS selector to scope extraction; empty = whole <body>
      excludeSelectors: ["nav", "header", "footer", "button", "form"],
      startDelimiters: [],                // drop everything BEFORE the earliest match
      endDelimiters: [],                  // drop everything AFTER the earliest match (searched after start cut)
      maskRules: []                       // [{pattern, flags, replacement}] applied in order
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
  return profiles[profiles.length - 1];
}
