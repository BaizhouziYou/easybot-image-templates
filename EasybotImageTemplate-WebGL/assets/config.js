(function () {
  const storageKey = "server_player_count_settings_v1";
  const debugStorageKey = "server_player_count_debug_logs_v1";
  const dataCacheStorageKey = storageKey + "_data_cache_v1";
  const maxDebugLogs = 500;
  let debugEnabled = false;
  let consoleWrapped = false;
  let remoteLogTimer = null;

  const defaultSettings = {
    title: "服务器在线列表",
    subtitle: "Minecraft Server",
    theme: "classic",
    renderScale: 1.5,
    fontFamily: "system",
    liquidAppearance: "clear",
    liquidEdgeRefractionRange: 100,
    liquidLightDirection: 315,
    showServerCount: true,
    showTotalOnline: true,
    showCurrentTime: true,
    showOnlineStatus: true,
    onlyOnlineServers: true,
    showBedrockBadge: true,
    excludedServerTokens: [],
    avatarProvider: "imgd",
    mixedAvatarSource1: "imgd",
    mixedAvatarSource2: "blessing",
    mixedAvatarSource3: "none",
    avatarSourceTimeoutSeconds: 3,
    imgdMissingPlayerUuid: "c06f89064c8a49119c29ea1dbd1aab82",
    domesticAvatarBaseUrl: "https://api.skin.xintinglei.cn",
    avatarBaseUrl: "",
    avatarSize: 64,
    imgdMode: "helm",
    customAvatarUrl: "",
    cacheBustAvatar: true,
    blessing3d: false,
    backgroundMode: "random",
    backgroundUrl: "",
    backgroundColor: "#0b111d",
    randomBackgroundApi: "https://t.alcy.cc",
    randomBackgroundCategory: "moez",
    randomBackgroundCustomCategory: "",
    backgroundDim: 45,
    enableDataCache: true,
    dataCacheSeconds: 30,
    enableAvatarCache: true,
    avatarCacheMinutes: 60,
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

  function isDebugMode() {
    return debugEnabled;
  }

  async function readDebugLogsAsync() {
    const remoteLogs = await readEasyBotValue(debugStorageKey);
    if (Array.isArray(remoteLogs)) {
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
    return readLocalDebugLogs();
  }

  async function flushDebugLogsAsync() {
    if (!debugEnabled) return;
    clearTimeout(remoteLogTimer);
    remoteLogTimer = null;
    const logs = readLocalDebugLogs().slice(-maxDebugLogs);
    await writeEasyBotValue(debugStorageKey, logs).catch(() => {});
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
    if (easybotOptions) {
      return normalizeSettings({ ...defaultSettings, ...easybotOptions });
    }
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
      renderScale: [1, 1.5, 2, 2.5, 3].includes(Number(settings.renderScale))
        ? Number(settings.renderScale)
        : defaultSettings.renderScale,
      fontFamily: ["system", "noto-sans-sc", "source-han-sans"].includes(settings.fontFamily)
        ? settings.fontFamily
        : defaultSettings.fontFamily,
      excludedServerTokens: normalizeStringList(settings.excludedServerTokens),
      avatarSize: Number(settings.avatarSize) || defaultSettings.avatarSize,
      avatarProvider: normalizeAvatarSource(settings.avatarProvider, defaultSettings.avatarProvider, true),
      mixedAvatarSource1: normalizeAvatarSource(settings.mixedAvatarSource1, defaultSettings.mixedAvatarSource1),
      mixedAvatarSource2: normalizeAvatarSource(settings.mixedAvatarSource2, defaultSettings.mixedAvatarSource2),
      mixedAvatarSource3: normalizeAvatarSource(settings.mixedAvatarSource3, defaultSettings.mixedAvatarSource3),
      avatarSourceTimeoutSeconds: Math.max(
        1,
        Math.min(8, Number(settings.avatarSourceTimeoutSeconds) || defaultSettings.avatarSourceTimeoutSeconds)
      ),
      imgdMissingPlayerUuid: String(
        settings.imgdMissingPlayerUuid || defaultSettings.imgdMissingPlayerUuid
      ).replace(/-/g, "").trim().toLowerCase(),
      backgroundMode: ["random", "default", "color", "custom"].includes(settings.backgroundMode)
        ? settings.backgroundMode
        : defaultSettings.backgroundMode,
      backgroundColor: normalizeHexColor(settings.backgroundColor, defaultSettings.backgroundColor),
      randomBackgroundCategory: ["pc", "mp", "moez", "fengjing", "custom"].includes(settings.randomBackgroundCategory)
        ? settings.randomBackgroundCategory
        : defaultSettings.randomBackgroundCategory,
      randomBackgroundCustomCategory: String(settings.randomBackgroundCustomCategory || "").trim(),
      backgroundDim: Number.isFinite(Number(settings.backgroundDim))
        ? Math.max(0, Math.min(80, Number(settings.backgroundDim)))
        : defaultSettings.backgroundDim,
      liquidEdgeRefractionRange: Math.max(
        50,
        Math.min(150, Number(settings.liquidEdgeRefractionRange) || defaultSettings.liquidEdgeRefractionRange)
      ),
      liquidLightDirection: Math.max(
        0,
        Math.min(
          360,
          Number.isFinite(Number(settings.liquidLightDirection))
            ? Number(settings.liquidLightDirection)
            : defaultSettings.liquidLightDirection
        )
      ),
      dataCacheSeconds: Math.max(5, Number(settings.dataCacheSeconds) || defaultSettings.dataCacheSeconds),
      avatarCacheMinutes: Math.max(1, Number(settings.avatarCacheMinutes) || defaultSettings.avatarCacheMinutes),
      cacheBustAvatar: settings.enableAvatarCache === false,
      domesticAvatarBaseUrl: trimTrailingSlash(settings.domesticAvatarBaseUrl || defaultSettings.domesticAvatarBaseUrl),
      avatarBaseUrl: trimTrailingSlash(settings.avatarBaseUrl || ""),
      randomBackgroundApi: trimTrailingSlash(settings.randomBackgroundApi || defaultSettings.randomBackgroundApi)
    };
  }

  function trimTrailingSlash(value) {
    return String(value).replace(/\/+$/, "");
  }

  function normalizeHexColor(value, fallback) {
    const raw = String(value || "").trim();
    const color = raw.startsWith("#") ? raw : `#${raw}`;
    return /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color)
      ? color.toLowerCase()
      : fallback;
  }

  function normalizeStringList(value) {
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

  function normalizeAvatarSource(value, fallback, allowMixed) {
    const allowed = allowMixed
      ? ["imgd", "blessing", "custom", "mixed"]
      : ["imgd", "blessing", "custom", "none"];
    return allowed.includes(value) ? value : fallback;
  }

  function replaceToken(value, token, replacement) {
    return String(value).split(token).join(replacement);
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
      if (typeof options === "string") {
        options = JSON.parse(options);
      }
      if (options && typeof options.value === "string") {
        options = JSON.parse(options.value);
      }
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
      debug("bridge:current-viewport", current);
      await flushDebugLogsAsync();
      await __internal_set_viewport(JSON.stringify({
        ...current,
        width,
        height,
        device_scale_factor: normalizedScale
      }));
      debug("bridge:set-viewport-success", {
        width,
        height,
        deviceScaleFactor: normalizedScale,
        outputWidth: Math.round(width * normalizedScale),
        outputHeight: Math.round(height * normalizedScale)
      });
      await flushDebugLogsAsync();
    } catch (error) {
      debug("bridge:set-viewport-error", error);
      await flushDebugLogsAsync();
      console.warn("Failed to set EasyBot viewport:", error);
    }
  }

  function buildAvatarCandidates(playerName, settings) {
    const config = normalizeSettings(settings || readSettings());
    const sourceOrder = config.avatarProvider === "mixed"
      ? [config.mixedAvatarSource1, config.mixedAvatarSource2, config.mixedAvatarSource3]
      : [config.avatarProvider];
    const candidates = [];
    const usedProviders = new Set();

    sourceOrder.forEach((provider) => {
      if (provider === "none" || usedProviders.has(provider)) return;
      usedProviders.add(provider);
      const url = buildAvatarUrlForProvider(playerName, provider, config);
      if (!url) return;
      candidates.push({
        provider,
        url: appendAvatarCache(url, config),
        detectMissingPlayer: config.avatarProvider === "mixed" && provider === "imgd",
        missingPlayerUuid: config.imgdMissingPlayerUuid
      });
    });

    const steveUrl = appendAvatarCache(
      `${config.domesticAvatarBaseUrl}/helm/Steve`,
      config
    );
    if (!candidates.some((candidate) => candidate.url === steveUrl)) {
      candidates.push({
        provider: "steve",
        url: steveUrl,
        detectMissingPlayer: false,
        missingPlayerUuid: ""
      });
    }
    return candidates;
  }

  function buildAvatarUrl(playerName, settings) {
    const candidates = buildAvatarCandidates(playerName, settings);
    return candidates.length ? candidates[0].url : "https://api.skin.xintinglei.cn/helm/Steve";
  }

  function buildAvatarUrlForProvider(playerName, provider, config) {
    const name = encodeURIComponent(playerName || "Steve");
    const size = encodeURIComponent(String(config.avatarSize || 64));

    if (provider === "custom") {
      if (!config.customAvatarUrl) return "";
      return replaceToken(
        replaceToken(config.customAvatarUrl, "{name}", name),
        "{size}",
        size
      );
    }
    if (provider === "blessing") {
      if (!config.avatarBaseUrl) return "";
      const params = new URLSearchParams({ size, png: "1" });
      if (config.blessing3d) params.set("3d", "1");
      return buildBlessingAvatarUrl(config.avatarBaseUrl, name, params);
    }
    if (provider === "imgd") {
      const mode = config.imgdMode === "helm" ? "helm" : "avatar";
      return `${config.domesticAvatarBaseUrl}/${mode}/${name}`;
    }
    return "";
  }

  function appendAvatarCache(url, config) {
    if (!url) return "";
    if (config.enableAvatarCache) {
      const cacheWindow = Math.max(1, config.avatarCacheMinutes) * 60 * 1000;
      const joiner = url.includes("?") ? "&" : "?";
      return `${url}${joiner}_avatar_cache=${Math.floor(Date.now() / cacheWindow)}`;
    }
    if (config.cacheBustAvatar) {
      const joiner = url.includes("?") ? "&" : "?";
      return `${url}${joiner}_=${Date.now()}`;
    }
    return url;
  }

  function buildBlessingAvatarUrl(baseUrl, name, params) {
    const base = trimTrailingSlash(baseUrl);
    if (base.includes("{name}") || base.includes("{size}")) {
      const replaced = replaceToken(
        replaceToken(base, "{name}", name),
        "{size}",
        String(params.get("size") || 64)
      );
      const joiner = replaced.includes("?") ? "&" : "?";
      return `${replaced}${joiner}${params.toString()}`;
    }

    if (/\/avatar\/player$/i.test(base)) {
      return `${base}/${name}?${params.toString()}`;
    }

    if (/\/avatar\/player\/[^/]+$/i.test(base)) {
      const joiner = base.includes("?") ? "&" : "?";
      return `${base}${joiner}${params.toString()}`;
    }

    return `${base}/avatar/player/${name}?${params.toString()}`;
  }

  window.ServerPlayerCountConfig = {
    storageKey,
    debugStorageKey,
    defaultSettings,
    readSettings,
    readSettingsAsync,
    saveSettings,
    saveSettingsAsync,
    resetSettings,
    buildAvatarUrl,
    buildAvatarCandidates,
    setRenderViewport,
    setDebugMode,
    isDebugMode,
    debug,
    readDebugLogsAsync,
    flushDebugLogsAsync,
    clearDebugLogsAsync,
    readDataCacheAsync,
    writeDataCacheAsync,
    clearDataCacheAsync
  };
})();
