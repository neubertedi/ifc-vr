import * as THREE from "three";
import type * as FRAGS from "@thatopen/fragments";
import type { SelectionManager } from "../core/selection";

/**
 * Controller-Picking gegen Fragments-Modelle per Dummy-Kamera-Trick:
 * model.raycast() akzeptiert nur (camera, mouse, dom). Eine versteckte Kamera
 * wird auf die Controller-Pose gesetzt; als mouse dient der Canvas-MITTELPUNKT
 * in Pixeln (die Engine rechnet intern nach NDC um) – die Bildmitte liegt
 * exakt auf der -Z-Achse des Controllers. Der Raycast nutzt die BVH im
 * Worker und bleibt auch bei großen Modellen schnell.
 */
export class VrPicker {
  private readonly pickCam = new THREE.PerspectiveCamera(50, 1, 0.05, 500);
  private readonly selection: SelectionManager;
  private readonly canvas: HTMLCanvasElement;
  private readonly rotMat = new THREE.Matrix4();

  constructor(selection: SelectionManager, canvas: HTMLCanvasElement) {
    this.selection = selection;
    this.canvas = canvas;
  }

  private get center(): THREE.Vector2 {
    const rect = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  private alignToController(controller: THREE.Object3D): void {
    controller.updateWorldMatrix(true, false);
    this.pickCam.position.setFromMatrixPosition(controller.matrixWorld);
    this.rotMat.extractRotation(controller.matrixWorld);
    this.pickCam.quaternion.setFromRotationMatrix(this.rotMat);
    this.pickCam.updateMatrixWorld(true);
  }

  async pick(controller: THREE.Object3D): Promise<FRAGS.RaycastResult | null> {
    this.alignToController(controller);
    return this.selection.pick(this.pickCam, this.center, this.canvas);
  }

  async pickSnapped(controller: THREE.Object3D): Promise<FRAGS.RaycastResult | null> {
    this.alignToController(controller);
    return this.selection.pickSnapped(this.pickCam, this.center, this.canvas);
  }
}
