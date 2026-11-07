import './style.css';
import { generateWorld, getTile, type World } from './world/world';
import { BUILDINGS, RESOURCE_KEYS, canBuild, createGame, housing, placeBuilding, storageCapacity, tickGame, workingAdults, type BuildingType, type GameState, type Resource } from './simulation/game';
import { saveGame, loadGame } from './storage/save';
import { GameRenderer } from './render/GameRenderer';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<div id="scene"></div><div id="game" class="game-ui hidden">
  <div class="topbar"><div class="resource-wrap"><div class="resources" id="resources" aria-label="Vorräte und Bevölkerung"></div><div class="resource-info hidden" id="resource-info" role="status"></div></div><div class="top-controls"><button class="icon-button" id="pause" aria-label="Pause">Ⅱ</button><button class="icon-button" id="speed" aria-label="Spielgeschwindigkeit">1×</button><button class="icon-button" id="save" aria-label="Spiel speichern">↓</button><button class="icon-button" id="settings" aria-label="Einstellungen">⚙</button></div></div>
  <div class="left-info"><div class="status-card" id="status"></div><div class="hint-card">Ein Finger: bewegen · Zwei Finger: zoomen & drehen<br>Am Desktop: ziehen, Mausrad & rechte Maustaste</div></div>
  <div class="bottom"><div class="detail-card hidden" id="detail"></div><div class="shop-row"><button class="shop-toggle" id="shop-toggle" aria-expanded="false" aria-controls="build-panel" aria-label="Baumenü öffnen"><span aria-hidden="true">⚒</span><small>Bauen</small></button><div class="build-panel" id="build-panel" aria-hidden="true" inert><div class="build-heading"><strong>Dein Dorf bauen</strong><small>Wischen →</small></div><div class="build-list" id="build-list"></div></div></div></div><div class="toast hidden" id="toast"></div></div>
  <div id="menu" class="menu-screen"><div class="menu-content"><div class="eyebrow">Ein kleines Aufbauspiel</div><h1 class="brand">Inselzeit<span style="color:#e8bd70">.</span></h1><p>Eine unbekannte Küste, fünf Menschen und die Freiheit, etwas Eigenes aufzubauen.</p><div class="menu-card"><div class="eyebrow" style="color:#a18858">Deine Reise beginnt hier</div><h2>Eine neue Welt wartet.</h2><div class="muted">Jeder Seed erschafft eine eigene, beständige Insel.</div><label for="seed">Welt-Seed</label><div class="seed-row"><input id="seed" value="839274" maxlength="40" autocomplete="off" aria-label="Welt-Seed"><button class="primary" id="new-game">Los geht’s →</button></div><div class="menu-actions"><button class="secondary" id="load-game">Gespeichertes Spiel laden</button><button class="secondary" id="menu-settings">Einstellungen</button><button class="secondary" id="help">Steuerung</button></div></div><div class="menu-foot">Mit Sorgfalt gebaut · Lokal gespeichert · Für kleine und große Bildschirme</div></div></div><div id="modal-root"></div>`;
const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const scene = $<HTMLDivElement>('#scene'), gameUI = $('#game'), menu = $('#menu'), detail = $('#detail'), toast = $('#toast');
let state: GameState | null = null, world: World | null = null, renderer: GameRenderer | null = null;
let selected: BuildingType | null = null, preview: {x:number;z:number} | null = null, inspectedId: number | null = null;
let paused = false, speed = 1, previous = performance.now(), uiElapsed = 0, saveElapsed = 0, lastRender = 0;
let shopOpen = false, resourceInfo: Resource | 'population' | null = null;
let lowPower = localStorage.getItem('inselzeit-low-power') === '1';
const labels: Record<Resource, string> = {wood:'Holz',stone:'Stein',food:'Nahrung',iron:'Eisen'};
// Inline vector icons render consistently even when an emoji font is unavailable.
const icon = (content: string) => `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">${content}</svg>`;
const icons: Record<Resource, string> = {
 wood: icon('<path fill="#98714b" d="M3 8.5 16 4l4 3v8L7 20l-4-3z"/><path fill="#d4ad78" d="M3 8.5 7 6l4 3.5-4 2z"/><path fill="none" stroke="#705138" stroke-width="1.2" d="M7 11.5V20M10 13l8-3M10 16l8-3"/>'),
 stone: icon('<path fill="#7e9187" d="m3 16 3-8 6-4 6 2 3 9-4 5H7z"/><path fill="#b6c5b6" d="m6 8 6-4 6 2-4 4-5 1z"/><path fill="#64786f" d="m14 10 4-4 3 9-4 5z"/>'),
 food: icon('<path fill="none" stroke="#cda655" stroke-width="1.8" stroke-linecap="round" d="M12 21V8M12 13 7 9M12 16l5-5"/><path fill="#e8c675" d="M12 2c-3 3-3 6 0 8 3-2 3-5 0-8M4 6c0 4 2 6 6 6 0-4-2-6-6-6M20 7c0 4-2 6-6 6 0-4 2-6 6-6"/>'),
 iron: icon('<path fill="#80969a" d="M6 8h12l3 9-2 3H5l-2-3z"/><path fill="#bdcfcb" d="m6 8 2-4h8l2 4z"/><path fill="#a0b5b3" d="M7 11h10l1.5 5h-13z"/>')
};
const peopleIcon = icon('<circle cx="9" cy="7" r="3" fill="#e3bd82"/><circle cx="17" cy="8" r="2.5" fill="#d5ac79"/><path d="M3 19c0-4 2-7 6-7s6 3 6 7z" fill="#9dc7b1"/><path d="M14 13c4-1 7 2 7 6h-5c0-2-.6-4-2-6" fill="#80a8a3"/>');
const buildingIcons: Record<BuildingType, string> = {
 house: icon('<path fill="#e5ce9f" d="M5 10h14v10H5z"/><path fill="#ba7458" d="m2 11 10-8 10 8-2 2-8-6-8 6z"/><path fill="#725e4b" d="M10 14h4v6h-4z"/>'),
 farm: icon('<path fill="#b79263" d="M2 15h20v6H2z"/><path stroke="#e0c083" stroke-width="1.4" d="M3 18h18M7 15l-2 6M13 15l-2 6M19 15l-2 6"/><path fill="#dfcca4" d="M5 8h8v7H5z"/><path fill="#b66f50" d="m3 9 6-5 6 5z"/>'),
 lumber: icon('<path fill="#907052" d="m6 21 9-14 2 1-9 14z"/><path fill="#b4c5b8" d="M14 5c3-3 6-2 8 0l-5 5-3-2z"/><path fill="#769889" d="M4 10 8 3l4 7z"/>'),
 quarry: icon('<path fill="#7e9187" d="m3 16 3-8 6-4 6 2 3 9-4 5H7z"/><path fill="#b6c5b6" d="m6 8 6-4 6 2-4 4-5 1z"/><path fill="#64786f" d="m14 10 4-4 3 9-4 5z"/>'),
 mine: icon('<path fill="#a17c55" d="m4 20 12-14 2 2L6 22z"/><path fill="#b8c8c2" d="M10 5c4-4 9-3 12 1-4-1-6 0-8 2z"/>'),
 warehouse: icon('<path fill="#ddc79d" d="M4 9h16v11H4z"/><path fill="#8f7151" d="M3 7h18v3H3zM6 14h5v6H6zm7-2h5v8h-5z"/><path fill="#bd9670" d="M7 15h3v2H7zm7-2h3v2h-3z"/>')
};
let toastTimer = 0;
function notify(message: string) { toast.textContent = message; toast.classList.remove('hidden'); window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => toast.classList.add('hidden'), 3500); }
function modal(content: string) { $('#modal-root').innerHTML = `<div class="modal-backdrop"><div class="modal">${content}</div></div>`; $('#modal-root').querySelector('[data-close]')?.addEventListener('click', closeModal); }
function closeModal() { $('#modal-root').innerHTML = ''; }
function showSettings() {
 modal(`<div class="eyebrow" style="color:#a18858">Inselzeit</div><h2>Einstellungen</h2><p>Die Darstellung lässt sich für mobile Geräte sparsamer einstellen.</p><label class="settings-line">Bildrate <select id="frame-setting"><option value="0">Flüssig (bis 60 FPS)</option><option value="1">Energiesparend (bis 30 FPS)</option></select></label><div class="modal-actions"><button class="primary" data-close>Fertig</button></div>`);
 const input = $<HTMLSelectElement>('#frame-setting'); input.value = lowPower ? '1' : '0'; input.onchange = () => { lowPower = input.value === '1'; localStorage.setItem('inselzeit-low-power', lowPower ? '1' : '0'); };
}
function showHelp() { modal(`<div class="eyebrow" style="color:#a18858">Willkommen an Bord</div><h2>So steuerst du</h2><p>Bewege die Karte mit einem Finger. Mit zwei Fingern zoomst und drehst du. Am Computer: linke Maustaste zum Verschieben, rechte zum Drehen und Mausrad zum Zoomen.</p><p>Öffne unten links das Baumenü, wähle ein Gebäude und tippe auf die Landschaft. Tippe auf einen Vorrat, um seine Produktion und seinen Verbrauch zu sehen. Die farbige Vorschau zeigt, ob der Platz geeignet ist. Bestätige den Bau im Infofenster. Tippe ein bestehendes Gebäude an, um mehr zu erfahren.</p><div class="modal-actions"><button class="primary" data-close>Verstanden</button></div>`); }
function startGame(next: GameState) {
 try {
  renderer?.dispose(); state = next; world = generateWorld(next.seed); selected = null; preview = null; inspectedId = null; paused = false; speed = 1;
  renderer = new GameRenderer(scene, world, {onTileTap: onTileTap, onHoverTile: onHoverTile});
  menu.classList.add('hidden'); gameUI.classList.remove('hidden'); previous = performance.now(); saveElapsed = 0;
  setShop(false); resourceInfo = null; drawResources(); drawBuildList(); updateUI(); syncRenderer();
 } catch (error) { console.error(error); notify('Die 3D-Welt konnte nicht gestartet werden. Bitte WebGL im Browser aktivieren.'); alert('Die 3D-Welt konnte nicht gestartet werden. Bitte WebGL im Browser aktivieren.'); }
}
function setShop(open: boolean) {
 shopOpen = open;
 const panel = $('#build-panel');
 panel.classList.toggle('open', open); panel.toggleAttribute('inert', !open); panel.setAttribute('aria-hidden', String(!open));
 const button = $('#shop-toggle'); button.setAttribute('aria-expanded', String(open)); button.setAttribute('aria-label', open ? 'Baumenü schließen' : 'Baumenü öffnen');
 button.classList.toggle('active', open);
}
function drawResources() {
 const keys: Array<Resource | 'population'> = [...RESOURCE_KEYS, 'population'];
 $('#resources').innerHTML = keys.map(key => `<button class="resource resource-${key}" data-resource="${key}" aria-expanded="false" aria-controls="resource-info"><span class="resource-top"><span class="resource-icon" aria-hidden="true">${key === 'population' ? peopleIcon : icons[key]}</span><span class="resource-value"></span></span><span class="resource-track" aria-hidden="true"><span class="resource-fill"></span></span></button>`).join('');
 document.querySelectorAll<HTMLButtonElement>('[data-resource]').forEach(button => button.onclick = () => {
  const key = button.dataset.resource as Resource | 'population'; resourceInfo = resourceInfo === key ? null : key; updateResourceInfo();
 });
}
function updateResourceInfo() {
 if (!state) return;
 const info = $('#resource-info');
 document.querySelectorAll<HTMLButtonElement>('[data-resource]').forEach(button => button.setAttribute('aria-expanded', String(button.dataset.resource === resourceInfo)));
 if (!resourceInfo) { info.classList.add('hidden'); return; }
 if (resourceInfo === 'population') {
  const capacity = housing(state), people = state.population.length;
  const housingText = people > capacity ? `${people - capacity} ohne Wohnplatz` : `${capacity - people} freie Wohnplätze`;
  info.innerHTML = `<strong>Bevölkerung</strong><span>${people} Menschen · ${capacity} Wohnplätze</span><span>${housingText} · ${workingAdults(state)} arbeitsfähig</span>`;
 } else {
  const key = resourceInfo, p = state.rates.production[key], c = state.rates.consumption[key];
  info.innerHTML = `<strong>${icons[key]} ${labels[key]}</strong><span>${Math.floor(state.resources[key])} / ${storageCapacity(state)} im Lager</span><span>+${p.toFixed(1)} produziert · −${c.toFixed(1)} verbraucht / Jahr</span>`;
 }
 info.classList.remove('hidden');
}
function drawBuildList() {
 $('#build-list').innerHTML = (Object.keys(BUILDINGS) as BuildingType[]).map(type => `<button class="build-item ${selected === type ? 'active' : ''}" data-type="${type}"><span class="emoji">${buildingIcons[type]}</span>${BUILDINGS[type].name}</button>`).join('');
 document.querySelectorAll<HTMLButtonElement>('[data-type]').forEach(button => button.onclick = () => { const type = button.dataset.type as BuildingType; selected = selected === type ? null : type; inspectedId = null; preview = null; renderer?.clearPreview(); drawBuildList(); setShop(false); updateDetail(); });
}
function onTileTap(x: number, z: number) {
 if (!state || !world) return;
 if (selected) { preview = {x,z}; renderer?.setPreview(selected,x,z,canBuild(state,world,selected,x,z).ok); updateDetail(); return; }
 const building = state.buildings.find(b => Math.abs(b.x-x) <= 1 && Math.abs(b.z-z) <= 1);
 inspectedId = building?.id ?? null; updateDetail();
}
function onHoverTile(x: number, z: number) { if (selected && !preview && state && world) renderer?.setPreview(selected,x,z,canBuild(state,world,selected,x,z).ok); }
function costText(type: BuildingType) { return RESOURCE_KEYS.filter(k => BUILDINGS[type].cost[k]).map(k => `${icons[k]} ${BUILDINGS[type].cost[k]} ${labels[k]}`).join(' &nbsp; '); }
function updateDetail() {
 if (!state || !world) return;
 if (selected) {
  const def = BUILDINGS[selected], check = preview ? canBuild(state,world,selected,preview.x,preview.z) : null;
  const tile = preview ? getTile(world,preview.x,preview.z) : undefined;
  detail.classList.remove('hidden');
  detail.innerHTML = `<div class="detail-header"><div><div class="eyebrow">Bauplanung</div><h3>${buildingIcons[selected]} ${def.name}</h3></div><div class="costs">${costText(selected)}</div></div><p>${def.description}</p><p class="placement-message ${check?.ok ? 'valid' : ''}">${check ? check.reason : 'Tippe auf eine Stelle für die Vorschau.'}${tile && selected === 'farm' ? ` Fruchtbarkeit: ${Math.round(tile.fertility*100)} %.` : ''}</p><div class="detail-actions"><button class="primary" id="confirm-build" ${!check?.ok ? 'disabled' : ''}>Hier bauen</button><button class="secondary" id="cancel-build">Abbrechen</button></div>`;
  $('#cancel-build').onclick = () => { selected = null; preview = null; renderer?.clearPreview(); drawBuildList(); updateDetail(); };
  $('#confirm-build').onclick = () => { if (!state || !world || !selected || !preview) return; const result = placeBuilding(state,world,selected,preview.x,preview.z); if (result.ok) { notify(`${BUILDINGS[selected].name} gebaut.`); selected = null; preview = null; renderer?.clearPreview(); drawBuildList(); syncRenderer(); updateUI(); updateDetail(); } else notify(result.reason); };
 } else if (inspectedId !== null) {
  const building = state.buildings.find(b => b.id === inspectedId); if (!building) { detail.classList.add('hidden'); return; }
  const def = BUILDINGS[building.type]; const production = RESOURCE_KEYS.filter(k => building.production[k] > 0).map(k => `${labels[k]} +${building.production[k].toFixed(1)}/Jahr`).join(' · ') || 'Aktuell keine Produktion';
  detail.classList.remove('hidden'); detail.innerHTML = `<div class="eyebrow">Dein Dorf</div><h3>${buildingIcons[building.type]} ${def.name}</h3><p>${def.description}</p><p>${def.jobs ? `Arbeitskräfte: ${building.workers} / ${def.jobs}<br>${production}` : def.capacity ? `Wohnplätze: ${def.capacity}` : `Lagerkapazität je Ressource: ${storageCapacity(state)}`}</p><button class="secondary" id="close-detail">Schließen</button>`; $('#close-detail').onclick = () => { inspectedId = null; updateDetail(); };
 } else detail.classList.add('hidden');
}
function updateUI() {
 if (!state) return;
 document.querySelectorAll<HTMLButtonElement>('[data-resource]').forEach(button => {
  const key = button.dataset.resource as Resource | 'population';
  const isPopulation = key === 'population';
  const value = isPopulation ? state!.population.length : state!.resources[key];
  const capacity = isPopulation ? housing(state!) : storageCapacity(state!);
  const overfull = isPopulation && value > capacity;
  const percentage = capacity > 0 ? Math.min(100, value / capacity * 100) : value > 0 ? 100 : 0;
  button.querySelector<HTMLElement>('.resource-value')!.textContent = String(Math.floor(value));
  button.querySelector<HTMLElement>('.resource-fill')!.style.width = `${percentage}%`;
  button.classList.toggle('overfull', overfull);
  const name = isPopulation ? 'Bevölkerung' : labels[key];
  button.setAttribute('aria-label', isPopulation ? `${name}: ${value} Menschen, ${capacity} Wohnplätze${overfull ? ', Wohnraum fehlt' : ''}. Details anzeigen` : `${name}: ${Math.floor(value)} von ${capacity}. Details anzeigen`);
 });
 updateResourceInfo();
 const year = 1 + Math.floor(state.time / 60), arrival = state.arrival;
 const message = arrival.phase === 'sailing' ? (arrival.initial ? 'Die ersten Siedler sind auf dem Weg.' : 'Ein Schiff mit neuen Siedlern nähert sich.') : arrival.phase === 'landing' ? 'Das Schiff legt an der Küste an.' : state.population.length ? 'Ein neuer Anfang an dieser Küste.' : 'Deine Insel wartet auf Bewohner.';
 $('#status').innerHTML = `<div class="status-main"><strong>Jahr ${year}</strong><span>☼ ${Math.round(state.happiness*100)} %</span></div><p>${paused ? 'Pausiert' : message}</p>`;
 $('#pause').textContent = paused ? '▶' : 'Ⅱ'; $('#pause').setAttribute('aria-label',paused ? 'Fortsetzen' : 'Pause'); $('#speed').textContent = `${speed}×`;
 if (inspectedId !== null) updateDetail();
}
function syncRenderer() { if (!state || !renderer) return; renderer.setBuildings(state.buildings); renderer.setArrival(state.arrival); renderer.setPopulation(state.population.length); }
async function save(quiet = false) { if (!state) return; try { await saveGame(state); if (!quiet) notify('Spielstand gespeichert.'); } catch (error) { console.error(error); if (!quiet) notify('Speichern fehlgeschlagen. Bitte Browser-Speicher prüfen.'); } }
$('#new-game').onclick = () => startGame(createGame($<HTMLInputElement>('#seed').value.trim() || '839274'));
$('#load-game').onclick = async () => { try { const record = await loadGame(); if (record) startGame(record.state); else alert('Noch kein Spielstand vorhanden.'); } catch (error) { console.error(error); alert('Der Spielstand konnte nicht geladen werden.'); } };
$('#settings').onclick = showSettings; $('#menu-settings').onclick = showSettings; $('#help').onclick = showHelp;
$('#shop-toggle').onclick = () => setShop(!shopOpen);
$('#pause').onclick = () => { paused = !paused; updateUI(); };
$('#speed').onclick = () => { speed = speed === 1 ? 2 : speed === 2 ? 4 : 1; updateUI(); };
$('#save').onclick = () => { void save(); };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void save(true); else previous = performance.now(); });
window.addEventListener('pagehide', () => { void save(true); });
function frame(now: number) { requestAnimationFrame(frame); const delta = Math.min((now-previous)/1000,.25); previous = now; if (!state || !world || !renderer) return;
 if (!paused && document.visibilityState === 'visible') { tickGame(state,delta*speed,world); saveElapsed += delta; if (saveElapsed >= 30) { saveElapsed = 0; void save(true); } }
 uiElapsed += delta; if (uiElapsed >= .3) { uiElapsed = 0; updateUI(); syncRenderer(); }
 if (now - lastRender >= (lowPower ? 1000/30 : 1000/60)) { const arrival = state.arrival; renderer.setArrival({ ...arrival, progress: Math.min(1, arrival.progress + (paused ? 0 : state.tickRemainder / (arrival.phase === 'sailing' ? 8 : 3))) }); renderer.render(Math.min((now-lastRender)/1000,.25)); lastRender = now; }
}
requestAnimationFrame(frame);
if ('serviceWorker' in navigator && import.meta.env.PROD) window.addEventListener('load', () => { navigator.serviceWorker.register('/wgv1/sw.js', { scope: '/wgv1/' }).catch(console.error); });
