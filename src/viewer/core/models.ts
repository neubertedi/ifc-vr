import type * as FRAGS from "@thatopen/fragments";
import type { FragmentsHost } from "./fragments-setup";

export interface ManagedModel {
  id: string;
  name: string;
  model: FRAGS.FragmentsModel;
  visible: boolean;
}

/** Verwaltet die geladenen Teilmodelle (Gewerke) – Laden/Entladen zur Laufzeit. */
export class ModelManager {
  readonly models: ManagedModel[] = [];
  private readonly host: FragmentsHost;
  private readonly listeners = new Set<() => void>();
  private counter = 0;

  constructor(host: FragmentsHost) {
    this.host = host;
  }

  onChange(listener: () => void): void {
    this.listeners.add(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  async add(fileName: string, buffer: ArrayBuffer): Promise<ManagedModel> {
    const name = fileName.replace(/\.frag$/i, "");
    const id = `${name}-${this.counter++}`;
    const model = await this.host.load(id, buffer);
    const managed: ManagedModel = { id, name, model, visible: true };
    this.models.push(managed);
    this.emit();
    return managed;
  }

  async remove(id: string): Promise<void> {
    const idx = this.models.findIndex((m) => m.id === id);
    if (idx === -1) return;
    this.models.splice(idx, 1);
    await this.host.dispose(id);
    this.emit();
  }

  setVisible(id: string, visible: boolean): void {
    const managed = this.models.find((m) => m.id === id);
    if (!managed) return;
    managed.visible = visible;
    managed.model.object.visible = visible;
    this.emit();
  }

  get visibleModels(): FRAGS.FragmentsModel[] {
    return this.models.filter((m) => m.visible).map((m) => m.model);
  }
}
