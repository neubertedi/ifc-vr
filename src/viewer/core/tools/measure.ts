import * as THREE from "three";

/** Zwei-Punkt-Messung mit Linie und Distanz-Label (Canvas-Sprite). */
export class MeasureTool {
  readonly group = new THREE.Group();
  private pending: THREE.Vector3 | null = null;
  private pendingMarker: THREE.Mesh | null = null;

  constructor(scene: THREE.Scene) {
    this.group.name = "measurements";
    scene.add(this.group);
  }

  /** Liefert true, wenn die Messung mit diesem Punkt abgeschlossen wurde. */
  addPoint(point: THREE.Vector3): boolean {
    if (!this.pending) {
      this.pending = point.clone();
      this.pendingMarker = this.makeMarker(point);
      this.group.add(this.pendingMarker);
      return false;
    }

    const a = this.pending;
    const b = point.clone();
    this.pending = null;
    if (this.pendingMarker) {
      this.group.remove(this.pendingMarker);
      this.pendingMarker = null;
    }

    const measurement = new THREE.Group();
    measurement.add(this.makeMarker(a), this.makeMarker(b));

    const geometry = new THREE.BufferGeometry().setFromPoints([a, b]);
    measurement.add(
      new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffc83c, depthTest: false })),
    );

    const meters = a.distanceTo(b);
    const label = makeTextSprite(`${meters.toFixed(2).replace(".", ",")} m`);
    label.position.copy(a).lerp(b, 0.5);
    measurement.add(label);

    this.group.add(measurement);
    return true;
  }

  cancelPending(): void {
    this.pending = null;
    if (this.pendingMarker) {
      this.group.remove(this.pendingMarker);
      this.pendingMarker = null;
    }
  }

  clear(): void {
    this.cancelPending();
    this.group.clear();
  }

  private makeMarker(point: THREE.Vector3): THREE.Mesh {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffc83c, depthTest: false }),
    );
    marker.position.copy(point);
    marker.renderOrder = 999;
    return marker;
  }
}

function makeTextSprite(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#1d2229";
  ctx.beginPath();
  ctx.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 18);
  ctx.fill();
  ctx.strokeStyle = "#ffc83c";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 44px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, depthTest: false, sizeAttenuation: true }),
  );
  sprite.scale.set(0.45, 0.17, 1);
  sprite.renderOrder = 1000;
  return sprite;
}
