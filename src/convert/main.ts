import * as FRAGS from "@thatopen/fragments";
import * as WEBIFC from "web-ifc";
import { unzipSync, zipSync } from "fflate";

interface Job {
  name: string; // Ausgabename ohne Endung
  data: Uint8Array | null; // rohe IFC-Bytes (nach Konvertierung freigegeben)
  status: "wartet" | "läuft" | "fertig" | "fehler";
  result: Uint8Array | null;
  error?: string;
  el: HTMLElement;
  progressEl: HTMLProgressElement;
  statusEl: HTMLElement;
  metaEl: HTMLElement;
}

const dropzone = document.getElementById("dropzone") as HTMLElement;
const fileInput = document.getElementById("fileInput") as HTMLInputElement;
const queueEl = document.getElementById("queue") as HTMLElement;
const actionsEl = document.getElementById("actions") as HTMLElement;
const busyNote = document.getElementById("busyNote") as HTMLElement;
const downloadAllBtn = document.getElementById("downloadAll") as HTMLButtonElement;

const jobs: Job[] = [];
let running = false;

// IFC-Klassen, die per Checkbox vom Export ausgeschlossen werden können.
// Namen statt fester Zahlen, damit fehlende Konstanten einfach übersprungen werden.
const EXCLUDE_GROUPS: Record<string, string[]> = {
  exclFurniture: ["IFCFURNISHINGELEMENT", "IFCFURNITURE", "IFCSYSTEMFURNITUREELEMENT"],
  exclRebar: [
    "IFCREINFORCINGBAR",
    "IFCREINFORCINGMESH",
    "IFCREINFORCINGELEMENT",
    "IFCTENDON",
    "IFCTENDONANCHOR",
  ],
  exclMep: [
    "IFCDISTRIBUTIONELEMENT",
    "IFCDISTRIBUTIONFLOWELEMENT",
    "IFCDISTRIBUTIONCONTROLELEMENT",
    "IFCFLOWSEGMENT",
    "IFCFLOWFITTING",
    "IFCFLOWTERMINAL",
    "IFCFLOWCONTROLLER",
    "IFCFLOWMOVINGDEVICE",
    "IFCFLOWSTORAGEDEVICE",
    "IFCFLOWTREATMENTDEVICE",
    "IFCENERGYCONVERSIONDEVICE",
    "IFCPIPESEGMENT",
    "IFCPIPEFITTING",
    "IFCDUCTSEGMENT",
    "IFCDUCTFITTING",
    "IFCCABLECARRIERSEGMENT",
    "IFCCABLESEGMENT",
    "IFCAIRTERMINAL",
  ],
  exclSmallParts: ["IFCFASTENER", "IFCMECHANICALFASTENER", "IFCDISCRETEACCESSORY"],
};

function excludedClassIds(): number[] {
  const ids: number[] = [];
  for (const [checkboxId, names] of Object.entries(EXCLUDE_GROUPS)) {
    const box = document.getElementById(checkboxId) as HTMLInputElement | null;
    if (!box?.checked) continue;
    for (const name of names) {
      const id = (WEBIFC as unknown as Record<string, unknown>)[name];
      if (typeof id === "number") ids.push(id);
    }
  }
  return ids;
}

function formatMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

function baseName(fileName: string): string {
  return fileName.replace(/\.(ifczip|ifc|zip)$/i, "");
}

function createJobElement(job: Job): void {
  const el = document.createElement("div");
  el.className = "job";
  el.innerHTML = `
    <div class="name"></div>
    <div class="status">wartet …</div>
    <div class="meta"></div>
    <div class="dl"></div>
    <progress max="100" value="0"></progress>
  `;
  (el.querySelector(".name") as HTMLElement).textContent = `${job.name}.frag`;
  job.el = el;
  job.progressEl = el.querySelector("progress") as HTMLProgressElement;
  job.statusEl = el.querySelector(".status") as HTMLElement;
  job.metaEl = el.querySelector(".meta") as HTMLElement;
  if (job.data) job.metaEl.textContent = `IFC: ${formatMB(job.data.byteLength)}`;
  queueEl.appendChild(el);
}

async function addFiles(files: FileList | File[]): Promise<void> {
  for (const file of Array.from(files)) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".ifczip") || lower.endsWith(".zip")) {
      // ZIP im Browser entpacken – kann ein oder mehrere IFCs enthalten
      try {
        const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
        const ifcEntries = Object.entries(entries).filter(([n]) =>
          n.toLowerCase().endsWith(".ifc"),
        );
        if (ifcEntries.length === 1) {
          // IFCZIP enthält meist genau eine, oft generisch benannte Datei
          // (z. B. "ISO-10303-21.ifc") → äußerer Dateiname ist der richtige
          enqueue(baseName(file.name), ifcEntries[0][1]);
        } else {
          for (const [entryName, bytes] of ifcEntries) {
            enqueue(baseName(entryName.split("/").pop() ?? entryName), bytes);
          }
        }
      } catch (e) {
        const job: Job = {
          name: baseName(file.name),
          data: null,
          status: "fehler",
          result: null,
          error: "ZIP konnte nicht entpackt werden",
        } as Job;
        createJobElement(job);
        job.statusEl.textContent = "✗ ZIP konnte nicht entpackt werden";
        job.statusEl.className = "status err";
        job.progressEl.remove();
        jobs.push(job);
        console.error(e);
      }
    } else if (lower.endsWith(".ifc")) {
      enqueue(baseName(file.name), new Uint8Array(await file.arrayBuffer()));
    }
  }
  void processQueue();
}

function enqueue(name: string, data: Uint8Array): void {
  const job: Job = { name, data, status: "wartet", result: null } as Job;
  createJobElement(job);
  jobs.push(job);
}

async function processQueue(): Promise<void> {
  if (running) return;
  running = true;
  busyNote.classList.add("visible");

  for (const job of jobs) {
    if (job.status !== "wartet" || !job.data) continue;
    job.status = "läuft";
    job.statusEl.textContent = "konvertiert …";
    // UI einen Frame atmen lassen, bevor WASM den Thread belegt
    await new Promise((r) => setTimeout(r, 50));

    try {
      const serializer = new FRAGS.IfcImporter();
      serializer.wasm = { absolute: true, path: new URL("wasm/", document.baseURI).href };
      for (const id of excludedClassIds()) serializer.classes.elements.delete(id);

      const started = performance.now();
      const result = await serializer.process({
        bytes: job.data,
        progressCallback: (progress: number) => {
          job.progressEl.value = Math.round(progress * 100);
        },
      });
      const seconds = ((performance.now() - started) / 1000).toFixed(0);

      job.result = result;
      job.status = "fertig";
      job.progressEl.value = 100;
      job.statusEl.textContent = `✓ fertig (${seconds} s)`;
      job.statusEl.className = "status ok";
      job.metaEl.textContent += ` → .frag: ${formatMB(result.byteLength)}`;

      const dl = job.el.querySelector(".dl") as HTMLElement;
      const btn = document.createElement("button");
      btn.textContent = "Herunterladen";
      btn.addEventListener("click", () => downloadBytes(`${job.name}.frag`, job.result!));
      dl.appendChild(btn);
    } catch (e) {
      job.status = "fehler";
      job.error = e instanceof Error ? e.message : String(e);
      job.statusEl.textContent = "✗ Fehler – siehe Konsole";
      job.statusEl.className = "status err";
      console.error(`Konvertierung von ${job.name} fehlgeschlagen:`, e);
    } finally {
      job.data = null; // IFC-Puffer sofort freigeben (Speicherdisziplin bei 25 Teilmodellen)
    }
  }

  running = false;
  busyNote.classList.remove("visible");
  if (jobs.some((j) => j.status === "fertig")) actionsEl.classList.add("visible");
}

function downloadBytes(fileName: string, bytes: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart]));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

downloadAllBtn.addEventListener("click", () => {
  const done = jobs.filter((j) => j.status === "fertig" && j.result);
  if (!done.length) return;
  const entries: Record<string, Uint8Array> = {};
  for (const job of done) entries[`${job.name}.frag`] = job.result!;
  // .frag ist bereits komprimiert – level 0 = nur verpacken, dafür schnell
  downloadBytes("modelle-frag.zip", zipSync(entries, { level: 0 }));
});

dropzone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  if (fileInput.files?.length) void addFiles(fileInput.files);
  fileInput.value = "";
});
dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  if (e.dataTransfer?.files.length) void addFiles(e.dataTransfer.files);
});
