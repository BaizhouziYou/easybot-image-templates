(function () {
  const configApi = window.ServerPerformanceConfig;
  const form = document.getElementById("settingsForm");
  const resetButton = document.getElementById("resetButton");
  const refreshPreviewButton = document.getElementById("refreshPreviewButton");
  const exportLogsButton = document.getElementById("exportLogsButton");
  const clearLogsButton = document.getElementById("clearLogsButton");
  const clearCacheButton = document.getElementById("clearCacheButton");
  const previewFrame = document.getElementById("previewFrame");
  const backgroundColorPicker = document.getElementById("backgroundColorPicker");
  const excludedServerTokensInput = document.getElementById("excludedServerTokens");
  const serverMetricProfilesInput = document.getElementById("serverMetricProfiles");
  const serverProfileLists = document.querySelectorAll("[data-server-profile-list]");
  const serverProfileCounts = document.querySelectorAll("[data-server-profile-count]");
  const serverProfileActions = document.querySelectorAll("[data-server-profile-action]");
  const backgroundFields = document.querySelectorAll("[data-background-field]");
  const previewBackgroundFields = document.querySelectorAll("[data-preview-background-field]");
  const randomCategoryFields = document.querySelectorAll("[data-random-category-field]");
  const previewRandomCategoryFields = document.querySelectorAll("[data-preview-random-category-field]");
  const themeFields = document.querySelectorAll("[data-theme-field]");
  const previewThemeFields = document.querySelectorAll("[data-preview-theme-field]");
  const tabs = document.querySelectorAll("[data-tab]");
  const pages = document.querySelectorAll("[data-page]");
  const menuItems = document.querySelectorAll("[data-preview-section]");
  const previewPanels = document.querySelectorAll("[data-preview-panel]");
  let availableServers = [];
  let serverProfiles = {};

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getTemplateId() {
    const proxyMatch = window.location.pathname.match(/\/template\/proxy\/([^/]+)\//);
    if (proxyMatch) return proxyMatch[1];
    const templateMatch = window.location.pathname.match(/\/template\/([^/]+)/);
    return templateMatch && templateMatch[1] !== "proxy" ? templateMatch[1] : "";
  }

  function normalizeServerList(value) {
    if (Array.isArray(value)) return value;
    if (value && Array.isArray(value.data)) return value.data;
    if (value && Array.isArray(value.servers)) return value.servers;
    return [];
  }

  function getExcludedServerTokens() {
    return configApi.normalizeTokenList(excludedServerTokensInput.value);
  }

  function setExcludedServerTokens(value) {
    const tokens = configApi.normalizeTokenList(value);
    const excluded = new Set(tokens);
    excludedServerTokensInput.value = JSON.stringify(tokens);
    serverProfileLists.forEach((list) => {
      list.querySelectorAll("[data-server-profile-visible]").forEach((checkbox) => {
        const server = getServerFromElement(checkbox);
        if (server) checkbox.checked = !excluded.has(server.token);
      });
    });
    updateServerProfileCount();
  }

  function inferPreset(metricConfig) {
    if (metricConfig === configApi.metricPresets.fabric) return "fabric";
    if (metricConfig === configApi.metricPresets.bukkit) return "bukkit";
    return "custom";
  }

  function createDefaultProfile() {
    const metricConfig = configApi.normalizeMetricConfig(form.elements.metricConfig.value || configApi.defaultMetricConfig);
    return {
      preset: inferPreset(metricConfig),
      queryPlayerName: String(form.elements.queryPlayerName.value || "Steve").trim() || "Steve",
      displayName: "",
      metricConfig
    };
  }

  function ensureServerProfile(token) {
    if (!serverProfiles[token]) serverProfiles[token] = createDefaultProfile();
    return serverProfiles[token];
  }

  function syncServerProfilesInput() {
    serverMetricProfilesInput.value = JSON.stringify(serverProfiles);
  }

  function getServerFromElement(element) {
    const card = element.closest("[data-server-index]");
    if (!card) return null;
    return availableServers[Number(card.getAttribute("data-server-index"))] || null;
  }

  function updateServerProfileCount() {
    const excluded = new Set(getExcludedServerTokens());
    const visibleCount = availableServers.filter((server) => !excluded.has(server.token)).length;
    const text = availableServers.length
      ? `共 ${availableServers.length} 台，当前显示 ${visibleCount} 台`
      : "当前没有可配置的服务器";
    serverProfileCounts.forEach((item) => { item.textContent = text; });
  }

  function createServerProfileMarkup(server, index, excluded) {
    const profile = ensureServerProfile(server.token);
    const statusText = server.isOnline ? "在线" : "离线";
    return `
      <article class="server-profile-card" data-server-index="${index}">
        <header class="server-profile-header">
          <label class="server-profile-visible">
            <input type="checkbox" data-server-profile-visible ${excluded.has(server.token) ? "" : "checked"} />
            <span>显示</span>
          </label>
          <div class="server-profile-identity">
            <strong>${escapeHtml(server.name)}</strong>
            <small>${escapeHtml(server.token)}</small>
          </div>
          <span class="server-profile-status ${server.isOnline ? "" : "is-offline"}">${statusText}</span>
        </header>
        <div class="server-profile-fields">
          <label class="field">
            <span>变量预设</span>
            <select data-server-profile-field="preset">
              <option value="fabric" ${profile.preset === "fabric" ? "selected" : ""}>Fabric（Text Placeholder API）</option>
              <option value="bukkit" ${profile.preset === "bukkit" ? "selected" : ""}>Bukkit / Paper（PlaceholderAPI）</option>
              <option value="custom" ${profile.preset === "custom" ? "selected" : ""}>自定义</option>
            </select>
          </label>
          <div class="preset-actions">
            <button type="button" class="secondary" data-server-profile-apply-preset>应用所选预设</button>
          </div>
          <label class="field full">
            <span>模板显示名称</span>
            <input type="text" data-server-profile-field="displayName" value="${escapeHtml(profile.displayName || "")}" placeholder="留空时使用 EasyBot 服务器名" />
            <small class="field-help">仅修改这张图片中的分组标题，不会改变服务器 token 或实际连接名称。</small>
          </label>
          <label class="field full">
            <span>PAPI 查询玩家名</span>
            <input type="text" data-server-profile-field="queryPlayerName" value="${escapeHtml(profile.queryPlayerName)}" />
            <small class="field-help">仅作为该服务器变量的玩家上下文；通常保持 Steve 即可。</small>
          </label>
          <label class="field full">
            <span>指标配置</span>
            <textarea rows="9" spellcheck="false" data-server-profile-field="metricConfig">${escapeHtml(profile.metricConfig)}</textarea>
            <small class="field-help">每行：名称 | 变量 | 单位 | lower / higher / neutral | 警告值 | 危险值，最多 18 项。</small>
          </label>
        </div>
      </article>
    `;
  }

  function renderServerProfiles(message) {
    if (message) {
      const markup = `<p class="server-profile-empty">${escapeHtml(message)}</p>`;
      serverProfileLists.forEach((list) => { list.innerHTML = markup; });
      serverProfileCounts.forEach((item) => { item.textContent = message; });
      return;
    }
    const excluded = new Set(getExcludedServerTokens());
    const markup = availableServers.length
      ? availableServers.map((server, index) => createServerProfileMarkup(server, index, excluded)).join("")
      : '<p class="server-profile-empty">当前没有可配置的服务器</p>';
    serverProfileLists.forEach((list) => { list.innerHTML = markup; });
    syncServerProfilesInput();
    updateServerProfileCount();
  }

  function syncServerProfileEditors(token, source) {
    serverProfileLists.forEach((list) => {
      list.querySelectorAll("[data-server-index]").forEach((card) => {
        const server = availableServers[Number(card.getAttribute("data-server-index"))];
        if (!server || server.token !== token) return;
        const profile = ensureServerProfile(token);
        card.querySelectorAll("[data-server-profile-field]").forEach((field) => {
          if (field === source) return;
          field.value = profile[field.getAttribute("data-server-profile-field")] || "";
        });
      });
    });
  }

  async function loadAvailableServers() {
    const templateId = getTemplateId();
    if (!templateId) {
      availableServers = [{ token: "preview", name: form.elements.previewServerName.value || "示例服务器", isOnline: true }];
      renderServerProfiles();
      return;
    }
    try {
      const response = await fetch(`/template/api/${templateId}/servers`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const seenTokens = new Set();
      availableServers = normalizeServerList(await response.json()).reduce((result, server) => {
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
      availableServers.forEach((server) => ensureServerProfile(server.token));
      renderServerProfiles();
    } catch (error) {
      configApi.debug("settings:servers-load-error", error);
      renderServerProfiles("服务器列表读取失败，请刷新后重试");
    }
  }

  function fillForm(settings) {
    Array.from(form.elements).forEach((field) => {
      if (!field.name || !(field.name in settings)) return;
      if (["excludedServerTokens", "serverMetricProfiles"].includes(field.name)) return;
      setFieldValue(field, settings[field.name]);
    });
    serverProfiles = configApi.normalizeServerMetricProfiles(
      settings.serverMetricProfiles,
      settings.metricConfig,
      settings.queryPlayerName
    );
    setExcludedServerTokens(settings.excludedServerTokens);
    syncServerProfilesInput();
    syncMirrors(settings);
    Object.keys(settings).forEach((name) => updateRangeReadouts(name, settings[name]));
    updateColorPicker(settings.backgroundColor);
    updateConditionalFields();
    if (availableServers.length) renderServerProfiles();
  }

  function collectForm() {
    const data = {};
    Array.from(form.elements).forEach((field) => {
      if (!field.name) return;
      data[field.name] = field.type === "checkbox" ? field.checked : field.value;
    });
    data.excludedServerTokens = getExcludedServerTokens();
    data.serverMetricProfiles = serverProfiles;
    return data;
  }

  function setFieldValue(field, value) {
    if (field.type === "checkbox") field.checked = Boolean(value);
    else field.value = value == null ? "" : value;
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
      if (field.name === name && field !== sourceField) setFieldValue(field, value);
    });
    document.querySelectorAll(`[data-mirror="${name}"]`).forEach((field) => {
      if (field !== sourceField) setFieldValue(field, value);
    });
    if (name === "backgroundColor") updateColorPicker(value);
    updateRangeReadouts(name, value);
  }

  function updateRangeReadouts(name, value) {
    document.querySelectorAll(`[data-range-value="${name}"]`).forEach((output) => {
      if (name === "liquidLightDirection") {
        const numeric = Number(value);
        const angle = Number.isFinite(numeric) ? Math.round(numeric) : 315;
        const normalized = ((angle % 360) + 360) % 360;
        const directions = ["上", "右上", "右", "右下", "下", "左下", "左", "左上"];
        output.textContent = `${angle}°（${directions[Math.round(normalized / 45) % directions.length]}）`;
        return;
      }
      output.textContent = `${value}%`;
    });
  }

  function updateColorPicker(value) {
    const normalized = configApi.normalizeHexColor(value, "#0B111D");
    const opaque = normalized.length === 9 ? normalized.slice(0, 7) : normalized;
    if (/^#[0-9A-F]{6}$/i.test(opaque)) backgroundColorPicker.value = opaque.toLowerCase();
  }

  function updateConditionalFields() {
    const mode = getMirrorValue("backgroundMode") || "random";
    const theme = getMirrorValue("theme") || "classic";
    const category = getMirrorValue("randomBackgroundCategory") || "moez";
    backgroundFields.forEach((field) => { field.hidden = field.getAttribute("data-background-field") !== mode; });
    previewBackgroundFields.forEach((field) => { field.hidden = field.getAttribute("data-preview-background-field") !== mode; });
    randomCategoryFields.forEach((field) => { field.hidden = mode !== "random" || field.getAttribute("data-random-category-field") !== category; });
    previewRandomCategoryFields.forEach((field) => { field.hidden = mode !== "random" || field.getAttribute("data-preview-random-category-field") !== category; });
    themeFields.forEach((field) => { field.hidden = field.getAttribute("data-theme-field") !== theme; });
    previewThemeFields.forEach((field) => { field.hidden = field.getAttribute("data-preview-theme-field") !== theme; });
  }

  function setActiveTab(target) {
    tabs.forEach((item) => item.classList.toggle("is-active", item.getAttribute("data-tab") === target));
    pages.forEach((page) => page.classList.toggle("is-active", page.getAttribute("data-page") === target));
    document.body.classList.toggle("is-preview-tab", target === "preview");
    if (target === "preview") adjustPreviewHeight();
  }

  async function save() {
    try {
      syncServerProfilesInput();
      const settings = collectForm();
      configApi.setDebugMode(settings.debugMode);
      configApi.debug("settings:save", settings);
      const normalized = await configApi.saveSettingsAsync(settings);
      fillForm(normalized);
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
      "EasyBot 服务器性能监控模板 Debug 日志",
      `导出时间: ${new Date().toISOString()}`,
      `User-Agent: ${navigator.userAgent}`,
      `日志数量: ${logs.length}`,
      ""
    ];
    const lines = logs.map((item) => `[${item.time}] [${item.level}] [rendering=${item.rendering}] ${item.message}\n页面: ${item.page}`);
    const blob = new Blob([header.concat(lines).join("\n")], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `easybot-server-performance-debug-${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    showToast(logs.length ? `已导出 ${logs.length} 条日志` : "暂无 Debug 日志");
  }

  async function refreshPreview() {
    if (!await save()) return;
    previewFrame.src = `./index.html?preview=${Date.now()}`;
  }

  function adjustPreviewHeight() {
    try {
      const doc = previewFrame.contentDocument || previewFrame.contentWindow.document;
      const poster = doc.getElementById("poster");
      const height = poster ? Math.ceil(poster.getBoundingClientRect().height) : Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight);
      previewFrame.style.height = `${height}px`;
    } catch (error) {
      previewFrame.style.height = "620px";
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

  function handleServerProfileInput(source) {
    const server = getServerFromElement(source);
    if (!server) return false;
    if (source.hasAttribute("data-server-profile-visible")) {
      const excluded = new Set(getExcludedServerTokens());
      if (source.checked) excluded.delete(server.token);
      else excluded.add(server.token);
      setExcludedServerTokens(Array.from(excluded));
      return true;
    }
    const fieldName = source.getAttribute("data-server-profile-field");
    if (!fieldName) return false;
    const profile = ensureServerProfile(server.token);
    profile[fieldName] = source.value;
    if (fieldName === "metricConfig") profile.preset = inferPreset(source.value);
    syncServerProfilesInput();
    syncServerProfileEditors(server.token, source);
    return true;
  }

  tabs.forEach((tab) => tab.addEventListener("click", () => setActiveTab(tab.getAttribute("data-tab"))));
  menuItems.forEach((item) => item.addEventListener("click", () => {
    const target = item.getAttribute("data-preview-section");
    menuItems.forEach((button) => button.classList.toggle("is-active", button === item));
    previewPanels.forEach((panel) => panel.classList.toggle("is-active", panel.getAttribute("data-preview-panel") === target));
  }));
  form.addEventListener("input", (event) => {
    const source = event.target;
    if (handleServerProfileInput(source)) return;
    const name = source.name || source.getAttribute("data-mirror");
    if (!name) return;
    syncNamedField(name, source);
  });
  form.addEventListener("change", (event) => {
    const source = event.target;
    if (handleServerProfileInput(source)) return;
    const name = source.name || source.getAttribute("data-mirror");
    if (name) syncNamedField(name, source);
    updateConditionalFields();
  });
  form.addEventListener("click", (event) => {
    const applyButton = event.target.closest("[data-server-profile-apply-preset]");
    if (!applyButton) return;
    const server = getServerFromElement(applyButton);
    if (!server) return;
    const card = applyButton.closest("[data-server-index]");
    const selectedPreset = card.querySelector('[data-server-profile-field="preset"]').value;
    const preset = configApi.metricPresets[selectedPreset];
    if (!preset) {
      showToast("自定义模式不会替换当前指标");
      return;
    }
    const profile = ensureServerProfile(server.token);
    profile.preset = selectedPreset;
    profile.metricConfig = preset;
    syncServerProfilesInput();
    syncServerProfileEditors(server.token);
    showToast(`已为 ${server.name} 应用${selectedPreset === "fabric" ? " Fabric" : " Bukkit / Paper"}预设`);
  });
  serverProfileActions.forEach((button) => button.addEventListener("click", () => {
    const action = button.getAttribute("data-server-profile-action");
    setExcludedServerTokens(action === "hide-all" ? availableServers.map((server) => server.token) : []);
  }));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await save();
  });
  backgroundColorPicker.addEventListener("input", () => {
    const field = Array.from(form.elements).find((item) => item.name === "backgroundColor");
    field.value = backgroundColorPicker.value.toUpperCase();
    syncNamedField("backgroundColor", field);
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
  clearLogsButton.addEventListener("click", async () => {
    try {
      await configApi.clearDebugLogsAsync();
      showToast("日志已清空");
    } catch (error) {
      showToast("清空日志失败，请重试");
    }
  });
  clearCacheButton.addEventListener("click", async () => {
    try {
      await configApi.clearDataCacheAsync();
      showToast("缓存已清空");
    } catch (error) {
      showToast("清空缓存失败，请重试");
    }
  });
  previewFrame.addEventListener("load", adjustPreviewHeight);
  window.addEventListener("message", (event) => {
    if (!event.data || event.data.type !== "server-performance-template-height") return;
    const height = Number(event.data.height);
    if (height > 0) previewFrame.style.height = `${Math.ceil(height)}px`;
  });

  async function init() {
    const settings = await configApi.readSettingsAsync();
    configApi.setDebugMode(settings.debugMode);
    configApi.debug("settings:init", { userAgent: navigator.userAgent, settings });
    fillForm(settings);
    setActiveTab("config");
    await loadAvailableServers();
  }

  init();
})();
