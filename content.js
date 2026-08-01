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

let exportTimer = null;

function scheduleExport(delaySeconds) {
  if (exportTimer) clearTimeout(exportTimer);
  exportTimer = setTimeout(() => runExport(false), (delaySeconds || 10) * 1000);
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

// Trigger on Enter in a textarea/input/contenteditable (i.e. a chat prompt box).
// Capture phase, and we never call preventDefault, so normal chat behavior is untouched.
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
      scheduleExport(config.autoExport.delaySeconds);
    });
  },
  true
);

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "manual-export") {
    return runExport(true);
  }
});
