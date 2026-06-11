import type { ModelManager } from "./models";

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
}

export interface StoredModel {
  id: string;
  projectId: string;
  name: string;
  /** Soll das Modell beim Projektstart in die Szene geladen werden? */
  loaded: boolean;
  size: number;
}

const DB_NAME = "ifc-vr";
const DB_VERSION = 1;
const LAST_PROJECT_KEY = "ifcvr.lastProject";

/**
 * Persistente Projektverwaltung über IndexedDB: Projekte + .frag-Daten
 * bleiben lokal im Browser gespeichert (auch auf der Quest), sodass Modelle
 * nicht bei jedem Besuch neu importiert werden müssen.
 * Stores: "projects" (Metadaten), "models" (Metadaten je Teilmodell),
 * "blobs" (die .frag-Bytes, getrennt, damit Listen-Abfragen leicht bleiben).
 */
export class ProjectStore {
  private db: IDBDatabase | null = null;

  async open(): Promise<void> {
    // Browser bitten, den Speicher nicht automatisch zu räumen
    try {
      await navigator.storage?.persist?.();
    } catch {
      // optional – nicht überall verfügbar
    }
    this.db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("projects")) {
          db.createObjectStore("projects", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("models")) {
          const models = db.createObjectStore("models", { keyPath: "id" });
          models.createIndex("byProject", "projectId");
        }
        if (!db.objectStoreNames.contains("blobs")) {
          db.createObjectStore("blobs");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private tx(stores: string[], mode: IDBTransactionMode): IDBTransaction {
    if (!this.db) throw new Error("ProjectStore nicht geöffnet");
    return this.db.transaction(stores, mode);
  }

  private request<T>(req: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async listProjects(): Promise<ProjectMeta[]> {
    const all = await this.request(
      this.tx(["projects"], "readonly").objectStore("projects").getAll(),
    );
    return (all as ProjectMeta[]).sort((a, b) => a.createdAt - b.createdAt);
  }

  async createProject(name: string): Promise<ProjectMeta> {
    const meta: ProjectMeta = { id: crypto.randomUUID(), name, createdAt: Date.now() };
    await this.request(this.tx(["projects"], "readwrite").objectStore("projects").put(meta));
    return meta;
  }

  async deleteProject(projectId: string): Promise<void> {
    const models = await this.listModels(projectId);
    const tx = this.tx(["projects", "models", "blobs"], "readwrite");
    tx.objectStore("projects").delete(projectId);
    for (const m of models) {
      tx.objectStore("models").delete(m.id);
      tx.objectStore("blobs").delete(m.id);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async listModels(projectId: string): Promise<StoredModel[]> {
    const all = await this.request(
      this.tx(["models"], "readonly").objectStore("models").index("byProject").getAll(projectId),
    );
    return (all as StoredModel[]).sort((a, b) => a.name.localeCompare(b.name, "de"));
  }

  async addModel(projectId: string, name: string, bytes: ArrayBuffer): Promise<StoredModel> {
    const meta: StoredModel = {
      id: crypto.randomUUID(),
      projectId,
      name,
      loaded: true,
      size: bytes.byteLength,
    };
    const tx = this.tx(["models", "blobs"], "readwrite");
    tx.objectStore("models").put(meta);
    tx.objectStore("blobs").put(bytes, meta.id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return meta;
  }

  async getModelBytes(modelId: string): Promise<ArrayBuffer | null> {
    const result = await this.request(
      this.tx(["blobs"], "readonly").objectStore("blobs").get(modelId),
    );
    return (result as ArrayBuffer) ?? null;
  }

  async setModelLoaded(modelId: string, loaded: boolean): Promise<void> {
    const tx = this.tx(["models"], "readwrite");
    const store = tx.objectStore("models");
    const meta = (await this.request(store.get(modelId))) as StoredModel | undefined;
    if (!meta) return;
    meta.loaded = loaded;
    store.put(meta);
  }

  async deleteModel(modelId: string): Promise<void> {
    const tx = this.tx(["models", "blobs"], "readwrite");
    tx.objectStore("models").delete(modelId);
    tx.objectStore("blobs").delete(modelId);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async storageEstimate(): Promise<string> {
    try {
      const est = await navigator.storage?.estimate?.();
      if (!est?.usage) return "";
      const mb = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;
      return est.quota ? `Speicher: ${mb(est.usage)} von ${mb(est.quota)} belegt` : mb(est.usage);
    } catch {
      return "";
    }
  }
}

/**
 * Verbindet ProjectStore (Persistenz) mit ModelManager (Szene):
 * aktives Projekt, automatisches Wiederherstellen, Laden/Entladen
 * ohne Neuimport.
 */
export class ProjectManager {
  readonly store = new ProjectStore();
  projects: ProjectMeta[] = [];
  active: ProjectMeta | null = null;
  /** Gespeicherte Teilmodelle des aktiven Projekts (inkl. nicht geladener). */
  storedModels: StoredModel[] = [];
  private readonly manager: ModelManager;
  private readonly listeners = new Set<() => void>();
  /** storageId → Laufzeit-Modell-Id im ModelManager */
  private readonly runtimeIds = new Map<string, string>();

  constructor(manager: ModelManager) {
    this.manager = manager;
  }

  onChange(listener: () => void): void {
    this.listeners.add(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  async init(): Promise<string | null> {
    await this.store.open();
    this.projects = await this.store.listProjects();
    const lastId = localStorage.getItem(LAST_PROJECT_KEY);
    const last = this.projects.find((p) => p.id === lastId) ?? null;
    if (last) {
      await this.openProject(last.id);
      return last.name;
    }
    this.emit();
    return null;
  }

  async openProject(projectId: string): Promise<void> {
    const project = this.projects.find((p) => p.id === projectId);
    if (!project) return;

    // Aktuelle Szene leeren
    for (const m of [...this.manager.models]) await this.manager.remove(m.id);
    this.runtimeIds.clear();

    this.active = project;
    localStorage.setItem(LAST_PROJECT_KEY, project.id);
    this.storedModels = await this.store.listModels(project.id);
    this.emit();

    for (const stored of this.storedModels) {
      if (stored.loaded) await this.loadStored(stored.id);
    }
  }

  async createProject(name: string): Promise<void> {
    const meta = await this.store.createProject(name);
    this.projects.push(meta);
    await this.openProject(meta.id);
  }

  async deleteActiveProject(): Promise<void> {
    if (!this.active) return;
    const id = this.active.id;
    for (const m of [...this.manager.models]) await this.manager.remove(m.id);
    this.runtimeIds.clear();
    await this.store.deleteProject(id);
    this.projects = this.projects.filter((p) => p.id !== id);
    this.active = null;
    this.storedModels = [];
    localStorage.removeItem(LAST_PROJECT_KEY);
    this.emit();
  }

  /** Neue Dateien importieren: in IndexedDB sichern + in die Szene laden. */
  async importFiles(files: File[]): Promise<void> {
    if (!this.active) {
      const date = new Date().toLocaleDateString("de-DE");
      const meta = await this.store.createProject(`Projekt vom ${date}`);
      this.projects.push(meta);
      this.active = meta;
      localStorage.setItem(LAST_PROJECT_KEY, meta.id);
      this.storedModels = [];
    }
    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const name = file.name.replace(/\.frag$/i, "");
      const stored = await this.store.addModel(this.active.id, name, bytes);
      this.storedModels.push(stored);
      const managed = await this.manager.add(file.name, bytes);
      this.runtimeIds.set(stored.id, managed.id);
    }
    this.storedModels.sort((a, b) => a.name.localeCompare(b.name, "de"));
    this.emit();
  }

  /** Gespeichertes Modell (wieder) in die Szene laden – ohne Neuimport. */
  async loadStored(storageId: string): Promise<void> {
    const stored = this.storedModels.find((m) => m.id === storageId);
    if (!stored || this.runtimeIds.has(storageId)) return;
    const bytes = await this.store.getModelBytes(storageId);
    if (!bytes) return;
    const managed = await this.manager.add(`${stored.name}.frag`, bytes);
    this.runtimeIds.set(storageId, managed.id);
    stored.loaded = true;
    await this.store.setModelLoaded(storageId, true);
    this.emit();
  }

  /** Aus der Szene entladen, bleibt aber im Projekt gespeichert. */
  async unloadStored(storageId: string): Promise<void> {
    const runtimeId = this.runtimeIds.get(storageId);
    if (runtimeId) {
      await this.manager.remove(runtimeId);
      this.runtimeIds.delete(storageId);
    }
    const stored = this.storedModels.find((m) => m.id === storageId);
    if (stored) {
      stored.loaded = false;
      await this.store.setModelLoaded(storageId, false);
    }
    this.emit();
  }

  /** Endgültig aus dem Projekt (und dem Browser-Speicher) löschen. */
  async deleteStored(storageId: string): Promise<void> {
    await this.unloadStored(storageId);
    await this.store.deleteModel(storageId);
    this.storedModels = this.storedModels.filter((m) => m.id !== storageId);
    this.emit();
  }

  runtimeIdFor(storageId: string): string | undefined {
    return this.runtimeIds.get(storageId);
  }
}
