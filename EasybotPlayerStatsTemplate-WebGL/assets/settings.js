(function () {
  const configApi = window.PlayerStatisticsConfig;
  const form = document.getElementById("settingsForm");
  const resetButton = document.getElementById("resetButton");
  const refreshPreviewButton = document.getElementById("refreshPreviewButton");
  const exportLogsButton = document.getElementById("exportLogsButton");
  const clearLogsButton = document.getElementById("clearLogsButton");
  const clearCacheButton = document.getElementById("clearCacheButton");
  const previewFrame = document.getElementById("previewFrame");
  const avatarProvider = document.getElementById("avatarProvider");
  const backgroundMode = document.getElementById("backgroundMode");
  const providerFields = document.querySelectorAll("[data-provider-field]");
  const previewProviderFields = document.querySelectorAll("[data-preview-provider-field]");
  const backgroundFields = document.querySelectorAll("[data-background-field]");
  const previewBackgroundFields = document.querySelectorAll("[data-preview-background-field]");
  const themeFields = document.querySelectorAll("[data-theme-field]");
  const previewThemeFields = document.querySelectorAll("[data-preview-theme-field]");
  const tabs = document.querySelectorAll("[data-tab]");
  const pages = document.querySelectorAll("[data-page]");
  const menuItems = document.querySelectorAll("[data-preview-section]");
  const previewPanels = document.querySelectorAll("[data-preview-panel]");

  function fillForm(settings) {
    Array.from(form.elements).forEach((field) => {
      if (!field.name || !(field.name in settings)) return;
      setFieldValue(field, settings[field.name]);
    });
    syncMirrors(settings);
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
      "EasyBot 玩家统计资料卡模板 Debug 日志",
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
    link.download = `easybot-player-statistics-debug-${Date.now()}.txt`;
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

  form.addEventListener("input", (event) => {
    const source = event.target;
    const name = source.name || source.getAttribute("data-mirror");
    if (!name) return;
    syncNamedField(name, source);
  });

  form.addEventListener("change", (event) => {
    const source = event.target;
    const name = source.name || source.getAttribute("data-mirror");
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
    if (!event.data || event.data.type !== "player-statistics-template-height") return;
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
  }

  init();
})();
