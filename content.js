(() => {
  const STORAGE_KEY = "formMemoryAssistantData";
  const MAX_VALUES_PER_FIELD = 5;
  const DROPDOWN_ID = "fma-suggestions";
  const TARGET_SELECTOR = [
    "input[type='text']",
    "input[type='email']",
    "input[type='tel']",
    "input:not([type])",
    "textarea"
  ].join(",");

  const SENSITIVE_PATTERNS = [
    /password/i,
    /passcode/i,
    /otp/i,
    /token/i,
    /secret/i,
    /cvv/i,
    /cvc/i,
    /card/i,
    /ssn/i,
    /social\s*security/i,
    /iban/i,
    /routing/i,
    /account\s*number/i
  ];

  let activeField = null;
  let dropdown = null;

  function normalizeLabel(value) {
    return (value || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeValue(value) {
    return (value || "").trim();
  }

  function storageGet() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        resolve(result[STORAGE_KEY] || {});
      });
    });
  }

  function storageSet(data) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: data }, resolve);
    });
  }

  function getFieldLabel(field) {
    if (field.labels && field.labels.length > 0) {
      const text = field.labels[0].textContent?.trim();
      if (text) {
        return text;
      }
    }

    if (field.id) {
      const byFor = document.querySelector(`label[for='${CSS.escape(field.id)}']`);
      const text = byFor?.textContent?.trim();
      if (text) {
        return text;
      }
    }

    const closestLabel = field.closest("label")?.textContent?.trim();
    if (closestLabel) {
      return closestLabel;
    }

    return (
      field.getAttribute("aria-label") ||
      field.placeholder ||
      field.name ||
      field.id ||
      ""
    ).trim();
  }

  function isVisibleField(field) {
    if (!field || !(field instanceof HTMLElement)) {
      return false;
    }

    const style = window.getComputedStyle(field);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }

    const rect = field.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isSensitiveField(field, labelText) {
    const type = (field.type || "").toLowerCase();
    if (type === "password" || type === "hidden") {
      return true;
    }

    const haystack = [
      labelText,
      field.name,
      field.id,
      field.placeholder,
      field.getAttribute("autocomplete")
    ]
      .filter(Boolean)
      .join(" ");

    return SENSITIVE_PATTERNS.some((pattern) => pattern.test(haystack));
  }

  function isSupportedField(field) {
    if (!field || !(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
      return false;
    }

    if (!field.matches(TARGET_SELECTOR)) {
      return false;
    }

    if (field.disabled || field.readOnly) {
      return false;
    }

    return isVisibleField(field);
  }

  function getFieldMeta(field) {
    const label = getFieldLabel(field);
    const normalized = normalizeLabel(label);
    return {
      label: label || "Field",
      key: normalized
    };
  }

  function labelsMatch(a, b) {
    if (!a || !b) {
      return false;
    }
    return a.includes(b) || b.includes(a);
  }

  async function rememberValue(field) {
    if (!isSupportedField(field)) {
      return;
    }

    const value = normalizeValue(field.value);
    if (!value) {
      return;
    }

    const meta = getFieldMeta(field);
    if (!meta.key) {
      return;
    }

    if (isSensitiveField(field, meta.label)) {
      return;
    }

    const data = await storageGet();
    const existing = (data[meta.key]?.values || []).slice();

    if (existing.some((entry) => entry.toLowerCase() === value.toLowerCase())) {
      return;
    }

    const updatedValues = [value, ...existing].slice(0, MAX_VALUES_PER_FIELD);
    data[meta.key] = {
      label: meta.label,
      values: updatedValues
    };

    await storageSet(data);
  }

  function ensureDropdown() {
    if (dropdown) {
      return dropdown;
    }

    dropdown = document.createElement("div");
    dropdown.id = DROPDOWN_ID;
    dropdown.style.position = "fixed";
    dropdown.style.display = "none";
    dropdown.style.zIndex = "2147483647";
    dropdown.style.background = "#ffffff";
    dropdown.style.border = "1px solid #d1d5db";
    dropdown.style.borderRadius = "8px";
    dropdown.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.12)";
    dropdown.style.maxHeight = "220px";
    dropdown.style.overflowY = "auto";
    dropdown.style.fontFamily = "system-ui, -apple-system, Segoe UI, sans-serif";
    dropdown.style.fontSize = "13px";
    dropdown.style.color = "#111827";
    document.body.appendChild(dropdown);
    return dropdown;
  }

  function hideDropdown() {
    if (!dropdown) {
      return;
    }
    dropdown.style.display = "none";
    dropdown.innerHTML = "";
  }

  function positionDropdown(field) {
    if (!dropdown || !field) {
      return;
    }

    const rect = field.getBoundingClientRect();
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.minWidth = `${Math.max(180, rect.width)}px`;
  }

  function fillField(field, value) {
    field.focus();
    field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function deleteStoredValue(key, value) {
    const data = await storageGet();
    const entry = data[key];
    if (!entry || !Array.isArray(entry.values)) {
      return;
    }

    entry.values = entry.values.filter((saved) => saved.toLowerCase() !== value.toLowerCase());

    if (entry.values.length === 0) {
      delete data[key];
    } else {
      data[key] = entry;
    }

    await storageSet(data);
  }

  function findSuggestions(data, field) {
    const meta = getFieldMeta(field);
    const suggestions = [];
    const seenValues = new Set();

    Object.entries(data).forEach(([savedKey, entry]) => {
      if (!entry || !Array.isArray(entry.values)) {
        return;
      }

      const savedLabel = normalizeLabel(entry.label || "");
      const similar = labelsMatch(meta.key, savedKey) || labelsMatch(meta.key, savedLabel);
      if (!similar) {
        return;
      }

      entry.values.forEach((value) => {
        const normalized = value.toLowerCase();
        if (seenValues.has(normalized)) {
          return;
        }
        seenValues.add(normalized);
        suggestions.push({
          key: savedKey,
          label: entry.label || "Saved",
          value
        });
      });
    });

    return suggestions.slice(0, 8);
  }

  function renderSuggestions(items, field) {
    const menu = ensureDropdown();
    menu.innerHTML = "";

    if (!items.length) {
      hideDropdown();
      return;
    }

    items.forEach((item) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.justifyContent = "space-between";
      row.style.gap = "10px";
      row.style.padding = "8px 10px";
      row.style.cursor = "pointer";
      row.style.borderBottom = "1px solid #f3f4f6";

      const text = document.createElement("div");
      text.style.flex = "1";
      text.style.overflow = "hidden";
      text.style.textOverflow = "ellipsis";
      text.style.whiteSpace = "nowrap";
      text.textContent = item.value;

      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "×";
      del.title = "Delete suggestion";
      del.style.border = "none";
      del.style.background = "transparent";
      del.style.color = "#6b7280";
      del.style.cursor = "pointer";
      del.style.fontSize = "16px";
      del.style.lineHeight = "1";
      del.style.padding = "0";

      row.addEventListener("mouseenter", () => {
        row.style.background = "#f9fafb";
      });

      row.addEventListener("mouseleave", () => {
        row.style.background = "transparent";
      });

      row.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });

      row.addEventListener("click", () => {
        fillField(field, item.value);
        hideDropdown();
      });

      del.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await deleteStoredValue(item.key, item.value);

        if (activeField) {
          const latest = await storageGet();
          renderSuggestions(findSuggestions(latest, activeField), activeField);
          positionDropdown(activeField);
        }
      });

      row.appendChild(text);
      row.appendChild(del);
      menu.appendChild(row);
    });

    menu.style.display = "block";
    positionDropdown(field);
  }

  async function showSuggestions(field) {
    if (!isSupportedField(field)) {
      hideDropdown();
      return;
    }

    const meta = getFieldMeta(field);
    if (!meta.key || isSensitiveField(field, meta.label)) {
      hideDropdown();
      return;
    }

    activeField = field;
    const data = await storageGet();
    const items = findSuggestions(data, field);
    renderSuggestions(items, field);
  }

  const inputDebounceTimers = new WeakMap();

  function queueRemember(field) {
    const previous = inputDebounceTimers.get(field);
    if (previous) {
      clearTimeout(previous);
    }

    const timer = setTimeout(() => {
      rememberValue(field);
      inputDebounceTimers.delete(field);
    }, 700);

    inputDebounceTimers.set(field, timer);
  }

  document.addEventListener(
    "focusin",
    async (event) => {
      const field = event.target;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
        return;
      }

      if (!isSupportedField(field)) {
        hideDropdown();
        return;
      }

      await showSuggestions(field);
    },
    true
  );

  document.addEventListener(
    "focusout",
    (event) => {
      const field = event.target;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
        return;
      }

      rememberValue(field);

      const next = event.relatedTarget;
      if (dropdown && next instanceof Node && dropdown.contains(next)) {
        return;
      }

      setTimeout(() => {
        if (!dropdown) {
          return;
        }
        const active = document.activeElement;
        if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) {
          hideDropdown();
          return;
        }

        if (active !== activeField) {
          hideDropdown();
        }
      }, 0);
    },
    true
  );

  document.addEventListener(
    "input",
    (event) => {
      const field = event.target;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
        return;
      }

      if (!isSupportedField(field)) {
        return;
      }

      queueRemember(field);
    },
    true
  );

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (dropdown && target instanceof Node && dropdown.contains(target)) {
        return;
      }

      if (target instanceof Element && target.matches(TARGET_SELECTOR)) {
        return;
      }

      hideDropdown();
    },
    true
  );

  window.addEventListener(
    "scroll",
    () => {
      if (dropdown && dropdown.style.display !== "none" && activeField) {
        positionDropdown(activeField);
      }
    },
    true
  );

  window.addEventListener("resize", () => {
    if (dropdown && dropdown.style.display !== "none" && activeField) {
      positionDropdown(activeField);
    }
  });
})();
