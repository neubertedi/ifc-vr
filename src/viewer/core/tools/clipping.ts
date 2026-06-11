import * as THREE from "three";
import type { ModelManager } from "../models";

/**
 * Eine globale Schnittebene für alle Teilmodelle.
 * renderer.clippingPlanes übernimmt den sichtbaren Schnitt,
 * getClippingPlanesEvent sorgt dafür, dass auch das Worker-Culling
 * der Fragments-Engine den Schnitt kennt.
 */
export class ClippingTool {
  enabled = false;
  readonly plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 10_000);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly helper: THREE.Mesh;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, manager: ModelManager) {
    this.renderer = renderer;

    this.helper = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 8),
      new THREE.MeshBasicMaterial({
        color: 0x38b2ac,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.helper.visible = false;
    scene.add(this.helper);

    manager.onChange(() => {
      for (const m of manager.models) {
        m.model.getClippingPlanesEvent = () => (this.enabled ? [this.plane] : []);
      }
    });
  }

  /** Ebene aus Punkt + Normale setzen (Desktop: Klick auf Fläche, VR: Controller-Pose). */
  setFromPointAndNormal(point: THREE.Vector3, normal: THREE.Vector3): void {
    const n = normal.clone().normalize().negate(); // geclippt wird die Seite, in die die Normale zeigt
    this.plane.setFromNormalAndCoplanarPoint(n, point);
    this.positionHelper(point);
    this.setEnabled(true);
  }

  /** Horizontale Schnittebene in gegebener Höhe (z. B. fürs Geschoss). */
  setHorizontal(point: THREE.Vector3): void {
    this.setFromPointAndNormal(point, new THREE.Vector3(0, 1, 0));
  }

  flip(): void {
    this.plane.negate();
    this.helper.rotateY(Math.PI);
  }

  /** Ebene um `distance` Meter entlang ihrer Normalen verschieben. */
  translate(distance: number): void {
    if (!this.enabled) return;
    // Ebene: n·p + c = 0 – Verschiebung in Normalenrichtung um d ⇒ c -= d
    this.plane.constant -= distance;
    this.helper.position.addScaledVector(this.plane.normal, distance);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.renderer.clippingPlanes = enabled ? [this.plane] : [];
    this.helper.visible = enabled;
  }

  private positionHelper(point: THREE.Vector3): void {
    this.helper.position.copy(point);
    const target = point.clone().add(this.plane.normal);
    this.helper.lookAt(target);
  }
}
