import './style.css';
import { generateWorld, getTile, type World } from './world/world';
import { BUILDINGS, RESOURCE_KEYS, canBuild, createGame, housing, placeBuilding, storageCapacity, tickGame, workingAdults, type BuildingType, type GameState, type Resource } from './simulation/game';
import { saveGame, loadGame } from './storage/save';
import { GameRenderer } from './render/GameRenderer';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<div id="scene"></div><div id="game" class="game-ui hidden">
  <div class="topbar"><div class="logo"><strong>Inselzeit</strong><small>Deine kleine Welt</small></div><div class="resources" id="resources"></div><div class="top-controls"><button class="icon-button" id="pause" aria-label="Pause">Ⅱ</button><button class="icon-button" id="speed" aria-label="Spielgeschwindigkeit">1×</button><button class="icon-button" id="save" aria-label="Spiel speichern">↓</button><button class="icon-button" id="settings" aria-label="Einstellungen">⚙</button></div></div>
  <div class="left-info"><div class="status-card" id="status"></div><div class="hint-card">Ein Finger: bewegen · Zwei Finger: zoomen & drehen<br>Am Desktop: ziehen, Mausrad & rechte Maustaste</div></div>
  <div class="bottom"><div class="detail-card hidden" id="detail"></div><div class="build-panel"><div class="build-heading"><strong>Dein Dorf bauen</strong><small>Wähle ein Gebäude und tippe auf die Insel</small></div><div class="build-list" id="build-list"></div></div></div><div class="toast hidden" id="toast"></div></div>
  <div id="menu" class="menu-screen"><div class="menu-content"><div class="eyebrow">Ein kleines Aufbauspiel</div><h1 class="brand">Inselzeit<span style="color:#e8bd70">.</span></h1><p>Eine unbekannte Küste, fünf Menschen und die Freiheit, etwas Eigenes aufzubauen.</p><div class="menu-card"><div class="eyebrow" style="color:#a18858">Deine Reise beginnt hier</div><h2>Eine neue Welt wartet.</h2><div class="muted">Jeder Seed erschafft eine eigene, beständige Insel.</div><label for="seed">Welt-Seed</label><div class="seed-row"><input id="seed" value="839274" maxlength="40" autocomplete="off" aria-label="Welt-Seed"><button class="primary" id="new-game">Los geht’s →</button></div><div class="menu-actions"><button class="secondary" id="load-game">Gespeichertes Spiel laden</button><button class="secondary" id="menu-settings">Einstellungen</button><button class="secondary" id="help">Steuerung</button></div></div><div class="menu-foot">Mit Sorgfalt gebaut · Lokal gespeichert · Für kleine und große Bildschirme</div></div></div><div id="modal-root"></div>`;
const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const scene = $<HTMLDivElement>('#scene'), gameUI = $('#game'), menu = $('#menu'), detail = $('#detail'), toast = $('#toast');
let state: GameState | null = null, world: World | null = null, renderer: GameRenderer | null = null;
let selected: BuildingType | null = null, preview: {x:number;z:number} | null = null, inspectedId: number | null = null;
let paused = false, speed = 1, previous = performance.now(), uiElapsed = 0, saveElapsed = 0, lastRender = 0;
let lowPower = localStorage.getItem('inselzeit-low-power') === '1';
const labels: Record<Resource, string> = {wood:'Holz',stone:'Stein',food:'Nahrung',iron:'Eisen'};
const icons: Record<Resource, string> = {wood:'🪵',stone:'🪨',food:'🌾',iron:'⛓'};
const buildingIcons: Record<BuildingType, string> = {house:'🏠',farm:'🌾',lumber:'🪓',quarry:'🪨',mine:'⛏',warehouse:'📦'};
let toastTimer = 0;
function notify(message: string) { toast.textContent = message; toast.classList.remove('hidden'); window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => toast.classList.add('hidden'), 3500); }
function modal(content: string) { $('#modal-root').innerHTML = `<div class="modal-backdrop"><div class="modal">${content}</div></div>`; $('#modal-root').querySelector('[data-close]')?.addEventListener('click', closeModal); }
function closeModal() { $('#modal-root').innerHTML = ''; }
function showSettings() {
 modal(`<div class="eyebrow" style="color:#a18858">Inselzeit</div><h2>Einstellungen</h2><p>Die Darstellung lässt sich für mobile Geräte sparsamer einstellen.</p><label class="settings-line">Bildrate <select id="frame-setting"><option value="0">Flüssig (bis 60 FPS)</option><option value="1">Energiesparend (bis 30 FPS)</option></select></label><div class="modal-actions"><button class="primary" data-close>Fertig</button></div>`);
 const input = $<HTMLSelectElement>('#frame-setting'); input.value = lowPower ? '1' : '0'; input.onchange = () => { lowPower = input.value === '1'; localStorage.setItem('inselzeit-low-power', lowPower ? '1' : '0'); };
}
function showHelp() { modal(`<div class="eyebrow" style="color:#a18858">Willkommen an Bord</div><h2>So steuerst du</h2><p>Bewege die Karte mit einem Finger. Mit zwei Fingern zoomst und drehst du. Am Computer: linke Maustaste zum Verschieben, rechte zum Drehen und Mausrad zum Zoomen.</p><p>Wähle unten ein Gebäude und tippe auf die Landschaft. Die farbige Vorschau zeigt, ob der Platz geeignet ist. Bestätige den Bau im Infofenster. Tippe ein bestehendes Gebäude an, um mehr zu erfahren.</p><div class="modal-actions"><button class="primary" data-close>Verstanden</button></div>`); }
function startGame(next: GameState) {
 try {
  renderer?.dispose(); state = next; world = generateWorld(next.seed); selected = null; preview = null; inspectedId = null; paused = false; speed = 1;
  renderer = new GameRenderer(scene, world, {onTileTap: onTileTap, onHoverTile: onHoverTile});
  menu.classList.add('hidden'); gameUI.classList.remove('hidden'); previous = performance.now(); saveElapsed = 0;
  drawBuildList(); updateUI(); syncRenderer();
 } catch (error) { console.error(error); notify('Die 3D-Welt konnte nicht gestartet werden. Bitte WebGL im Browser aktivieren.'); alert('Die 3D-Welt konnte nicht gestartet werden. Bitte WebGL im Browser aktivieren.'); }
}
function drawBuildList() {
 $('#build-list').innerHTML = (Object.keys(BUILDINGS) as BuildingType[]).map(type => `<button class="build-item ${selected === type ? 'active' : ''}" data-type="${type}"><span class="emoji">${buildingIcons[type]}</span>${BUILDINGS[type].name}</button>`).join('');
 document.querySelectorAll<HTMLButtonElement>('[data-type]').forEach(button => button.onclick = () => { const type = button.dataset.type as BuildingType; selected = selected === type ? null : type; inspectedId = null; preview = null; renderer?.clearPreview(); drawBuildList(); updateDetail(); });
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
  detail.innerHTML = `<div class="eyebrow">Bauplanung</div><h3>${buildingIcons[selected]} ${def.name}</h3><p>${def.description}</p><div class="costs">${costText(selected)}</div><p>${check ? check.reason : 'Tippe auf eine Stelle für die Vorschau.'}${tile && selected === 'farm' ? ` Fruchtbarkeit: ${Math.round(tile.fertility*100)} %.` : ''}</p><button class="primary" id="confirm-build" ${!check?.ok ? 'disabled' : ''}>Hier bauen</button><button class="secondary" id="cancel-build">Abbrechen</button>`;
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
 $('#resources').innerHTML = RESOURCE_KEYS.map(k => { const p=state!.rates.production[k], c=state!.rates.consumption[k]; return `<div class="resource"><div class="resource-label">${labels[k]}</div><div class="resource-value"><span>${icons[k]}</span>${Math.floor(state!.resources[k])}</div><div class="resource-rate">+${p.toFixed(1)} / −${c.toFixed(1)} pro Jahr</div></div>`; }).join('') + `<div class="resource"><div class="resource-label">Menschen</div><div class="resource-value"><span>♟</span>${state.population.length}</div><div class="resource-rate">${Math.max(0,housing(state)-state.population.length)} freie Plätze</div></div>`;
 const year = 1 + Math.floor(state.time / 60), arrival = state.arrival;
 const message = arrival.phase === 'sailing' ? (arrival.initial ? 'Die ersten Siedler sind auf dem Weg.' : 'Ein Schiff mit neuen Siedlern nähert sich.') : arrival.phase === 'landing' ? 'Das Schiff legt an der Küste an.' : state.population.length ? 'Ein neuer Anfang an dieser Küste.' : 'Deine Insel wartet auf Bewohner.';
 $('#status').innerHTML = `<div class="eyebrow">Deine Siedlung · Jahr ${year}</div><h3>${paused ? 'Zeit für eine Pause' : 'Ein Anfang am Meer'}</h3><p>${message}</p><div class="status-line">☼ ${Math.round(state.happiness*100)} % Zufriedenheit &nbsp; · &nbsp; ${workingAdults(state)} arbeitsfähig</div>`;
 $('#pause').textContent = paused ? '▶' : 'Ⅱ'; $('#pause').setAttribute('aria-label',paused ? 'Fortsetzen' : 'Pause'); $('#speed').textContent = `${speed}×`;
 if (inspectedId !== null) updateDetail();
}
function syncRenderer() { if (!state || !renderer) return; renderer.setBuildings(state.buildings); renderer.setArrival(state.arrival); renderer.setPopulation(state.population.length); }
async function save(quiet = false) { if (!state) return; try { await saveGame(state); if (!quiet) notify('Spielstand gespeichert.'); } catch (error) { console.error(error); if (!quiet) notify('Speichern fehlgeschlagen. Bitte Browser-Speicher prüfen.'); } }
$('#new-game').onclick = () => startGame(createGame($<HTMLInputElement>('#seed').value.trim() || '839274'));
$('#load-game').onclick = async () => { try { const record = await loadGame(); if (record) startGame(record.state); else alert('Noch kein Spielstand vorhanden.'); } catch (error) { console.error(error); alert('Der Spielstand konnte nicht geladen werden.'); } };
$('#settings').onclick = showSettings; $('#menu-settings').onclick = showSettings; $('#help').onclick = showHelp;
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



