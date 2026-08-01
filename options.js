async function loadIntoForm() {
  const config = await getConfig();

  document.getElementById("baseUrl").value = config.nextcloud.baseUrl;
  document.getElementById("username").value = config.nextcloud.username;
  document.getElementById("appPassword").value = config.nextcloud.appPassword;
  document.getElementById("remoteFolder").value = config.nextcloud.remoteFolder;

  document.getElementById("autoEnabled").checked = config.autoExport.enabled;
  document.getElementById("delaySeconds").value = config.autoExport.delaySeconds;

  document.getElementById("notificationsEnabled").checked = config.notifications ? config.notifications.enabled !== false : true;

  document.getElementById("filterSyncEnabled").checked = config.filterSync.enabled;
  document.getElementById("filterSyncFilename").value = config.filterSync.filename || DEFAULT_CONFIG.filterSync.filename;
  updateLastSyncedLabel(config.filterSync.lastPushed);

  document.getElementById("profilesJson").value = JSON.stringify(config.profiles, null, 2);
}

function readForm() {
  const baseUrl = document.getElementById("baseUrl").value.trim();
  const username = document.getElementById("username").value.trim();
  const appPassword = document.getElementById("appPassword").value;
  const remoteFolder = document.getElementById("remoteFolder").value.trim() || "AI-Chats";
  const autoEnabled = document.getElementById("autoEnabled").checked;
  const delaySeconds = Math.max(1, Number(document.getElementById("delaySeconds").value) || 10);
  const notificationsEnabled = document.getElementById("notificationsEnabled").checked;
  const filterSyncEnabled = document.getElementById("filterSyncEnabled").checked;
  const filterSyncFilename = document.getElementById("filterSyncFilename").value.trim() || DEFAULT_CONFIG.filterSync.filename;

  let profiles;
  try {
    profiles = JSON.parse(document.getElementById("profilesJson").value);
    if (!Array.isArray(profiles) || !profiles.length) throw new Error("must be a non-empty array");
  } catch (e) {
    throw new Error("Profiles JSON is invalid: " + e.message);
  }

  return { baseUrl, username, appPassword, remoteFolder, autoEnabled, delaySeconds, notificationsEnabled, filterSyncEnabled, filterSyncFilename, profiles };
}

async function save() {
  const statusEl = document.getElementById("saveStatus");
  try {
    const form = readForm();
    const existing = await getConfig();
    const newConfig = {
      nextcloud: {
        baseUrl: form.baseUrl,
        username: form.username,
        appPassword: form.appPassword,
        remoteFolder: form.remoteFolder
      },
      autoExport: {
        enabled: form.autoEnabled,
        delaySeconds: form.delaySeconds
      },
      notifications: {
        enabled: form.notificationsEnabled
      },
      filterSync: {
        enabled: form.filterSyncEnabled,
        filename: form.filterSyncFilename,
        // Reset lastPushed so the updated local settings are treated as newer on next sync.
        lastPushed: form.filterSyncEnabled ? Date.now() : existing.filterSync.lastPushed
      },
      profiles: form.profiles,
      urlMap: existing.urlMap || {}
    };
    await setConfig(newConfig);

    // If sync is enabled, immediately push the freshly-saved settings to Nextcloud.
    if (form.filterSyncEnabled) {
      try {
        const result = await browser.runtime.sendMessage({ type: "sync-filter-settings" });
        if (result && result.ok) {
          updateLastSyncedLabel(result.updatedAt);
          statusEl.textContent = `Saved and synced to Nextcloud (${result.action}).`;
        } else {
          statusEl.textContent = "Saved. Sync skipped: " + (result && result.reason || "unknown");
        }
      } catch (syncErr) {
        statusEl.textContent = "Saved, but sync failed: " + syncErr.message;
      }
    } else {
      statusEl.textContent = "Saved.";
    }

    statusEl.className = "ok";
  } catch (e) {
    statusEl.textContent = "Error: " + e.message;
    statusEl.className = "err";
  }
}

function resetProfiles() {
  document.getElementById("profilesJson").value = JSON.stringify(DEFAULT_CONFIG.profiles, null, 2);
}

async function testConnection() {
  const statusEl = document.getElementById("testStatus");
  statusEl.textContent = "Testing…";
  statusEl.className = "";
  try {
    const form = readForm();
    const base = form.baseUrl.replace(/\/+$/, "");
    const user = encodeURIComponent(form.username);
    const url = `${base}/remote.php/dav/files/${user}/`;
    const res = await fetch(url, {
      method: "PROPFIND",
      headers: {
        Authorization: "Basic " + btoa(`${form.username}:${form.appPassword}`),
        Depth: "0"
      }, 
	  credentials: "omit"
    });
    if (res.status === 207 || res.ok) {
      statusEl.textContent = "Connection OK.";
      statusEl.className = "ok";
    } else if (res.status === 401) {
      statusEl.textContent = "Authentication failed (check username/app password).";
      statusEl.className = "err";
    } else {
      statusEl.textContent = `Unexpected response: ${res.status} ${res.statusText}`;
      statusEl.className = "err";
    }
  } catch (e) {
    statusEl.textContent = "Error: " + e.message + " (check the base URL and that the domain is reachable)";
    statusEl.className = "err";
  }
}

function updateLastSyncedLabel(ts) {
  const el = document.getElementById("filterSyncLastSynced");
  if (!el) return;
  if (!ts) { el.textContent = ""; return; }
  const d = new Date(ts);
  el.textContent = `Last synced: ${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}

async function syncNow() {
  const statusEl = document.getElementById("syncStatus");
  statusEl.textContent = "Syncing…";
  statusEl.className = "";
  try {
    // Save first so the background script works with current form values.
    await save();
    const result = await browser.runtime.sendMessage({ type: "sync-filter-settings" });
    if (!result || !result.ok) {
      const reason = result && result.reason;
      if (reason === "disabled") {
        statusEl.textContent = "Sync is disabled — enable it above and save first.";
      } else if (reason === "not-configured") {
        statusEl.textContent = "Nextcloud is not configured yet.";
      } else {
        statusEl.textContent = "Sync failed: " + (result && result.error || "unknown error");
      }
      statusEl.className = "err";
      return;
    }
    updateLastSyncedLabel(result.updatedAt);
    statusEl.textContent = result.action === "pull"
      ? "Pulled remote settings (remote was newer). Reloading form…"
      : "Pushed local settings to Nextcloud.";
    statusEl.className = "ok";
    if (result.action === "pull") {
      // Remote settings were applied by the background: reload the form to reflect them.
      setTimeout(loadIntoForm, 1200);
    }
  } catch (e) {
    statusEl.textContent = "Error: " + e.message;
    statusEl.className = "err";
  }
}

document.addEventListener("DOMContentLoaded", loadIntoForm);
document.getElementById("save").addEventListener("click", save);
document.getElementById("reset").addEventListener("click", resetProfiles);
document.getElementById("testConnection").addEventListener("click", testConnection);
document.getElementById("syncNow").addEventListener("click", syncNow);
