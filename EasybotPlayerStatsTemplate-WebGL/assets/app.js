(function () {
  const configApi = window.PlayerStatisticsConfig;
  let settings = configApi.readSettings();
  const avatarObjectUrls = [];
  const valueDelimiter = "|::EASYBOT_PLAYER_STATS::|";

  const state = {
    context: null,
    profile: null,
    loading: true,
    error: ""
  };

  const fontPresets = {
    system: {
      family: '"Microsoft YaHei", "PingFang SC", "Segoe UI", system-ui, sans-serif',
      loadFamily: "",
      label: "system"
    },
    "noto-sans-sc": {
      family: '"Template Noto Sans SC", "Microsoft YaHei", sans-serif',
      loadFamily: '"Template Noto Sans SC"',
      label: "Noto Sans SC"
    },
    "source-han-sans": {
      family: '"Template Source Han Sans SC", "Microsoft YaHei", sans-serif',
      loadFamily: '"Template Source Han Sans SC"',
      label: "Source Han Sans SC"
    }
  };

  const elements = {
    poster: document.getElementById("poster"),
    posterBackground: document.getElementById("posterBackground"),
    title: document.getElementById("title"),
    subtitle: document.getElementById("subtitle"),
    description: document.getElementById("description"),
    playerAvatar: document.getElementById("playerAvatar"),
    playerLabel: document.getElementById("playerLabel"),
    playerName: document.getElementById("playerName"),
    statCount: document.getElementById("statCount"),
    statsGrid: document.getElementById("statsGrid")
  };

  function getTemplateId() {
    const match = window.location.pathname.match(/\/template\/proxy\/([^/]+)\//);
    return match ? match[1] : "";
  }

  async function requestApi(url, options) {
    configApi.debug("api:request", { url, method: options && options.method ? options.method : "GET" });
    const startedAt = Date.now();
    const response = await fetch(url, options);
    configApi.debug("api:response", { url, status: response.status, durationMs: Date.now() - startedAt });
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    const responseText = await response.text();
    try {
      return JSON.parse(responseText);
    } catch (error) {
      return responseText;
    }
  }

  function parseStatsConfig() {
    return String(settings.statsConfig || configApi.defaultStatsConfig)
      .split(/\r?\n/)
      .map((line) => {
        const separator = line.indexOf("|");
        if (separator <= 0) return null;
        return {
          label: line.slice(0, separator).trim(),
          placeholder: line.slice(separator + 1).trim()
        };
      })
      .filter((item) => item && item.label && item.placeholder)
      .slice(0, 24);
  }

  async function readRenderContext() {
    if (typeof __internal_get_context !== "function") {
      return {
        type: "preview",
        from_server_token: "preview",
        from_user_id: "preview",
        is_bind: false,
        first_player_name: settings.previewPlayerName || "Steve",
        player_name_list: [settings.previewPlayerName || "Steve"]
      };
    }
    try {
      const rawContext = await __internal_get_context();
      return typeof rawContext === "string" ? JSON.parse(rawContext) : rawContext;
    } catch (error) {
      configApi.debug("context:read-error", error);
      throw new Error("无法读取玩家查询上下文");
    }
  }

  function resolvePlayerName(context) {
    const firstName = context && String(context.first_player_name || "").trim();
    const listName = context && Array.isArray(context.player_name_list)
      ? String(context.player_name_list[0] || "").trim()
      : "";
    const candidate = firstName && firstName !== "unknown" ? firstName : listName;
    return candidate && candidate !== "unknown"
      ? candidate
      : String(settings.previewPlayerName || "Steve").trim() || "Steve";
  }

  function normalizeMinecraftCodes(value) {
    return String(value == null ? "" : value).replace(/Â§/g, "§");
  }

  function parseMinecraftHexSegments(value) {
    const source = normalizeMinecraftCodes(value);
    const tokenPattern = /§x(?:§[0-9a-f]){6}|&x(?:&[0-9a-f]){6}|[§&]#[0-9a-f]{6}|<#[0-9a-f]{6}>|<\/#(?:[0-9a-f]{6})>|[§&][0-9a-fk-or]/gi;
    const segments = [];
    let activeColor = "";
    let cursor = 0;
    let match;

    const appendText = (text) => {
      if (!text) return;
      const previous = segments[segments.length - 1];
      if (previous && previous.color === activeColor) {
        previous.text += text;
      } else {
        segments.push({ text, color: activeColor });
      }
    };

    while ((match = tokenPattern.exec(source)) !== null) {
      appendText(source.slice(cursor, match.index));
      const token = match[0];
      const compactHex = token.match(/#([0-9a-f]{6})/i);
      if (/^[§&]x/i.test(token)) {
        const digits = token.match(/[0-9a-f]/gi) || [];
        activeColor = digits.length === 6 ? `#${digits.join("").toUpperCase()}` : "";
      } else if (compactHex && !/^<\/#/i.test(token)) {
        activeColor = `#${compactHex[1].toUpperCase()}`;
      } else if (/^<\/#/i.test(token) || /^[§&]r$/i.test(token) || /^[§&][0-9a-f]$/i.test(token)) {
        activeColor = "";
      }
      cursor = tokenPattern.lastIndex;
    }

    appendText(source.slice(cursor));
    return segments;
  }

  function stripMinecraftFormatting(value) {
    return parseMinecraftHexSegments(value).map((segment) => segment.text).join("");
  }

  function minecraftTextToHtml(value) {
    return parseMinecraftHexSegments(value).map((segment) => {
      const text = escapeHtml(segment.text);
      return segment.color
        ? `<span class="minecraft-hex-color" style="color:${segment.color}">${text}</span>`
        : text;
    }).join("");
  }

  function setMinecraftText(element, value) {
    element.innerHTML = minecraftTextToHtml(value);
  }

  function getPrimaryHexColor(value) {
    const segment = parseMinecraftHexSegments(value).find((item) => item.color && item.text.trim());
    return segment ? segment.color : "";
  }

  function sanitizePlaceholderValue(value, placeholder) {
    const rawText = normalizeMinecraftCodes(value).trim();
    const text = stripMinecraftFormatting(rawText).trim();
    if (!text || text === placeholder || /^null$/i.test(text)) return "--";
    if (/%(?:player|statistic)_[^%]+%/i.test(text) || /%ez-statistic_[^%]+%/i.test(text)) return "--";
    if (/(no enum constant|unknown placeholder|invalid placeholder|exception|error:)/i.test(text)) return "--";
    return rawText;
  }

  function isUnresolvedPlaceholderValue(value, placeholder) {
    const text = stripMinecraftFormatting(value).trim();
    return !text
      || text === placeholder
      || /%(?:player|statistic)_[^%]+%/i.test(text)
      || /%ez-statistic_[^%]+%/i.test(text)
      || /(no enum constant|unknown placeholder|invalid placeholder|exception|error:)/i.test(text);
  }

  function buildDemoProfile(playerName, statEntries) {
    const demoValues = [
      "217401", "128", "24", "36",
      "18", "7", "4620", "2",
      "336380", "1", "244", "39",
      "80120", "12", "28940", "86"
    ];
    return {
      playerName,
      stats: statEntries.map((item, index) => ({
        label: item.label,
        placeholder: item.placeholder,
        value: demoValues[index] || String((index + 1) * 8)
      }))
    };
  }

  async function fetchProfileData(context) {
    const statEntries = parseStatsConfig();
    const playerName = resolvePlayerName(context);
    if (!context || context.type === "preview" || !getTemplateId()) {
      configApi.debug("profile:demo", { playerName, statCount: statEntries.length });
      return buildDemoProfile(playerName, statEntries);
    }

    const placeholders = statEntries.map((item) => item.placeholder);
    const placeholderUrl = `/template/api/${getTemplateId()}/placeholder`;
    const requestPlaceholderText = (text) => requestApi(placeholderUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text,
        playerName,
        context
      })
    });
    const result = await requestPlaceholderText(placeholders.join(valueDelimiter));
    const resultValue = result && typeof result === "object" && !Array.isArray(result)
      ? (result.data ?? result.value ?? result.text ?? result.result ?? result)
      : result;
    const rawText = typeof resultValue === "string"
      ? resultValue
      : String(resultValue == null ? "" : resultValue);
    let values = Array.isArray(resultValue)
      ? resultValue.map((value) => String(value == null ? "" : value))
      : rawText.split(valueDelimiter);
    if (values.length !== placeholders.length) {
      configApi.debug("placeholder:batch-shape-mismatch", {
        expectedValueCount: placeholders.length,
        actualValueCount: values.length,
        responseType: Array.isArray(resultValue) ? "array" : typeof resultValue
      });
      values = await Promise.all(placeholders.map(async (placeholder) => {
        const singleResult = await requestPlaceholderText(placeholder);
        if (typeof singleResult === "string") return singleResult;
        if (singleResult && typeof singleResult === "object") {
          return String(singleResult.data ?? singleResult.value ?? singleResult.text ?? singleResult.result ?? "");
        }
        return String(singleResult == null ? "" : singleResult);
      }));
    }
    const statisticResolvedCount = statEntries.reduce((count, item, index) => {
      return count + (isUnresolvedPlaceholderValue(values[index], item.placeholder) ? 0 : 1);
    }, 0);
    configApi.debug("easybot-statistic:result", {
      responseType: Array.isArray(resultValue) ? "array" : typeof resultValue,
      responseLength: rawText.length,
      valueCount: values.length,
      expectedValueCount: placeholders.length,
      statisticResolvedCount,
      statisticCount: statEntries.length,
      unresolvedStatisticSamples: statEntries.filter((item, index) => {
        return isUnresolvedPlaceholderValue(values[index], item.placeholder);
      }).slice(0, 4).map((item) => item.placeholder),
      rawPreview: rawText.slice(0, 500)
    });

    const profile = {
      playerName,
      stats: statEntries.map((item, index) => ({
        label: item.label,
        placeholder: item.placeholder,
        value: sanitizePlaceholderValue(values[index], item.placeholder)
      })),
      diagnostics: {
        statisticResolvedCount,
        statisticCount: statEntries.length
      }
    };
    if (statisticResolvedCount === 0 && statEntries.length) {
      configApi.debug("easybot-statistic:unsupported", {
        message: "服务器未解析 EasyBot 内置 ez-statistic 变量，请检查 EasyBot 服务端版本和连接状态。",
        samples: statEntries.slice(0, 4).map((item) => item.placeholder)
      });
    }
    return profile;
  }

  async function loadProfileData(context) {
    const playerName = resolvePlayerName(context);
    const signature = [
      "profile-cache-v4-stat-format",
      getTemplateId(),
      context && context.from_server_token || "preview",
      playerName,
      settings.statsConfig
    ].join("|");
    const cached = settings.enableDataCache ? await configApi.readDataCacheAsync() : null;
    const cacheAge = cached && cached.createdAt ? Date.now() - Number(cached.createdAt) : Infinity;
    const cacheLifetime = Math.max(5, Number(settings.dataCacheSeconds) || 30) * 1000;
    const cacheMatches = cached && cached.signature === signature && cached.data && Array.isArray(cached.data.stats);

    if (cacheMatches && cacheAge < cacheLifetime) {
      configApi.debug("cache:data-hit", { ageMs: cacheAge, lifetimeMs: cacheLifetime });
      return cached.data;
    }

    configApi.debug("cache:data-miss", {
      enabled: settings.enableDataCache,
      cacheMatches: Boolean(cacheMatches),
      ageMs: Number.isFinite(cacheAge) ? cacheAge : null,
      lifetimeMs: cacheLifetime
    });

    try {
      const data = await fetchProfileData(context);
      const hasResolvedData = !data.diagnostics || data.diagnostics.statisticResolvedCount > 0;
      if (settings.enableDataCache && hasResolvedData) {
        const nextCache = {
          createdAt: Date.now(),
          signature,
          data
        };
        await configApi.writeDataCacheAsync(nextCache);
      } else if (settings.enableDataCache) {
        configApi.debug("cache:data-skip-unresolved", data.diagnostics || {});
      }
      return data;
    } catch (error) {
      if (cacheMatches) {
        configApi.debug("cache:data-stale-fallback", { ageMs: cacheAge, error });
        return cached.data;
      }
      throw error;
    }
  }

  async function applySettings() {
    const theme = settings.theme === "liquid" ? "liquid" : "classic";
    const liquidAppearance = settings.liquidAppearance === "tinted" ? "tinted" : "clear";
    elements.poster.classList.toggle("theme-liquid", theme === "liquid");
    elements.poster.classList.toggle("theme-classic", theme === "classic");
    elements.poster.classList.toggle("liquid-clear", theme === "liquid" && liquidAppearance === "clear");
    elements.poster.classList.toggle("liquid-tinted", theme === "liquid" && liquidAppearance === "tinted");
    elements.poster.setAttribute("data-theme", theme);
    configApi.debug("theme:apply", { theme, liquidAppearance });
    const fontReady = applyFontSettings();
    const previewName = resolvePlayerName(state.context);
    setMinecraftText(elements.title, String(settings.title || "你好，{name}!").split("{name}").join(previewName));
    setMinecraftText(elements.subtitle, settings.subtitle || "");
    setMinecraftText(elements.description, settings.description || "");
    setMinecraftText(elements.playerLabel, settings.playerLabel || "玩家名称");
    document.body.style.setProperty("--background-dim", `${settings.backgroundDim / 100}`);

    const backgroundUrl = resolveBackgroundUrl();
    configApi.debug("background:resolve", { mode: settings.backgroundMode, url: backgroundUrl });
    let backgroundReady;
    if (backgroundUrl) {
      elements.poster.classList.add("has-custom-bg");
      backgroundReady = loadImage(elements.posterBackground, backgroundUrl);
      elements.posterBackground.toggleAttribute(
        "data-liquid-ignore",
        settings.backgroundMode === "random"
      );
    } else {
      elements.posterBackground.removeAttribute("src");
      elements.posterBackground.removeAttribute("data-liquid-ignore");
      elements.poster.classList.remove("has-custom-bg");
    }

    if (settings.customCss) {
      const style = document.createElement("style");
      style.setAttribute("data-custom-css", "true");
      style.textContent = settings.customCss;
      document.head.appendChild(style);
    }

    document.querySelectorAll("[data-option]").forEach((node) => {
      const key = node.getAttribute("data-option");
      node.hidden = settings[key] === false;
    });
    await Promise.all([fontReady, backgroundReady]);
  }

  function resolveBackgroundUrl() {
    if (settings.backgroundMode === "custom") {
      return settings.backgroundUrl || "";
    }

    if (settings.backgroundMode === "random") {
      const category = encodeURIComponent(settings.randomBackgroundCategory || "moez");
      return `${settings.randomBackgroundApi}/${category}`;
    }

    return "";
  }

  async function render() {
    if (state.loading) {
      elements.statsGrid.innerHTML = '<div class="loading"><span>正在获取玩家统计...</span></div>';
      return;
    }

    if (state.error) {
      elements.playerName.textContent = resolvePlayerName(state.context);
      elements.statsGrid.innerHTML = `<div class="empty"><span>${escapeHtml(state.error)}</span></div>`;
      return;
    }

    const profile = state.profile;
    setMinecraftText(elements.title, String(settings.title || "你好，{name}!").split("{name}").join(profile.playerName));
    setMinecraftText(elements.playerName, profile.playerName);
    elements.statCount.textContent = `${profile.stats.length} 项`;
    elements.statsGrid.innerHTML = profile.stats.map(renderStat).join("");
    elements.playerAvatar.setAttribute("data-player-name", profile.playerName);
    if (settings.showAvatar !== false) {
      await loadAvatarWithFallback(elements.playerAvatar, profile.playerName);
    } else {
      elements.playerAvatar.removeAttribute("src");
    }
  }

  function renderStat(item, index) {
    const formatted = formatStatValue(item);
    const valueHtml = formatted.rawValue
      ? minecraftTextToHtml(formatted.rawValue)
      : formatted.color
        ? `<span class="minecraft-hex-color" style="color:${formatted.color}">${escapeHtml(formatted.value)}</span>`
        : escapeHtml(formatted.value);
    return `
      <div class="stat-card">
        <span>${minecraftTextToHtml(item.label)}</span>
        <strong class="${formatted.className}">${valueHtml}</strong>
        <i>${String(index + 1).padStart(2, "0")}</i>
      </div>
    `;
  }

  function formatStatValue(item) {
    const rawValue = normalizeMinecraftCodes(item.value);
    const plainValue = stripMinecraftFormatting(rawValue).trim();
    if (!plainValue || plainValue === "--") return { value: "--", className: "" };

    const numericText = plainValue.replace(/,/g, "");
    if (!/^-?\d+(?:\.\d+)?$/.test(numericText)) {
      return { value: plainValue, rawValue, className: "" };
    }

    const numericValue = Number(numericText);
    if (!Number.isFinite(numericValue)) return { value: plainValue, className: "" };
    const placeholder = String(item.placeholder || "").toUpperCase();
    const color = getPrimaryHexColor(rawValue);

    if (placeholder.includes("PLAY_ONE_MINUTE") || placeholder.includes("STATISTIC_TIME_PLAYED")) {
      return {
        value: formatPlayTime(numericValue),
        className: "stat-value-duration",
        color
      };
    }

    if (placeholder.includes("_ONE_CM")) {
      const full = settings.distanceDisplayMode === "full";
      return {
        value: full ? formatDistanceFull(numericValue) : formatDistanceCompact(numericValue),
        className: full ? "stat-value-distance-full" : "",
        color
      };
    }

    const value = settings.largeNumberDisplayMode === "full"
      ? formatFullNumber(numericValue)
      : formatCompactNumber(numericValue);
    return { value, className: "", color };
  }

  function formatPlayTime(ticks) {
    const sign = ticks < 0 ? "-" : "";
    let seconds = Math.floor(Math.abs(ticks) / 20);
    const days = Math.floor(seconds / 86400);
    seconds %= 86400;
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    seconds %= 60;
    return `${sign}${days}天${hours}时${minutes}分${seconds}秒`;
  }

  function formatDistanceCompact(centimeters) {
    const sign = centimeters < 0 ? "-" : "";
    const value = Math.abs(centimeters);
    if (value >= 100000) return `${sign}${formatDistanceDecimal(value / 100000)} km`;
    if (value >= 100) return `${sign}${formatDistanceDecimal(value / 100)} m`;
    return `${sign}${formatDistanceDecimal(value)} cm`;
  }

  function formatDistanceFull(centimeters) {
    return `${formatFullNumber(centimeters / 100)} m`;
  }

  function formatCompactNumber(value) {
    const sign = value < 0 ? "-" : "";
    const absolute = Math.abs(value);
    const units = [
      { threshold: 1000000000, divisor: 1000000000, suffix: "B" },
      { threshold: 1000000, divisor: 1000000, suffix: "M" },
      { threshold: 1000, divisor: 1000, suffix: "k" }
    ];
    const unit = units.find((candidate) => absolute >= candidate.threshold);
    if (!unit) return formatFullNumber(value);
    return `${sign}${formatDecimal(absolute / unit.divisor)}${unit.suffix}`;
  }

  function formatFullNumber(value) {
    return new Intl.NumberFormat("en-US", {
      useGrouping: settings.useThousandsSeparator === true,
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2
    }).format(value);
  }

  function formatDecimal(value) {
    const fractionDigits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return Number(value.toFixed(fractionDigits)).toString();
  }

  function formatDistanceDecimal(value) {
    const fractionDigits = value >= 10 ? 1 : 2;
    return Number(value.toFixed(fractionDigits)).toString();
  }

  async function applyFontSettings() {
    const preset = fontPresets[settings.fontFamily] || fontPresets.system;
    document.documentElement.style.setProperty("--template-font-family", preset.family);
    configApi.debug("font:apply", {
      selected: settings.fontFamily,
      label: preset.label,
      embedded: Boolean(preset.loadFamily)
    });

    if (!preset.loadFamily || !document.fonts) return;

    const sample = "玩家统计 生涯统计 Minecraft Player 0123456789";
    let timeoutId;
    try {
      const result = await Promise.race([
        document.fonts.load(`400 50px ${preset.loadFamily}`, sample).then((fonts) => ({
          status: "loaded",
          faceCount: fonts.length
        })),
        new Promise((resolve) => {
          timeoutId = setTimeout(() => resolve({ status: "timeout", faceCount: 0 }), 8000);
        })
      ]);
      clearTimeout(timeoutId);
      const ready = result.status === "loaded" && result.faceCount > 0;
      configApi.debug("font:load", {
        selected: settings.fontFamily,
        status: result.status,
        faceCount: result.faceCount,
        ready
      });
      if (!ready) {
        document.documentElement.style.setProperty("--template-font-family", fontPresets.system.family);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      document.documentElement.style.setProperty("--template-font-family", fontPresets.system.family);
      configApi.debug("font:error", {
        selected: settings.fontFamily,
        name: error.name,
        message: error.message
      });
    }
  }

  async function loadAvatarWithFallback(image, playerName) {
    const candidates = configApi.buildAvatarCandidates(playerName, settings);
    const timeoutMs = Math.max(1, Number(settings.avatarSourceTimeoutSeconds) || 3) * 1000;
    const startedAt = Date.now();
    image.style.visibility = "hidden";

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      configApi.debug("avatar:attempt", {
        playerName,
        index: index + 1,
        total: candidates.length,
        provider: candidate.provider,
        url: candidate.url,
        timeoutMs
      });
      try {
        const result = candidate.detectMissingPlayer
          ? await loadVerifiedImgdAvatar(image, candidate, timeoutMs)
          : await loadAvatarSource(image, candidate.url, timeoutMs);
        configApi.debug("avatar:source-success", {
          playerName,
          provider: candidate.provider,
          url: candidate.url,
          resolvedUrl: result.resolvedUrl || image.currentSrc || image.src,
          durationMs: Date.now() - startedAt
        });
        image.style.visibility = "visible";
        return;
      } catch (error) {
        configApi.debug("avatar:source-failed", {
          playerName,
          provider: candidate.provider,
          url: candidate.url,
          reason: error && error.message ? error.message : String(error),
          durationMs: Date.now() - startedAt
        });
      }
    }

    configApi.debug("avatar:all-sources-failed", { playerName, durationMs: Date.now() - startedAt });
    image.removeAttribute("src");
  }

  async function loadVerifiedImgdAvatar(image, candidate, timeoutMs) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = setTimeout(() => {
      if (controller) controller.abort();
    }, timeoutMs);
    let blob;
    let resolvedUrl;
    try {
      const response = await fetch(candidate.url, {
        cache: "force-cache",
        credentials: "omit",
        signal: controller ? controller.signal : undefined
      });
      if (!response.ok) throw new Error("http-" + response.status);
      resolvedUrl = response.url || candidate.url;
      const resolvedUuid = readImgdUuid(resolvedUrl);
      const missingUuid = String(candidate.missingPlayerUuid || "").replace(/-/g, "").toLowerCase();
      if (missingUuid && resolvedUuid === missingUuid) {
        throw new Error("player-not-found:" + resolvedUuid);
      }
      blob = await response.blob();
      if (blob.type && !blob.type.startsWith("image/")) throw new Error("invalid-content-type:" + blob.type);
    } catch (error) {
      if (error && error.name === "AbortError") throw new Error("source-timeout");
      throw error;
    } finally {
      clearTimeout(timer);
    }
    const objectUrl = URL.createObjectURL(blob);
    try {
      await loadAvatarSource(image, objectUrl, timeoutMs);
      avatarObjectUrls.push(objectUrl);
      return { resolvedUrl };
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }

  function readImgdUuid(url) {
    try {
      const parts = new URL(url, window.location.href).pathname.split("/").filter(Boolean);
      return String(parts[parts.length - 1] || "").replace(/-/g, "").toLowerCase();
    } catch (error) {
      return "";
    }
  }

  function loadAvatarSource(image, url, timeoutMs) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        clearTimeout(timer);
        image.removeEventListener("load", handleLoad);
        image.removeEventListener("error", handleError);
      };
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback(value);
      };
      const handleLoad = () => {
        if (image.naturalWidth > 0) finish(resolve, { resolvedUrl: image.currentSrc || image.src });
        else finish(reject, new Error("empty-image"));
      };
      const handleError = () => finish(reject, new Error("image-load-error"));
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        image.removeAttribute("src");
        reject(new Error("source-timeout"));
      }, timeoutMs);
      image.addEventListener("load", handleLoad, { once: true });
      image.addEventListener("error", handleError, { once: true });
      image.src = url;
      if (image.complete) {
        if (image.naturalWidth > 0) handleLoad();
        else if (image.src) handleError();
      }
    });
  }

  function loadImage(image, url) {
    return new Promise((resolve) => {
      let finished = false;
      const startedAt = Date.now();
      const finish = (event) => {
        if (finished) return;
        finished = true;
        configApi.debug("image:complete", {
          url,
          result: event && event.type ? event.type : "timeout",
          durationMs: Date.now() - startedAt,
          complete: image.complete,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          resourceTiming: readResourceTiming(image.currentSrc || url)
        });
        resolve();
      };
      image.addEventListener("load", finish, { once: true });
      image.addEventListener("error", finish, { once: true });
      image.src = url;
      if (image.complete) finish();
      setTimeout(() => finish({ type: "timeout" }), 8000);
    });
  }

  function readResourceTiming(url) {
    if (!window.performance || typeof window.performance.getEntriesByName !== "function") return null;
    const entries = window.performance.getEntriesByName(url);
    const entry = entries.length ? entries[entries.length - 1] : null;
    if (!entry) return null;
    return {
      durationMs: Math.round(entry.duration),
      transferSize: entry.transferSize || 0,
      encodedBodySize: entry.encodedBodySize || 0,
      decodedBodySize: entry.decodedBodySize || 0,
      nextHopProtocol: entry.nextHopProtocol || "",
      responseStatus: typeof entry.responseStatus === "number" ? entry.responseStatus : "unavailable-cross-origin"
    };
  }

  function markLiquidSurfaces() {
    const selector = ".summary, .meta-row > div, .server-card, .loading, .empty";
    document.querySelectorAll(selector).forEach((node) => {
      node.classList.add("liquid-surface");
      node.classList.toggle("liquid-meta-surface", node.matches(".meta-row > div"));
    });
  }

  function smoothstep(edge0, edge1, value) {
    const amount = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0 || 1)));
    return amount * amount * (3 - 2 * amount);
  }

  function roundedBoxDistance(x, y, halfWidth, halfHeight, radius) {
    const qx = Math.abs(x) - halfWidth + radius;
    const qy = Math.abs(y) - halfHeight + radius;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
      + Math.min(Math.max(qx, qy), 0)
      - radius;
  }

  function getLiquidEdgeRangeScale() {
    const percentage = Number(settings.liquidEdgeRefractionRange);
    const normalized = Number.isFinite(percentage) ? percentage : 100;
    return Math.max(50, Math.min(150, normalized)) / 100;
  }

  function getRenderScale() {
    const scale = Number(settings.renderScale);
    return [1, 1.5, 2, 2.5, 3].includes(scale) ? scale : 1.5;
  }

  function createPosterDisplacementMap(width, height, surfaces, posterRect, tinted) {
    const mapWidth = Math.max(320, Math.round(Math.min(width, 1000)));
    const mapScale = mapWidth / width;
    const mapHeight = Math.max(1, Math.round(height * mapScale));
    const canvas = document.createElement("canvas");
    canvas.width = mapWidth;
    canvas.height = mapHeight;
    const context = canvas.getContext("2d", { alpha: false });
    const pixels = context.createImageData(mapWidth, mapHeight);
    for (let index = 0; index < pixels.data.length; index += 4) {
      pixels.data[index] = 128;
      pixels.data[index + 1] = 128;
      pixels.data[index + 2] = 128;
      pixels.data[index + 3] = 255;
    }

    surfaces.forEach((surface) => {
      const rect = surface.getBoundingClientRect();
      const left = (rect.left - posterRect.left) * mapScale;
      const top = (rect.top - posterRect.top) * mapScale;
      const surfaceWidth = rect.width * mapScale;
      const surfaceHeight = rect.height * mapScale;
      const halfWidth = surfaceWidth / 2;
      const halfHeight = surfaceHeight / 2;
      const radius = (parseFloat(window.getComputedStyle(surface).borderTopLeftRadius) || 20) * mapScale;
      const bevelWidth = Math.max(
        3,
        Math.min(surfaceWidth, surfaceHeight) * (tinted ? 0.08 : 0.1) * getLiquidEdgeRangeScale()
      );
      const startX = Math.max(0, Math.floor(left));
      const endX = Math.min(mapWidth, Math.ceil(left + surfaceWidth));
      const startY = Math.max(0, Math.floor(top));
      const endY = Math.min(mapHeight, Math.ceil(top + surfaceHeight));

      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          const px = x + 0.5 - left - halfWidth;
          const py = y + 0.5 - top - halfHeight;
          const signedDistance = roundedBoxDistance(px, py, halfWidth, halfHeight, radius);
          if (signedDistance > 0) continue;
          const insideDistance = -signedDistance;
          const edge = 1 - smoothstep(0, bevelWidth, insideDistance);
          const bevel = Math.pow(edge, tinted ? 7 : 9);
          const edgeProfile = edge * (tinted ? 0.08 : 0.12) + bevel * (tinted ? 0.34 : 0.52);
          const normalizedX = px / Math.max(1, halfWidth);
          const normalizedY = py / Math.max(1, halfHeight);
          const radialLength = Math.hypot(normalizedX, normalizedY) || 1;
          const normalX = normalizedX / radialLength;
          const normalY = normalizedY / radialLength;
          const magnify = Math.min(1, radialLength) * (tinted ? 0.004 : 0.008);
          const profile = Math.max(-1, Math.min(1, edgeProfile - magnify));
          const offset = (y * mapWidth + x) * 4;
          pixels.data[offset] = Math.round(128 + normalX * profile * 127);
          pixels.data[offset + 1] = Math.round(128 + normalY * profile * 127);
        }
      }
    });

    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/png");
  }

  function createStaticPosterFilter(width, height, surfaces, posterRect, tinted) {
    const svgNamespace = "http://www.w3.org/2000/svg";
    const definitions = document.getElementById("liquidFilterDefs");
    if (!definitions) return "";
    const filterId = "liquid-static-poster-lens";
    const filter = document.createElementNS(svgNamespace, "filter");
    filter.setAttribute("id", filterId);
    filter.setAttribute("filterUnits", "userSpaceOnUse");
    filter.setAttribute("x", "0");
    filter.setAttribute("y", "0");
    filter.setAttribute("width", String(width));
    filter.setAttribute("height", String(height));
    filter.setAttribute("color-interpolation-filters", "sRGB");

    const map = document.createElementNS(svgNamespace, "feImage");
    const mapUrl = createPosterDisplacementMap(width, height, surfaces, posterRect, tinted);
    map.setAttribute("href", mapUrl);
    map.setAttribute("x", "0");
    map.setAttribute("y", "0");
    map.setAttribute("width", String(width));
    map.setAttribute("height", String(height));
    map.setAttribute("preserveAspectRatio", "none");
    map.setAttribute("result", "lensMap");

    const displacement = document.createElementNS(svgNamespace, "feDisplacementMap");
    displacement.setAttribute("in", "SourceGraphic");
    displacement.setAttribute("in2", "lensMap");
    displacement.setAttribute("scale", tinted ? "10" : "14");
    displacement.setAttribute("xChannelSelector", "R");
    displacement.setAttribute("yChannelSelector", "G");
    displacement.setAttribute("result", "refracted");
    filter.appendChild(map);
    filter.appendChild(displacement);

    definitions.appendChild(filter);
    return `url("#${filterId}")`;
  }

  function createStaticSurfaceClip(surfaces, posterRect) {
    const svgNamespace = "http://www.w3.org/2000/svg";
    const definitions = document.getElementById("liquidFilterDefs");
    if (!definitions) return "";
    const clipId = "liquid-static-surface-clip";
    const clip = document.createElementNS(svgNamespace, "clipPath");
    clip.setAttribute("id", clipId);
    clip.setAttribute("clipPathUnits", "userSpaceOnUse");
    surfaces.forEach((surface) => {
      const bounds = surface.getBoundingClientRect();
      const radius = parseFloat(window.getComputedStyle(surface).borderTopLeftRadius) || 20;
      const rect = document.createElementNS(svgNamespace, "rect");
      rect.setAttribute("x", String(bounds.left - posterRect.left));
      rect.setAttribute("y", String(bounds.top - posterRect.top));
      rect.setAttribute("width", String(bounds.width));
      rect.setAttribute("height", String(bounds.height));
      rect.setAttribute("rx", String(radius));
      rect.setAttribute("ry", String(radius));
      clip.appendChild(rect);
    });
    definitions.appendChild(clip);
    return `url("#${clipId}")`;
  }

  function setupStaticLiquidMaterial(reason) {
    const posterRect = elements.poster.getBoundingClientRect();
    const posterWidth = Math.max(1, posterRect.width);
    const posterHeight = Math.max(1, posterRect.height);
    const sourceWidth = elements.posterBackground.naturalWidth;
    const sourceHeight = elements.posterBackground.naturalHeight;
    const backgroundUrl = resolveBackgroundUrl();
    let renderedWidth = posterWidth;
    let renderedHeight = posterHeight;
    let originX = 0;
    let originY = 0;

    if (backgroundUrl && sourceWidth > 0 && sourceHeight > 0) {
      const scale = Math.max(posterWidth / sourceWidth, posterHeight / sourceHeight) * 1.02;
      renderedWidth = sourceWidth * scale;
      renderedHeight = sourceHeight * scale;
      originX = (posterWidth - renderedWidth) / 2;
      originY = (posterHeight - renderedHeight) / 2;
    }

    const definitions = document.getElementById("liquidFilterDefs");
    if (definitions) definitions.replaceChildren();
    const tinted = settings.liquidAppearance === "tinted";
    const allSurfaces = Array.from(document.querySelectorAll(".liquid-surface"));
    const surfaces = allSurfaces.filter((surface) => !surface.classList.contains("liquid-meta-surface"));
    const posterFilter = createStaticPosterFilter(
      posterWidth,
      posterHeight,
      surfaces,
      posterRect,
      tinted
    );
    const surfaceClip = createStaticSurfaceClip(surfaces, posterRect);
    let overlay = elements.poster.querySelector(".liquid-refraction-overlay");
    if (!overlay || overlay.tagName !== "CANVAS") {
      if (overlay) overlay.remove();
      overlay = document.createElement("canvas");
      overlay.className = "liquid-refraction-overlay";
      overlay.setAttribute("aria-hidden", "true");
      overlay.setAttribute("data-liquid-ignore", "");
      elements.poster.appendChild(overlay);
    }
    overlay.width = Math.ceil(posterWidth);
    overlay.height = Math.ceil(posterHeight);
    const overlayContext = overlay.getContext("2d", { alpha: true });
    overlayContext.clearRect(0, 0, overlay.width, overlay.height);
    if (backgroundUrl && sourceWidth > 0 && sourceHeight > 0) {
      overlayContext.drawImage(
        elements.posterBackground,
        originX,
        originY,
        renderedWidth,
        renderedHeight
      );
    } else {
      const gradient = overlayContext.createLinearGradient(0, 0, overlay.width, overlay.height);
      gradient.addColorStop(0, "#071b24");
      gradient.addColorStop(0.52, "#111827");
      gradient.addColorStop(1, "#062522");
      overlayContext.fillStyle = gradient;
      overlayContext.fillRect(0, 0, overlay.width, overlay.height);
    }
    const dimAmount = Math.max(0, Math.min(0.8, Number(settings.backgroundDim || 0) / 100));
    overlayContext.fillStyle = `rgba(0, 0, 0, ${dimAmount})`;
    overlayContext.fillRect(0, 0, overlay.width, overlay.height);
    overlay.style.setProperty("--liquid-static-filter", posterFilter);
    overlay.style.setProperty("--liquid-surface-clip", surfaceClip);
    allSurfaces.forEach((surface) => {
      surface.style.removeProperty("--liquid-bg-image");
      surface.style.removeProperty("--liquid-bg-size");
      surface.style.removeProperty("--liquid-bg-position");
      surface.style.removeProperty("--liquid-static-filter");
    });

    elements.poster.classList.add("liquid-static-refraction");
    configApi.debug("liquid:static-refraction-ready", {
      reason,
      posterWidth,
      posterHeight,
      sourceWidth,
      sourceHeight,
      surfaceCount: allSurfaces.length,
      refractiveSurfaceCount: surfaces.length,
      metaSurfaceCount: allSurfaces.length - surfaces.length
    });
  }

  function resetLiquidWebGL() {
    const renderer = window.__liquidGLRenderer__;
    if (renderer) {
      if (renderer._rafId) cancelAnimationFrame(renderer._rafId);
      if (renderer.canvas && renderer.canvas.remove) renderer.canvas.remove();
    }
    delete window.__liquidGLRenderer__;
    const overlay = elements.poster.querySelector(".liquid-refraction-overlay");
    if (overlay) overlay.remove();
    document.querySelectorAll(".liquid-surface").forEach((surface) => {
      surface.style.removeProperty("opacity");
      surface.style.removeProperty("background");
      surface.style.removeProperty("background-color");
      surface.style.removeProperty("background-image");
      surface.style.removeProperty("backdrop-filter");
      surface.style.removeProperty("-webkit-backdrop-filter");
      surface.style.removeProperty("pointer-events");
    });
  }

  function isEasyBotRendering() {
    return typeof window.__internal_set_viewport === "function"
      || typeof window.__internal_get_viewport === "function";
  }

  function canUseLiquidWebGL() {
    if (settings.backgroundMode === "random") {
      return { allowed: false, reason: "random-background-cors" };
    }
    if (settings.backgroundMode === "custom" && settings.backgroundUrl) {
      try {
        if (new URL(settings.backgroundUrl, window.location.href).origin !== window.location.origin) {
          return { allowed: false, reason: "cross-origin-background" };
        }
      } catch (error) {
        return { allowed: false, reason: "invalid-background-url" };
      }
    }
    return { allowed: true, reason: "supported" };
  }

  function loadScriptOnce(src, globalName) {
    if (globalName && typeof window[globalName] !== "undefined") return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-liquid-dependency="${src}"]`);
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.setAttribute("data-liquid-dependency", src);
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
      document.head.appendChild(script);
    });
  }

  async function initializeLiquidGlass() {
    if (settings.theme !== "liquid") return;

    markLiquidSurfaces();
    const surfaces = document.querySelectorAll(".liquid-surface");
    const support = canUseLiquidWebGL();
    if (!surfaces.length || !support.allowed) {
      elements.poster.classList.add("liquid-webgl-fallback");
      setupStaticLiquidMaterial(support.reason);
      configApi.debug("liquid:static-material", {
        surfaceCount: surfaces.length,
        reason: support.reason
      });
      return;
    }

    const tinted = settings.liquidAppearance === "tinted";
    const edgeRangeScale = getLiquidEdgeRangeScale();
    try {
      await loadScriptOnce("./assets/vendor/html2canvas/html2canvas.min.js", "html2canvas");
      await loadScriptOnce("./assets/vendor/liquid-gl/liquidGL.js", "liquidGL");
    } catch (error) {
      elements.poster.classList.add("liquid-webgl-fallback");
      setupStaticLiquidMaterial("dependency-error");
      configApi.debug("liquid:dependency-error", { message: error.message });
      return;
    }

    window.__liquidGLStaticMode__ = true;
    configApi.debug("liquid:init", {
      surfaceCount: surfaces.length,
      appearance: tinted ? "tinted" : "clear",
      renderScale: getRenderScale(),
      textureResolution: Math.min(3, 1.25 * getRenderScale()),
      edgeRefractionRange: settings.liquidEdgeRefractionRange,
      lightDirection: settings.liquidLightDirection,
      backgroundIncluded: !elements.posterBackground.hasAttribute("data-liquid-ignore")
    });

    await new Promise((resolve) => {
      let completed = false;
      const finish = (result, detail) => {
        if (completed) return;
        completed = true;
        elements.poster.classList.add(result === "ready" ? "liquid-webgl-ready" : "liquid-webgl-fallback");
        if (result !== "ready") {
          resetLiquidWebGL();
          setupStaticLiquidMaterial(`webgl-${result}`);
        }
        configApi.debug(`liquid:${result}`, detail || {});
        resolve();
      };

      const timer = setTimeout(() => finish("timeout", { timeoutMs: 3500 }), 3500);
      try {
        window.liquidGL({
          snapshot: "#poster",
          target: ".liquid-surface",
          resolution: Math.min(3, 1.25 * getRenderScale()),
          refraction: tinted ? 0.014 : 0.032,
          bevelDepth: tinted ? 0.1 : 0.17,
          bevelWidth: (tinted ? 0.2 : 0.24) * edgeRangeScale,
          frost: tinted ? 3.5 : 0,
          shadow: true,
          specular: true,
          lightAngle: Number(settings.liquidLightDirection),
          reveal: "none",
          tilt: false,
          magnify: tinted ? 1.01 : 1.055,
          on: {
            init() {
              clearTimeout(timer);
              finish("ready", { renderer: "liquidGL", webgl: true });
            }
          }
        });
        if (window.__liquidGLNoWebGL__) {
          clearTimeout(timer);
          completed = true;
          elements.poster.classList.add("liquid-webgl-project-fallback");
          configApi.debug("liquid:project-css-fallback", {
            reason: "webgl-context-unavailable",
            renderer: "liquidGL"
          });
          resolve();
        }
      } catch (error) {
        clearTimeout(timer);
        finish("error", { name: error.name, message: error.message });
      }
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async function init() {
    settings = await configApi.readSettingsAsync();
    configApi.setDebugMode(settings.debugMode);
    state.context = await readRenderContext();
    configApi.debug("render:init", {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      online: navigator.onLine,
      secureContext: window.isSecureContext,
      visibilityState: document.visibilityState,
      inIframe: window.parent !== window,
      referrer: document.referrer,
      pathname: window.location.pathname,
      bridges: {
        getViewport: typeof window.__internal_get_viewport,
        setViewport: typeof window.__internal_set_viewport
      },
      screen: {
        width: window.screen && window.screen.width,
        height: window.screen && window.screen.height,
        devicePixelRatio: window.devicePixelRatio
      },
      settings,
      context: state.context
    });
    try {
      const [appearance, data] = await Promise.allSettled([applySettings(), loadProfileData(state.context)]);
      if (appearance.status === "rejected") throw appearance.reason;
      if (data.status === "rejected") throw data.reason;
      state.profile = data.value;
    } catch (error) {
      console.error(error);
      state.error = "玩家统计加载失败，请检查 EasyBot 服务端连接与版本";
    } finally {
      state.loading = false;
      await render();
      await initializeLiquidGlass();
      await updateViewport();
    }
  }

  async function updateViewport() {
    const rect = elements.poster.getBoundingClientRect();
    const height = Math.ceil(rect.height);
    const computedStyle = window.getComputedStyle(elements.poster);
    configApi.debug("render:viewport", {
      width: 900,
      height,
      renderScale: getRenderScale(),
      outputWidth: Math.round(900 * getRenderScale()),
      outputHeight: Math.round(height * getRenderScale()),
      rect: { width: rect.width, height: rect.height, top: rect.top, bottom: rect.bottom },
      poster: { offsetHeight: elements.poster.offsetHeight, scrollHeight: elements.poster.scrollHeight },
      document: {
        bodyOffsetHeight: document.body.offsetHeight,
        bodyScrollHeight: document.body.scrollHeight,
        documentScrollHeight: document.documentElement.scrollHeight,
        visibilityState: document.visibilityState
      },
      computedStyle: {
        display: computedStyle.display,
        visibility: computedStyle.visibility,
        overflow: computedStyle.overflow,
        position: computedStyle.position
      }
    });
    await configApi.flushDebugLogsAsync();
    await configApi.setRenderViewport(900, height, getRenderScale());
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: "player-statistics-template-height",
        height
      }, "*");
    }
  }

  init();
})();
