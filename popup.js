document.getElementById("openOptions").addEventListener("click", (e) => {
  e.preventDefault();
  browser.runtime.openOptionsPage();
});

document.getElementById("exportNow").addEventListener("click", async () => {
  const statusEl = document.getElementById("status");
  statusEl.textContent = "Exporting…";
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const resp = await browser.tabs.sendMessage(tab.id, { type: "manual-export" });
    if (resp && resp.ok) {
      statusEl.textContent = `Done: ${resp.filename || "updated"}`;
    } else {
      statusEl.textContent = `Failed: ${(resp && (resp.reason || resp.error)) || "unknown error"}`;
    }
  } catch (e) {
    statusEl.textContent = `Error: ${e.message}`;
  }
});
