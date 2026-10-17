(function () {
  const configApi = window.ServerPerformanceConfig;
  let settings = configApi.readSettings();
  const valueDelimiter = "|::EASYBOT_SERVER_PERF::|";
  const state = {
    context: null,
    dashboards: [],
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
    healthSummary: document.getElementById("healthSummary"),
    healthText: document.getElementById("healthText"),
    healthDetail: document.getElementById("healthDetail"),
    serverLabel: document.getElementById("serverLabel"),
    serverName: document.getElementById("serverName"),
    updateTime: document.getElementById("updateTime"),
    metricCount: document.getElementById("metricCount"),
    serverList: document.getElementById("serverList")
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
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    const responseText = await response.text();
    try {
      return JSON.parse(responseText);
    } catch (error) {
      return responseText;
    }
  }

  function parseMetricConfig(metricConfig) {
    return String(metricConfig || settings.metricConfig || configApi.defaultMetricConfig)
      .split(/\r?\n/)
      .map((line) => {
        const parts = line.split("|");
        const direction = ["lower", "higher", "neutral"].includes(String(parts[3] || "").trim().toLowerCase())
          ? String(parts[3]).trim().toLowerCase()
          : "neutral";
        return {
          label: String(parts[0] || "").trim(),
          placeholder: String(parts[1] || "").trim(),
          unit: String(parts[2] || "").trim().slice(0, 12),
          direction,
          warning: parseOptionalNumber(parts[4]),
          danger: parseOptionalNumber(parts[5])
        };
      })
      .filter((item) => item.label && item.placeholder)
      .slice(0, 18);
  }

  function parseOptionalNumber(value) {
    const text = String(value == null ? "" : value).trim();
    if (!text) return null;
    const numeric = Number(text);
    return Number.isFinite(numeric) ? numeric : null;
  }

  async function readRenderContext() {
    if (typeof __internal_get_context !== "function") {
      return {
        type: "preview",
        from_server_token: "preview",
        from_user_id: "preview",
        is_bind: false,
        first_player_name: "",
        player_name_list: []
      };
    }
    try {
      const rawContext = await __internal_get_context();
      return typeof rawContext === "string" ? JSON.parse(rawContext) : rawContext;
    } catch (error) {
      configApi.debug("context:read-error", error);
      throw new Error("无法读取服务器查询上下文");
    }
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
      if (previous && previous.color === activeColor) previous.text += text;
      else segments.push({ text, color: activeColor });
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

  function sanitizePlaceholderValue(value, placeholder) {
    const rawText = normalizeMinecraftCodes(value).trim();
    const plainText = stripMinecraftFormatting(rawText).trim();
    if (!plainText || plainText === placeholder || /^null$/i.test(plainText)) return "--";
    if (/%[^%]+%/.test(plainText)) return "--";
    if (/(no enum constant|unknown placeholder|invalid placeholder|exception|error:)/i.test(plainText)) return "--";
    return rawText;
  }

  function readNumericValue(value) {
    const plainText = stripMinecraftFormatting(value).replace(/,/g, "").trim();
    const match = plainText.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const numeric = Number(match[0]);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function calculateSeverity(metric) {
    if (metric.value === "--" || metric.numericValue === null) return "unknown";
    if (metric.direction === "neutral") return "neutral";
    if (metric.warning === null && metric.danger === null) return "neutral";
    if (metric.direction === "lower") {
      if (metric.danger !== null && metric.numericValue >= metric.danger) return "critical";
      if (metric.warning !== null && metric.numericValue >= metric.warning) return "warning";
      return "good";
    }
    if (metric.danger !== null && metric.numericValue <= metric.danger) return "critical";
    if (metric.warning !== null && metric.numericValue <= metric.warning) return "warning";
    return "good";
  }

  function buildDemoDashboard(metrics, serverName, token) {
    const demoValues = ["19.95", "32.4", "46", "28", "4096", "28"];
    const populated = metrics.map((metric, index) => {
      const value = demoValues[index] || String(Number(((index + 1) * 7.5).toFixed(1)));
      const result = { ...metric, value, numericValue: readNumericValue(value) };
      result.severity = calculateSeverity(result);
      return result;
    });
    return {
      server: {
        name: serverName || settings.previewServerName || "示例服务器",
        token: token || "preview",
        isOnline: true
      },
      metrics: populated,
      updatedAt: Date.now(),
      diagnostics: { resolvedCount: populated.length, metricCount: populated.length },
      error: ""
    };
  }

  function normalizeServerList(value) {
    if (Array.isArray(value)) return value;
    if (value && Array.isArray(value.data)) return value.data;
    if (value && Array.isArray(value.servers)) return value.servers;
    return [];
  }

  function normalizeServer(server) {
    const token = String(server && server.token || "").trim();
    return {
      name: server && (server.server_name || server.name) || "未命名服务器",
      token,
      isOnline: Boolean(server && server.is_online)
    };
  }

  function getServerProfile(token) {
    const rawProfile = settings.serverMetricProfiles && settings.serverMetricProfiles[token];
    return {
      queryPlayerName: String(rawProfile && rawProfile.queryPlayerName || settings.queryPlayerName || "Steve").trim() || "Steve",
      displayName: String(rawProfile && rawProfile.displayName || "").trim(),
      metricConfig: rawProfile && rawProfile.metricConfig || settings.metricConfig || configApi.defaultMetricConfig,
      preset: rawProfile && rawProfile.preset || "custom"
    };
  }

  function createServerContext(baseContext, server, profile) {
    return {
      ...(baseContext || {}),
      type: "papi_query",
      from_server_token: server.token,
      from_user_id: baseContext && baseContext.from_user_id || "system",
      is_bind: true,
      first_player_name: profile.queryPlayerName,
      player_name_list: profile.queryPlayerName ? [profile.queryPlayerName] : []
    };
  }

  function unwrapPlaceholderResult(result) {
    if (result && typeof result === "object" && !Array.isArray(result)) {
      return result.data ?? result.value ?? result.text ?? result.result ?? result;
    }
    return result;
  }

  function buildUnavailableDashboard(server, metricDefinitions, error) {
    const metrics = metricDefinitions.map((definition) => ({
      ...definition,
      value: "--",
      numericValue: null,
      severity: "unknown"
    }));
    return {
      server,
      metrics,
      updatedAt: Date.now(),
      diagnostics: { resolvedCount: 0, metricCount: metrics.length },
      error: error ? String(error.message || error) : ""
    };
  }

  async function fetchServerDashboard(server, baseContext) {
    const profile = getServerProfile(server.token);
    const displayServer = { ...server, name: profile.displayName || server.name };
    const metricDefinitions = parseMetricConfig(profile.metricConfig);
    if (!server.isOnline) {
      configApi.debug("performance:server-offline", { server });
      return buildUnavailableDashboard(displayServer, metricDefinitions, new Error("服务器当前离线"));
    }
    const placeholderUrl = `/template/api/${getTemplateId()}/placeholder`;
    const context = createServerContext(baseContext, server, profile);
    const requestPlaceholderText = (text) => requestApi(placeholderUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, playerName: profile.queryPlayerName, context })
    });
    try {
      const placeholders = metricDefinitions.map((metric) => metric.placeholder);
      if (!placeholders.length) return buildUnavailableDashboard(displayServer, [], null);
      const batchResult = unwrapPlaceholderResult(await requestPlaceholderText(placeholders.join(valueDelimiter)));
      const rawText = typeof batchResult === "string"
        ? batchResult
        : String(batchResult == null ? "" : batchResult);
      let values = Array.isArray(batchResult)
        ? batchResult.map((value) => String(value == null ? "" : value))
        : rawText.split(valueDelimiter);

      if (values.length !== placeholders.length) {
        configApi.debug("placeholder:batch-shape-mismatch", {
          serverToken: server.token,
          expectedValueCount: placeholders.length,
          actualValueCount: values.length
        });
        values = await Promise.all(placeholders.map(async (placeholder) => {
          const singleResult = unwrapPlaceholderResult(await requestPlaceholderText(placeholder));
          return String(singleResult == null ? "" : singleResult);
        }));
      }

      const metrics = metricDefinitions.map((definition, index) => {
        const value = sanitizePlaceholderValue(values[index], definition.placeholder);
        const metric = { ...definition, value, numericValue: readNumericValue(value) };
        metric.severity = calculateSeverity(metric);
        return metric;
      });
      const resolvedCount = metrics.filter((metric) => metric.value !== "--").length;
      configApi.debug("performance:server-result", {
        server: displayServer,
        preset: profile.preset,
        metricCount: metrics.length,
        resolvedCount,
        unresolvedSamples: metrics.filter((metric) => metric.value === "--").slice(0, 4).map((metric) => metric.placeholder)
      });
      return {
        server: displayServer,
        metrics,
        updatedAt: Date.now(),
        diagnostics: { resolvedCount, metricCount: metrics.length },
        error: ""
      };
    } catch (error) {
      configApi.debug("performance:server-error", { server, message: error.message });
      return buildUnavailableDashboard(displayServer, metricDefinitions, error);
    }
  }

  async function fetchDashboardData(context) {
    if (!context || context.type === "preview" || !getTemplateId()) {
      const profile = getServerProfile("preview");
      const metricDefinitions = parseMetricConfig(profile.metricConfig);
      configApi.debug("performance:demo", { metricCount: metricDefinitions.length });
      return [buildDemoDashboard(metricDefinitions, profile.displayName || settings.previewServerName, "preview")];
    }
    const excluded = new Set(settings.excludedServerTokens || []);
    const servers = normalizeServerList(await requestApi(`/template/api/${getTemplateId()}/servers`))
      .map(normalizeServer)
      .filter((server) => server.token && !excluded.has(server.token));
    configApi.debug("performance:servers-selected", {
      total: servers.length + excluded.size,
      selected: servers.map((server) => server.token),
      excluded: Array.from(excluded)
    });
    return Promise.all(servers.map((server) => fetchServerDashboard(server, context)));
  }

  function createCacheSignature(context) {
    const profiles = Object.keys(settings.serverMetricProfiles || {}).sort().reduce((result, token) => {
      result[token] = settings.serverMetricProfiles[token];
      return result;
    }, {});
    return JSON.stringify({
      version: "server-performance-cache-v2",
      templateId: getTemplateId(),
      sourceServer: context && context.from_server_token || "preview",
      excludedServerTokens: (settings.excludedServerTokens || []).slice().sort(),
      serverMetricProfiles: profiles,
      fallbackQueryPlayerName: settings.queryPlayerName,
      fallbackMetricConfig: settings.metricConfig
    });
  }

  async function loadDashboardData(context) {
    const signature = createCacheSignature(context);
    const cached = settings.enableDataCache ? await configApi.readDataCacheAsync() : null;
    const cacheAge = cached && cached.createdAt ? Date.now() - Number(cached.createdAt) : Infinity;
    const cacheLifetime = Math.max(5, Number(settings.dataCacheSeconds) || 30) * 1000;
    const cacheMatches = Boolean(cached && cached.signature === signature && Array.isArray(cached.data));
    if (cacheMatches && cacheAge < cacheLifetime) {
      configApi.debug("cache:data-hit", { ageMs: cacheAge, lifetimeMs: cacheLifetime, serverCount: cached.data.length });
      return cached.data;
    }
    configApi.debug("cache:data-miss", { enabled: settings.enableDataCache, cacheMatches, cacheAge });
    try {
      const data = await fetchDashboardData(context);
      const resolvedCount = data.reduce((total, dashboard) => total + dashboard.diagnostics.resolvedCount, 0);
      if (settings.enableDataCache && resolvedCount > 0) {
        const nextCache = { createdAt: Date.now(), signature, data };
        await configApi.writeDataCacheAsync(nextCache);
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
    const fontReady = applyFontSettings();
    setMinecraftText(elements.title, settings.title || "服务器性能监控");
    setMinecraftText(elements.subtitle, settings.subtitle || "");
    setMinecraftText(elements.description, settings.description || "");
    setMinecraftText(elements.serverLabel, settings.serverLabel || "显示服务器");
    document.body.style.setProperty("--background-dim", `${settings.backgroundDim / 100}`);
    elements.poster.style.setProperty("--custom-background-color", settings.backgroundColor || "#0B111D");

    const backgroundUrl = resolveBackgroundUrl();
    elements.poster.classList.toggle("has-color-bg", settings.backgroundMode === "color");
    configApi.debug("background:resolve", { mode: settings.backgroundMode, url: backgroundUrl, color: settings.backgroundColor });
    let backgroundReady;
    if (backgroundUrl) {
      elements.poster.classList.add("has-custom-bg");
      backgroundReady = loadImage(elements.posterBackground, backgroundUrl);
      elements.posterBackground.toggleAttribute("data-liquid-ignore", settings.backgroundMode === "random");
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
    await Promise.all([fontReady, backgroundReady]);
  }

  function resolveBackgroundUrl() {
    if (settings.backgroundMode === "custom") return settings.backgroundUrl || "";
    if (settings.backgroundMode !== "random") return "";
    const base = String(settings.randomBackgroundApi || "").replace(/\/+$/, "");
    if (!base) return "";
    const category = settings.randomBackgroundCategory === "custom"
      ? String(settings.randomBackgroundCustomCategory || "").trim()
      : String(settings.randomBackgroundCategory || "moez").trim();
    if (base.includes("{category}")) return base.split("{category}").join(encodeURIComponent(category));
    if (!category) return base;
    if (/^[?&#]/.test(category)) return `${base}${category}`;
    return `${base}/${category.replace(/^\/+/, "")}`;
  }

  function render() {
    if (state.loading) {
      elements.serverList.innerHTML = '<div class="loading"><span>正在获取多台服务器性能数据...</span></div>';
      return;
    }
    if (state.error) {
      elements.healthSummary.className = "summary health-unknown";
      elements.healthText.textContent = "异常";
      elements.healthDetail.textContent = "读取失败";
      elements.serverList.innerHTML = `<div class="empty"><span>${escapeHtml(state.error)}</span></div>`;
      return;
    }
    const dashboards = state.dashboards;
    const totalMetricCount = dashboards.reduce((total, dashboard) => total + dashboard.diagnostics.metricCount, 0);
    const latestUpdate = dashboards.reduce((latest, dashboard) => Math.max(latest, Number(dashboard.updatedAt) || 0), 0);
    elements.serverName.textContent = `${dashboards.length} 台`;
    elements.updateTime.textContent = latestUpdate
      ? new Date(latestUpdate).toLocaleTimeString("zh-CN", { hour12: false })
      : "--:--:--";
    elements.metricCount.textContent = `${totalMetricCount} 项`;
    elements.serverList.innerHTML = dashboards.length
      ? dashboards.map(renderServerDashboard).join("")
      : '<div class="empty"><span>当前没有选择要显示的服务器，请前往配置页勾选</span></div>';
    applyHealthSummary(dashboards);
  }

  function getDashboardSeverity(dashboard) {
    let severity = "good";
    if (!dashboard.server.isOnline || dashboard.error) severity = "critical";
    else if (dashboard.metrics.some((metric) => metric.severity === "critical")) severity = "critical";
    else if (dashboard.metrics.some((metric) => metric.severity === "warning")) severity = "warning";
    else if (!dashboard.metrics.some((metric) => ["good", "warning", "critical"].includes(metric.severity))) severity = "unknown";
    return severity;
  }

  function renderServerDashboard(dashboard) {
    const diagnostics = dashboard.diagnostics;
    const severity = getDashboardSeverity(dashboard);
    const statusText = !dashboard.server.isOnline
      ? "离线"
      : dashboard.error
        ? "读取失败"
        : `${diagnostics.resolvedCount}/${diagnostics.metricCount} 可用`;
    const metrics = dashboard.metrics.length
      ? dashboard.metrics.map(renderMetric).join("")
      : '<div class="empty"><span>该服务器尚未配置性能指标</span></div>';
    return `
      <article class="server-card metrics-panel server-health-${severity}">
        <header class="server-header">
          <div>
            <p class="section-kicker">Server Performance</p>
            <h2>${minecraftTextToHtml(dashboard.server.name)}</h2>
          </div>
          <span class="server-result-badge is-${severity}">${escapeHtml(statusText)}</span>
        </header>
        <div class="metrics-grid">${metrics}</div>
      </article>
    `;
  }

  function applyHealthSummary(dashboards) {
    let severity = "unknown";
    if (dashboards.length) {
      const severities = dashboards.map(getDashboardSeverity);
      if (severities.includes("critical")) severity = "critical";
      else if (severities.includes("warning")) severity = "warning";
      else if (severities.includes("good")) severity = "good";
    }
    const affectedCount = dashboards.filter((dashboard) => ["critical", "warning"].includes(getDashboardSeverity(dashboard))).length;
    const labels = {
      good: ["正常", `${dashboards.length} 台服务器指标稳定`],
      warning: ["需关注", `${affectedCount} 台服务器接近阈值`],
      critical: ["异常", `${affectedCount} 台服务器需要处理`],
      unknown: ["未知", dashboards.length ? "暂无可判定指标" : "未选择服务器"]
    };
    elements.healthSummary.className = `summary health-${severity}`;
    elements.healthText.textContent = labels[severity][0];
    elements.healthDetail.textContent = labels[severity][1];
  }

  function renderMetric(metric, index) {
    const unitHtml = metric.value !== "--" && metric.unit && !stripMinecraftFormatting(metric.value).includes(metric.unit)
      ? `<em>${escapeHtml(metric.unit)}</em>`
      : "";
    const stateLabel = {
      good: "正常",
      warning: "警告",
      critical: "危险",
      neutral: "监测",
      unknown: "无数据"
    }[metric.severity] || "监测";
    return `
      <div class="metric-card is-${metric.severity}">
        <div class="metric-heading">
          <span>${minecraftTextToHtml(metric.label)}</span>
          <i>${stateLabel}</i>
        </div>
        <strong>${minecraftTextToHtml(metric.value)}${unitHtml}</strong>
        <small>${String(index + 1).padStart(2, "0")}</small>
      </div>
    `;
  }

  async function applyFontSettings() {
    const preset = fontPresets[settings.fontFamily] || fontPresets.system;
    document.documentElement.style.setProperty("--template-font-family", preset.family);
    configApi.debug("font:apply", { selected: settings.fontFamily, label: preset.label, embedded: Boolean(preset.loadFamily) });
    if (!preset.loadFamily || !document.fonts) return;
    const sample = "服务器性能监控 TPS MSPT 0123456789";
    let timeoutId;
    try {
      const result = await Promise.race([
        document.fonts.load(`400 50px ${preset.loadFamily}`, sample).then((fonts) => ({ status: "loaded", faceCount: fonts.length })),
        new Promise((resolve) => { timeoutId = setTimeout(() => resolve({ status: "timeout", faceCount: 0 }), 8000); })
      ]);
      clearTimeout(timeoutId);
      if (result.status !== "loaded" || result.faceCount < 1) {
        document.documentElement.style.setProperty("--template-font-family", fontPresets.system.family);
      }
      configApi.debug("font:load", { selected: settings.fontFamily, ...result });
    } catch (error) {
      clearTimeout(timeoutId);
      document.documentElement.style.setProperty("--template-font-family", fontPresets.system.family);
      configApi.debug("font:error", error);
    }
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
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight
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
      } else if (settings.backgroundMode === "color") {
        overlayContext.fillStyle = settings.backgroundColor;
        overlayContext.fillRect(0, 0, overlay.width, overlay.height);
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
      inIframe: window.parent !== window,
      pathname: window.location.pathname,
      settings,
      context: state.context
    });
    try {
      const [appearance, data] = await Promise.allSettled([applySettings(), loadDashboardData(state.context)]);
      if (appearance.status === "rejected") throw appearance.reason;
      if (data.status === "rejected") throw data.reason;
      state.dashboards = data.value;
    } catch (error) {
      console.error(error);
      state.error = "服务器性能数据加载失败，请检查服务器连接、PAPI 变量和模板配置";
    } finally {
      state.loading = false;
      render();
      await initializeLiquidGlass();
      await updateViewport();
    }
  }

  async function updateViewport() {
    const rect = elements.poster.getBoundingClientRect();
    const height = Math.ceil(rect.height);
    configApi.debug("render:viewport", {
      width: 900,
      height,
      renderScale: getRenderScale(),
      outputWidth: Math.round(900 * getRenderScale()),
      outputHeight: Math.round(height * getRenderScale())
    });
    await configApi.flushDebugLogsAsync();
    await configApi.setRenderViewport(900, height, getRenderScale());
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "server-performance-template-height", height }, "*");
    }
  }

  init();
})();
