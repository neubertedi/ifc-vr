import * as FRAGS from "@thatopen/fragments";
import * as THREE from "three";

/**
 * Kapselt die komplette ThatOpen-Fragments-API (einzige Stelle im Code,
 * die FragmentsModels direkt anfasst – erleichtert Updates bei API-Änderungen).
 */
export class FragmentsHost {
  readonly fragments: FRAGS.FragmentsModels;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private lastUpdate = 0;
  private updatePending = false;
  /** Drosselintervall in ms – Worker-Roundtrips nicht pro Frame anstoßen. */
  updateInterval = 300;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;
    // Selbst gehosteter Worker statt FragmentsModels.getWorker() (lädt von unpkg)
    const workerUrl = new URL("frag-worker/worker.mjs", document.baseURI).href;
    this.fragments = new FRAGS.FragmentsModels(workerUrl);
  }

  async load(modelId: string, buffer: ArrayBuffer): Promise<FRAGS.FragmentsModel> {
    const model = await this.fragments.load(buffer, { modelId, camera: this.camera });
    model.useCamera(this.camera);
    this.scene.add(model.object);
    await this.fragments.update(true);
    return model;
  }

  async dispose(modelId: string): Promise<void> {
    const model = this.fragments.models.list.get(modelId);
    if (model) this.scene.remove(model.object);
    await this.fragments.disposeModel(modelId);
  }

  get models(): FRAGS.FragmentsModel[] {
    return [...this.fragments.models.list.values()];
  }

  /** Im Renderloop aufrufen – stößt gedrosselt Tile-/LOD-Updates an. */
  tick(time: number): void {
    if (this.updatePending || time - this.lastUpdate < this.updateInterval) return;
    this.lastUpdate = time;
    this.updatePending = true;
    void this.fragments.update().finally(() => {
      this.updatePending = false;
    });
  }

  /** Sofort-Update, z. B. nach Teleport oder Modell-Laden. */
  async forceUpdate(): Promise<void> {
    await this.fragments.update(true);
  }
}
