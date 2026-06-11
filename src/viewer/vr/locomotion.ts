import * as THREE from "three";
import { XRControllerModelFactory } from "three/examples/jsm/webxr/XRControllerModelFactory.js";

export type Hand = "left" | "right";

interface ControllerSlot {
  ray: THREE.XRTargetRaySpace;
  grip: THREE.XRGripSpace;
  hand: Hand | null;
  gamepad: Gamepad | null;
}

/**
 * Controller-Verwaltung + Button-Flankenerkennung.
 * xr-standard-Mapping: buttons[0]=Trigger, [1]=Grip, [3]=Stick-Klick,
 * [4]=A/X, [5]=B/Y; axes[2]/[3]=Daumenstick.
 */
export class VrInput {
  readonly slots: [ControllerSlot, ControllerSlot];
  private readonly prev = new Map<string, boolean>();

  constructor(renderer: THREE.WebGLRenderer, rig: THREE.Group) {
    const factory = new XRControllerModelFactory();
    const make = (index: number): ControllerSlot => {
      const ray = renderer.xr.getController(index);
      const grip = renderer.xr.getControllerGrip(index);
      grip.add(factory.createControllerModel(grip));
      rig.add(ray, grip);
      const slot: ControllerSlot = { ray, grip, hand: null, gamepad: null };
      ray.addEventListener("connected", (e) => {
        const source = e.data as XRInputSource | undefined;
        slot.hand = (source?.handedness as Hand) ?? null;
        slot.gamepad = source?.gamepad ?? null;
      });
      ray.addEventListener("disconnected", () => {
        slot.hand = null;
        slot.gamepad = null;
      });
      return slot;
    };
    this.slots = [make(0), make(1)];
  }

  controller(hand: Hand): ControllerSlot | null {
    return this.slots.find((s) => s.hand === hand) ?? null;
  }

  axes(hand: Hand): { x: number; y: number } {
    const pad = this.controller(hand)?.gamepad;
    if (!pad || pad.axes.length < 4) return { x: 0, y: 0 };
    return { x: pad.axes[2], y: pad.axes[3] };
  }

  isDown(hand: Hand, button: number): boolean {
    const pad = this.controller(hand)?.gamepad;
    return !!pad?.buttons[button]?.pressed;
  }

  /** Am ENDE des Frames aufrufen, damit justPressed pro Frame stimmt. */
  latch(): void {
    for (const hand of ["left", "right"] as Hand[]) {
      for (let b = 0; b < 7; b++) this.prev.set(`${hand}:${b}`, this.isDown(hand, b));
    }
  }

  justPressed(hand: Hand, button: number): boolean {
    return this.isDown(hand, button) && !this.prev.get(`${hand}:${button}`);
  }
}

export interface TeleportTarget {
  point: THREE.Vector3;
  normal: THREE.Vector3;
}

/**
 * Fortbewegung: linker Stick = gleitendes Gehen entlang der Blickrichtung,
 * rechter Stick seitlich = 45°-Drehung, rechter Stick nach vorn = Teleport-Zielen.
 * Bewegt wird immer das Rig – die Kamerapose gehört dem Headset.
 */
export class Locomotion {
  moveSpeed = 2.5;
  snapAngle = Math.PI / 4;
  private readonly rig: THREE.Group;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly input: VrInput;
  private readonly pickTeleport: () => Promise<TeleportTarget | null>;
  private snapReady = true;
  private aiming = false;
  private lastAimPick = 0;
  private target: TeleportTarget | null = null;
  private readonly marker: THREE.Mesh;
  private readonly aimLine: THREE.Line;

  constructor(
    rig: THREE.Group,
    camera: THREE.PerspectiveCamera,
    input: VrInput,
    scene: THREE.Scene,
    pickTeleport: () => Promise<TeleportTarget | null>,
  ) {
    this.rig = rig;
    this.camera = camera;
    this.input = input;
    this.pickTeleport = pickTeleport;

    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.26, 32),
      new THREE.MeshBasicMaterial({
        color: 0x38b2ac,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthTest: false,
      }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.renderOrder = 998;
    this.marker.visible = false;
    scene.add(this.marker);

    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -8),
    ]);
    this.aimLine = new THREE.Line(
      lineGeo,
      new THREE.LineBasicMaterial({ color: 0x38b2ac, transparent: true, opacity: 0.7 }),
    );
    this.aimLine.visible = false;
  }

  update(dt: number, time: number): void {
    this.smoothMove(dt);
    this.vertical(dt);
    this.snapTurn();
    this.teleport(time);
  }

  /** B-Taste (rechts, oben) = aufwärts, A-Taste (rechts, unten) = abwärts. */
  private vertical(dt: number): void {
    let dir = 0;
    if (this.input.isDown("right", 5)) dir += 1;
    if (this.input.isDown("right", 4)) dir -= 1;
    if (dir !== 0) this.rig.position.y += dir * 2 * dt;
  }

  private headPosition(): THREE.Vector3 {
    return this.camera.getWorldPosition(new THREE.Vector3());
  }

  private smoothMove(dt: number): void {
    const { x, y } = this.input.axes("left");
    if (Math.abs(x) < 0.12 && Math.abs(y) < 0.12) return;

    // Bewegungsrichtung aus dem Blick-Yaw, auf die XZ-Ebene projiziert
    const forward = this.camera.getWorldDirection(new THREE.Vector3());
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));

    const move = new THREE.Vector3()
      .addScaledVector(forward, -y)
      .addScaledVector(right, x)
      .multiplyScalar(this.moveSpeed * dt);
    this.rig.position.add(move);
  }

  private snapTurn(): void {
    const { x } = this.input.axes("right");
    if (Math.abs(x) < 0.3) this.snapReady = true;
    if (!this.snapReady || Math.abs(x) < 0.7) return;
    this.snapReady = false;

    // Klassischer Fehler: um den Rig-Ursprung statt um den Kopf drehen.
    const head = this.headPosition();
    const angle = x > 0 ? -this.snapAngle : this.snapAngle;
    const pivot = new THREE.Vector3(head.x, this.rig.position.y, head.z);
    this.rig.position.sub(pivot);
    this.rig.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    this.rig.position.add(pivot);
    this.rig.rotateY(angle);
  }

  private teleport(time: number): void {
    const { y } = this.input.axes("right");
    const pushing = y < -0.7;
    const rightRay = this.input.controller("right")?.ray;

    if (pushing && rightRay) {
      if (!this.aiming) {
        this.aiming = true;
        rightRay.add(this.aimLine);
        this.aimLine.visible = true;
      }
      // Ziel gedrosselt asynchron suchen (Fragments-Raycast läuft im Worker)
      if (time - this.lastAimPick > 120) {
        this.lastAimPick = time;
        void this.pickTeleport().then((hit) => {
          if (!this.aiming) return;
          this.target = hit && hit.normal.y > 0.7 ? hit : null;
          if (this.target) {
            this.marker.position.copy(this.target.point).add(new THREE.Vector3(0, 0.02, 0));
            this.marker.visible = true;
          } else {
            this.marker.visible = false;
          }
        });
      }
    } else if (this.aiming) {
      // Stick losgelassen → springen
      this.aiming = false;
      this.aimLine.visible = false;
      this.aimLine.removeFromParent();
      if (this.target) {
        const head = this.headPosition();
        this.rig.position.x += this.target.point.x - head.x;
        this.rig.position.z += this.target.point.z - head.z;
        this.rig.position.y = this.target.point.y;
      }
      this.marker.visible = false;
      this.target = null;
    }
  }
}
