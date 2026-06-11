import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";

export type NavMode = "orbit" | "ego";

/**
 * Desktop-Navigation: Orbit (Maus) oder Ego-Modus (Klick = Maussperre, WASD laufen,
 * Q/E bzw. Leertaste/Strg hoch/runter, Umschalt = schneller).
 */
export class DesktopControls {
  mode: NavMode = "orbit";
  private readonly orbit: OrbitControls;
  private readonly pointerLock: PointerLockControls;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly keys = new Set<string>();
  /** Ziel für sanftes Umsetzen des Orbit-Drehpunkts (angeklickter Punkt). */
  private pivotGoal: THREE.Vector3 | null = null;

  constructor(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement) {
    this.camera = camera;

    this.orbit = new OrbitControls(camera, canvas);
    this.orbit.target.set(0, 2, 0);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.12;

    this.pointerLock = new PointerLockControls(camera, canvas);

    window.addEventListener("keydown", (e) => this.keys.add(e.code));
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    canvas.addEventListener("click", () => {
      if (this.mode === "ego" && !this.pointerLock.isLocked) this.pointerLock.lock();
    });
  }

  setMode(mode: NavMode): void {
    this.mode = mode;
    if (mode === "orbit") {
      if (this.pointerLock.isLocked) this.pointerLock.unlock();
      this.orbit.enabled = true;
      // Orbit-Ziel vor die Kamera legen, damit es nach dem Ego-Modus keinen Sprung gibt
      const dir = this.camera.getWorldDirection(new THREE.Vector3());
      this.orbit.target.copy(this.camera.position).addScaledVector(dir, 8);
    } else {
      this.orbit.enabled = false;
      this.pointerLock.lock();
    }
  }

  /** Angeklickten Punkt zum Orbit-Drehpunkt machen (sanft übergeblendet). */
  setPivot(point: THREE.Vector3): void {
    if (this.mode !== "orbit") return;
    this.pivotGoal = point.clone();
  }

  /** Bei Modellwechsel: Kamera sinnvoll vor das Modell stellen. */
  frameBox(box: THREE.Box3): void {
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    const dist = Math.max(8, size * 0.6);
    this.camera.position.copy(center).add(new THREE.Vector3(dist, dist * 0.55, dist));
    this.orbit.target.copy(center);
    this.orbit.update();
  }

  update(dt: number): void {
    if (this.mode === "orbit") {
      if (this.pivotGoal) {
        this.orbit.target.lerp(this.pivotGoal, 1 - Math.exp(-8 * dt));
        if (this.orbit.target.distanceToSquared(this.pivotGoal) < 1e-6) this.pivotGoal = null;
      }
      this.orbit.update();
      return;
    }
    if (!this.pointerLock.isLocked) return;

    const fast = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    const speed = (fast ? 8 : 3) * dt;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) this.pointerLock.moveForward(speed);
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) this.pointerLock.moveForward(-speed);
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) this.pointerLock.moveRight(-speed);
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) this.pointerLock.moveRight(speed);
    if (this.keys.has("KeyE") || this.keys.has("Space")) this.camera.position.y += speed;
    if (this.keys.has("KeyQ") || this.keys.has("ControlLeft")) this.camera.position.y -= speed;
  }
}
