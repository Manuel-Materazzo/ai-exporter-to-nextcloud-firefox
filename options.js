/* Options page logic: connection settings, auto-export, filter sync,
   and visual site profile management with JSON import/export. */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeProfile(p, fallbackIndex = 1) {
  const id = p && p.id ? String(p.id).trim() : `site-${fallbackIndex}`;
  const hostnamePattern = p && p.hostnamePattern != null ? String(p.hostnamePattern).trim() : "";
  const mode = p && (p.mode === "smart" || p.mode === "delay") ? p.mode : null;
  const detectSendButton = p && typeof p.detectSendButton === "boolean" ? p.detectSendButton : null;
  const delaySeconds =
    p && p.delaySeconds != null && !isNaN(Number(p.delaySeconds)) && Number(p.delaySeconds) > 0
      ? Number(p.delaySeconds)
      : null;
  const quiescenceSeconds =
    p && p.quiescenceSeconds != null && !isNaN(Number(p.quiescenceSeconds)) && Number(p.quiescenceSeconds) > 0
      ? Number(p.quiescenceSeconds)
      : null;
  const submitButtonSelector = p && p.submitButtonSelector ? String(p.submitButtonSelector).trim() : "";
  const stopButtonSelector = p && p.stopButtonSelector ? String(p.stopButtonSelector).trim() : "";
  const containerSelector = p && p.containerSelector ? String(p.containerSelector).trim() : "";
  const userMessageSelector = p && p.userMessageSelector ? String(p.userMessageSelector).trim() : "";
  const excludeSelectors = Array.isArray(p && p.excludeSelectors)
    ? p.excludeSelectors.map((s) => String(s).trim()).filter(Boolean)
    : [];
  const startDelimiters = Array.isArray(p && p.startDelimiters)
    ? p.startDelimiters.map((s) => String(s)).filter(Boolean)
    : [];
  const endDelimiters = Array.isArray(p && p.endDelimiters)
    ? p.endDelimiters.map((s) => String(s)).filter(Boolean)
    : [];
  const maskRules = Array.isArray(p && p.maskRules)
    ? p.maskRules
        .filter((r) => r && r.pattern)
        .map((r) => ({
          pattern: String(r.pattern),
          flags: String(r.flags != null ? r.flags : "g"),
          replacement: String(r.replacement != null ? r.replacement : "")
        }))
    : [];

  return {
    id,
    hostnamePattern,
    mode,
    detectSendButton,
    delaySeconds,
    quiescenceSeconds,
    submitButtonSelector,
    stopButtonSelector,
    containerSelector,
    excludeSelectors,
    userMessageSelector,
    startDelimiters,
    endDelimiters,
    maskRules
  };
}

function isJsonModeActive() {
  const jsonView = document.getElementById("profilesJsonView");
  return jsonView && jsonView.style.display !== "none";
}

// ---------------------------------------------------------------------------
// Visual Profiles UI Rendering & Reading (Using Safe Templates)
// ---------------------------------------------------------------------------

function renderMaskRuleRow(rule = { pattern: "", flags: "g", replacement: "" }) {
  const tmpl = document.getElementById("maskRuleTemplate");
  const clone = tmpl.content.cloneNode(true);
  const row = clone.querySelector(".mask-rule-row");

  const patternInput = row.querySelector(".mask-field-pattern");
  const flagsInput = row.querySelector(".mask-field-flags");
  const replacementInput = row.querySelector(".mask-field-replacement");

  patternInput.value = rule.pattern || "";
  flagsInput.value = rule.flags != null ? rule.flags : "g";
  replacementInput.value = rule.replacement != null ? rule.replacement : "";

  return row;
}

function renderProfileCard(profile, index, total, isExpanded = false) {
  const p = normalizeProfile(profile, index + 1);
  const tmpl = document.getElementById("profileCardTemplate");
  const clone = tmpl.content.cloneNode(true);
  const card = clone.querySelector(".profile-card");

  card.dataset.index = String(index);
  if (isExpanded) {
    card.classList.remove("collapsed");
  } else {
    card.classList.add("collapsed");
  }

  // Header elements
  card.querySelector(".profile-order-badge").textContent = `#${index + 1}`;
  card.querySelector(".profile-name").textContent = p.id || "untitled";
  card.querySelector(".header-hostname-badge").textContent = p.hostnamePattern || "(empty regex)";

  const modeBadge = card.querySelector(".header-mode-badge");
  if (modeBadge) {
    if (p.mode === "smart") {
      modeBadge.textContent = "Smart";
      modeBadge.className = "badge badge-primary header-mode-badge";
      modeBadge.style.display = "";
    } else if (p.mode === "delay") {
      modeBadge.textContent = "Delay";
      modeBadge.className = "badge badge-amber header-mode-badge";
      modeBadge.style.display = "";
    } else {
      modeBadge.style.display = "none";
    }
  }

  const delayBadge = card.querySelector(".header-delay-badge");
  if (p.delaySeconds != null || p.quiescenceSeconds != null) {
    const parts = [];
    if (p.delaySeconds != null) parts.push(`${p.delaySeconds}s delay`);
    if (p.quiescenceSeconds != null) parts.push(`${p.quiescenceSeconds}s settle`);
    delayBadge.textContent = parts.join(", ");
    delayBadge.className = "badge badge-primary header-delay-badge";
  } else {
    delayBadge.textContent = "Global timings";
    delayBadge.className = "badge badge-subtle header-delay-badge";
  }

  const excludesBadge = card.querySelector(".header-excludes-badge");
  if (p.excludeSelectors && p.excludeSelectors.length) {
    excludesBadge.textContent = `${p.excludeSelectors.length} excludes`;
    excludesBadge.style.display = "";
  } else {
    excludesBadge.style.display = "none";
  }

  const masksBadge = card.querySelector(".header-masks-badge");
  if (p.maskRules && p.maskRules.length) {
    masksBadge.textContent = `${p.maskRules.length} mask${p.maskRules.length === 1 ? "" : "s"}`;
    masksBadge.style.display = "";
  } else {
    masksBadge.style.display = "none";
  }

  const upBtn = card.querySelector(".move-up-btn");
  if (index === 0) upBtn.disabled = true;

  const downBtn = card.querySelector(".move-down-btn");
  if (index === total - 1) downBtn.disabled = true;

  // Body inputs
  card.querySelector(".field-id").value = p.id;
  const hostnameInput = card.querySelector(".field-hostname");
  hostnameInput.value = p.hostnamePattern;

  const modeOverrideSelect = card.querySelector(".field-mode-override");
  if (modeOverrideSelect) modeOverrideSelect.value = p.mode || "";

  const sendBtnOverrideSelect = card.querySelector(".field-send-btn-override");
  if (sendBtnOverrideSelect) {
    sendBtnOverrideSelect.value = p.detectSendButton != null ? String(p.detectSendButton) : "";
  }

  const delayToggle = card.querySelector(".field-delay-toggle");
  const delayWrap = card.querySelector(".delay-input-wrap");
  const delayInput = card.querySelector(".field-delay");
  const quiescenceInput = card.querySelector(".field-quiescence");
  const delayHint = card.querySelector(".delay-inherited-hint");

  if (p.delaySeconds != null || p.quiescenceSeconds != null) {
    delayToggle.checked = true;
    if (delayInput) delayInput.value = p.delaySeconds != null ? p.delaySeconds : 10;
    if (quiescenceInput) quiescenceInput.value = p.quiescenceSeconds != null ? p.quiescenceSeconds : 2.5;
    if (delayWrap) delayWrap.style.display = "flex";
    if (delayHint) delayHint.style.display = "none";
  } else {
    delayToggle.checked = false;
    if (delayInput) delayInput.value = 10;
    if (quiescenceInput) quiescenceInput.value = 2.5;
    if (delayWrap) delayWrap.style.display = "none";
    if (delayHint) delayHint.style.display = "";
  }

  const submitBtnInput = card.querySelector(".field-submit-btn-selector");
  if (submitBtnInput) submitBtnInput.value = p.submitButtonSelector || "";

  const stopBtnInput = card.querySelector(".field-stop-btn-selector");
  if (stopBtnInput) stopBtnInput.value = p.stopButtonSelector || "";

  card.querySelector(".field-container").value = p.containerSelector;
  card.querySelector(".field-user-msg").value = p.userMessageSelector;
  card.querySelector(".field-excludes").value = p.excludeSelectors.join("\n");
  card.querySelector(".field-start-delims").value = p.startDelimiters.join("\n");
  card.querySelector(".field-end-delims").value = p.endDelimiters.join("\n");

  // Populate mask rules
  const maskList = card.querySelector(".mask-rules-list");
  if (p.maskRules && p.maskRules.length) {
    p.maskRules.forEach((rule) => maskList.appendChild(renderMaskRuleRow(rule)));
  } else {
    const emptyHint = document.createElement("div");
    emptyHint.className = "mask-empty-hint";
    emptyHint.textContent = "No masking rules for this site. Click '+ Add Mask Rule' to redact sensitive text.";
    maskList.appendChild(emptyHint);
  }

  // Live regex validity check
  validateHostnameInput(hostnameInput, card.querySelector(".regex-status"));

  return card;
}

function validateHostnameInput(inputEl, statusEl) {
  if (!inputEl || !statusEl) return;
  const val = inputEl.value.trim();
  if (!val) {
    statusEl.textContent = "";
    return;
  }
  try {
    new RegExp(val);
    statusEl.textContent = "✓ Valid regular expression";
    statusEl.className = "regex-status ok";
  } catch (e) {
    statusEl.textContent = `✗ Invalid regex: ${e.message}`;
    statusEl.className = "regex-status err";
  }
}

function renderProfilesUI(profiles, expandedIndices = new Set()) {
  const container = document.getElementById("profilesList");
  container.textContent = "";

  const summary = document.getElementById("profilesSummary");
  if (summary) {
    summary.textContent = "";
    const countSpan = document.createElement("span");
    countSpan.textContent = `${profiles.length} site profile${profiles.length === 1 ? "" : "s"} configured`;
    countSpan.style.fontWeight = "600";
    const hintSpan = document.createElement("span");
    hintSpan.textContent = "Evaluated top to bottom — first match wins";
    summary.appendChild(countSpan);
    summary.appendChild(hintSpan);
  }

  if (!profiles || !profiles.length) {
    const empty = document.createElement("div");
    empty.className = "empty-profiles-state";
    const p1 = document.createElement("p");
    p1.style.cssText = "margin: 0 0 10px 0; font-size: 15px; font-weight: 500;";
    p1.textContent = "No site profiles configured";
    const p2 = document.createElement("p");
    p2.style.cssText = "margin: 0; font-size: 13px;";
    p2.textContent = "Add a new site profile or reset to default profiles to begin.";
    empty.appendChild(p1);
    empty.appendChild(p2);
    container.appendChild(empty);
    return;
  }

  profiles.forEach((p, idx) => {
    const isExpanded = expandedIndices.has(idx);
    const card = renderProfileCard(p, idx, profiles.length, isExpanded);
    container.appendChild(card);
  });
}

function readSingleProfileCard(card, fallbackIndex = 1) {
  const id = card.querySelector(".field-id")?.value.trim() || `site-${fallbackIndex}`;
  const hostnamePattern = card.querySelector(".field-hostname")?.value.trim() || "";

  const modeVal = card.querySelector(".field-mode-override")?.value || "";
  const mode = modeVal === "smart" || modeVal === "delay" ? modeVal : null;

  const sendBtnVal = card.querySelector(".field-send-btn-override")?.value || "";
  const detectSendButton = sendBtnVal === "true" ? true : sendBtnVal === "false" ? false : null;

  const delayToggle = card.querySelector(".field-delay-toggle");
  const delayInput = card.querySelector(".field-delay");
  const quiescenceInput = card.querySelector(".field-quiescence");

  const delaySeconds =
    delayToggle && delayToggle.checked && delayInput && delayInput.value !== ""
      ? Math.max(1, Number(delayInput.value) || 10)
      : null;

  const quiescenceSeconds =
    delayToggle && delayToggle.checked && quiescenceInput && quiescenceInput.value !== ""
      ? Math.max(0.5, Number(quiescenceInput.value) || 2.5)
      : null;

  const submitButtonSelector = card.querySelector(".field-submit-btn-selector")?.value.trim() || "";
  const stopButtonSelector = card.querySelector(".field-stop-btn-selector")?.value.trim() || "";

  const containerSelector = card.querySelector(".field-container")?.value.trim() || "";
  const userMessageSelector = card.querySelector(".field-user-msg")?.value.trim() || "";

  const excludesRaw = card.querySelector(".field-excludes")?.value || "";
  const excludeSelectors = excludesRaw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const startDelimsRaw = card.querySelector(".field-start-delims")?.value || "";
  const startDelimiters = startDelimsRaw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const endDelimsRaw = card.querySelector(".field-end-delims")?.value || "";
  const endDelimiters = endDelimsRaw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const maskRows = card.querySelectorAll(".mask-rule-row");
  const maskRules = [];
  maskRows.forEach((row) => {
    const pattern = row.querySelector(".mask-field-pattern")?.value.trim() || "";
    if (!pattern) return;
    const flags = row.querySelector(".mask-field-flags")?.value.trim() || "g";
    const replacement = row.querySelector(".mask-field-replacement")?.value ?? "";
    maskRules.push({ pattern, flags, replacement });
  });

  return {
    id,
    hostnamePattern,
    mode,
    detectSendButton,
    delaySeconds,
    quiescenceSeconds,
    submitButtonSelector,
    stopButtonSelector,
    containerSelector,
    excludeSelectors,
    userMessageSelector,
    startDelimiters,
    endDelimiters,
    maskRules
  };
}

function readProfilesFromUI() {
  const cards = document.querySelectorAll("#profilesList .profile-card");
  const list = [];
  cards.forEach((card, idx) => {
    list.push(readSingleProfileCard(card, idx + 1));
  });
  return list;
}

function getExpandedCardIndices() {
  const indices = new Set();
  const cards = document.querySelectorAll("#profilesList .profile-card");
  cards.forEach((card, idx) => {
    if (!card.classList.contains("collapsed")) {
      indices.add(idx);
    }
  });
  return indices;
}

// ---------------------------------------------------------------------------
// Form loading & reading
// ---------------------------------------------------------------------------

async function loadIntoForm() {
  const config = await getConfig();

  document.getElementById("baseUrl").value = config.nextcloud.baseUrl;
  document.getElementById("username").value = config.nextcloud.username;
  document.getElementById("appPassword").value = config.nextcloud.appPassword;
  document.getElementById("remoteFolder").value = config.nextcloud.remoteFolder;

  document.getElementById("autoEnabled").checked = config.autoExport.enabled;
  document.getElementById("autoMode").value = config.autoExport.mode || "smart";
  document.getElementById("detectSendButton").checked =
    config.autoExport.detectSendButton !== false;
  document.getElementById("delaySeconds").value = config.autoExport.delaySeconds || 10;
  document.getElementById("quiescenceSeconds").value = config.autoExport.quiescenceSeconds || 2.5;

  const isSmart = (config.autoExport.mode || "smart") === "smart";
  const smartWrap = document.getElementById("smartSettingWrap");
  if (smartWrap) smartWrap.style.display = isSmart ? "" : "none";

  document.getElementById("notificationsEnabled").checked =
    config.notifications ? config.notifications.enabled !== false : true;

  document.getElementById("filterSyncEnabled").checked = config.filterSync.enabled;
  document.getElementById("filterSyncFilename").value =
    config.filterSync.filename || DEFAULT_CONFIG.filterSync.filename;
  updateLastSyncedLabel(config.filterSync.lastPushed);

  const profiles = config.profiles && config.profiles.length ? config.profiles : DEFAULT_CONFIG.profiles;
  document.getElementById("profilesJson").value = JSON.stringify(profiles, null, 2);

  // Render visual cards, expanding first card by default for ease of discovery
  renderProfilesUI(profiles, new Set([0]));
}

function readForm() {
  const baseUrl = document.getElementById("baseUrl").value.trim();
  const username = document.getElementById("username").value.trim();
  const appPassword = document.getElementById("appPassword").value;
  const remoteFolder = document.getElementById("remoteFolder").value.trim() || "AI-Chats";
  const autoEnabled = document.getElementById("autoEnabled").checked;
  const autoMode = document.getElementById("autoMode").value;
  const detectSendButton = document.getElementById("detectSendButton").checked;
  const delaySeconds = Math.max(1, Number(document.getElementById("delaySeconds").value) || 10);
  const quiescenceSeconds = Math.max(0.5, Number(document.getElementById("quiescenceSeconds").value) || 2.5);
  const notificationsEnabled = document.getElementById("notificationsEnabled").checked;
  const filterSyncEnabled = document.getElementById("filterSyncEnabled").checked;
  const filterSyncFilename =
    document.getElementById("filterSyncFilename").value.trim() || DEFAULT_CONFIG.filterSync.filename;

  let profiles;
  if (isJsonModeActive()) {
    try {
      profiles = JSON.parse(document.getElementById("profilesJson").value);
      if (!Array.isArray(profiles) || !profiles.length) throw new Error("must be a non-empty array");
    } catch (e) {
      throw new Error("Profiles JSON is invalid: " + e.message);
    }
  } else {
    profiles = readProfilesFromUI();
    if (!profiles.length) throw new Error("At least one site profile is required.");
    // Keep JSON textarea synchronized
    document.getElementById("profilesJson").value = JSON.stringify(profiles, null, 2);
  }

  // Validate regexes for all profiles
  for (const p of profiles) {
    if (p.hostnamePattern) {
      try {
        new RegExp(p.hostnamePattern);
      } catch (err) {
        throw new Error(`Profile "${p.id}" has an invalid hostname regex: ${err.message}`);
      }
    }
    if (p.maskRules) {
      for (const r of p.maskRules) {
        if (r.pattern) {
          try {
            new RegExp(r.pattern, r.flags || "g");
          } catch (err) {
            throw new Error(`Profile "${p.id}" has an invalid mask rule regex: ${err.message}`);
          }
        }
      }
    }
  }

  return {
    baseUrl,
    username,
    appPassword,
    remoteFolder,
    autoEnabled,
    autoMode,
    detectSendButton,
    delaySeconds,
    quiescenceSeconds,
    notificationsEnabled,
    filterSyncEnabled,
    filterSyncFilename,
    profiles
  };
}

async function save() {
  const statusEl = document.getElementById("saveStatus");
  statusEl.textContent = "Saving…";
  statusEl.className = "";
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
        mode: form.autoMode,
        detectSendButton: form.detectSendButton,
        delaySeconds: form.delaySeconds,
        quiescenceSeconds: form.quiescenceSeconds
      },
      notifications: {
        enabled: form.notificationsEnabled
      },
      filterSync: {
        enabled: form.filterSyncEnabled,
        filename: form.filterSyncFilename,
        lastPushed: form.filterSyncEnabled ? Date.now() : existing.filterSync.lastPushed
      },
      profiles: form.profiles,
      urlMap: existing.urlMap || {}
    };
    await setConfig(newConfig);

    // If sync is enabled, immediately push freshly-saved settings to Nextcloud.
    if (form.filterSyncEnabled) {
      try {
        const result = await browser.runtime.sendMessage({ type: "sync-filter-settings" });
        if (result && result.ok) {
          updateLastSyncedLabel(result.updatedAt);
          statusEl.textContent = `Saved and synced to Nextcloud (${result.action}).`;
        } else {
          statusEl.textContent = "Saved. Sync skipped: " + ((result && result.reason) || "unknown");
        }
      } catch (syncErr) {
        statusEl.textContent = "Saved, but sync failed: " + syncErr.message;
      }
    } else {
      statusEl.textContent = "Settings saved successfully.";
    }

    statusEl.className = "ok";
    setTimeout(() => {
      if (statusEl.className === "ok") {
        statusEl.textContent = "";
      }
    }, 4000);
  } catch (e) {
    statusEl.textContent = "Error: " + e.message;
    statusEl.className = "err";
  }
}

function resetProfiles() {
  if (
    !confirm(
      "Are you sure you want to reset all site extraction profiles to defaults? Any custom profiles or modifications will be replaced."
    )
  ) {
    return;
  }
  const defaultProfiles = JSON.parse(JSON.stringify(DEFAULT_CONFIG.profiles));
  document.getElementById("profilesJson").value = JSON.stringify(defaultProfiles, null, 2);
  renderProfilesUI(defaultProfiles, new Set([0]));
  const statusEl = document.getElementById("saveStatus");
  statusEl.textContent = "Profiles reset to defaults. Click 'Save Settings' to apply changes.";
  statusEl.className = "ok";
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
      statusEl.textContent = "Authentication failed (check username / app password).";
      statusEl.className = "err";
    } else {
      statusEl.textContent = `Unexpected response: ${res.status} ${res.statusText}`;
      statusEl.className = "err";
    }
  } catch (e) {
    statusEl.textContent = "Error: " + e.message + " (check the base URL and network connectivity)";
    statusEl.className = "err";
  }
}

function updateLastSyncedLabel(ts) {
  const el = document.getElementById("filterSyncLastSynced");
  if (!el) return;
  if (!ts) {
    el.textContent = "";
    return;
  }
  const d = new Date(ts);
  el.textContent = `Last synced: ${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}

async function syncNow() {
  const statusEl = document.getElementById("syncStatus");
  statusEl.textContent = "Syncing…";
  statusEl.className = "";
  try {
    await save();
    const result = await browser.runtime.sendMessage({ type: "sync-filter-settings" });
    if (!result || !result.ok) {
      const reason = result && result.reason;
      if (reason === "disabled") {
        statusEl.textContent = "Sync is disabled — enable it above and save first.";
      } else if (reason === "not-configured") {
        statusEl.textContent = "Nextcloud connection is not configured yet.";
      } else {
        statusEl.textContent = "Sync failed: " + ((result && result.error) || "unknown error");
      }
      statusEl.className = "err";
      return;
    }
    updateLastSyncedLabel(result.updatedAt);
    statusEl.textContent =
      result.action === "pull"
        ? "Pulled remote settings (remote was newer). Reloading form…"
        : "Pushed local settings to Nextcloud.";
    statusEl.className = "ok";
    if (result.action === "pull") {
      setTimeout(loadIntoForm, 1200);
    }
  } catch (e) {
    statusEl.textContent = "Error: " + e.message;
    statusEl.className = "err";
  }
}

// ---------------------------------------------------------------------------
// Profiles Card Event Handling (Delegation)
// ---------------------------------------------------------------------------

function setupProfilesListInteractions() {
  const listEl = document.getElementById("profilesList");

  // Click delegation
  listEl.addEventListener("click", (e) => {
    const card = e.target.closest(".profile-card");
    if (!card) return;
    const cardIndex = Number(card.dataset.index);

    // 1. Move Up button
    if (e.target.closest(".move-up-btn")) {
      e.stopPropagation();
      const current = readProfilesFromUI();
      if (cardIndex > 0) {
        const expanded = getExpandedCardIndices();
        const wasExpanded = expanded.has(cardIndex);
        const prevWasExpanded = expanded.has(cardIndex - 1);

        const temp = current[cardIndex];
        current[cardIndex] = current[cardIndex - 1];
        current[cardIndex - 1] = temp;

        expanded.delete(cardIndex);
        expanded.delete(cardIndex - 1);
        if (wasExpanded) expanded.add(cardIndex - 1);
        if (prevWasExpanded) expanded.add(cardIndex);

        renderProfilesUI(current, expanded);
      }
      return;
    }

    // 2. Move Down button
    if (e.target.closest(".move-down-btn")) {
      e.stopPropagation();
      const current = readProfilesFromUI();
      if (cardIndex < current.length - 1) {
        const expanded = getExpandedCardIndices();
        const wasExpanded = expanded.has(cardIndex);
        const nextWasExpanded = expanded.has(cardIndex + 1);

        const temp = current[cardIndex];
        current[cardIndex] = current[cardIndex + 1];
        current[cardIndex + 1] = temp;

        expanded.delete(cardIndex);
        expanded.delete(cardIndex + 1);
        if (wasExpanded) expanded.add(cardIndex + 1);
        if (nextWasExpanded) expanded.add(cardIndex);

        renderProfilesUI(current, expanded);
      }
      return;
    }

    // 3. Duplicate profile
    if (e.target.closest(".duplicate-btn")) {
      e.stopPropagation();
      const current = readProfilesFromUI();
      const clone = JSON.parse(JSON.stringify(current[cardIndex]));
      clone.id = `${clone.id}-copy`;
      current.splice(cardIndex + 1, 0, clone);

      const expanded = getExpandedCardIndices();
      expanded.add(cardIndex + 1);
      renderProfilesUI(current, expanded);
      return;
    }

    // 4. Delete profile
    if (e.target.closest(".delete-btn")) {
      e.stopPropagation();
      const current = readProfilesFromUI();
      const profileId = current[cardIndex]?.id || `#${cardIndex + 1}`;
      if (confirm(`Are you sure you want to delete profile "${profileId}"?`)) {
        current.splice(cardIndex, 1);
        const expanded = getExpandedCardIndices();
        expanded.delete(cardIndex);
        renderProfilesUI(current, expanded);
      }
      return;
    }

    // 5. Add default excludes helper button
    if (e.target.closest(".add-default-excludes-btn")) {
      e.stopPropagation();
      const textarea = card.querySelector(".field-excludes");
      if (textarea) {
        const currentExcludes = textarea.value
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        const defaults = ["nav", "header", "footer", "button", "form"];
        defaults.forEach((d) => {
          if (!currentExcludes.includes(d)) currentExcludes.push(d);
        });
        textarea.value = currentExcludes.join("\n");
        // Update header excludes badge
        updateCardHeaderBadges(card);
      }
      return;
    }

    // 6. Add Mask Rule button
    if (e.target.closest(".add-mask-rule-btn")) {
      e.stopPropagation();
      const maskList = card.querySelector(".mask-rules-list");
      const emptyHint = maskList.querySelector(".mask-empty-hint");
      if (emptyHint) emptyHint.remove();

      const newRow = renderMaskRuleRow({ pattern: "", flags: "g", replacement: "" });
      maskList.appendChild(newRow);
      newRow.querySelector(".mask-field-pattern")?.focus();
      updateCardHeaderBadges(card);
      return;
    }

    // 7. Remove Mask Rule button
    if (e.target.closest(".remove-mask-btn")) {
      e.stopPropagation();
      const row = e.target.closest(".mask-rule-row");
      const maskList = card.querySelector(".mask-rules-list");
      if (row) row.remove();
      if (!maskList.querySelector(".mask-rule-row")) {
        const emptyHint = document.createElement("div");
        emptyHint.className = "mask-empty-hint";
        emptyHint.textContent = "No masking rules for this site. Click '+ Add Mask Rule' to redact sensitive text.";
        maskList.appendChild(emptyHint);
      }
      updateCardHeaderBadges(card);
      return;
    }

    // 8. Header toggle expand / collapse (when clicking anywhere on header except buttons)
    if (e.target.closest(".profile-card-header")) {
      card.classList.toggle("collapsed");
    }
  });

  // Input & Change delegation for live header updates & regex checks
  listEl.addEventListener("input", (e) => {
    const card = e.target.closest(".profile-card");
    if (!card) return;

    if (e.target.classList.contains("field-id")) {
      const nameEl = card.querySelector(".profile-name");
      if (nameEl) nameEl.textContent = e.target.value.trim() || "untitled";
    }

    if (e.target.classList.contains("field-hostname")) {
      const badge = card.querySelector(".header-hostname-badge");
      if (badge) badge.textContent = e.target.value.trim() || "(empty regex)";
      validateHostnameInput(e.target, card.querySelector(".regex-status"));
    }

    if (e.target.classList.contains("field-delay") || e.target.classList.contains("field-quiescence")) {
      updateDelayBadge(card);
    }

    if (e.target.classList.contains("field-excludes")) {
      updateCardHeaderBadges(card);
    }
  });

  listEl.addEventListener("change", (e) => {
    const card = e.target.closest(".profile-card");
    if (!card) return;

    if (e.target.classList.contains("field-mode-override")) {
      updateModeBadge(card);
    }

    if (e.target.classList.contains("field-delay-toggle")) {
      const delayWrap = card.querySelector(".delay-input-wrap");
      const delayHint = card.querySelector(".delay-inherited-hint");
      if (e.target.checked) {
        if (delayWrap) delayWrap.style.display = "flex";
        if (delayHint) delayHint.style.display = "none";
      } else {
        if (delayWrap) delayWrap.style.display = "none";
        if (delayHint) delayHint.style.display = "";
      }
      updateDelayBadge(card);
    }

    if (e.target.classList.contains("field-delay") || e.target.classList.contains("field-quiescence")) {
      updateDelayBadge(card);
    }
  });
}

function updateModeBadge(card) {
  const modeSelect = card.querySelector(".field-mode-override");
  const badge = card.querySelector(".header-mode-badge");
  if (!badge) return;

  const mode = modeSelect ? modeSelect.value : "";
  if (mode === "smart") {
    badge.textContent = "Smart";
    badge.className = "badge badge-primary header-mode-badge";
    badge.style.display = "";
  } else if (mode === "delay") {
    badge.textContent = "Delay";
    badge.className = "badge badge-amber header-mode-badge";
    badge.style.display = "";
  } else {
    badge.style.display = "none";
  }
}

function updateDelayBadge(card) {
  const toggle = card.querySelector(".field-delay-toggle");
  const delayInput = card.querySelector(".field-delay");
  const quiescenceInput = card.querySelector(".field-quiescence");
  const badge = card.querySelector(".header-delay-badge");
  if (!badge) return;

  if (toggle && toggle.checked) {
    const parts = [];
    if (delayInput && delayInput.value !== "") parts.push(`${Number(delayInput.value) || 10}s delay`);
    if (quiescenceInput && quiescenceInput.value !== "") parts.push(`${Number(quiescenceInput.value) || 2.5}s settle`);
    badge.textContent = parts.length ? parts.join(", ") : "Custom timings";
    badge.className = "badge badge-primary header-delay-badge";
  } else {
    badge.textContent = "Global timings";
    badge.className = "badge badge-subtle header-delay-badge";
  }
}

function updateCardHeaderBadges(card) {
  const excludesBadge = card.querySelector(".header-excludes-badge");
  const masksBadge = card.querySelector(".header-masks-badge");

  // Excludes badge
  const excludesVal = card.querySelector(".field-excludes")?.value || "";
  const countExcludes = excludesVal
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean).length;

  if (excludesBadge) {
    if (countExcludes > 0) {
      excludesBadge.textContent = `${countExcludes} excludes`;
      excludesBadge.style.display = "";
    } else {
      excludesBadge.style.display = "none";
    }
  }

  // Masks badge
  const maskRows = card.querySelectorAll(".mask-rule-row");
  const countMasks = Array.from(maskRows).filter(
    (row) => row.querySelector(".mask-field-pattern")?.value.trim()
  ).length;

  if (masksBadge) {
    if (countMasks > 0) {
      masksBadge.textContent = `${countMasks} mask${countMasks === 1 ? "" : "s"}`;
      masksBadge.style.display = "";
    } else {
      masksBadge.style.display = "none";
    }
  }
}

// ---------------------------------------------------------------------------
// Add Profile & Expand/Collapse All
// ---------------------------------------------------------------------------

function addNewProfile() {
  const current = isJsonModeActive()
    ? (() => {
        try {
          return JSON.parse(document.getElementById("profilesJson").value);
        } catch (e) {
          return readProfilesFromUI();
        }
      })()
    : readProfilesFromUI();

  const newIdx = current.length + 1;
  const newProfile = {
    id: `site-${newIdx}`,
    hostnamePattern: "example\\.com",
    mode: null,
    detectSendButton: null,
    delaySeconds: null,
    quiescenceSeconds: null,
    submitButtonSelector: "",
    stopButtonSelector: "",
    containerSelector: "",
    excludeSelectors: ["nav", "header", "footer", "button", "form"],
    userMessageSelector: "",
    startDelimiters: [],
    endDelimiters: [],
    maskRules: []
  };

  current.push(newProfile);

  if (isJsonModeActive()) {
    document.getElementById("profilesJson").value = JSON.stringify(current, null, 2);
    switchToVisualTab();
  } else {
    const expanded = getExpandedCardIndices();
    expanded.add(current.length - 1);
    renderProfilesUI(current, expanded);

    // Scroll to new card and focus ID field
    const cards = document.querySelectorAll("#profilesList .profile-card");
    const lastCard = cards[cards.length - 1];
    if (lastCard) {
      lastCard.scrollIntoView({ behavior: "smooth", block: "center" });
      const idInput = lastCard.querySelector(".field-id");
      if (idInput) {
        idInput.focus();
        idInput.select();
      }
    }
  }
}

function expandAllCards() {
  document.querySelectorAll("#profilesList .profile-card").forEach((card) => {
    card.classList.remove("collapsed");
  });
}

function collapseAllCards() {
  document.querySelectorAll("#profilesList .profile-card").forEach((card) => {
    card.classList.add("collapsed");
  });
}

// ---------------------------------------------------------------------------
// View Mode Switching (Visual Editor <-> Raw JSON)
// ---------------------------------------------------------------------------

function switchToVisualTab() {
  const jsonView = document.getElementById("profilesJsonView");
  const visualView = document.getElementById("profilesVisualView");
  const tabVisual = document.getElementById("tabVisual");
  const tabJson = document.getElementById("tabJson");
  const jsonStatus = document.getElementById("jsonValidationStatus");

  // Attempt to parse raw JSON
  try {
    const rawVal = document.getElementById("profilesJson").value;
    const profiles = JSON.parse(rawVal);
    if (!Array.isArray(profiles)) throw new Error("JSON must be an array of profile objects.");

    renderProfilesUI(profiles);
    jsonView.style.display = "none";
    visualView.style.display = "";
    tabVisual.classList.add("active");
    tabJson.classList.remove("active");
    if (jsonStatus) jsonStatus.textContent = "";
  } catch (e) {
    if (jsonStatus) {
      jsonStatus.textContent = `Cannot switch: ${e.message}`;
      jsonStatus.className = "json-status err";
    }
  }
}

function switchToJsonTab() {
  const jsonView = document.getElementById("profilesJsonView");
  const visualView = document.getElementById("profilesVisualView");
  const tabVisual = document.getElementById("tabVisual");
  const tabJson = document.getElementById("tabJson");
  const jsonStatus = document.getElementById("jsonValidationStatus");

  const profiles = readProfilesFromUI();
  document.getElementById("profilesJson").value = JSON.stringify(profiles, null, 2);

  visualView.style.display = "none";
  jsonView.style.display = "";
  tabJson.classList.add("active");
  tabVisual.classList.remove("active");

  if (jsonStatus) {
    jsonStatus.textContent = `✓ ${profiles.length} profiles serialized`;
    jsonStatus.className = "json-status ok";
  }
}

function prettifyRawJson() {
  const textarea = document.getElementById("profilesJson");
  const jsonStatus = document.getElementById("jsonValidationStatus");
  try {
    const parsed = JSON.parse(textarea.value);
    textarea.value = JSON.stringify(parsed, null, 2);
    if (jsonStatus) {
      jsonStatus.textContent = "✓ JSON formatted";
      jsonStatus.className = "json-status ok";
    }
  } catch (e) {
    if (jsonStatus) {
      jsonStatus.textContent = `Format failed: ${e.message}`;
      jsonStatus.className = "json-status err";
    }
  }
}

// ---------------------------------------------------------------------------
// Import / Export Modal
// ---------------------------------------------------------------------------

function getCurrentProfilesSnapshot() {
  if (isJsonModeActive()) {
    try {
      return JSON.parse(document.getElementById("profilesJson").value);
    } catch (e) {
      return readProfilesFromUI();
    }
  }
  return readProfilesFromUI();
}

function openExportModal() {
  const modal = document.getElementById("modalBackdrop");
  const exportPanel = document.getElementById("modalExportPanel");
  const importPanel = document.getElementById("modalImportPanel");
  const tabExport = document.getElementById("modalTabExport");
  const tabImport = document.getElementById("modalTabImport");
  const feedback = document.getElementById("exportFeedback");

  const profiles = getCurrentProfilesSnapshot();
  document.getElementById("exportJsonArea").value = JSON.stringify(profiles, null, 2);

  exportPanel.style.display = "";
  importPanel.style.display = "none";
  tabExport.classList.add("active");
  tabImport.classList.remove("active");
  if (feedback) feedback.textContent = "";

  modal.style.display = "flex";
}

function openImportModal() {
  const modal = document.getElementById("modalBackdrop");
  const exportPanel = document.getElementById("modalExportPanel");
  const importPanel = document.getElementById("modalImportPanel");
  const tabExport = document.getElementById("modalTabExport");
  const tabImport = document.getElementById("modalTabImport");

  // Reset import fields
  document.getElementById("importJsonArea").value = "";
  document.getElementById("importFileInput").value = "";
  document.getElementById("importFileName").textContent = "No file chosen";
  document.getElementById("applyImportBtn").disabled = true;
  const statusEl = document.getElementById("importValidationStatus");
  if (statusEl) {
    statusEl.textContent = "";
    statusEl.className = "import-status";
  }

  exportPanel.style.display = "none";
  importPanel.style.display = "";
  tabExport.classList.remove("active");
  tabImport.classList.add("active");

  modal.style.display = "flex";
}

function closeModal() {
  document.getElementById("modalBackdrop").style.display = "none";
}

async function copyExportJson() {
  const text = document.getElementById("exportJsonArea").value;
  const feedback = document.getElementById("exportFeedback");
  try {
    await navigator.clipboard.writeText(text);
    feedback.textContent = "✓ Copied to clipboard!";
    feedback.className = "action-feedback ok";
  } catch (e) {
    // Fallback
    const area = document.getElementById("exportJsonArea");
    area.select();
    document.execCommand("copy");
    feedback.textContent = "✓ Copied!";
    feedback.className = "action-feedback ok";
  }
  setTimeout(() => {
    feedback.textContent = "";
  }, 2500);
}

function downloadExportJson() {
  const text = document.getElementById("exportJsonArea").value;
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ai-exporter-profiles.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  const feedback = document.getElementById("exportFeedback");
  feedback.textContent = "✓ Download started!";
  feedback.className = "action-feedback ok";
  setTimeout(() => {
    feedback.textContent = "";
  }, 2500);
}

function validateImportContent() {
  const text = document.getElementById("importJsonArea").value.trim();
  const statusEl = document.getElementById("importValidationStatus");
  const applyBtn = document.getElementById("applyImportBtn");

  if (!text) {
    statusEl.textContent = "";
    statusEl.className = "import-status";
    applyBtn.disabled = true;
    return;
  }

  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      throw new Error("Imported JSON must be an array of profile objects.");
    }
    if (!parsed.length) {
      throw new Error("JSON array contains 0 profiles.");
    }

    const ids = parsed.map((p, i) => (p && p.id ? String(p.id) : `#${i + 1}`));
    const sampleIds = ids.slice(0, 4).join(", ") + (ids.length > 4 ? "…" : "");
    statusEl.textContent = `✓ Valid JSON: ${parsed.length} profile${parsed.length === 1 ? "" : "s"} found (${sampleIds})`;
    statusEl.className = "import-status ok";
    applyBtn.disabled = false;
  } catch (e) {
    statusEl.textContent = `✗ Invalid profiles JSON: ${e.message}`;
    statusEl.className = "import-status err";
    applyBtn.disabled = true;
  }
}

function handleImportFileSelect(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  document.getElementById("importFileName").textContent = file.name;
  const reader = new FileReader();
  reader.onload = (event) => {
    document.getElementById("importJsonArea").value = event.target.result;
    validateImportContent();
  };
  reader.onerror = () => {
    const statusEl = document.getElementById("importValidationStatus");
    statusEl.textContent = "✗ Error reading file.";
    statusEl.className = "import-status err";
  };
  reader.readAsText(file);
}

function applyImport() {
  const text = document.getElementById("importJsonArea").value.trim();
  const modeEl = document.querySelector('input[name="importMode"]:checked');
  const mode = modeEl ? modeEl.value : "replace";

  let importedList;
  try {
    importedList = JSON.parse(text);
    if (!Array.isArray(importedList) || !importedList.length) throw new Error("Invalid profiles array");
  } catch (e) {
    alert("Could not import: " + e.message);
    return;
  }

  // Normalize imported profiles
  const normalizedImported = importedList.map((p, i) => normalizeProfile(p, i + 1));

  let finalList;
  if (mode === "append") {
    const current = getCurrentProfilesSnapshot();
    finalList = current.concat(normalizedImported);
  } else {
    finalList = normalizedImported;
  }

  // Update both visual editor & raw JSON textarea
  document.getElementById("profilesJson").value = JSON.stringify(finalList, null, 2);
  renderProfilesUI(finalList, new Set([0]));

  closeModal();

  const statusEl = document.getElementById("saveStatus");
  statusEl.textContent = `Successfully imported ${normalizedImported.length} profile${normalizedImported.length === 1 ? "" : "s"} (${mode === "append" ? "appended" : "replaced"}). Remember to click "Save Settings".`;
  statusEl.className = "ok";
}

// ---------------------------------------------------------------------------
// Initialization & Event Binding
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  loadIntoForm();
  setupProfilesListInteractions();

  // Settings action buttons
  document.getElementById("save").addEventListener("click", save);
  document.getElementById("reset").addEventListener("click", resetProfiles);
  document.getElementById("testConnection").addEventListener("click", testConnection);
  document.getElementById("syncNow").addEventListener("click", syncNow);

  // Auto-export mode change
  document.getElementById("autoMode").addEventListener("change", (e) => {
    const isSmart = e.target.value === "smart";
    const smartWrap = document.getElementById("smartSettingWrap");
    if (smartWrap) smartWrap.style.display = isSmart ? "" : "none";
  });

  // Profile Toolbar actions
  document.getElementById("addProfileBtn").addEventListener("click", addNewProfile);
  document.getElementById("addProfileBottomBtn").addEventListener("click", addNewProfile);
  document.getElementById("expandAllBtn").addEventListener("click", expandAllCards);
  document.getElementById("collapseAllBtn").addEventListener("click", collapseAllCards);

  // View Mode Tabs
  document.getElementById("tabVisual").addEventListener("click", switchToVisualTab);
  document.getElementById("tabJson").addEventListener("click", switchToJsonTab);
  document.getElementById("prettifyJsonBtn").addEventListener("click", prettifyRawJson);

  // Raw JSON validation feedback on typing
  document.getElementById("profilesJson").addEventListener("input", () => {
    const statusEl = document.getElementById("jsonValidationStatus");
    try {
      const parsed = JSON.parse(document.getElementById("profilesJson").value);
      if (Array.isArray(parsed)) {
        statusEl.textContent = `✓ Valid JSON (${parsed.length} profiles)`;
        statusEl.className = "json-status ok";
      } else {
        statusEl.textContent = "✗ Must be an array of profiles";
        statusEl.className = "json-status err";
      }
    } catch (e) {
      statusEl.textContent = `✗ Syntax error: ${e.message}`;
      statusEl.className = "json-status err";
    }
  });

  // Import / Export Buttons & Modal
  document.getElementById("openExportBtn").addEventListener("click", openExportModal);
  document.getElementById("openImportBtn").addEventListener("click", openImportModal);
  document.getElementById("modalTabExport").addEventListener("click", () => {
    document.getElementById("modalExportPanel").style.display = "";
    document.getElementById("modalImportPanel").style.display = "none";
    document.getElementById("modalTabExport").classList.add("active");
    document.getElementById("modalTabImport").classList.remove("active");
  });
  document.getElementById("modalTabImport").addEventListener("click", () => {
    document.getElementById("modalExportPanel").style.display = "none";
    document.getElementById("modalImportPanel").style.display = "";
    document.getElementById("modalTabExport").classList.remove("active");
    document.getElementById("modalTabImport").classList.add("active");
  });

  document.getElementById("modalCloseBtn").addEventListener("click", closeModal);
  document.getElementById("cancelImportBtn").addEventListener("click", closeModal);
  document.getElementById("modalBackdrop").addEventListener("click", (e) => {
    if (e.target === document.getElementById("modalBackdrop")) {
      closeModal();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.getElementById("modalBackdrop").style.display !== "none") {
      closeModal();
    }
  });

  document.getElementById("copyExportBtn").addEventListener("click", copyExportJson);
  document.getElementById("downloadExportBtn").addEventListener("click", downloadExportJson);

  document.getElementById("importFileInput").addEventListener("change", handleImportFileSelect);
  document.getElementById("importJsonArea").addEventListener("input", validateImportContent);
  document.getElementById("applyImportBtn").addEventListener("click", applyImport);
});
