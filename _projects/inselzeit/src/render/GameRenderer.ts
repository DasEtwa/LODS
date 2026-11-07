import * as THREE from 'three';
import { CameraControls } from '../input/CameraControls';
import type { World, Tile } from '../world/world';

type BuildingView = { id: string | number; type: string; x: number; z: number };
type ArrivalView = { phase: string; progress: number; passengers?: number };
type Callbacks = { onTileTap: (x: number, z: number) => void; onHoverTile: (x: number, z: number) => void };

const colors: Record<string, number> = {
  ocean: 0x8f9270, lake: 0x589fa4, river: 0x589fa4, beach: 0xd8c69a,
  grass: 0x83a972, forest: 0x638d60, rock: 0x8c9381, snow: 0xd9ddd0, dry: 0xb5ae79,
};
const mat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
const wall = mat(0xe7d3a6), wood = mat(0x81573b), roof = mat(0xa55b42), dark = mat(0x423d32), foliage = mat(0x467b57);
const soil = mat(0x8b6946), crops = mat(0xb9b86b), logs = mat(0x9c744d), stone = mat(0x9b9d8e), windowMat = mat(0x77abb2);
const clothingA = mat(0x61969a), clothingB = mat(0xc68762);
// Reusable materials belong to the module, not to an individual game instance.
const sharedMaterials = new Set<THREE.Material>([wall, wood, roof, dark, foliage, soil, crops, logs, stone, windowMat, clothingA, clothingB]);
function disposeObjects(group: THREE.Group, disposeMaterials = false) {
  group.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.dispose();
    if (disposeMaterials) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (!sharedMaterials.has(m)) m.dispose(); });
  });
  group.clear();
}

function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z); mesh.castShadow = false; mesh.receiveShadow = false;
  return mesh;
}
function makeBuilding(type: string): THREE.Group {
  const g = new THREE.Group();
  if (type === 'farm') {
    g.add(box(1.3, 0.10, 1.3, soil, 0, 0.08));
    for (let i = -2; i <= 2; i++) g.add(box(1.18, .08, .08, crops, 0, .16, i * .22));
    g.add(box(.48, .5, .45, wood, -.4, .33, -.4));
    g.add(box(.57, .1, .53, roof, -.4, .63, -.4));
  } else if (type === 'house') {
    g.add(box(.95, .75, .8, wall, 0, .43));
    const top = new THREE.Mesh(new THREE.ConeGeometry(.82, .52, 4), roof);
    top.rotation.y = Math.PI / 4; top.position.y = 1.05; g.add(top);
    g.add(box(.2, .4, .04, dark, 0, .25, .42));
    g.add(box(.18, .18, .04, windowMat, .29, .53, .42));
  } else if (type === 'lumberyard' || type === 'lumber' || type === 'woodcutter') {
    g.add(box(.9, .55, .7, wood, 0, .35)); g.add(box(1.05, .12, .85, roof, 0, .68));
    for (let i = 0; i < 3; i++) g.add(box(.55, .12, .12, logs, .25, .12 + i * .13, .55));
  } else if (type === 'quarry' || type === 'mine') {
    g.add(box(1.1, .15, 1.1, stone, 0, .1));
    g.add(box(.7, .6, .55, wood, 0, .42, -.1));
    g.add(box(.85, .12, .72, dark, 0, .78, -.1));
    g.add(box(.27, .35, .04, dark, 0, .27, .19));
  } else {
    g.add(box(1.15, .75, .85, wall, 0, .43));
    g.add(box(1.28, .15, .98, wood, 0, .87));
    g.add(box(.38, .5, .04, dark, 0, .3, .44));
  }
  return g;
}

/** Presentation only: all authoritative world and economy data live outside Three.js. */
export class GameRenderer {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, .1, 400);
  private renderer: THREE.WebGLRenderer;
  private controls: CameraControls;
  private raycaster = new THREE.Raycaster();
  private terrain: THREE.Mesh[] = [];
  private buildingLayer = new THREE.Group();
  private preview = new THREE.Group();
  private water: THREE.Mesh;
  private ship = new THREE.Group();
  private people = new THREE.Group();
  private arrival: ArrivalView = { phase: 'sailing', progress: 0 };
  private population = 0;
  private visualPopulation = -1;
  private previewKey = '';
  private elapsed = 0;
  private buildingsKey = '';
  private resizeObserver: ResizeObserver;
  private tileMap = new Map<string, Tile>();
  private geometries: THREE.BufferGeometry[] = [];
  private treeTiles: Tile[] = [];
  private trunks?: THREE.InstancedMesh;
  private crowns?: THREE.InstancedMesh;

  constructor(private container: HTMLElement, private world: World, private callbacks: Callbacks) {
    this.renderer = new THREE.WebGLRenderer({ antialias: window.devicePixelRatio < 2, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.style.touchAction = 'none';
    this.renderer.domElement.style.display = 'block';
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0xb6d9da);
    this.scene.fog = new THREE.Fog(0xb6d9da, world.size * .85, world.size * 2.4);
    this.scene.add(new THREE.HemisphereLight(0xe6f5ee, 0x607060, 2.0));
    const sun = new THREE.DirectionalLight(0xffe6b6, 2.1); sun.position.set(25, 50, 15); this.scene.add(sun);
    for (const tile of world.tiles) this.tileMap.set(`${tile.x},${tile.z}`, tile);
    this.createTerrain();
    this.createTrees();
    const waterGeometry = new THREE.PlaneGeometry(world.size * 2.5, world.size * 2.5, 1, 1);
    this.water = new THREE.Mesh(waterGeometry, new THREE.MeshStandardMaterial({ color: 0x509e9e, transparent: true, opacity: .78, roughness: .34, metalness: .05, side: THREE.DoubleSide }));
    this.water.rotation.x = -Math.PI / 2; this.water.position.set(world.size / 2, .025, world.size / 2); this.scene.add(this.water);
    this.scene.add(this.buildingLayer, this.preview, this.ship, this.people);
    this.makeShip();
    // Frame the approaching ship and the eventual settlement together at startup.
    const initialCenter = { x: world.spawn.x * .7 + world.seaStart.x * .3, z: world.spawn.z * .7 + world.seaStart.z * .3 };
    this.controls = new CameraControls(this.camera, this.renderer.domElement, initialCenter, world.size,
      (x, y) => this.pick(x, y, callbacks.onTileTap), (x, y) => this.pick(x, y, callbacks.onHoverTile));
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }
  private height(x: number, z: number) { return this.tileMap.get(`${x},${z}`)?.height ?? -1; }
  private createTerrain() {
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
    for (const chunk of this.world.chunks) {
      const positions: number[] = [], colorValues: number[] = [];
      for (const t of chunk.tiles) {
        const c = new THREE.Color(colors[t.biome] ?? colors.grass);
        // Per-tile gentle variation avoids artificial repeating texture; it is coordinate-stable.
        const shade = .95 + (((t.x * 73856093 ^ t.z * 19349663) >>> 0) % 11) / 100;
        c.multiplyScalar(shade);
        const corner = (dx: number, dz: number) => (this.height(t.x, t.z) + this.height(t.x + dx, t.z) + this.height(t.x, t.z + dz) + this.height(t.x + dx, t.z + dz)) / 4;
        const x = t.x, z = t.z;
        const a = [x - .5, corner(-1, -1), z - .5], b = [x + .5, corner(1, -1), z - .5];
        const d = [x - .5, corner(-1, 1), z + .5], e = [x + .5, corner(1, 1), z + .5];
        positions.push(...a, ...d, ...b, ...b, ...d, ...e);
        for (let i = 0; i < 6; i++) colorValues.push(c.r, c.g, c.b);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colorValues, 3));
      geometry.computeVertexNormals(); geometry.computeBoundingSphere();
      this.geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, material); this.terrain.push(mesh); this.scene.add(mesh);
    }
  }
  private createTrees() {
    const forest = this.world.tiles.filter(t => t.forest > .48 && !t.water && t.height > .15 && ((t.x * 13 + t.z * 29) % 5 !== 0));
    if (!forest.length) return;
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.055, .08, .55, 5), wood, forest.length);
    const leaves = new THREE.InstancedMesh(new THREE.ConeGeometry(.36, 1.05, 6), foliage, forest.length);
    this.treeTiles = forest; this.trunks = trunk; this.crowns = leaves;
    this.updateTrees([]);
    this.scene.add(trunk, leaves);
  }
  private updateTrees(buildings: BuildingView[]) {
    if (!this.trunks || !this.crowns) return;
    const transform = new THREE.Object3D();
    this.treeTiles.forEach((t, i) => {
      const h = ((t.x * 31 + t.z * 17) % 7) / 20;
      const occupied = buildings.some(b => Math.abs(b.x - t.x) <= .7 && Math.abs(b.z - t.z) <= .7);
      transform.position.set(t.x + .12, t.height + .3, t.z + .1); transform.scale.setScalar(occupied ? 0 : .85 + h); transform.updateMatrix(); this.trunks!.setMatrixAt(i, transform.matrix);
      transform.position.y = t.height + .9; transform.updateMatrix(); this.crowns!.setMatrixAt(i, transform.matrix);
    });
    this.trunks.instanceMatrix.needsUpdate = true; this.crowns.instanceMatrix.needsUpdate = true;
  }
  private makeShip() {
    this.ship.add(box(1.7, .35, .65, wood, 0, .19));
    this.ship.add(box(.12, 1.35, .12, dark, 0, .9));
    this.ship.add(box(.7, .75, .03, wall, .38, 1.15, 0));
    this.ship.add(box(.5, .2, .4, roof, -.5, .5));
  }
  private pick(clientX: number, clientY: number, callback: (x: number, z: number) => void) {
    const r = this.renderer.domElement.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.raycaster.setFromCamera(new THREE.Vector2((clientX - r.left) / r.width * 2 - 1, -(clientY - r.top) / r.height * 2 + 1), this.camera);
    const hit = this.raycaster.intersectObjects(this.terrain, false)[0];
    if (hit) callback(Math.round(hit.point.x), Math.round(hit.point.z));
  }
  setBuildings(buildings: BuildingView[]) {
    const key = buildings.map(b => `${b.id}:${b.type}:${b.x}:${b.z}`).join('|');
    if (key === this.buildingsKey) return;
    this.buildingsKey = key; disposeObjects(this.buildingLayer);
    this.updateTrees(buildings);
    for (const b of buildings) {
      const model = makeBuilding(b.type); model.position.set(b.x, Math.max(0, this.height(b.x, b.z)), b.z); this.buildingLayer.add(model);
    }
  }
  setPreview(type: string, x: number, z: number, valid: boolean) {
    const key = `${type}:${x}:${z}:${valid}`;
    if (key === this.previewKey) { this.preview.visible = true; return; }
    disposeObjects(this.preview, true);
    this.previewKey = key;
    const marker = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), new THREE.MeshBasicMaterial({ color: valid ? 0x68e9a0 : 0xff6b68, transparent: true, opacity: .6, side: THREE.DoubleSide, depthWrite: false }));
    marker.rotation.x = -Math.PI / 2; marker.position.y = .06; this.preview.add(marker);
    const model = makeBuilding(type); model.traverse(o => { if (o instanceof THREE.Mesh) { o.material = new THREE.MeshBasicMaterial({ color: valid ? 0x9dffd0 : 0xff8f89, transparent: true, opacity: .55, depthWrite: false }); } });
    this.preview.add(model); this.preview.position.set(x, Math.max(0, this.height(x, z)) + .08, z); this.preview.visible = true;
  }
  clearPreview() { this.preview.visible = false; }
  setArrival(arrival: ArrivalView) { this.arrival = arrival; this.updatePeople(); }
  setPopulation(count: number) { this.population = count; this.updatePeople(); }
  private updatePeople() {
    const count = Math.min(12, this.population + (this.arrival.phase === 'landing' ? (this.arrival.passengers ?? 0) : 0));
    if (count === this.visualPopulation) return;
    this.visualPopulation = count; disposeObjects(this.people);
    for (let i = 0; i < count; i++) {
      const person = new THREE.Group();
      person.add(box(.16, .28, .12, i % 2 ? clothingA : clothingB, 0, .2));
      const head = new THREE.Mesh(new THREE.SphereGeometry(.09, 6, 4), wall); head.position.y = .43; person.add(head);
      this.people.add(person);
    }
  }
  private resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h);
  }
  render(dt: number) {
    this.elapsed += dt; this.controls.update(dt);
    this.water.position.y = .025 + Math.sin(this.elapsed * .8) * .025;
    const { seaStart, landing, spawn } = this.world;
    const progress = this.arrival.phase === 'sailing' ? .15 + Math.min(1, this.arrival.progress) * .85 : 1;
    this.ship.visible = this.arrival.phase !== 'complete';
    this.ship.position.set(THREE.MathUtils.lerp(seaStart.x, landing.x, progress), .08 + Math.sin(this.elapsed * 2) * .04, THREE.MathUtils.lerp(seaStart.z, landing.z, progress));
    this.ship.rotation.y = -Math.atan2(landing.z - seaStart.z, landing.x - seaStart.x);
    this.people.visible = this.arrival.phase !== 'sailing';
    this.people.children.forEach((person, i) => {
      const landingProgress = this.arrival.phase === 'landing' && i >= this.population ? Math.min(1, this.arrival.progress) : 1;
      const x = THREE.MathUtils.lerp(landing.x, spawn.x, landingProgress) + Math.sin(this.elapsed * .3 + i * 2.4) * (landingProgress * 1.3);
      const z = THREE.MathUtils.lerp(landing.z, spawn.z, landingProgress) + Math.cos(this.elapsed * .25 + i * 2.4) * (landingProgress * 1.3);
      person.position.set(x, Math.max(0, this.height(Math.round(x), Math.round(z))), z);
    });
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.controls.dispose(); this.resizeObserver.disconnect();
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach(material => { if (!sharedMaterials.has(material)) material.dispose(); }); }
    });
    this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
