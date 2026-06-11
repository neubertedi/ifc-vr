import type { ModelManager } from "../core/models";
import type { ProjectManager } from "../core/projects";
import type { PropertyRow } from "../core/selection";
import type { StoreyFilter } from "../core/storeys";

export type ToolMode = "select" | "measure" | "clip";

export interface UiCallbacks {
  onLoadFiles: (files: FileList) => void;
  onProjectOpened?: () => void;
  onNavMode: (mode: "orbit" | "ego") => void;
  onToolMode: (mode: ToolMode) => void;
  onClipFlip: () => void;
  onClipOff: () => void;
  onMeasureClear: () => void;
  onStartVr: () => void;
}

/** HTML-Seitenleiste des Desktop-Modus. */
export class DesktopUI {
  toolMode: ToolMode = "select";
  private readonly manager: ModelManager;
  private readonly storeys: StoreyFilter;
  private readonly projects: ProjectManager;
  private readonly cb: UiCallbacks;

  constructor(
    manager: ModelManager,
    storeys: StoreyFilter,
    projects: ProjectManager,
    cb: UiCallbacks,
  ) {
    this.manager = manager;
    this.storeys = storeys;
    this.projects = projects;
    this.cb = cb;

    manager.onChange(() => this.renderModels());
    storeys.onChange(() => this.renderStoreys());
    projects.onChange(() => {
      this.renderProjects();
      this.renderModels();
    });

    byId<HTMLSelectElement>("projectSelect").addEventListener("change", (e) => {
      const id = (e.target as HTMLSelectElement).value;
      if (id) void this.projects.openProject(id).then(() => this.cb.onProjectOpened?.());
    });
    byId<HTMLButtonElement>("projectNew").addEventListener("click", () => {
      const name = prompt("Name des neuen Projekts:", "");
      if (name?.trim()) void this.projects.createProject(name.trim());
    });
    byId<HTMLButtonElement>("projectDelete").addEventListener("click", () => {
      const active = this.projects.active;
      if (!active) return;
      if (
        confirm(
          `Projekt „${active.name}" mit allen gespeicherten Teilmodellen aus dem Browser-Speicher löschen?\n(Die .frag-Dateien auf der Festplatte bleiben erhalten.)`,
        )
      ) {
        void this.projects.deleteActiveProject();
      }
    });

    const loadBtn = byId<HTMLButtonElement>("loadBtn");
    const fragInput = byId<HTMLInputElement>("fragInput");
    loadBtn.addEventListener("click", () => fragInput.click());
    fragInput.addEventListener("change", () => {
      if (fragInput.files?.length) cb.onLoadFiles(fragInput.files);
      fragInput.value = "";
    });

    this.wireToggle("modeOrbit", "modeEgo", (m) => cb.onNavMode(m === 0 ? "orbit" : "ego"));

    const toolButtons: [string, ToolMode][] = [
      ["toolSelect", "select"],
      ["toolMeasure", "measure"],
      ["toolClip", "clip"],
    ];
    for (const [id, mode] of toolButtons) {
      byId<HTMLButtonElement>(id).addEventListener("click", () => this.setTool(mode));
    }

    byId<HTMLButtonElement>("clipFlip").addEventListener("click", cb.onClipFlip);
    byId<HTMLButtonElement>("clipOff").addEventListener("click", cb.onClipOff);
    byId<HTMLButtonElement>("measureClear").addEventListener("click", cb.onMeasureClear);
    byId<HTMLButtonElement>("vrBtn").addEventListener("click", cb.onStartVr);
  }

  setTool(mode: ToolMode): void {
    this.toolMode = mode;
    const map: Record<ToolMode, string> = {
      select: "toolSelect",
      measure: "toolMeasure",
      clip: "toolClip",
    };
    for (const id of Object.values(map)) byId(id).classList.remove("active");
    byId(map[mode]).classList.add("active");
    byId("clipOpts").style.display = mode === "clip" ? "flex" : "none";
    byId("measureOpts").style.display = mode === "measure" ? "flex" : "none";
    const hints: Record<ToolMode, string> = {
      select: "Bauteil anklicken für Eigenschaften",
      measure: "Zwei Punkte anklicken zum Messen",
      clip: "Auf Fläche klicken = schneiden · Mausrad = Ebene verschieben (Umschalt = fein)",
    };
    this.setHint(hints[mode]);
    this.cb.onToolMode(mode);
  }

  setHint(text: string): void {
    byId("hudHint").textContent = text;
  }

  showVrButton(): void {
    byId("vrBtn").classList.add("available");
  }

  setLoading(visible: boolean): void {
    byId("loading").classList.toggle("visible", visible);
  }

  setSidebarVisible(visible: boolean): void {
    byId("sidebar").classList.toggle("hidden", !visible);
  }

  private wireToggle(idA: string, idB: string, onPick: (index: 0 | 1) => void): void {
    const a = byId<HTMLButtonElement>(idA);
    const b = byId<HTMLButtonElement>(idB);
    a.addEventListener("click", () => {
      a.classList.add("active");
      b.classList.remove("active");
      onPick(0);
    });
    b.addEventListener("click", () => {
      b.classList.add("active");
      a.classList.remove("active");
      onPick(1);
    });
  }

  private renderProjects(): void {
    const select = byId<HTMLSelectElement>("projectSelect");
    select.innerHTML = "";
    if (!this.projects.projects.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "– kein Projekt –";
      select.appendChild(opt);
    }
    for (const p of this.projects.projects) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      opt.selected = p.id === this.projects.active?.id;
      select.appendChild(opt);
    }
    void this.projects.store.storageEstimate().then((text) => {
      byId("storageInfo").textContent = text;
    });
  }

  private renderModels(): void {
    const el = byId("modelList");
    el.innerHTML = "";
    const stored = this.projects.storedModels;
    if (!stored.length) {
      el.innerHTML = `<div class="empty">Noch keine Modelle im Projekt.</div>`;
      return;
    }
    for (const s of stored) {
      const row = document.createElement("div");
      const runtimeId = this.projects.runtimeIdFor(s.id);
      const managed = runtimeId
        ? this.manager.models.find((m) => m.id === runtimeId)
        : undefined;

      if (managed) {
        // Geladen: Sichtbarkeit umschalten, ✕ = entladen (bleibt gespeichert)
        row.className = "row";
        const check = document.createElement("input");
        check.type = "checkbox";
        check.checked = managed.visible;
        check.title = "Sichtbarkeit";
        check.addEventListener("change", () => this.manager.setVisible(managed.id, check.checked));
        const label = document.createElement("span");
        label.className = "grow";
        label.textContent = s.name;
        const unload = document.createElement("button");
        unload.className = "x";
        unload.title = "Entladen (bleibt im Projekt gespeichert)";
        unload.textContent = "✕";
        unload.addEventListener("click", () => void this.projects.unloadStored(s.id));
        row.append(check, label, unload);
      } else {
        // Gespeichert, aber nicht geladen
        row.className = "row unloaded";
        const load = document.createElement("button");
        load.className = "mini";
        load.textContent = "Laden";
        load.addEventListener("click", () => void this.projects.loadStored(s.id));
        const label = document.createElement("span");
        label.className = "grow";
        label.textContent = `${s.name} (${Math.max(1, Math.round(s.size / 1024 / 1024))} MB)`;
        const del = document.createElement("button");
        del.className = "x";
        del.title = "Endgültig aus dem Projekt löschen";
        del.textContent = "🗑";
        del.addEventListener("click", () => {
          if (confirm(`„${s.name}" endgültig aus dem Projekt löschen?`)) {
            void this.projects.deleteStored(s.id);
          }
        });
        row.append(load, label, del);
      }
      el.appendChild(row);
    }
  }

  private renderStoreys(): void {
    const el = byId("storeyList");
    el.innerHTML = "";
    if (!this.storeys.groups.length) {
      el.innerHTML = `<div class="empty">–</div>`;
      return;
    }
    for (const group of this.storeys.groups) {
      const row = document.createElement("div");
      row.className = "row";
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = group.visible;
      check.addEventListener("change", () => void this.storeys.setVisible(group, check.checked));
      const label = document.createElement("span");
      label.className = "grow";
      label.textContent = group.name;
      row.append(check, label);
      el.appendChild(row);
    }
  }

  renderProperties(rows: PropertyRow[] | null): void {
    const el = byId("props");
    el.innerHTML = "";
    if (!rows || !rows.length) {
      el.innerHTML = `<div class="empty">Bauteil anklicken …</div>`;
      return;
    }
    const table = document.createElement("table");
    for (const row of rows) {
      const tr = document.createElement("tr");
      if (row.isHeader) {
        const td = document.createElement("td");
        td.colSpan = 2;
        td.className = "pset";
        td.textContent = row.label;
        tr.appendChild(td);
      } else {
        const tdLabel = document.createElement("td");
        tdLabel.textContent = row.label;
        tdLabel.title = row.label;
        const tdValue = document.createElement("td");
        tdValue.textContent = row.value;
        tr.append(tdLabel, tdValue);
      }
      table.appendChild(tr);
    }
    el.appendChild(table);
  }
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} fehlt im DOM`);
  return el as T;
}
