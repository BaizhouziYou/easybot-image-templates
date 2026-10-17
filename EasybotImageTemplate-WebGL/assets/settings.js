(function () {
  const configApi = window.ServerPlayerCountConfig;
  const form = document.getElementById("settingsForm");
  const resetButton = document.getElementById("resetButton");
  const refreshPreviewButton = document.getElementById("refreshPreviewButton");
  const exportLogsButton = document.getElementById("exportLogsButton");
  const clearLogsButton = document.getElementById("clearLogsButton");
  const clearCacheButton = document.getElementById("clearCacheButton");
  const previewFrame = document.getElementById("previewFrame");
  const excludedServerTokensInput = document.getElementById("excludedServerTokens");
  const serverFilterLists = document.querySelectorAll("[data-excluded-server-list]");
  const serverFilterCounts = document.querySelectorAll("[data-server-filter-count]");
  const serverFilterActions = document.querySelectorAll("[data-server-filter-action]");
  const avatarProvider = document.getElementById("avatarProvider");
  const backgroundMode = document.getElementById("backgroundMode");
  const providerFields = document.querySelectorAll("[data-provider-field]");
  const previewProviderFields = document.querySelectorAll("[data-preview-provider-field]");
  const backgroundFields = document.querySelectorAll("[data-background-field]");
  const previewBackgroundFields = document.querySelectorAll("[data-preview-background-field]");
  const randomCategoryFields = document.querySelectorAll("[data-random-category-field]");
  const previewRandomCategoryFields = document.querySelectorAll("[data-preview-random-category-field]");
  const colorPickers = document.querySelectorAll("[data-color-picker]");
  const themeFields = document.querySelectorAll("[data-theme-field]");
  const previewThemeFields = document.querySelectorAll("[data-preview-theme-field]");
  const tabs = document.querySelectorAll("[data-tab]");
  const pages = document.querySelectorAll("[data-page]");
  const menuItems = document.querySelectorAll("[data-preview-section]");
  const previewPanels = document.querySelectorAll("[data-preview-panel]");
  let availableServers = [];

  function normalizeTokenList(value) {
    let items = value;
    if (typeof items === "string") {
      try {
        items = JSON.parse(items);
      } catch (error) {
        items = items.split(",");
      }
    }
    if (!Array.isArray(items)) return [];
    return Array.from(new Set(items.map((item) => String(item).trim()).filter(Boolean)));
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function toColorPickerValue(value) {
    const color = String(value || "").trim().toLowerCase();
    if (/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/.test(color)) return color.slice(0, 7);
    if (/^#[0-9a-f]{3,4}$/.test(color)) {
      return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
    }
    return "";
  }

  function syncColorPickers(value) {
    const pickerValue = toColorPickerValue(value);
    if (!pickerValue) return;
    colorPickers.forEach((picker) => {
      picker.value = pickerValue;
    });
  }

  function getTemplateId() {
    const proxyMatch = window.location.pathname.match(/\/template\/proxy\/([^/]+)\//);
    if (proxyMatch) return proxyMatch[1];
    const templateMatch = window.location.pathname.match(/\/template\/([^/]+)/);
    return templateMatch && templateMatch[1] !== "proxy" ? templateMatch[1] : "";
  }

  function getExcludedServerTokens() {
    return normalizeTokenList(excludedServerTokensInput ? excludedServerTokensInput.value : []);
  }

  function updateServerFilterCount() {
    const excluded = new Set(getExcludedServerTokens());
    const excludedCount = availableServers.filter((server) => excluded.has(server.token)).length;
    const text = availableServers.length
      ? `已排除 ${excludedCount} 个，仍显示 ${availableServers.length - excludedCount} 个`
      : "当前没有可配置的服务器";
    serverFilterCounts.forEach((item) => {
      item.textContent = text;
    });
  }

  function setExcludedServerTokens(value) {
    const tokens = normalizeTokenList(value);
    const excluded = new Set(tokens);
    if (excludedServerTokensInput) {
      excludedServerTokensInput.value = JSON.stringify(tokens);
    }
    serverFilterLists.forEach((list) => {
      list.querySelectorAll("input[data-server-token]").forEach((checkbox) => {
        checkbox.checked = excluded.has(checkbox.getAttribute("data-server-token"));
      });
    });
    updateServerFilterCount();
  }

  function renderServerFilters(message) {
    if (message) {
      const safeMessage = escapeHtml(message);
      serverFilterLists.forEach((list) => {
        list.innerHTML = `<p class="server-filter-empty">${safeMessage}</p>`;
      });
      serverFilterCounts.forEach((item) => {
        item.textContent = message;
      });
      return;
    }

    const excluded = new Set(getExcludedServerTokens());
    const markup = availableServers.length
      ? availableServers.map((server) => `
          <label class="server-filter-item">
            <input type="checkbox" data-server-token="${escapeHtml(server.token)}" ${excluded.has(server.token) ? "checked" : ""} />
            <span class="server-filter-name">${escapeHtml(server.name)}</span>
            <span class="server-filter-status ${server.isOnline ? "" : "is-offline"}">${server.isOnline ? "在线" : "离线"}</span>
          </label>
        `).join("")
      : '<p class="server-filter-empty">当前没有可配置的服务器</p>';
    serverFilterLists.forEach((list) => {
      list.innerHTML = markup;
    });
    updateServerFilterCount();
  }

  async function loadAvailableServers() {
    const templateId = getTemplateId();
    if (!templateId) {
      renderServerFilters("请在 EasyBot 模板配置页中选择服务器");
      return;
    }
    try {
      const response = await fetch(`/template/api/${templateId}/servers`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const servers = await response.json();
      const seenTokens = new Set();
      availableServers = (Array.isArray(servers) ? servers : []).reduce((result, server) => {
        const token = String(server.token || "").trim();
        if (!token || seenTokens.has(token)) return result;
        seenTokens.add(token);
        result.push({
          token,
          name: server.server_name || server.name || "未命名服务器",
          isOnline: Boolean(server.is_online)
        });
        return result;
      }, []);
      renderServerFilters();
    } catch (error) {
      configApi.debug("settings:servers-load-error", error);
      renderServerFilters("服务器列表读取失败，请刷新后重试");
    }
  }

  function fillForm(settings) {
    Array.from(form.elements).forEach((field) => {
      if (!field.name || !(field.name in settings)) return;
      setFieldValue(field, settings[field.name]);
    });
    syncMirrors(settings);
    syncColorPickers(settings.backgroundColor);
    setExcludedServerTokens(settings.excludedServerTokens);
    Object.keys(settings).forEach((name) => updateRangeReadouts(name, settings[name]));
    updateConditionalFields();
  }

  function collectForm() {
    const data = {};
    Array.from(form.elements).forEach((field) => {
      if (!field.name) return;
      data[field.name] = field.type === "checkbox" ? field.checked : field.value;
    });
    return data;
  }

  function setFieldValue(field, value) {
    if (field.type === "checkbox") {
      field.checked = Boolean(value);
    } else if (field.name === "excludedServerTokens") {
      field.value = JSON.stringify(normalizeTokenList(value));
    } else {
      field.value = value == null ? "" : value;
    }
  }

  function getMirrorValue(name) {
    const named = Array.from(form.elements).find((field) => field.name === name);
    if (named) return named.type === "checkbox" ? named.checked : named.value;
    const mirror = document.querySelector(`[data-mirror="${name}"]`);
    if (!mirror) return "";
    return mirror.type === "checkbox" ? mirror.checked : mirror.value;
  }

  function syncMirrors(settings) {
    document.querySelectorAll("[data-mirror]").forEach((field) => {
      const key = field.getAttribute("data-mirror");
      setFieldValue(field, settings[key]);
    });
  }

  function syncNamedField(name, sourceField) {
    const value = sourceField.type === "checkbox" ? sourceField.checked : sourceField.value;
    Array.from(form.elements).forEach((field) => {
      if (field.name === name && field !== sourceField) {
        setFieldValue(field, value);
      }
    });
    document.querySelectorAll(`[data-mirror="${name}"]`).forEach((field) => {
      if (field !== sourceField) {
        setFieldValue(field, value);
      }
    });
    if (name === "backgroundColor") syncColorPickers(value);
    updateRangeReadouts(name, value);
  }

  function updateRangeReadouts(name, value) {
    document.querySelectorAll(`[data-range-value="${name}"]`).forEach((output) => {
      if (name === "liquidLightDirection") {
        const numericValue = Number(value);
        const displayAngle = Number.isFinite(numericValue) ? Math.round(numericValue) : 315;
        const normalizedAngle = ((displayAngle % 360) + 360) % 360;
        const directions = ["上", "右上", "右", "右下", "下", "左下", "左", "左上"];
        const direction = directions[Math.round(normalizedAngle / 45) % directions.length];
        output.textContent = `${displayAngle}°（${direction}）`;
        return;
      }
      output.textContent = `${value}%`;
    });
  }

  function updateConditionalFields() {
    const provider = getMirrorValue("avatarProvider") || "imgd";
    const mode = getMirrorValue("backgroundMode") || "default";
    const randomCategory = getMirrorValue("randomBackgroundCategory") || "moez";
    const theme = getMirrorValue("theme") || "classic";

    providerFields.forEach((field) => {
      const providers = String(field.getAttribute("data-provider-field") || "").split(/\s+/);
      field.hidden = !providers.includes(provider);
    });
    previewProviderFields.forEach((field) => {
      const providers = String(field.getAttribute("data-preview-provider-field") || "").split(/\s+/);
      field.hidden = !providers.includes(provider);
    });
    backgroundFields.forEach((field) => {
      field.hidden = field.getAttribute("data-background-field") !== mode;
    });
    previewBackgroundFields.forEach((field) => {
      field.hidden = field.getAttribute("data-preview-background-field") !== mode;
    });
    randomCategoryFields.forEach((field) => {
      field.hidden = mode !== "random" || field.getAttribute("data-random-category-field") !== randomCategory;
    });
    previewRandomCategoryFields.forEach((field) => {
      field.hidden = mode !== "random" || field.getAttribute("data-preview-random-category-field") !== randomCategory;
    });
    themeFields.forEach((field) => {
      field.hidden = field.getAttribute("data-theme-field") !== theme;
    });
    previewThemeFields.forEach((field) => {
      field.hidden = field.getAttribute("data-preview-theme-field") !== theme;
    });
  }

  function setActiveTab(target) {
    tabs.forEach((item) => item.classList.toggle("is-active", item.getAttribute("data-tab") === target));
    pages.forEach((page) => page.classList.toggle("is-active", page.getAttribute("data-page") === target));
    document.body.classList.toggle("is-preview-tab", target === "preview");
    if (target === "preview") adjustPreviewHeight();
  }

  async function save() {
    try {
      const settings = collectForm();
      configApi.setDebugMode(settings.debugMode);
      configApi.debug("settings:save", settings);
      await configApi.saveSettingsAsync(settings);
      showToast("配置已保存");
      return true;
    } catch (error) {
      showToast("保存失败，请检查连接后重试");
      return false;
    }
  }

  async function exportLogs() {
    const logs = await configApi.readDebugLogsAsync();
    const header = [
      "EasyBot 服务器在线列表模板 Debug 日志",
      `导出时间: ${new Date().toISOString()}`,
      `User-Agent: ${navigator.userAgent}`,
      `日志数量: ${logs.length}`,
      ""
    ];
    const lines = logs.map((item) => {
      return `[${item.time}] [${item.level}] [rendering=${item.rendering}] ${item.message}\n页面: ${item.page}`;
    });
    const blob = new Blob([header.concat(lines).join("\n")], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `easybot-template-debug-${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    showToast(logs.length ? `已导出 ${logs.length} 条日志` : "暂无 Debug 日志");
  }

  async function clearLogs() {
    try {
      await configApi.clearDebugLogsAsync();
      showToast("日志已清空");
    } catch (error) {
      showToast("清空日志失败，请重试");
    }
  }

  async function clearCache() {
    try {
      await configApi.clearDataCacheAsync();
      showToast("缓存已清空");
    } catch (error) {
      showToast("清空缓存失败，请重试");
    }
  }

  async function refreshPreview() {
    if (!await save()) return;
    previewFrame.src = `./index.html?preview=${Date.now()}`;
  }

  function adjustPreviewHeight() {
    try {
      const doc = previewFrame.contentDocument || previewFrame.contentWindow.document;
      const poster = doc.getElementById("poster");
      const height = poster
        ? Math.ceil(poster.getBoundingClientRect().height)
        : Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight);
      previewFrame.style.height = `${height}px`;
    } catch (error) {
      previewFrame.style.height = "560px";
    }
  }

  function showToast(message) {
    let toast = document.querySelector(".toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("is-visible");
    setTimeout(() => toast.classList.remove("is-visible"), 1800);
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      setActiveTab(tab.getAttribute("data-tab"));
    });
  });

  menuItems.forEach((item) => {
    item.addEventListener("click", () => {
      const target = item.getAttribute("data-preview-section");
      menuItems.forEach((button) => button.classList.toggle("is-active", button === item));
      previewPanels.forEach((panel) => panel.classList.toggle("is-active", panel.getAttribute("data-preview-panel") === target));
    });
  });

  serverFilterLists.forEach((list) => {
    list.addEventListener("change", (event) => {
      const checkbox = event.target.closest("input[data-server-token]");
      if (!checkbox) return;
      const excluded = new Set(getExcludedServerTokens());
      const token = checkbox.getAttribute("data-server-token");
      if (checkbox.checked) {
        excluded.add(token);
      } else {
        excluded.delete(token);
      }
      setExcludedServerTokens(Array.from(excluded));
    });
  });

  serverFilterActions.forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.getAttribute("data-server-filter-action");
      setExcludedServerTokens(action === "exclude-all" ? availableServers.map((server) => server.token) : []);
    });
  });

  form.addEventListener("input", (event) => {
    const source = event.target;
    const name = source.name || source.getAttribute("data-mirror") || source.getAttribute("data-color-picker");
    if (!name) return;
    syncNamedField(name, source);
  });

  form.addEventListener("change", (event) => {
    const source = event.target;
    const name = source.name || source.getAttribute("data-mirror") || source.getAttribute("data-color-picker");
    if (name) syncNamedField(name, source);
    updateConditionalFields();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await save();
  });

  resetButton.addEventListener("click", async () => {
    try {
      const settings = await configApi.resetSettings();
      configApi.setDebugMode(settings.debugMode);
      fillForm(settings);
      showToast("已恢复默认配置");
    } catch (error) {
      showToast("恢复失败，请检查连接后重试");
    }
  });

  refreshPreviewButton.addEventListener("click", refreshPreview);
  exportLogsButton.addEventListener("click", exportLogs);
  clearLogsButton.addEventListener("click", clearLogs);
  clearCacheButton.addEventListener("click", clearCache);
  previewFrame.addEventListener("load", adjustPreviewHeight);
  window.addEventListener("message", (event) => {
    if (!event.data || event.data.type !== "server-player-count-template-height") return;
    const height = Number(event.data.height);
    if (height > 0) {
      previewFrame.style.height = `${Math.ceil(height)}px`;
    }
  });

  async function init() {
    const settings = await configApi.readSettingsAsync();
    configApi.setDebugMode(settings.debugMode);
    configApi.debug("settings:init", { userAgent: navigator.userAgent, settings });
    fillForm(settings);
    updateConditionalFields();
    setActiveTab("config");
    loadAvailableServers();
  }

  init();
})();
