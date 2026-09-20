(() => {
  "use strict";

  const DEMO_PLAYER = { id: "demo", name: "Muffin", ping: 24, world: "world", region: "spawn" };
  const DEMO_NAMES = ["Muffin", "Luna", "DasEtwa", "Steve", "Alex", "Keks", "Nova", "Robin", "Pixel", "Mika"];
  const SURFACES = {
    tab: ["Tablist", "Header & Footer gestalten"],
    scoreboard: ["Scoreboard", "Sidebar & Zeilen gestalten"],
    actionbar: ["ActionBar", "Module & Prioritäten ansehen"],
    bossbar: ["BossBar", "Fortschritt & Bedingungen gestalten"]
  };
  const PREVIEW_PATHS = {
    "tab.serverName": "tab.server-name",
    "tab.footer": "tab.ram-format",
    "scoreboard.title": "scoreboard.title",
    "bossbar.title": "bossbar.title",
    "bossbar.value": "bossbar.value",
    "bossbar.max": "bossbar.max",
    "bossbar.color": "bossbar.color",
    "bossbar.style": "bossbar.style"
  };
  const COLOR_NAMES = {
    black: "#000000", dark_blue: "#0000aa", dark_green: "#00aa00", dark_aqua: "#00aaaa",
    dark_red: "#aa0000", dark_purple: "#aa00aa", gold: "#ffaa00", gray: "#aaaaaa",
    dark_gray: "#555555", blue: "#5555ff", green: "#55ff55", aqua: "#55ffff",
    red: "#ff5555", light_purple: "#ff55ff", yellow: "#ffff55", white: "#ffffff"
  };
  const BOSS_COLORS = { pink: "#dd55a2", blue: "#4c72db", red: "#d84c4c", green: "#49a85c", yellow: "#d8b548", purple: "#a342b5", white: "#e6e6e6" };

  const initialEditor = {
    tab: { serverName: "<gradient:#AA00AA:#BA55D3>Welcome from NeoTab</gradient>", footer: "<gray>RAM: <light_purple>{used}MB / {total}MB ({percent}%)</light_purple></gray>", animationStyle: "rainbow", interval: 10, colors: ["#aa00aa", "#ba55d3"] },
    scoreboard: { enabled: false, title: "<gradient:#AA00AA:#BA55D3>NeoTab</gradient>", lines: ["&7Online: &d{online}&7/&d{max}", "&7Ping: &d{ping}ms", "&7RAM: &d{ram_used}&7/&d{ram_max} MB"], interval: 20 },
    actionbar: { enabled: true, preview: "<gray>Welcome <light_purple>{player}</light_purple>!</gray>" },
    bossbar: { enabled: false, title: "<gradient:#AA00AA:#BA55D3>NeoTab</gradient>", value: "{online}", max: "{max}", color: "purple", style: "solid", permission: "", worlds: "" }
  };

  const state = {
    surface: "tab",
    editor: clone(initialEditor),
    baseline: clone(initialEditor),
    players: [DEMO_PLAYER],
    selectedPlayerId: "demo",
    socket: null,
    connected: false,
    connecting: false,
    intentionalClose: false,
    pending: new Map(),
    requestSequence: 0,
    capabilities: null,
    configRevision: null,
    saving: false,
    liveValues: new Map(),
    subscriptionId: null,
    preview: null,
    previewQueue: Promise.resolve(),
    liveDebounce: 0,
    patchDebounce: 0
  };

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function selectedPlayer() { return state.players.find(player => player.id === state.selectedPlayerId) || DEMO_PLAYER; }
  function getPath(root, path) { return path.split(".").reduce((value, key) => value?.[key], root); }
  function setPath(root, path, value) {
    const parts = path.split(".");
    const key = parts.pop();
    const owner = parts.reduce((value, part) => value[part], root);
    owner[key] = value;
  }

  function showToast(message, error = false) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.toggle("error", error);
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 2800);
  }

  function openConnection(open = true) {
    $("#connectionPanel").hidden = !open;
    $("#connectionState").setAttribute("aria-expanded", String(open));
    if (open) setTimeout(() => $("#socketUrl").focus(), 20);
  }

  function updateConnectionUi() {
    const button = $("#connectionState");
    button.classList.toggle("connected", state.connected);
    button.classList.toggle("connecting", state.connecting);
    $("#connectionLabel").textContent = state.connected ? "Live verbunden" : state.connecting ? "Verbindet …" : "Nicht verbunden";
    $("#connectButton").textContent = state.connected ? "Trennen" : state.connecting ? "Verbindet …" : "Verbinden";
    $("#connectButton").disabled = state.connecting;
    const canSave = state.connected && Number.isInteger(state.configRevision)
      && (state.capabilities?.operations || []).includes("SAVE_CONFIG");
    $("#saveButton").disabled = !canSave || state.saving;
    $("#saveButton").textContent = state.saving ? "Speichert …" : "Auf Server speichern";
    $("#previewMode").textContent = state.connected ? "Live-Servervorschau" : "Lokale Vorschau";
    $(".preview-toolbar .live-dot").classList.toggle("live", state.connected);
    $("#saveHint").textContent = canSave
      ? "Speichern validiert die Werte, legt ein Backup an und lädt NeoTab neu."
      : state.connected ? "Live-Daten aktiv. Config-Speichern ist serverseitig deaktiviert." : "Änderungen betreffen nur diese Vorschau.";
  }

  function navigate(surface) {
    if (!SURFACES[surface]) return;
    state.surface = surface;
    $$(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.surface === surface));
    $$(".surface-form").forEach(form => form.classList.toggle("active", form.dataset.form === surface));
    $("#surfaceEyebrow").textContent = SURFACES[surface][0];
    $("#surfaceTitle").textContent = SURFACES[surface][1];
  }

  function syncBindings() {
    $$('[data-bind]').forEach(input => {
      const value = getPath(state.editor, input.dataset.bind);
      if (input.type === "checkbox") input.checked = Boolean(value);
      else input.value = value ?? "";
    });
    renderColorInputs();
    renderLineInputs();
  }

  function readBinding(input) {
    const path = input.dataset.bind;
    let value = input.type === "checkbox" ? input.checked : input.value;
    if (input.type === "number") value = Number(input.value);
    setPath(state.editor, path, value);
    render();
    scheduleLiveSubscription();
    if (PREVIEW_PATHS[path]) schedulePreviewPatch(path, String(value));
  }

  function renderColorInputs() {
    const row = $("#tabColors");
    row.replaceChildren();
    state.editor.tab.colors.forEach((color, index) => {
      const label = document.createElement("label");
      label.className = "color-swatch";
      label.title = `Farbe ${index + 1}: ${color}`;
      const input = document.createElement("input");
      input.type = "color";
      input.value = /^#[0-9a-f]{6}$/i.test(color) ? color : "#aa00aa";
      input.addEventListener("input", () => { state.editor.tab.colors[index] = input.value; label.title = `Farbe ${index + 1}: ${input.value}`; render(); });
      label.append(input);
      row.append(label);
    });
    if (state.editor.tab.colors.length < 8) {
      const add = document.createElement("button");
      add.type = "button";
      add.className = "add-color";
      add.textContent = "+";
      add.title = "Farbe hinzufügen";
      add.addEventListener("click", () => { state.editor.tab.colors.push("#ba55d3"); renderColorInputs(); render(); });
      row.append(add);
    }
  }

  function renderLineInputs() {
    const editor = $("#scoreboardLines");
    editor.replaceChildren();
    state.editor.scoreboard.lines.forEach((line, index) => {
      const row = document.createElement("div");
      row.className = "line-entry";
      const number = document.createElement("span");
      number.textContent = String(index + 1).padStart(2, "0");
      const input = document.createElement("input");
      input.type = "text";
      input.value = line;
      input.setAttribute("aria-label", `Scoreboard-Zeile ${index + 1}`);
      input.addEventListener("input", () => { state.editor.scoreboard.lines[index] = input.value; render(); scheduleLiveSubscription(); });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-line";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `Zeile ${index + 1} entfernen`);
      remove.addEventListener("click", () => { state.editor.scoreboard.lines.splice(index, 1); renderLineInputs(); render(); scheduleLiveSubscription(); });
      row.append(number, input, remove);
      editor.append(row);
    });
  }

  function addScoreboardLine() {
    if (state.editor.scoreboard.lines.length >= 15) return showToast("Ein Scoreboard kann höchstens 15 Zeilen haben.", true);
    state.editor.scoreboard.lines.push("");
    renderLineInputs();
    const inputs = $$("#scoreboardLines input");
    inputs.at(-1)?.focus();
    render();
  }

  function collectTemplateStrings() {
    return [state.editor.tab.serverName, state.editor.tab.footer, state.editor.scoreboard.title, ...state.editor.scoreboard.lines, state.editor.actionbar.preview, state.editor.bossbar.title, state.editor.bossbar.value, state.editor.bossbar.max];
  }

  function collectPlaceholders() {
    const found = new Set();
    const pattern = /\{[a-zA-Z0-9_]+\}|%[a-zA-Z0-9_:-]+%/g;
    collectTemplateStrings().forEach(template => String(template || "").match(pattern)?.forEach(value => found.add(value)));
    return [...found];
  }

  function demoValue(placeholder, player) {
    const values = {
      "{online}": "42", "{max}": "100", "{ping}": String(player.ping), "{avg_ping}": "31",
      "{ram_used}": "1248", "{ram_max}": "4096", "{ram_percent}": "30",
      "{used}": "1248", "{total}": "4096", "{percent}": "30",
      "{server_name}": "NeoTab Server", "{player}": player.name, "{player_name}": player.name
    };
    return values[placeholder] ?? (placeholder.startsWith("%") ? "Live PAPI" : placeholder);
  }

  function valueFor(placeholder) {
    const player = selectedPlayer();
    if (state.connected && player.id !== "demo") {
      const key = `${player.id}\u0000${placeholder}`;
      if (state.liveValues.has(key)) return state.liveValues.get(key);
    }
    return demoValue(placeholder, player);
  }

  function resolveText(template) {
    return String(template ?? "").replace(/\{[a-zA-Z0-9_]+\}|%[a-zA-Z0-9_:-]+%/g, valueFor);
  }

  function miniMessageFragment(template) {
    const fragment = document.createDocumentFragment();
    const root = document.createElement("span");
    fragment.append(root);
    const stack = [{ name: "root", node: root }];
    const source = resolveText(template).replace(/&([0-9a-fklmnor])/gi, "§$1");
    const tokens = source.split(/(<[^<>]{1,120}>|§[0-9a-fklmnor])/gi);
    for (const token of tokens) {
      if (!token) continue;
      if (token[0] !== "<" && token[0] !== "§") {
        const lines = token.split("\n");
        lines.forEach((line, index) => { if (index) stack.at(-1).node.append(document.createElement("br")); stack.at(-1).node.append(document.createTextNode(line)); });
        continue;
      }
      if (token[0] === "§") {
        applyLegacyCode(token[1].toLowerCase(), stack);
        continue;
      }
      const raw = token.slice(1, -1).trim();
      if (!raw) continue;
      if (raw.startsWith("/")) { closeStyle(raw.slice(1).split(":")[0].toLowerCase(), stack); continue; }
      const parts = raw.split(":");
      const name = parts[0].toLowerCase();
      if (name === "reset") { stack.splice(1); continue; }
      const span = document.createElement("span");
      if (name === "gradient" && parts.length >= 3) {
        const colors = parts.slice(1).filter(value => /^#[0-9a-f]{6}$/i.test(value));
        if (colors.length >= 2) { span.className = "mc-gradient"; span.style.backgroundImage = `linear-gradient(90deg, ${colors.join(",")})`; }
        else continue;
      } else if (name === "color" && parts[1]) {
        const color = safeColor(parts[1]); if (!color) continue; span.style.color = color;
      } else if (safeColor(name)) {
        span.style.color = safeColor(name);
      } else if (["bold", "b"].includes(name)) span.className = "mc-bold";
      else if (["italic", "i", "em"].includes(name)) span.className = "mc-italic";
      else if (["underlined", "u"].includes(name)) span.className = "mc-underlined";
      else if (["strikethrough", "st"].includes(name)) span.className = "mc-strikethrough";
      else continue;
      stack.at(-1).node.append(span);
      stack.push({ name, node: span });
    }
    return fragment;
  }

  function safeColor(value) {
    const normalized = String(value).toLowerCase().replace(/-/g, "_");
    if (/^#[0-9a-f]{6}$/i.test(normalized)) return normalized;
    return COLOR_NAMES[normalized] || null;
  }

  function closeStyle(name, stack) {
    const aliases = { b: "bold", i: "italic", em: "italic", u: "underlined", st: "strikethrough" };
    const target = aliases[name] || name;
    for (let index = stack.length - 1; index > 0; index--) {
      const current = aliases[stack[index].name] || stack[index].name;
      stack.pop();
      if (current === target || (target === "color" && safeColor(current)) || (target === "gradient" && current === "gradient")) break;
    }
  }

  function applyLegacyCode(code, stack) {
    if (code === "r") { stack.splice(1); return; }
    const styles = { l: "bold", o: "italic", n: "underlined", m: "strikethrough" };
    const legacyColors = { 0:"black",1:"dark_blue",2:"dark_green",3:"dark_aqua",4:"dark_red",5:"dark_purple",6:"gold",7:"gray",8:"dark_gray",9:"blue",a:"green",b:"aqua",c:"red",d:"light_purple",e:"yellow",f:"white" };
    if (legacyColors[code]) {
      while (stack.length > 1) stack.pop();
      const span = document.createElement("span"); span.style.color = safeColor(legacyColors[code]); rootAppend(stack, span, legacyColors[code]);
    } else if (styles[code]) {
      const span = document.createElement("span"); span.className = `mc-${styles[code]}`; rootAppend(stack, span, styles[code]);
    }
  }

  function rootAppend(stack, node, name) { stack.at(-1).node.append(node); stack.push({ name, node }); }
  function setRichText(element, template) { element.replaceChildren(miniMessageFragment(template)); }

  function render() {
    const player = selectedPlayer();
    setRichText($("#tabHeader"), state.editor.tab.serverName);
    setRichText($("#tabFooter"), state.editor.tab.footer);
    $("#tabHeader").className = `tab-header animation-${state.editor.tab.animationStyle}`;

    const playerGrid = $("#playerGrid");
    playerGrid.replaceChildren();
    const players = state.connected && state.players.length > 1 ? state.players.slice(0, 10) : DEMO_NAMES.map((name, index) => ({ name, ping: 18 + index * 7 }));
    players.forEach(entry => {
      const cell = document.createElement("div"); cell.className = "player-cell";
      const head = document.createElement("i"); head.className = "player-head";
      const name = document.createElement("span"); name.textContent = entry.name;
      const ping = document.createElement("span"); ping.className = "ping-bars"; ping.textContent = entry.ping > 120 ? "▂" : entry.ping > 70 ? "▂▄" : "▂▄▆";
      cell.append(head, name, ping); playerGrid.append(cell);
    });

    $("#scoreboardPreview").classList.toggle("off", !state.editor.scoreboard.enabled);
    setRichText($("#scoreboardTitle"), state.editor.scoreboard.title);
    const rows = $("#scoreboardRows"); rows.replaceChildren();
    state.editor.scoreboard.lines.forEach(line => { const row = document.createElement("p"); row.append(miniMessageFragment(line)); rows.append(row); });

    setRichText($("#actionbarPreview"), state.editor.actionbar.preview);
    $("#actionbarPreview").hidden = !state.editor.actionbar.enabled;

    $("#bossbarPreview").classList.toggle("off", !state.editor.bossbar.enabled);
    setRichText($("#bossbarTitle"), state.editor.bossbar.title);
    const value = Number(resolveText(state.editor.bossbar.value));
    const max = Number(resolveText(state.editor.bossbar.max));
    const progress = Number.isFinite(value) && Number.isFinite(max) && max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
    $("#bossbarFill").style.width = `${progress * 100}%`;
    $("#bossbarFill").style.background = BOSS_COLORS[state.editor.bossbar.color] || BOSS_COLORS.purple;
    $("#bossbarSegments").className = state.editor.bossbar.style === "solid" ? "" : state.editor.bossbar.style;

    $("#metaPlayer").textContent = player.name;
    $("#metaPing").textContent = `${player.ping} ms`;
    $("#metaWorld").textContent = player.world || "–";
    $("#metaRegion").textContent = player.region || "default";
    renderPlaceholderChips();
  }

  function renderPlaceholderChips() {
    const container = $("#placeholderChips"); container.replaceChildren();
    const placeholders = collectPlaceholders();
    if (!placeholders.length) { const empty = document.createElement("span"); empty.className = "placeholder-chip"; empty.textContent = "keine"; container.append(empty); return; }
    placeholders.forEach(value => { const chip = document.createElement("span"); chip.className = `placeholder-chip${state.connected && selectedPlayer().id !== "demo" ? " live" : ""}`; chip.textContent = value; chip.title = valueFor(value); container.append(chip); });
  }

  function configToEditor(snapshot) {
    const config = snapshot?.config;
    if (!config) throw new Error("NeoTab hat keine lesbare Config geliefert.");
    state.configRevision = snapshot.revision;
    const tab = config.defaultTab || {};
    const scoreboard = config.scoreboard || {};
    const score = scoreboard.defaultProfile || {};
    const bossbar = config.bossBar || {};
    const boss = bossbar.defaultProfile || {};
    state.editor = {
      tab: { serverName: tab.serverName ?? initialEditor.tab.serverName, footer: tab.footer ?? initialEditor.tab.footer, animationStyle: tab.animationStyle ?? "static", interval: config.tabUpdateIntervalTicks ?? 10, colors: tab.colors?.length ? [...tab.colors] : [...initialEditor.tab.colors] },
      scoreboard: { enabled: Boolean(scoreboard.enabled), title: score.title ?? initialEditor.scoreboard.title, lines: Array.isArray(score.lines) ? [...score.lines] : [...initialEditor.scoreboard.lines], interval: scoreboard.updateIntervalTicks ?? 20 },
      actionbar: { enabled: Boolean(config.actionBarEnabled), preview: initialEditor.actionbar.preview },
      bossbar: { enabled: Boolean(bossbar.enabled), title: boss.title ?? initialEditor.bossbar.title, value: boss.value ?? "{online}", max: boss.max ?? "{max}", color: boss.color ?? "purple", style: boss.style ?? "solid", permission: boss.permission ?? "", worlds: Array.isArray(boss.worlds) ? boss.worlds.join(", ") : "" }
    };
    state.baseline = clone(state.editor);
    syncBindings(); render(); updateConnectionUi();
  }

  function refreshPlayerSelect() {
    const select = $("#playerSelect");
    select.replaceChildren();
    const demo = document.createElement("option"); demo.value = "demo"; demo.textContent = "Demo-Spieler"; select.append(demo);
    state.players.filter(player => player.id !== "demo").forEach(player => { const option = document.createElement("option"); option.value = player.id; option.textContent = `${player.name} · ${player.ping} ms`; select.append(option); });
    if (!state.players.some(player => player.id === state.selectedPlayerId)) state.selectedPlayerId = "demo";
    select.value = state.selectedPlayerId;
  }

  function request(op, payload = {}, timeoutMs = 8000) {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Keine offene Verbindung."));
    const id = `web-${++state.requestSequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { state.pending.delete(id); reject(new Error(`${op} hat zu lange gebraucht.`)); }, timeoutMs);
      state.pending.set(id, { resolve, reject, timer });
      state.socket.send(JSON.stringify({ id, op, ...payload }));
    });
  }

  function onSocketMessage(event) {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === "VALUES_DELTA" && message.data) { applyWireValues(message.data.values); render(); return; }
    if (!message.id || !state.pending.has(message.id)) return;
    const pending = state.pending.get(message.id); state.pending.delete(message.id); clearTimeout(pending.timer);
    if (message.ok) pending.resolve(message.data);
    else pending.reject(new Error(message.error?.message || message.error?.code || "Anfrage abgelehnt"));
  }

  async function connect() {
    if (state.connected) { disconnect(true); return; }
    const urlText = $("#socketUrl").value.trim();
    const token = $("#authToken").value;
    let url;
    try { url = new URL(urlText); } catch { return showToast("Bitte gib eine gültige WebSocket-Adresse ein.", true); }
    if (!["ws:", "wss:"].includes(url.protocol)) return showToast("Die Adresse muss mit ws:// oder wss:// beginnen.", true);
    if (location.protocol === "https:" && url.protocol !== "wss:") return showToast("Diese HTTPS-Seite darf sich nur per wss:// verbinden.", true);
    if (token.length < 32) return showToast("Der Bridge-Token muss mindestens 32 Zeichen lang sein.", true);
    localStorage.setItem("neotab.socketUrl", url.href);
    state.connecting = true; state.intentionalClose = false; updateConnectionUi();
    try {
      const socket = new WebSocket(url.href);
      state.socket = socket;
      socket.addEventListener("message", onSocketMessage);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Verbindungs-Timeout")), 8000);
        socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
        socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("WebSocket nicht erreichbar")); }, { once: true });
      });
      socket.addEventListener("close", event => handleSocketClose(event));
      await request("AUTH", { token });
      state.connected = true; state.connecting = false; updateConnectionUi();
      $("#authToken").value = "";
      const [capabilities, config, players, preview] = await Promise.all([
        request("GET_CAPABILITIES"), request("GET_CONFIG"), request("GET_PLAYERS"), request("PATCH_PREVIEW", { action: "open" })
      ]);
      state.capabilities = capabilities;
      updateConnectionUi();
      state.preview = preview;
      state.players = [DEMO_PLAYER, ...(players || [])];
      refreshPlayerSelect(); configToEditor(config);
      openConnection(false);
      showToast("Mit NeoTab verbunden – Live-Daten sind aktiv.");
      scheduleLiveSubscription();
    } catch (error) {
      state.connecting = false;
      showToast(error.message || "Verbindung fehlgeschlagen.", true);
      disconnect(false);
    }
  }

  function handleSocketClose(event) {
    const unexpected = !state.intentionalClose && state.connected;
    cleanupConnection();
    if (unexpected) showToast(`Live-Verbindung getrennt${event.reason ? `: ${event.reason}` : "."}`, true);
  }

  function disconnect(notify = false) {
    state.intentionalClose = true;
    const socket = state.socket;
    cleanupConnection();
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, "Editor disconnected");
    if (notify) showToast("Live-Verbindung getrennt.");
  }

  function cleanupConnection() {
    state.connected = false; state.connecting = false; state.saving = false; state.socket = null; state.capabilities = null; state.configRevision = null; state.subscriptionId = null; state.preview = null; state.liveValues.clear();
    state.pending.forEach(pending => { clearTimeout(pending.timer); pending.reject(new Error("Verbindung geschlossen.")); }); state.pending.clear();
    state.players = [DEMO_PLAYER]; state.selectedPlayerId = "demo"; $("#authToken").value = ""; $("#writeToken").value = "";
    refreshPlayerSelect(); updateConnectionUi(); render();
  }

  async function refreshPlayers() {
    if (!state.connected) return showToast("Verbinde zuerst einen NeoTab-Server.", true);
    try { const players = await request("GET_PLAYERS"); state.players = [DEMO_PLAYER, ...(players || [])]; refreshPlayerSelect(); render(); showToast("Spielerliste aktualisiert."); }
    catch (error) { showToast(error.message, true); }
  }

  function allowedLivePlaceholder(value) {
    if (!state.capabilities) return false;
    if ((state.capabilities.builtInPlaceholders || []).includes(value)) return true;
    if (!value.startsWith("%")) return false;
    const body = value.slice(1, -1).toLowerCase();
    return (state.capabilities.placeholderApiPrefixes || []).some(prefix => {
      const normalized = String(prefix).toLowerCase().replace(/^%|%$/g, "");
      return body === normalized || body.startsWith(`${normalized}_`);
    });
  }

  function scheduleLiveSubscription() {
    clearTimeout(state.liveDebounce);
    state.liveDebounce = setTimeout(updateLiveSubscription, 300);
  }

  async function updateLiveSubscription() {
    if (!state.connected || selectedPlayer().id === "demo") return render();
    const placeholders = collectPlaceholders().filter(allowedLivePlaceholder);
    const values = placeholders.map(placeholder => ({ playerId: selectedPlayer().id, placeholder }));
    try {
      if (state.subscriptionId) { await request("UNSUBSCRIBE_VALUES", { subscriptionId: state.subscriptionId }); state.subscriptionId = null; }
      state.liveValues.clear();
      if (!values.length) return render();
      const resolved = await request("RESOLVE_PLACEHOLDERS", { values }); applyWireValues(resolved);
      const subscriptionId = `preview-${Date.now().toString(36)}`;
      await request("SUBSCRIBE_VALUES", { subscriptionId, intervalTicks: 20, values });
      state.subscriptionId = subscriptionId; render();
    } catch (error) { showToast(`Live-Werte: ${error.message}`, true); }
  }

  function applyWireValues(values) {
    (values || []).forEach(entry => state.liveValues.set(`${entry.playerId}\u0000${entry.placeholder}`, String(entry.value ?? "")));
  }

  function schedulePreviewPatch(path, value) {
    if (!state.connected || !state.preview) return;
    clearTimeout(state.patchDebounce);
    state.patchDebounce = setTimeout(() => enqueuePreviewPatch(PREVIEW_PATHS[path], value), 180);
  }

  function enqueuePreviewPatch(path, value) {
    state.previewQueue = state.previewQueue.then(async () => {
      if (!state.connected || !state.preview) return;
      try {
        state.preview = await request("PATCH_PREVIEW", { action: "patch", sessionId: state.preview.sessionId, revision: state.preview.revision, values: { [path]: value } });
      } catch (error) { showToast(`Preview-Sync: ${error.message}`, true); }
    });
  }

  function resetEditor() { state.editor = clone(state.baseline); syncBindings(); render(); scheduleLiveSubscription(); showToast("Vorschau zurückgesetzt."); }

  function exportPreview() {
    const payload = { format: "NeoTab Studio Preview", exportedAt: new Date().toISOString(), warning: "Preview only – not a complete NeoTab config", values: state.editor };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "neotab-preview.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
    showToast("Preview als JSON exportiert.");
  }

  function writableConfigValues(editor = state.editor) {
    return {
      "server-name": editor.tab.serverName,
      "ram-format": editor.tab.footer,
      "animation-style": editor.tab.animationStyle,
      "custom-colors": [...editor.tab.colors],
      "update-interval-ticks": Number(editor.tab.interval),
      "scoreboard.enabled": Boolean(editor.scoreboard.enabled),
      "scoreboard.title": editor.scoreboard.title,
      "scoreboard.lines": [...editor.scoreboard.lines],
      "scoreboard.update-interval-ticks": Number(editor.scoreboard.interval),
      "extras.actionbar.enabled": Boolean(editor.actionbar.enabled),
      "bossbar.enabled": Boolean(editor.bossbar.enabled),
      "bossbar.title": editor.bossbar.title,
      "bossbar.value": editor.bossbar.value,
      "bossbar.max": editor.bossbar.max,
      "bossbar.color": editor.bossbar.color,
      "bossbar.style": editor.bossbar.style,
      "bossbar.conditions.permission": editor.bossbar.permission,
      "bossbar.conditions.worlds": editor.bossbar.worlds.split(",").map(value => value.trim()).filter(Boolean)
    };
  }

  function changedConfigValues() {
    const current = writableConfigValues(state.editor);
    const baseline = writableConfigValues(state.baseline);
    return Object.fromEntries(Object.entries(current).filter(([path, value]) => JSON.stringify(value) !== JSON.stringify(baseline[path])));
  }

  async function saveConfig() {
    if (!state.connected || !(state.capabilities?.operations || []).includes("SAVE_CONFIG")) {
      return showToast("Config-Speichern ist auf diesem Server nicht freigeschaltet.", true);
    }
    const writeToken = $("#writeToken").value;
    if (writeToken.length < 32) return showToast("Zum Speichern wird der separate Schreib-Token benötigt.", true);
    if (!Number.isInteger(state.configRevision)) return showToast("Keine gültige Config-Revision geladen.", true);
    const values = changedConfigValues();
    if (!Object.keys(values).length) return showToast("Es gibt keine Änderungen zum Speichern.");
    clearTimeout(state.patchDebounce);
    state.saving = true; updateConnectionUi();
    try {
      await state.previewQueue;
      const snapshot = await request("SAVE_CONFIG", {
        expectedRevision: state.configRevision,
        writeToken,
        values
      }, 15000);
      configToEditor(snapshot);
      state.preview = await request("PATCH_PREVIEW", { action: "open" });
      showToast("Config atomar gespeichert und NeoTab neu geladen.");
    } catch (error) {
      showToast(`Speichern fehlgeschlagen: ${error.message}`, true);
    } finally {
      state.saving = false; updateConnectionUi();
    }
  }

  function initialize() {
    const storedUrl = localStorage.getItem("neotab.socketUrl"); if (storedUrl) $("#socketUrl").value = storedUrl;
    $$(".nav-item").forEach(item => item.addEventListener("click", () => navigate(item.dataset.surface)));
    $$('[data-bind]').forEach(input => input.addEventListener(input.tagName === "SELECT" || input.type === "checkbox" ? "change" : "input", () => readBinding(input)));
    $("#connectionState").addEventListener("click", () => openConnection($("#connectionPanel").hidden));
    $("#closeConnection").addEventListener("click", () => openConnection(false));
    $("#connectButton").addEventListener("click", connect);
    $("#authToken").addEventListener("keydown", event => { if (event.key === "Enter") connect(); });
    $("#refreshPlayers").addEventListener("click", refreshPlayers);
    $("#playerSelect").addEventListener("change", event => { state.selectedPlayerId = event.target.value; render(); scheduleLiveSubscription(); });
    $("#addScoreboardLine").addEventListener("click", addScoreboardLine);
    $("#resetButton").addEventListener("click", resetEditor);
    $("#exportButton").addEventListener("click", exportPreview);
    $("#saveButton").addEventListener("click", saveConfig);
    $$(".viewport-switch button").forEach(button => button.addEventListener("click", () => { $$(".viewport-switch button").forEach(item => item.classList.toggle("active", item === button)); $("#minecraftFrame").classList.toggle("compact", button.dataset.scale === "compact"); }));
    window.addEventListener("beforeunload", () => { state.intentionalClose = true; state.socket?.close(); });
    syncBindings(); refreshPlayerSelect(); updateConnectionUi(); render();
  }

  initialize();
})();
