async function loadIntoForm() {
  const config = await getConfig();

  document.getElementById("baseUrl").value = config.nextcloud.baseUrl;
  document.getElementById("username").value = config.nextcloud.username;
  document.getElementById("appPassword").value = config.nextcloud.appPassword;
  document.getElementById("remoteFolder").value = config.nextcloud.remoteFolder;

  document.getElementById("autoEnabled").checked = config.autoExport.enabled;
  document.getElementById("delaySeconds").value = config.autoExport.delaySeconds;

  document.getElementById("profilesJson").value = JSON.stringify(config.profiles, null, 2);
}

function readForm() {
  const baseUrl = document.getElementById("baseUrl").value.trim();
  const username = document.getElementById("username").value.trim();
  const appPassword = document.getElementById("appPassword").value;
  const remoteFolder = document.getElementById("remoteFolder").value.trim() || "AI-Chats";
  const autoEnabled = document.getElementById("autoEnabled").checked;
  const delaySeconds = Math.max(1, Number(document.getElementById("delaySeconds").value) || 10);

  let profiles;
  try {
    profiles = JSON.parse(document.getElementById("profilesJson").value);
    if (!Array.isArray(profiles) || !profiles.length) throw new Error("must be a non-empty array");
  } catch (e) {
    throw new Error("Profiles JSON is invalid: " + e.message);
  }

  return { baseUrl, username, appPassword, remoteFolder, autoEnabled, delaySeconds, profiles };
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
      profiles: form.profiles,
      urlMap: existing.urlMap || {}
    };
    await setConfig(newConfig);
    statusEl.textContent = "Saved.";
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

document.addEventListener("DOMContentLoaded", loadIntoForm);
document.getElementById("save").addEventListener("click", save);
document.getElementById("reset").addEventListener("click", resetProfiles);
document.getElementById("testConnection").addEventListener("click", testConnection);
