(() => {
  const STORAGE_KEY = "formMemoryAssistantData";
  const SETTINGS_KEY = "formMemoryAssistantSettings";
  const statsEl = document.getElementById("stats");
  const statusEl = document.getElementById("status");
  const clearBtn = document.getElementById("clearAllBtn");
  const enabledToggle = document.getElementById("enabledToggle");

  function storageGet() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        resolve(result[STORAGE_KEY] || {});
      });
    });
  }

  function storageRemove() {
    return new Promise((resolve) => {
      chrome.storage.local.remove(STORAGE_KEY, resolve);
    });
  }

  function settingsGet() {
    return new Promise((resolve) => {
      chrome.storage.local.get([SETTINGS_KEY], (result) => {
        const settings = result[SETTINGS_KEY] || {};
        resolve({
          enabled: settings.enabled !== false
        });
      });
    });
  }

  function settingsSet(settings) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [SETTINGS_KEY]: settings }, resolve);
    });
  }

  function setStatus(message) {
    statusEl.textContent = message;
  }

  async function refreshStats() {
    const data = await storageGet();
    const fieldCount = Object.keys(data).length;
    const valueCount = Object.values(data).reduce((sum, entry) => {
      if (!entry || !Array.isArray(entry.values)) {
        return sum;
      }
      return sum + entry.values.length;
    }, 0);

    statsEl.textContent = `Saved fields: ${fieldCount} | Saved values: ${valueCount}`;
  }

  clearBtn.addEventListener("click", async () => {
    const confirmed = window.confirm("Delete all saved form memory values?");
    if (!confirmed) {
      return;
    }

    await storageRemove();
    setStatus("All saved values were cleared.");
    await refreshStats();
  });

  enabledToggle.addEventListener("change", async () => {
    await settingsSet({ enabled: enabledToggle.checked });
    setStatus(enabledToggle.checked ? "Assistant is enabled." : "Assistant is paused.");
  });

  (async () => {
    const settings = await settingsGet();
    enabledToggle.checked = settings.enabled;
    await refreshStats();
  })();
})();
