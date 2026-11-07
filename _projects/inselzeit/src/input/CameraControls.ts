import * as THREE from 'three';

type Point = { x: number; y: number; startX: number; startY: number };

/** Pointer events keep the same controls usable in Safari, on Android and on desktop. */
export class CameraControls {
  private points = new Map<number, Point>();
  private distance = 43;
  private angle = Math.PI / 4;
  private pitch = 0.82;
  private target: THREE.Vector3;
  private multi = false;
  private lastPinch = 0;
  private lastAngle = 0;
  private moved = false;
  private keys = new Set<string>();
  private handlers: Array<() => void> = [];

  constructor(private camera: THREE.PerspectiveCamera, private element: HTMLElement,
    center: { x: number; z: number }, private size: number,
    private tap: (x: number, y: number) => void,
    private hover: (x: number, y: number) => void) {
    this.target = new THREE.Vector3(center.x, 0, center.z);
    const listen = <K extends keyof HTMLElementEventMap>(target: HTMLElement | Window, name: K, fn: (e: any) => void, options?: AddEventListenerOptions) => {
      target.addEventListener(name, fn as EventListener, options);
      this.handlers.push(() => target.removeEventListener(name, fn as EventListener, options));
    };
    listen(element, 'pointerdown', this.down);
    listen(element, 'pointermove', this.move);
    listen(element, 'pointerup', this.up);
    listen(element, 'pointercancel', this.cancel);
    listen(element, 'wheel', this.wheel, { passive: false });
    listen(element, 'contextmenu', (e: Event) => e.preventDefault());
    listen(window, 'keydown', (e: KeyboardEvent) => this.keys.add(e.key.toLowerCase()));
    listen(window, 'keyup', (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase()));
    this.update(0);
  }

  private down = (e: PointerEvent) => {
    if (e.button !== 0 && e.button !== 2) return;
    this.element.setPointerCapture(e.pointerId);
    this.points.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY });
    if (this.points.size === 1) { this.moved = false; this.multi = false; }
    if (this.points.size === 2) { this.multi = true; this.rememberPinch(); }
  };
  private move = (e: PointerEvent) => {
    const p = this.points.get(e.pointerId);
    if (!p) { if (e.pointerType === 'mouse') this.hover(e.clientX, e.clientY); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(p.x - p.startX, p.y - p.startY) > 8) this.moved = true;
    if (this.points.size >= 2) {
      const [a, b] = [...this.points.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      if (this.lastPinch) this.distance = THREE.MathUtils.clamp(this.distance * this.lastPinch / Math.max(d, 1), 12, this.size * 1.35);
      let delta = angle - this.lastAngle;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      this.angle -= delta;
      this.lastPinch = d; this.lastAngle = angle;
      this.moved = true;
    } else if (!this.multi && this.moved) {
      if (e.buttons === 2) this.angle -= dx * 0.009;
      else this.pan(dx, dy);
    }
  };
  private up = (e: PointerEvent) => {
    const p = this.points.get(e.pointerId);
    if (p && !this.moved && !this.multi && e.button === 0) this.tap(e.clientX, e.clientY);
    this.points.delete(e.pointerId);
    if (this.points.size < 2) this.lastPinch = 0;
  };
  private cancel = (e: PointerEvent) => { this.points.delete(e.pointerId); this.multi = true; };
  private wheel = (e: WheelEvent) => { e.preventDefault(); this.distance = THREE.MathUtils.clamp(this.distance * Math.exp(e.deltaY * 0.001), 12, this.size * 1.35); };
  private rememberPinch() {
    const [a, b] = [...this.points.values()];
    this.lastPinch = Math.hypot(a.x - b.x, a.y - b.y);
    this.lastAngle = Math.atan2(b.y - a.y, b.x - a.x);
  }
  private pan(dx: number, dy: number) {
    const factor = this.distance * 0.0018;
    const right = new THREE.Vector3(Math.cos(this.angle), 0, -Math.sin(this.angle));
    const forward = new THREE.Vector3(-Math.sin(this.angle), 0, -Math.cos(this.angle));
    this.target.addScaledVector(right, -dx * factor).addScaledVector(forward, dy * factor);
    this.target.x = THREE.MathUtils.clamp(this.target.x, 0, this.size - 1);
    this.target.z = THREE.MathUtils.clamp(this.target.z, 0, this.size - 1);
  }
  update(dt: number) {
    const speed = dt * 400;
    if (this.keys.has('w') || this.keys.has('arrowup')) this.pan(0, speed);
    if (this.keys.has('s') || this.keys.has('arrowdown')) this.pan(0, -speed);
    if (this.keys.has('a') || this.keys.has('arrowleft')) this.pan(speed, 0);
    if (this.keys.has('d') || this.keys.has('arrowright')) this.pan(-speed, 0);
    if (this.keys.has('q')) this.angle += dt;
    if (this.keys.has('e')) this.angle -= dt;
    this.camera.position.set(this.target.x + Math.sin(this.angle) * Math.cos(this.pitch) * this.distance,
      this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.angle) * Math.cos(this.pitch) * this.distance);
    this.camera.lookAt(this.target);
  }
  dispose() { this.handlers.forEach(unsubscribe => unsubscribe()); }
}
