import * as FRAGS from "@thatopen/fragments";
import * as THREE from "three";

export type DetailLevel = "hoch" | "mittel" | "niedrig";

/** Qualitätsstufe (0–1) und Grafikspeicher-Budget je Detail-Einstellung. */
const DETAIL_PRESETS: Record<DetailLevel, { quality: number; budget: number }> = {
  hoch: { quality: 1, budget: 640 * 1024 * 1024 },
  mittel: { quality: 0.5, budget: 384 * 1024 * 1024 },
  niedrig: { quality: 0.25, budget: 224 * 1024 * 1024 },
};

const DETAIL_KEY = "ifcvr.detail";

/** Laufzeit-Übergaben an die gepatchte Engine (siehe vite.config.ts). */
const engineGlobals = globalThis as unknown as {
  __IFCVR_GPU_BUDGET?: number;
  __IFCVR_VIEWSIZE?: number;
};

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
    // Werksseitig steht die Qualität auf 0 (niedrigste Stufe) – dann fehlen
    // kleine/ferne Bauteile oder erscheinen stark vereinfacht.
    const saved = localStorage.getItem(DETAIL_KEY) as DetailLevel | null;
    this.setDetail(saved && saved in DETAIL_PRESETS ? saved : "hoch");
  }

  detail: DetailLevel = "hoch";

  /** Detailstufe: Abwägung zwischen Vollständigkeit und Bildrate (pro Gerät gespeichert). */
  setDetail(level: DetailLevel): void {
    this.detail = level;
    const preset = DETAIL_PRESETS[level];
    this.fragments.settings.graphicsQuality = preset.quality;
    for (const model of this.models) model.graphicsQuality = preset.quality;
    engineGlobals.__IFCVR_GPU_BUDGET = preset.budget;
    localStorage.setItem(DETAIL_KEY, level);
    void this.forceUpdate();
  }

  /**
   * In VR die echte Framebuffer-Größe melden (statt der kleinen
   * 2D-Fenstergröße) – sonst hält die Detailstufen-Wahl kleine Bauteile
   * für unter-Pixel-groß. null = zurück zur Fenstergröße (Desktop).
   */
  setXrViewSize(pixels: number | null): void {
    engineGlobals.__IFCVR_VIEWSIZE = pixels ?? 0;
    void this.forceUpdate();
  }

  async load(modelId: string, buffer: ArrayBuffer): Promise<FRAGS.FragmentsModel> {
    const model = await this.fragments.load(buffer, { modelId, camera: this.camera });
    model.graphicsQuality = DETAIL_PRESETS[this.detail].quality;
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

  private moving = false;

  /**
   * Bewegungszustand melden (VR-Lokomotion): Während der Bewegung werden
   * Nachlade-Updates pausiert (vermeidet Mikro-Ruckler durch Worker-Uploads),
   * beim Stehenbleiben wird sofort vollständig nachgeladen.
   */
  setMoving(moving: boolean): void {
    if (this.moving && !moving) {
      void this.forceUpdate();
    }
    this.moving = moving;
  }

  /** Im Renderloop aufrufen – stößt gedrosselt Tile-/LOD-Updates an. */
  tick(time: number): void {
    if (this.moving) return;
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
