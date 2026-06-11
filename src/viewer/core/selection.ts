import * as FRAGS from "@thatopen/fragments";
import * as THREE from "three";
import type { ModelManager } from "./models";

export interface Selection {
  model: FRAGS.FragmentsModel;
  localId: number;
}

export interface PropertyRow {
  label: string;
  value: string;
  /** true = Überschrift eines Property-Sets */
  isHeader?: boolean;
}

const HIGHLIGHT: FRAGS.MaterialDefinition = {
  color: new THREE.Color(0xffc83c),
  renderedFaces: FRAGS.RenderedFaces.TWO,
  opacity: 1,
  transparent: false,
};

/** Deutsche Anzeigenamen für die wichtigsten IFC-Attribute. */
const ATTRIBUTE_LABELS: Record<string, string> = {
  Name: "Name",
  ObjectType: "Typ-Bezeichnung",
  Tag: "Kennzeichen",
  GlobalId: "GlobalId",
  PredefinedType: "Vordefinierter Typ",
  Description: "Beschreibung",
};

/** IFC-Kategorienamen → deutsche Bezeichnung (Auswahl der häufigsten). */
const CATEGORY_LABELS: Record<string, string> = {
  IFCWALL: "Wand",
  IFCWALLSTANDARDCASE: "Wand",
  IFCSLAB: "Decke/Bodenplatte",
  IFCBEAM: "Träger/Unterzug",
  IFCCOLUMN: "Stütze",
  IFCDOOR: "Tür",
  IFCWINDOW: "Fenster",
  IFCSTAIR: "Treppe",
  IFCSTAIRFLIGHT: "Treppenlauf",
  IFCRAILING: "Geländer",
  IFCROOF: "Dach",
  IFCFOOTING: "Fundament",
  IFCPILE: "Pfahl",
  IFCPLATE: "Platte",
  IFCMEMBER: "Stab/Profil",
  IFCCOVERING: "Bekleidung/Belag",
  IFCCURTAINWALL: "Vorhangfassade",
  IFCFURNISHINGELEMENT: "Möblierung",
  IFCSPACE: "Raum",
  IFCSITE: "Gelände",
  IFCBUILDINGSTOREY: "Geschoss",
  IFCBUILDING: "Gebäude",
};

export function categoryLabel(category: string | null | undefined): string {
  if (!category) return "Bauteil";
  return CATEGORY_LABELS[category.toUpperCase()] ?? category.replace(/^IFC/i, "Ifc");
}

export class SelectionManager {
  current: Selection | null = null;
  private readonly manager: ModelManager;
  private readonly listeners = new Set<(rows: PropertyRow[] | null) => void>();

  constructor(manager: ModelManager) {
    this.manager = manager;
  }

  onChange(listener: (rows: PropertyRow[] | null) => void): void {
    this.listeners.add(listener);
  }

  /**
   * Raycast über alle sichtbaren Teilmodelle, nächster Treffer gewinnt.
   * WICHTIG: `mouse` sind PIXEL-Koordinaten (event.clientX/Y) – die
   * NDC-Umrechnung macht die Fragments-Engine intern selbst.
   * In VR: Dummy-Kamera auf der Controller-Pose + Canvas-Mittelpunkt.
   */
  async pick(
    camera: THREE.PerspectiveCamera,
    mouse: THREE.Vector2,
    dom: HTMLCanvasElement,
  ): Promise<FRAGS.RaycastResult | null> {
    const results = await Promise.all(
      this.manager.visibleModels.map((m) => m.raycast({ camera, mouse, dom })),
    );
    let best: FRAGS.RaycastResult | null = null;
    for (const r of results) {
      if (r && (!best || r.distance < best.distance)) best = r;
    }
    return best;
  }

  /** Wie pick(), aber mit Vertex-/Kanten-Snapping (fürs Messen). */
  async pickSnapped(
    camera: THREE.PerspectiveCamera,
    mouse: THREE.Vector2,
    dom: HTMLCanvasElement,
  ): Promise<FRAGS.RaycastResult | null> {
    const snappingClasses = [FRAGS.SnappingClass.POINT, FRAGS.SnappingClass.LINE];
    const results = await Promise.all(
      this.manager.visibleModels.map((m) =>
        m.raycastWithSnapping({ camera, mouse, dom, snappingClasses }),
      ),
    );
    let best: FRAGS.RaycastResult | null = null;
    for (const list of results) {
      for (const r of list ?? []) {
        if (r && (!best || r.distance < best.distance)) best = r;
      }
    }
    return best;
  }

  async select(model: FRAGS.FragmentsModel, localId: number): Promise<PropertyRow[]> {
    await this.clear(false);
    this.current = { model, localId };
    await model.highlight([localId], HIGHLIGHT);
    const rows = await this.buildRows(model, localId);
    for (const l of this.listeners) l(rows);
    return rows;
  }

  async clear(notify = true): Promise<void> {
    if (this.current) {
      try {
        await this.current.model.resetHighlight([this.current.localId]);
      } catch {
        // Modell wurde evtl. inzwischen entladen
      }
    }
    this.current = null;
    if (notify) for (const l of this.listeners) l(null);
  }

  /** IFC-Daten des Bauteils als anzeigefertige Zeilen (deutsche Labels). */
  private async buildRows(model: FRAGS.FragmentsModel, localId: number): Promise<PropertyRow[]> {
    const rows: PropertyRow[] = [];

    const [data] = await model.getItemsData([localId], {
      attributesDefault: true,
      relations: {
        IsDefinedBy: { attributes: true, relations: true },
        ContainedInStructure: { attributes: true, relations: false },
      },
    });
    if (!data) return rows;

    const catAttr = data._category;
    const category =
      catAttr && !Array.isArray(catAttr) && catAttr.value ? String(catAttr.value) : null;
    rows.push({ label: "Kategorie", value: categoryLabel(category) });

    for (const [key, label] of Object.entries(ATTRIBUTE_LABELS)) {
      const attr = data[key];
      if (attr && !Array.isArray(attr) && attr.value !== null && attr.value !== undefined) {
        const text = String(attr.value).trim();
        if (text) rows.push({ label, value: text });
      }
    }

    // Geschoss über die räumliche Struktur
    const contained = data.ContainedInStructure;
    if (Array.isArray(contained)) {
      for (const c of contained) {
        const name = c?.Name;
        if (name && !Array.isArray(name) && name.value) {
          rows.push({ label: "Geschoss", value: String(name.value) });
          break;
        }
      }
    }

    // Property-Sets (IsDefinedBy → HasProperties)
    const definedBy = data.IsDefinedBy;
    if (Array.isArray(definedBy)) {
      for (const pset of definedBy) {
        const psetName = pset?.Name;
        const title =
          psetName && !Array.isArray(psetName) && psetName.value
            ? String(psetName.value)
            : "Eigenschaften";
        const props = pset?.HasProperties;
        if (!Array.isArray(props) || !props.length) continue;
        rows.push({ label: title, value: "", isHeader: true });
        for (const p of props) {
          const pName = p?.Name;
          const pValue = p?.NominalValue;
          if (!pName || Array.isArray(pName)) continue;
          let valueText = "";
          if (pValue && !Array.isArray(pValue) && pValue.value !== null && pValue.value !== undefined) {
            valueText = formatValue(pValue.value);
          }
          rows.push({ label: String(pName.value ?? ""), value: valueText });
        }
      }
    }

    return rows;
  }
}

function formatValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "ja" : "nein";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(".", ",");
  }
  return String(value);
}
