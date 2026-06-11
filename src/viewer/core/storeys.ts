import type * as FRAGS from "@thatopen/fragments";
import type { ManagedModel, ModelManager } from "./models";

export interface StoreyGroup {
  /** Anzeigename, z. B. "EG" – gleichnamige Geschosse aller Teilmodelle werden gebündelt. */
  name: string;
  /** Sortierhöhe (Elevation), falls ermittelbar. */
  elevation: number;
  visible: boolean;
  /** Bauteil-IDs je Modell. */
  parts: { model: FRAGS.FragmentsModel; elementIds: number[] }[];
}

/**
 * Sammelt Geschosse über alle Teilmodelle (per räumlicher Struktur) und
 * schaltet sie gemeinsam sichtbar/unsichtbar – föderationstauglich:
 * "EG" im Architekturmodell und "EG" im Tragwerksmodell sind eine Gruppe.
 */
export class StoreyFilter {
  groups: StoreyGroup[] = [];
  private readonly manager: ModelManager;
  private readonly listeners = new Set<() => void>();
  private readonly scanned = new Set<string>();

  constructor(manager: ModelManager) {
    this.manager = manager;
    manager.onChange(() => void this.sync());
  }

  onChange(listener: () => void): void {
    this.listeners.add(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  /** Nach Modell-Änderungen Geschossliste aktualisieren. */
  private async sync(): Promise<void> {
    const liveIds = new Set(this.manager.models.map((m) => m.id));

    // Entladene Modelle aus den Gruppen entfernen
    for (const group of this.groups) {
      group.parts = group.parts.filter((p) =>
        this.manager.models.some((m) => m.model === p.model),
      );
    }
    this.groups = this.groups.filter((g) => g.parts.length > 0);
    for (const id of [...this.scanned]) if (!liveIds.has(id)) this.scanned.delete(id);

    // Neue Modelle scannen
    for (const managed of this.manager.models) {
      if (this.scanned.has(managed.id)) continue;
      this.scanned.add(managed.id);
      try {
        await this.scanModel(managed);
      } catch (e) {
        console.warn(`Geschoss-Scan für ${managed.name} fehlgeschlagen:`, e);
      }
    }

    this.groups.sort((a, b) => a.elevation - b.elevation);
    this.emit();
  }

  private async scanModel(managed: ManagedModel): Promise<void> {
    const { model } = managed;
    const tree = await model.getSpatialStructure();

    // Baumstruktur: Kategorie-Knoten (localId=null, category gesetzt) enthalten
    // Instanz-Knoten (localId gesetzt, category=null) – die Geschoss-Instanzen
    // sind also die KINDER des IFCBUILDINGSTOREY-Knotens.
    const storeyNodes: { localId: number; elementIds: number[] }[] = [];
    const walk = (node: FRAGS.SpatialTreeItem): void => {
      if (node.category?.toUpperCase() === "IFCBUILDINGSTOREY") {
        for (const instance of node.children ?? []) {
          if (instance.localId === null) continue;
          const elementIds: number[] = [];
          collectIds(instance, elementIds);
          storeyNodes.push({ localId: instance.localId, elementIds });
        }
        return;
      }
      for (const child of node.children ?? []) walk(child);
    };
    walk(tree);
    if (!storeyNodes.length) return;

    // Namen + Höhen der Geschosse nachladen
    const data = await model.getItemsData(
      storeyNodes.map((s) => s.localId),
      { attributesDefault: true },
    );

    for (let i = 0; i < storeyNodes.length; i++) {
      const attrs = data[i] ?? {};
      const nameAttr = attrs.Name;
      const elevAttr = attrs.Elevation;
      const name =
        nameAttr && !Array.isArray(nameAttr) && nameAttr.value
          ? String(nameAttr.value)
          : `Geschoss ${i + 1}`;
      const elevation =
        elevAttr && !Array.isArray(elevAttr) && typeof elevAttr.value === "number"
          ? elevAttr.value
          : i;

      let group = this.groups.find((g) => g.name === name);
      if (!group) {
        group = { name, elevation, visible: true, parts: [] };
        this.groups.push(group);
      }
      group.parts.push({ model, elementIds: storeyNodes[i].elementIds });
      if (!group.visible) {
        // Neu geladenes Modell an bestehenden Filterzustand angleichen
        void model.setVisible(storeyNodes[i].elementIds, false);
      }
    }
  }

  async setVisible(group: StoreyGroup, visible: boolean): Promise<void> {
    group.visible = visible;
    await Promise.all(group.parts.map((p) => p.model.setVisible(p.elementIds, visible)));
    this.emit();
  }
}

function collectIds(node: FRAGS.SpatialTreeItem, out: number[]): void {
  for (const child of node.children ?? []) {
    if (child.localId !== null) out.push(child.localId);
    collectIds(child, out);
  }
}
