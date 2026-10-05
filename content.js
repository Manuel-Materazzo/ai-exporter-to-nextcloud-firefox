/* Runs on every page. Does nothing unless/until Enter is pressed in an editable
   field, or a manual export is requested from the popup. */

const BLOCK_SELECTOR = "h1,h2,h3,h4,h5,h6,p,li,pre,table,blockquote";

// Walk inline children of an element, preserving links/bold/italic/code as Markdown
// instead of flattening everything to plain text (this is what removes a lot of the
// "noise" vs. using el.innerText directly, and avoids emitting duplicate <a> lines).
function elementToInline(el) {
  let out = "";
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent;
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    switch (node.tagName) {
      case "BR":
        out += "\n";
        break;
      case "A":
        out += `[${elementToInline(node).trim()}](${node.href})`;
        break;
      case "STRONG":
      case "B":
        out += `**${elementToInline(node).trim()}**`;
        break;
      case "EM":
      case "I":
        out += `*${elementToInline(node).trim()}*`;
        break;
      case "CODE":
        out += `\`${elementToInline(node).trim()}\``;
        break;
      default:
        out += elementToInline(node);
    }
  }
  return out;
}

function tableToMarkdown(table) {
  const rows = Array.from(table.querySelectorAll("tr"));
  if (!rows.length) return "";
  let md = "";
  rows.forEach((row, i) => {
    const cells = Array.from(row.querySelectorAll("th,td")).map(
      (c) => elementToInline(c).trim().replace(/\|/g, "\\|") || " "
    );
    md += `| ${cells.join(" | ")} |\n`;
    if (i === 0) {
      md += `| ${cells.map(() => "---").join(" | ")} |\n`;
    }
  });
  return md + "\n";
}

function isExcluded(el, excludeSelectors) {
  if (!excludeSelectors || !excludeSelectors.length) return false;
  return excludeSelectors.some((sel) => {
    try {
      return el.closest(sel);
    } catch (e) {
      return false;
    }
  });
}

function getUserMessageContainer(el, userMessageSelector) {
  if (!userMessageSelector) return null;
  try {
    return el.closest(userMessageSelector);
  } catch (e) {
    return null;
  }
}

function wrapAsQuote(text, delimiter = "---") {
  const quotedText = text.split("\n").map((l) => `> ${l}`).join("\n");
  return `${delimiter}\n${quotedText}\n${delimiter}`;
}

function getBlockMarkdown(el) {
  switch (el.tagName) {
    case "H1": {
      const t = elementToInline(el).trim();
      return t ? `# ${t}\n\n` : "";
    }
    case "H2": {
      const t = elementToInline(el).trim();
      return t ? `## ${t}\n\n` : "";
    }
    case "H3": {
      const t = elementToInline(el).trim();
      return t ? `### ${t}\n\n` : "";
    }
    case "H4": {
      const t = elementToInline(el).trim();
      return t ? `#### ${t}\n\n` : "";
    }
    case "H5": {
      const t = elementToInline(el).trim();
      return t ? `##### ${t}\n\n` : "";
    }
    case "H6": {
      const t = elementToInline(el).trim();
      return t ? `###### ${t}\n\n` : "";
    }
    case "P": {
      const t = elementToInline(el).trim();
      return t ? `${t}\n\n` : "";
    }
    case "LI": {
      const t = elementToInline(el).trim();
      return t ? `* ${t}\n` : "";
    }
    case "BLOCKQUOTE": {
      const t = elementToInline(el).trim();
      return t ? `> ${t.split("\n").join("\n> ")}\n\n` : "";
    }
    case "PRE": {
      const t = el.innerText.trim();
      return t ? `\`\`\`\n${t}\n\`\`\`\n\n` : "";
    }
    case "TABLE": {
      const t = tableToMarkdown(el).trim();
      return t ? `${t}\n\n` : "";
    }
    default:
      return "";
  }
}

function extractMarkdown(profile) {
  const root =
    (profile.containerSelector && document.querySelector(profile.containerSelector)) ||
    document.body;
  const all = Array.from(root.querySelectorAll(BLOCK_SELECTOR));
  const allSet = new Set(all);
  let markdown = "";

  let currentContainer = null;
  let currentContainerMd = "";

  const flushUserMessage = () => {
    if (currentContainerMd.trim()) {
      markdown += wrapAsQuote(currentContainerMd.trim()) + "\n\n";
    }
    currentContainer = null;
    currentContainerMd = "";
  };

  for (const el of all) {
    if (isExcluded(el, profile.excludeSelectors)) continue;

    // Skip elements whose nearest matching ancestor is already in our block list
    // (e.g. a <p> inside an <li>, or content inside a <table>/<blockquote>) so we
    // don't render the same text twice.
    const ancestorMatch = el.parentElement && el.parentElement.closest(BLOCK_SELECTOR);
    if (ancestorMatch && allSet.has(ancestorMatch)) continue;

    const container = getUserMessageContainer(el, profile.userMessageSelector);

    if (container) {
      if (currentContainer && currentContainer !== container) {
        flushUserMessage();
      }
      currentContainer = container;
      currentContainerMd += getBlockMarkdown(el);
    } else {
      if (currentContainer) {
        flushUserMessage();
      }
      const blockMd = getBlockMarkdown(el);
      if (el.tagName === "BLOCKQUOTE") {
        const t = elementToInline(el).trim();
        if (t) markdown += wrapAsQuote(t) + "\n\n";
      } else {
        markdown += blockMd;
      }
    }
  }

  if (currentContainer) {
    flushUserMessage();
  }

  return markdown.trim() + "\n";
}

// Cut everything before the earliest start-delimiter match, and everything after
// the earliest end-delimiter match found in what remains.
function applyCropping(markdown, startDelims, endDelims) {
  let result = markdown;

  if (startDelims && startDelims.length) {
    let cut = -1;
    for (const d of startDelims) {
      if (!d) continue;
      const idx = result.indexOf(d);
      if (idx !== -1) {
        const after = idx + d.length;
        if (cut === -1 || idx < cut) cut = after;
      }
    }
    if (cut !== -1) result = result.slice(cut);
  }

  if (endDelims && endDelims.length) {
    let cut = -1;
    for (const d of endDelims) {
      if (!d) continue;
      const idx = result.indexOf(d);
      if (idx !== -1 && (cut === -1 || idx < cut)) cut = idx;
    }
    if (cut !== -1) result = result.slice(0, cut);
  }

  return result.trim();
}

function applyMasking(markdown, maskRules) {
  let result = markdown;
  for (const rule of maskRules || []) {
    if (!rule.pattern) continue;
    try {
      const re = new RegExp(rule.pattern, rule.flags || "g");
      result = result.replace(re, rule.replacement != null ? rule.replacement : "");
    } catch (e) {
      console.warn("[AI Exporter] invalid mask rule", rule, e);
    }
  }
  return result;
}

async function runExport(manual) {
  try {
    const config = await getConfig();
    const profile = matchProfile(config.profiles, location.hostname);
    if (!profile) {
      if (manual) console.warn("[AI Exporter] no profile matching domain: " + location.hostname);
      return { ok: false, reason: "no_profile" };
    }

    let markdown = extractMarkdown(profile);
    markdown = applyCropping(markdown, profile.startDelimiters, profile.endDelimiters);
    markdown = applyMasking(markdown, profile.maskRules);

    if (!markdown.trim()) {
      if (manual) console.warn("[AI Exporter] nothing extracted");
      return { ok: false, reason: "empty" };
    }

    const resp = await browser.runtime.sendMessage({
      type: "export-chat",
      url: location.href,
      title: document.title,
      markdown
    });
    return resp;
  } catch (e) {
    console.error("[AI Exporter] export failed", e);
    return { ok: false, error: String(e) };
  }
}

function isSubmitButton(el, profile) {
  if (!el) return false;
  const btn = el.closest('button, [role="button"], input[type="submit"]');
  if (!btn) return false;

  // 1. Profile custom selector if defined
  if (profile && profile.submitButtonSelector) {
    try {
      if (btn.matches(profile.submitButtonSelector)) return true;
    } catch (e) {}
  }

  // 2. HTML standard type="submit"
  if (btn.type === "submit") return true;

  // 3. Aria-label, title, or test-id checks (covering "Send message", "Send prompt", "Submit", etc.)
  const ariaLabel = (btn.getAttribute("aria-label") || "").trim();
  const title = (btn.getAttribute("title") || "").trim();
  const testId = (btn.getAttribute("data-testid") || btn.getAttribute("data-qa") || "").trim();
  const btnText = (btn.innerText || btn.textContent || "").trim();

  const sendExactRegex = /^(send(\s+(message|prompt|query|chat))?|submit|ask|generate)$/i;
  if (sendExactRegex.test(ariaLabel) || sendExactRegex.test(title)) return true;

  const sendBroadRegex = /\b(send\s*(message|prompt|query|chat)?|submit)\b/i;
  if (sendBroadRegex.test(ariaLabel) || sendBroadRegex.test(title) || sendBroadRegex.test(testId)) return true;

  if (btnText && btnText.length < 20 && sendExactRegex.test(btnText)) return true;

  // 4. Proximity & icon heuristic: button inside prompt container with text in editable field
  const promptContainer = btn.closest('form, [class*="prompt" i], [class*="input" i], [class*="chat-input" i]');
  if (promptContainer) {
    const editable = promptContainer.querySelector('textarea, [contenteditable="true"], input[type="text"]');
    if (editable) {
      const val = (editable.value || editable.innerText || editable.textContent || "").trim();
      if (val.length > 0 && (btn.querySelector("svg") || btn.tagName === "BUTTON")) {
        return true;
      }
    }
  }

  return false;
}

function findStopButton(profile) {
  if (profile && profile.stopButtonSelector) {
    try {
      const el = document.querySelector(profile.stopButtonSelector);
      if (el) return el;
    } catch (e) {}
  }
  const selectors = [
    'button[aria-label*="stop" i]',
    'button[title*="stop" i]',
    'button[data-testid*="stop" i]',
    '[aria-label="Stop generating"]',
    '[aria-label="Stop response"]',
    '[aria-label="Stop streaming"]',
    'button[aria-label*="cancel" i]'
  ];
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return el;
    } catch (e) {}
  }
  return null;
}

let exportTimer = null;
let activeTracker = null;

function cancelActiveTracker() {
  if (activeTracker) {
    activeTracker.abort();
    activeTracker = null;
  }
}

function scheduleExport(delaySeconds) {
  cancelActiveTracker();
  if (exportTimer) clearTimeout(exportTimer);
  exportTimer = setTimeout(() => runExport(false), (delaySeconds || 10) * 1000);
}

class SmartResponseTracker {
  constructor(profile, quiescenceSeconds) {
    this.profile = profile;
    this.quiescenceMs = Math.max(500, (Number(quiescenceSeconds) || 2.5) * 1000);
    this.state = "waiting"; // "waiting" | "streaming" | "settling" | "done"
    this.quiescenceTimer = null;
    this.initialWaitTimer = null;
    this.maxTotalTimer = null;
    this.observer = null;
    this.sawStopButton = false;

    this.root =
      (profile && profile.containerSelector && document.querySelector(profile.containerSelector)) ||
      document.body;

    this.prevTextLength = (this.root.innerText || this.root.textContent || "").length;
    this.prevBlockCount = this.root.querySelectorAll(BLOCK_SELECTOR).length;

    this.start();
  }

  start() {
    // Initial wait timeout: if no response begins in 45s, stop watching
    this.initialWaitTimer = setTimeout(() => {
      if (this.state === "waiting") {
        console.debug("[AI Exporter] smart tracker: initial wait timeout (no response detected)");
        this.abort();
      }
    }, 45000);

    // Max total timeout safety net: max 5 minutes
    this.maxTotalTimer = setTimeout(() => {
      console.warn("[AI Exporter] smart tracker: max total duration reached, running export");
      this.finish();
    }, 300000);

    this.observer = new MutationObserver(() => this.onMutation());
    try {
      this.observer.observe(this.root, {
        childList: true,
        subtree: true,
        characterData: true
      });
    } catch (e) {
      console.warn("[AI Exporter] could not observe root element", e);
      this.abort();
      scheduleExport(10);
      return;
    }

    this.onMutation();
  }

  onMutation() {
    if (this.state === "done") return;

    const currTextLength = (this.root.innerText || this.root.textContent || "").length;
    const currBlockCount = this.root.querySelectorAll(BLOCK_SELECTOR).length;
    const stopBtn = findStopButton(this.profile);

    if (stopBtn) {
      this.sawStopButton = true;
    }

    const textGrew = currTextLength > this.prevTextLength + 3;
    const blocksGrew = currBlockCount > this.prevBlockCount;

    if (this.state === "waiting") {
      if (textGrew || blocksGrew || stopBtn) {
        this.state = "streaming";
        if (this.initialWaitTimer) {
          clearTimeout(this.initialWaitTimer);
          this.initialWaitTimer = null;
        }
        this.prevTextLength = currTextLength;
        this.prevBlockCount = currBlockCount;
        this.resetQuiescenceTimer();
      }
      return;
    }

    if (this.state === "streaming" || this.state === "settling") {
      if (textGrew || blocksGrew) {
        this.state = "streaming";
        this.prevTextLength = currTextLength;
        this.prevBlockCount = currBlockCount;
        this.resetQuiescenceTimer();
      } else if (this.sawStopButton && !stopBtn) {
        if (this.state !== "settling") {
          this.state = "settling";
          if (this.quiescenceTimer) clearTimeout(this.quiescenceTimer);
          this.quiescenceTimer = setTimeout(() => this.finish(), 600);
        }
      }
    }
  }

  resetQuiescenceTimer() {
    if (this.quiescenceTimer) clearTimeout(this.quiescenceTimer);
    this.quiescenceTimer = setTimeout(() => {
      const stopBtn = findStopButton(this.profile);
      if (stopBtn) {
        this.quiescenceTimer = setTimeout(() => this.resetQuiescenceTimer(), 1000);
        return;
      }
      this.finish();
    }, this.quiescenceMs);
  }

  finish() {
    this.abort();
    runExport(false);
  }

  abort() {
    this.state = "done";
    if (this.quiescenceTimer) {
      clearTimeout(this.quiescenceTimer);
      this.quiescenceTimer = null;
    }
    if (this.initialWaitTimer) {
      clearTimeout(this.initialWaitTimer);
      this.initialWaitTimer = null;
    }
    if (this.maxTotalTimer) {
      clearTimeout(this.maxTotalTimer);
      this.maxTotalTimer = null;
    }
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
}

function startSmartResponseTracker(profile, quiescenceSeconds) {
  if (exportTimer) {
    clearTimeout(exportTimer);
    exportTimer = null;
  }
  cancelActiveTracker();
  activeTracker = new SmartResponseTracker(profile, quiescenceSeconds);
}

function triggerAutoExport(config, profile, source) {
  const mode = (profile && profile.mode) ? profile.mode : (config.autoExport.mode || "smart");

  if (mode === "delay") {
    const delay =
      profile && profile.delaySeconds != null && Number(profile.delaySeconds) > 0
        ? Number(profile.delaySeconds)
        : config.autoExport.delaySeconds;
    scheduleExport(delay);
  } else {
    const quiescence =
      profile && profile.quiescenceSeconds != null && Number(profile.quiescenceSeconds) > 0
        ? Number(profile.quiescenceSeconds)
        : (config.autoExport.quiescenceSeconds || 2.5);
    startSmartResponseTracker(profile, quiescence);
  }
}

// Trigger on Enter in a textarea/input/contenteditable
document.addEventListener(
  "keydown",
  (e) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    const t = e.target;
    const editable =
      t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable);
    if (!editable) return;
    getConfig().then((config) => {
      if (!config.autoExport.enabled) return;
      const profile = matchProfile(config.profiles, location.hostname);
      triggerAutoExport(config, profile, "enter");
    });
  },
  true
);

// Trigger on clicks on Send / Submit buttons
document.addEventListener(
  "click",
  (e) => {
    getConfig().then((config) => {
      if (!config.autoExport.enabled) return;
      const profile = matchProfile(config.profiles, location.hostname);
      const allowSendBtn =
        profile && profile.detectSendButton != null
          ? profile.detectSendButton
          : config.autoExport.detectSendButton !== false;
      if (!allowSendBtn) return;

      if (isSubmitButton(e.target, profile)) {
        triggerAutoExport(config, profile, "click");
      }
    });
  },
  true
);

// Trigger on form submission
document.addEventListener(
  "submit",
  (e) => {
    getConfig().then((config) => {
      if (!config.autoExport.enabled) return;
      const profile = matchProfile(config.profiles, location.hostname);
      const allowSendBtn =
        profile && profile.detectSendButton != null
          ? profile.detectSendButton
          : config.autoExport.detectSendButton !== false;
      if (!allowSendBtn) return;

      triggerAutoExport(config, profile, "submit");
    });
  },
  true
);

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "manual-export") {
    return runExport(true);
  }
});
