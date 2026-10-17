(function () {
  const storageKey = "server_performance_dashboard_settings_v1";
  const debugStorageKey = "server_performance_dashboard_debug_logs_v1";
  const dataCacheStorageKey = storageKey + "_data_cache_v1";
  const maxDebugLogs = 500;
  let debugEnabled = false;
  let consoleWrapped = false;
  let remoteLogTimer = null;

  const bukkitMetricConfig = [
    "TPS（1分钟）|%server_tps_1%||higher|18|15",
    "MSPT|%spark_tickduration_10s%|ms|lower|40|50",
    "系统 CPU|%spark_cpu_system_10s%|%|lower|70|90",
    "进程 CPU|%spark_cpu_process_10s%|%|lower|70|90",
    "已用内存|%server_ram_used%|MB|neutral||",
    "在线玩家|%server_online%|人|neutral||"
  ].join("\n");

  const fabricMetricConfig = [
    "TPS|%server:tps%||higher|18|15",
    "MSPT|%server:mspt%|ms|lower|40|50",
    "系统 CPU|%spark:cpu_system 10s%|%|lower|70|90",
    "进程 CPU|%spark:cpu_process 10s%|%|lower|70|90",
    "已用内存|%server:used_ram%|MB|neutral||",
    "在线玩家|%server:online%|人|neutral||"
  ].join("\n");

  const metricPresets = {
    bukkit: bukkitMetricConfig,
    fabric: fabricMetricConfig
  };
  const defaultMetricConfig = bukkitMetricConfig;

  const defaultSettings = {
    title: "服务器性能监控",
    subtitle: "Minecraft Performance",
    description: "实时查看服务器运行状态",
    serverLabel: "显示服务器",
    previewServerName: "示例服务器",
    queryPlayerName: "Steve",
    metricConfig: defaultMetricConfig,
    excludedServerTokens: [],
    serverMetricProfiles: {},
    theme: "classic",
    renderScale: 1.5,
    fontFamily: "system",
    liquidAppearance: "clear",
    liquidEdgeRefractionRange: 100,
    liquidLightDirection: 315,
    backgroundMode: "random",
    backgroundUrl: "",
    backgroundColor: "#0B111D",
    randomBackgroundApi: "https://t.alcy.cc",
    randomBackgroundCategory: "moez",
    randomBackgroundCustomCategory: "",
    backgroundDim: 45,
    enableDataCache: true,
    dataCacheSeconds: 30,
    debugMode: false,
    customCss: ""
  };

  function serializeDebugValue(value) {
    if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack || ""}`;
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
    }
  }

  function readLocalDebugLogs() {
    try {
      const raw = window.localStorage.getItem(debugStorageKey);
      const logs = raw ? JSON.parse(raw) : [];
      return Array.isArray(logs) ? logs : [];
    } catch (error) {
      return [];
    }
  }

  function appendDebugLog(level, values) {
    if (!debugEnabled) return;
    const logs = readLocalDebugLogs();
    logs.push({
      time: new Date().toISOString(),
      level,
      page: window.location.href,
      rendering: isRendering(),
      message: Array.from(values).map(serializeDebugValue).join(" ")
    });
    const limitedLogs = logs.slice(-maxDebugLogs);
    window.localStorage.setItem(debugStorageKey, JSON.stringify(limitedLogs));
    scheduleRemoteLogWrite(limitedLogs);
  }

  function scheduleRemoteLogWrite(logs) {
    if ((!inProxy() && !isRendering()) || !readApiKey()) return;
    clearTimeout(remoteLogTimer);
    remoteLogTimer = setTimeout(() => {
      writeEasyBotValue(debugStorageKey, logs).catch(() => {});
    }, 250);
  }

  function setDebugMode(enabled) {
    debugEnabled = Boolean(enabled);
    if (consoleWrapped) return;
    consoleWrapped = true;
    ["log", "info", "warn", "error", "debug"].forEach((level) => {
      const original = console[level] ? console[level].bind(console) : console.log.bind(console);
      console[level] = function () {
        original.apply(console, arguments);
        appendDebugLog(level, arguments);
      };
    });
    window.addEventListener("error", (event) => {
      appendDebugLog("window.error", [event.message, event.filename, `${event.lineno}:${event.colno}`, event.error || ""]);
    });
    window.addEventListener("unhandledrejection", (event) => {
      appendDebugLog("unhandledrejection", [event.reason]);
    });
  }

  function debug() {
    appendDebugLog("template", arguments);
  }

  async function readDebugLogsAsync() {
    const remoteLogs = await readEasyBotValue(debugStorageKey);
    if (!Array.isArray(remoteLogs)) return readLocalDebugLogs();
    const merged = remoteLogs.concat(readLocalDebugLogs());
    const seen = new Set();
    const uniqueLogs = merged.filter((item) => {
      const identity = `${item.time}|${item.level}|${item.page}|${item.message}`;
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    }).sort((left, right) => String(left.time).localeCompare(String(right.time))).slice(-maxDebugLogs);
    window.localStorage.setItem(debugStorageKey, JSON.stringify(uniqueLogs));
    return uniqueLogs;
  }

  async function flushDebugLogsAsync() {
    if (!debugEnabled) return;
    clearTimeout(remoteLogTimer);
    remoteLogTimer = null;
    await writeEasyBotValue(debugStorageKey, readLocalDebugLogs().slice(-maxDebugLogs)).catch(() => {});
  }

  async function clearDebugLogsAsync() {
    clearTimeout(remoteLogTimer);
    remoteLogTimer = null;
    window.localStorage.removeItem(debugStorageKey);
    window.localStorage.removeItem("easybot-image-sdk-options-" + debugStorageKey);
    await writeEasyBotValue(debugStorageKey, []);
  }

  function readSettings() {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return { ...defaultSettings };
      return normalizeSettings({ ...defaultSettings, ...JSON.parse(raw) });
    } catch (error) {
      console.warn("Failed to read template settings:", error);
      return { ...defaultSettings };
    }
  }

  async function readSettingsAsync() {
    const easybotOptions = await readEasyBotOptions();
    if (easybotOptions) return normalizeSettings({ ...defaultSettings, ...easybotOptions });
    return readSettings();
  }

  function saveSettings(settings) {
    return saveSettingsAsync(settings);
  }

  async function saveSettingsAsync(settings) {
    const normalized = normalizeSettings({ ...defaultSettings, ...settings });
    delete normalized.__dataCache;
    await writeEasyBotOptions(normalized);
    window.localStorage.setItem(storageKey, JSON.stringify(normalized));
    return normalized;
  }

  function resetSettings() {
    return saveSettingsAsync({ ...defaultSettings });
  }

  function normalizeSettings(settings) {
    return {
      ...settings,
      title: String(settings.title || defaultSettings.title).slice(0, 80),
      subtitle: String(settings.subtitle || defaultSettings.subtitle).slice(0, 80),
      description: String(settings.description || defaultSettings.description).slice(0, 160),
      serverLabel: String(settings.serverLabel || defaultSettings.serverLabel).slice(0, 40),
      previewServerName: String(settings.previewServerName || defaultSettings.previewServerName).trim().slice(0, 80),
      queryPlayerName: String(settings.queryPlayerName || defaultSettings.queryPlayerName).trim().slice(0, 64),
      metricConfig: normalizeMetricConfig(settings.metricConfig),
      excludedServerTokens: normalizeTokenList(settings.excludedServerTokens),
      serverMetricProfiles: normalizeServerMetricProfiles(
        settings.serverMetricProfiles,
        settings.metricConfig,
        settings.queryPlayerName
      ),
      theme: ["classic", "liquid"].includes(settings.theme) ? settings.theme : defaultSettings.theme,
      renderScale: [1, 1.5, 2, 2.5, 3].includes(Number(settings.renderScale))
        ? Number(settings.renderScale)
        : defaultSettings.renderScale,
      fontFamily: ["system", "noto-sans-sc", "source-han-sans"].includes(settings.fontFamily)
        ? settings.fontFamily
        : defaultSettings.fontFamily,
      liquidAppearance: ["clear", "tinted"].includes(settings.liquidAppearance)
        ? settings.liquidAppearance
        : defaultSettings.liquidAppearance,
      liquidEdgeRefractionRange: clampNumber(settings.liquidEdgeRefractionRange, 50, 150, 100),
      liquidLightDirection: clampNumber(settings.liquidLightDirection, 0, 360, 315),
      backgroundMode: ["random", "default", "color", "custom"].includes(settings.backgroundMode)
        ? settings.backgroundMode
        : defaultSettings.backgroundMode,
      backgroundUrl: String(settings.backgroundUrl || "").trim().slice(0, 1000),
      backgroundColor: normalizeHexColor(settings.backgroundColor, defaultSettings.backgroundColor),
      randomBackgroundApi: trimTrailingSlash(settings.randomBackgroundApi || defaultSettings.randomBackgroundApi),
      randomBackgroundCategory: ["pc", "mp", "moez", "fj", "custom"].includes(settings.randomBackgroundCategory)
        ? settings.randomBackgroundCategory
        : defaultSettings.randomBackgroundCategory,
      randomBackgroundCustomCategory: String(settings.randomBackgroundCustomCategory || "").trim().slice(0, 240),
      backgroundDim: clampNumber(settings.backgroundDim, 0, 80, defaultSettings.backgroundDim),
      dataCacheSeconds: Math.max(5, Math.min(3600, Number(settings.dataCacheSeconds) || defaultSettings.dataCacheSeconds)),
      enableDataCache: settings.enableDataCache !== false,
      debugMode: settings.debugMode === true,
      customCss: String(settings.customCss || "").slice(0, 30000)
    };
  }

  function normalizeMetricConfig(value) {
    const source = String(value || defaultMetricConfig);
    const validLines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 18).filter((line) => {
      const parts = line.split("|");
      return Boolean(String(parts[0] || "").trim() && String(parts[1] || "").trim());
    });
    return (validLines.length ? validLines : defaultMetricConfig.split("\n")).join("\n");
  }

  function normalizeTokenList(value) {
    let source = value;
    if (typeof source === "string") {
      try {
        source = JSON.parse(source);
      } catch (error) {
        source = source.split(",");
      }
    }
    if (!Array.isArray(source)) return [];
    return Array.from(new Set(source
      .map((item) => String(item || "").trim().slice(0, 160))
      .filter(Boolean)))
      .slice(0, 200);
  }

  function normalizeServerMetricProfiles(value, fallbackMetricConfig, fallbackQueryPlayerName) {
    let source = value;
    if (typeof source === "string") {
      try {
        source = JSON.parse(source);
      } catch (error) {
        source = {};
      }
    }
    if (!source || typeof source !== "object" || Array.isArray(source)) return {};
    const profiles = {};
    Object.entries(source).slice(0, 200).forEach(([rawToken, rawProfile]) => {
      const token = String(rawToken || "").trim().slice(0, 160);
      if (!token || !rawProfile || typeof rawProfile !== "object" || Array.isArray(rawProfile)) return;
      const metricConfig = normalizeMetricConfig(rawProfile.metricConfig || fallbackMetricConfig);
      const inferredPreset = metricConfig === metricPresets.fabric
        ? "fabric"
        : metricConfig === metricPresets.bukkit
          ? "bukkit"
          : "custom";
      profiles[token] = {
        preset: ["fabric", "bukkit", "custom"].includes(rawProfile.preset)
          ? rawProfile.preset
          : inferredPreset,
        queryPlayerName: String(rawProfile.queryPlayerName || fallbackQueryPlayerName || defaultSettings.queryPlayerName)
          .trim()
          .slice(0, 64),
        displayName: String(rawProfile.displayName || "").trim().slice(0, 80),
        metricConfig
      };
    });
    return profiles;
  }

  function normalizeHexColor(value, fallback) {
    const text = String(value || "").trim().replace(/^#/, "");
    if (/^[0-9a-f]{3,4}$/i.test(text) || /^[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(text)) {
      return `#${text.toUpperCase()}`;
    }
    return fallback;
  }

  function clampNumber(value, min, max, fallback) {
    const numeric = Number(value);
    return Math.max(min, Math.min(max, Number.isFinite(numeric) ? numeric : fallback));
  }

  function trimTrailingSlash(value) {
    return String(value).trim().replace(/\/+$/, "");
  }

  function inProxy() {
    const pathParts = window.location.pathname.split("/");
    return pathParts[1] === "template" && pathParts[2] === "proxy";
  }

  function isRendering() {
    return typeof __internal_set_viewport === "function";
  }

  function readApiKey() {
    const match = window.location.pathname.match(/\/template\/proxy\/([^/]+)\//);
    return match ? match[1] : "";
  }

  async function readEasyBotOptions() {
    return readEasyBotValue(storageKey);
  }

  async function readEasyBotValue(key) {
    try {
      if (!inProxy() && !isRendering()) {
        const raw = window.localStorage.getItem("easybot-image-sdk-options-" + key);
        return raw ? JSON.parse(raw) : null;
      }
      const apiKey = readApiKey();
      if (!apiKey) return null;
      const response = await fetch(`/template/api/${apiKey}/options?key=${encodeURIComponent(key)}`);
      if (!response.ok) return null;
      let options = await response.json();
      if (typeof options === "string") options = JSON.parse(options);
      if (options && typeof options.value === "string") options = JSON.parse(options.value);
      return options && Object.keys(options).length ? options : null;
    } catch (error) {
      console.warn("Failed to read EasyBot template options:", error);
      return null;
    }
  }

  async function writeEasyBotOptions(settings) {
    return writeEasyBotValue(storageKey, settings);
  }

  async function writeEasyBotValue(key, value) {
    if (!inProxy() && !isRendering()) {
      window.localStorage.setItem("easybot-image-sdk-options-" + key, JSON.stringify(value));
      return;
    }
    const apiKey = readApiKey();
    if (!apiKey) throw new Error("无法识别模板，请重新打开配置页面");
    const response = await fetch("/template/api/" + apiKey + "/options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value: JSON.stringify(value) })
    });
    if (!response.ok) throw new Error("保存请求失败：HTTP " + response.status);
  }

  async function readDataCacheAsync() {
    return readEasyBotValue(dataCacheStorageKey);
  }

  async function writeDataCacheAsync(cache) {
    try {
      await writeEasyBotValue(dataCacheStorageKey, cache);
    } catch (error) {
      console.warn("缓存写入失败，本次数据仍可正常显示：", error);
    }
  }

  async function clearDataCacheAsync() {
    await writeEasyBotValue(dataCacheStorageKey, null);
  }

  async function setRenderViewport(width, height, deviceScaleFactor) {
    const normalizedScale = [1, 1.5, 2, 2.5, 3].includes(Number(deviceScaleFactor))
      ? Number(deviceScaleFactor)
      : defaultSettings.renderScale;
    debug("bridge:status", {
      rendering: isRendering(),
      getViewport: typeof __internal_get_viewport,
      setViewport: typeof __internal_set_viewport,
      requestedWidth: width,
      requestedHeight: height,
      requestedDeviceScaleFactor: normalizedScale
    });
    if (!isRendering()) return;
    try {
      const current = typeof __internal_get_viewport === "function"
        ? JSON.parse(await __internal_get_viewport())
        : {};
      await flushDebugLogsAsync();
      await __internal_set_viewport(JSON.stringify({
        ...current,
        width,
        height,
        device_scale_factor: normalizedScale
      }));
      debug("bridge:set-viewport-success", { width, height, deviceScaleFactor: normalizedScale });
      await flushDebugLogsAsync();
    } catch (error) {
      debug("bridge:set-viewport-error", error);
      await flushDebugLogsAsync();
      console.warn("Failed to set EasyBot viewport:", error);
    }
  }

  window.ServerPerformanceConfig = {
    storageKey,
    debugStorageKey,
    defaultSettings,
    defaultMetricConfig,
    metricPresets,
    readSettings,
    readSettingsAsync,
    saveSettings,
    saveSettingsAsync,
    resetSettings,
    normalizeSettings,
    normalizeMetricConfig,
    normalizeTokenList,
    normalizeServerMetricProfiles,
    normalizeHexColor,
    setRenderViewport,
    setDebugMode,
    debug,
    readDebugLogsAsync,
    flushDebugLogsAsync,
    clearDebugLogsAsync,
    readDataCacheAsync,
    writeDataCacheAsync,
    clearDataCacheAsync
  };
})();
