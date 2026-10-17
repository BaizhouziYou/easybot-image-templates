(function () {
  const configApi = window.ServerPlayerCountConfig;
  let settings = configApi.readSettings();
  const avatarObjectUrls = [];

  const state = {
    servers: [],
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
    totalOnline: document.getElementById("totalOnline"),
    serverCount: document.getElementById("serverCount"),
    updateTime: document.getElementById("updateTime"),
    statusText: document.getElementById("statusText"),
    serverList: document.getElementById("serverList")
  };

  function getTemplateId() {
    const match = window.location.pathname.match(/\/template\/proxy\/([^/]+)\//);
    return match ? match[1] : "";
  }

  async function requestJson(url, options) {
    configApi.debug("api:request", { url, method: options && options.method ? options.method : "GET" });
    const startedAt = Date.now();
    const response = await fetch(url, options);
    configApi.debug("api:response", { url, status: response.status, durationMs: Date.now() - startedAt });
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    return response.json();
  }

  async function fetchEasyBotData() {
    const templateId = getTemplateId();
    if (!templateId) {
      return [];
    }

    const servers = await requestJson(`/template/api/${templateId}/servers`);
    const excludedServerTokens = new Set(settings.excludedServerTokens || []);
    const includedServers = servers.filter((server) => {
      const token = String(server.token || "").trim();
      return !token || !excludedServerTokens.has(token);
    });
    const visibleServers = settings.onlyOnlineServers
      ? includedServers.filter((server) => server.is_online)
      : includedServers;
    configApi.debug("servers:filter", {
      total: servers.length,
      excluded: servers.length - includedServers.length,
      visible: visibleServers.length,
      excludedServerTokens: Array.from(excludedServerTokens)
    });
    return Promise.all(visibleServers.map(async (server) => {
      let players = { players: [] };
      let error = "";

      if (server.is_online) {
        try {
          players = await requestJson(`/template/api/${templateId}/players`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              type: "papi_query",
              from_server_token: server.token,
              from_user_id: "system",
              is_bind: true,
              first_player_name: "",
              player_name_list: []
            })
          });
        } catch (cause) {
          error = "玩家列表暂不可用";
          configApi.debug("players:server-error", { server: server.server_name || server.name, error: cause });
        }
      }

      return {
        server: server.server_name || server.name || "未命名服务器",
        players,
        isOnline: Boolean(server.is_online),
        error
      };
    }));
  }

  async function loadEasyBotData() {
    const templateId = getTemplateId();
    const excludedSignature = Array.from(new Set(settings.excludedServerTokens || [])).sort().join(",");
    const signature = `${templateId}|online=${settings.onlyOnlineServers !== false}|excluded=${excludedSignature}`;
    const cached = settings.enableDataCache ? await configApi.readDataCacheAsync() : null;
    const cacheAge = cached && cached.createdAt ? Date.now() - Number(cached.createdAt) : Infinity;
    const cacheLifetime = Math.max(5, Number(settings.dataCacheSeconds) || 30) * 1000;
    const cacheMatches = cached && cached.signature === signature && Array.isArray(cached.data);

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
      const data = await fetchEasyBotData();
      if (settings.enableDataCache && !data.some((item) => item.error)) {
        const nextCache = {
          createdAt: Date.now(),
          signature,
          data
        };
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
    configApi.debug("theme:apply", { theme, liquidAppearance });
    const fontReady = applyFontSettings();
    elements.title.textContent = settings.title || "服务器在线列表";
    elements.subtitle.textContent = settings.subtitle || "";
    document.body.style.setProperty("--background-dim", `${settings.backgroundDim / 100}`);
    elements.poster.style.setProperty("--custom-background-color", settings.backgroundColor);
    elements.poster.classList.toggle("has-color-bg", settings.backgroundMode === "color");

    const backgroundUrl = resolveBackgroundUrl();
    configApi.debug("background:resolve", {
      mode: settings.backgroundMode,
      url: backgroundUrl,
      color: settings.backgroundMode === "color" ? settings.backgroundColor : ""
    });
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
      const selectedCategory = settings.randomBackgroundCategory || "moez";
      const category = selectedCategory === "custom"
        ? String(settings.randomBackgroundCustomCategory || "").trim()
        : selectedCategory;
      return buildRandomBackgroundUrl(settings.randomBackgroundApi, category);
    }

    return "";
  }

  function buildRandomBackgroundUrl(api, category) {
    const base = String(api || "").trim();
    const suffix = String(category || "").trim();
    if (!base || !suffix) return base;
    if (base.includes("{category}")) {
      return base.split("{category}").join(encodeURIComponent(suffix));
    }
    if (/^[?&#]/.test(suffix)) return `${base}${suffix}`;
    return `${base.replace(/\/+$/, "")}/${suffix.replace(/^\/+/, "")}`;
  }

  function countPlayers(servers) {
    return servers.reduce((sum, item) => sum + getPlayers(item).length, 0);
  }

  function getPlayers(serverItem) {
    return serverItem && serverItem.players && Array.isArray(serverItem.players.players)
      ? serverItem.players.players
      : [];
  }

  function formatTime() {
    return new Date().toLocaleTimeString("zh-CN", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  async function render() {
    const total = countPlayers(state.servers);
    const hasServerErrors = state.servers.some((item) => item.error);
    elements.totalOnline.textContent = hasServerErrors ? `${total}+` : String(total);
    elements.serverCount.textContent = String(state.servers.length);
    elements.updateTime.textContent = formatTime();
    elements.statusText.textContent = state.error ? "异常" : hasServerErrors ? "部分异常" : "正常";

    if (state.loading) {
      elements.serverList.innerHTML = '<div class="loading">正在获取在线玩家...</div>';
      return;
    }

    if (state.error) {
      elements.serverList.innerHTML = `<div class="empty">${escapeHtml(state.error)}</div>`;
      return;
    }

    if (!state.servers.length || (total === 0 && !hasServerErrors)) {
      elements.serverList.innerHTML = '<div class="empty">当前没有在线玩家</div>';
      return;
    }

    elements.serverList.innerHTML = state.servers.map(renderServer).join("");
    const avatarImages = document.querySelectorAll("[data-avatar]");
    await Promise.all(Array.from(avatarImages).map((image) => {
      return loadAvatarWithFallback(image, image.getAttribute("data-player-name") || "Steve");
    }));
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

    const sample = "服务器在线列表 玩家状态 Minecraft Server 0123456789";
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
      const timer = setTimeout(() => finish(reject, new Error("source-timeout")), timeoutMs);
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

  function renderServer(serverItem) {
    const players = getPlayers(serverItem);
    return `
      <article class="server-card">
        <header class="server-header">
          <h2>${escapeHtml(serverItem.server)}</h2>
          <span>${serverItem.error ? "查询失败" : `${players.length} 人在线`}</span>
        </header>
        <div class="player-grid">
          ${serverItem.error ? `<p class="empty">${escapeHtml(serverItem.error)}</p>` : players.map(renderPlayer).join("")}
        </div>
      </article>
    `;
  }

  function renderPlayer(player) {
    const name = player && player.name ? player.name : "Unknown";
    const badge = player && player.bedrock && settings.showBedrockBadge
      ? '<span class="badge">基岩版</span>'
      : "";

    return `
      <div class="player">
        <img data-avatar data-player-name="${escapeHtml(name)}" alt="${escapeHtml(name)}" />
        <div>
          <strong>${escapeHtml(name)}</strong>
          ${badge}
        </div>
      </div>
    `;
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
      settings
    });
    try {
      const [appearance, data] = await Promise.allSettled([applySettings(), loadEasyBotData()]);
      if (appearance.status === "rejected") throw appearance.reason;
      if (data.status === "rejected") throw data.reason;
      state.servers = data.value;
    } catch (error) {
      console.error(error);
      state.error = "玩家数据加载失败";
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
        type: "server-player-count-template-height",
        height
      }, "*");
    }
  }

  init();
  setInterval(() => {
    elements.updateTime.textContent = formatTime();
  }, 1000);
})();
