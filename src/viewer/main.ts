import * as THREE from "three";
import { createViewerScene } from "./scene";
import { FragmentsHost } from "./core/fragments-setup";
import { ModelManager } from "./core/models";
import { ProjectManager } from "./core/projects";
import { SelectionManager } from "./core/selection";
import { StoreyFilter } from "./core/storeys";
import { ClippingTool } from "./core/tools/clipping";
import { MeasureTool } from "./core/tools/measure";
import { DesktopControls } from "./desktop/controls";
import { DesktopUI, type ToolMode } from "./desktop/ui";
import { VrInput, Locomotion } from "./vr/locomotion";
import { VrPicker } from "./vr/picking";
import { VrPanel } from "./vr/panel";

const { renderer, scene, camera, rig, canvas } = createViewerScene(
  document.getElementById("app")!,
);

const host = new FragmentsHost(scene, camera);
const manager = new ModelManager(host);
const selection = new SelectionManager(manager);
const storeys = new StoreyFilter(manager);
const clipping = new ClippingTool(renderer, scene, manager);
const measure = new MeasureTool(scene);
const controls = new DesktopControls(camera, canvas);
const projects = new ProjectManager(manager);

let tool: ToolMode = "select";

/* ---------- Desktop-UI ---------- */

const ui = new DesktopUI(manager, storeys, projects, {
  onLoadFiles: (files) => void loadFiles(files),
  onProjectOpened: () => {
    void host.forceUpdate().then(() => controls.frameBox(modelsBox()));
  },
  onNavMode: (mode) => controls.setMode(mode),
  onToolMode: (mode) => {
    tool = mode;
    if (mode !== "measure") measure.cancelPending();
    panel.draw();
  },
  onClipFlip: () => clipping.flip(),
  onClipOff: () => clipping.setEnabled(false),
  onMeasureClear: () => measure.clear(),
  onStartVr: () => void startVr(),
});

selection.onChange((rows) => {
  ui.renderProperties(rows);
  panel.setProperties(rows);
});

async function loadFiles(files: FileList): Promise<void> {
  ui.setLoading(true);
  try {
    await projects.importFiles(Array.from(files));
    await host.forceUpdate();
    controls.frameBox(modelsBox());
    ui.setHint("Linksklick wählt Bauteile aus – Werkzeuge links");
  } catch (e) {
    console.error("Laden fehlgeschlagen:", e);
    alert(
      "Datei konnte nicht geladen werden. Ist es eine .frag-Datei aus dem Konverter?\n" +
        (e instanceof Error ? e.message : ""),
    );
  } finally {
    ui.setLoading(false);
  }
}

// Beim Start: zuletzt benutztes Projekt automatisch wiederherstellen
void (async () => {
  ui.setLoading(true);
  try {
    const restored = await projects.init();
    if (restored) {
      await host.forceUpdate();
      controls.frameBox(modelsBox());
      ui.setHint(`Projekt „${restored}" wiederhergestellt`);
    }
  } catch (e) {
    console.error("Projekt-Wiederherstellung fehlgeschlagen:", e);
  } finally {
    ui.setLoading(false);
  }
})();

function modelsBox(): THREE.Box3 {
  const box = new THREE.Box3();
  for (const m of manager.models) box.expandByObject(m.model.object);
  return box;
}

/* ---------- Maus-Picking (Desktop) ---------- */

let downPos: { x: number; y: number } | null = null;
canvas.addEventListener("pointerdown", (e) => {
  downPos = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener("pointerup", (e) => {
  if (!downPos) return;
  const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
  downPos = null;
  if (moved > 5 || renderer.xr.isPresenting) return;

  // mouse = Pixel-Koordinaten; im Ego-Modus (Maussperre) zielt die Bildmitte
  const locked = document.pointerLockElement === canvas;
  const mouse = locked
    ? new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2)
    : new THREE.Vector2(e.clientX, e.clientY);
  void handlePick(mouse);
});

async function handlePick(mouse: THREE.Vector2): Promise<void> {
  if (tool === "measure") {
    const hit = await selection.pickSnapped(camera, mouse, canvas);
    if (hit) {
      measure.addPoint(hit.point);
      controls.setPivot(hit.point);
    }
    return;
  }
  const hit = await selection.pick(camera, mouse, canvas);
  if (hit) controls.setPivot(hit.point); // angeklickter Punkt wird Orbit-Drehpunkt
  if (tool === "clip") {
    if (hit) clipping.setFromPointAndNormal(hit.point, hit.normal ?? new THREE.Vector3(0, 1, 0));
    return;
  }
  if (hit) await selection.select(hit.fragments, hit.localId);
  else await selection.clear();
}

// Mausrad verschiebt die Schnittebene, solange das Schnitt-Werkzeug aktiv ist
// (capture-Phase, damit OrbitControls währenddessen nicht zoomt)
window.addEventListener(
  "wheel",
  (e) => {
    if (tool !== "clip" || !clipping.enabled || renderer.xr.isPresenting) return;
    if (e.target !== canvas) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const step = e.shiftKey ? 0.02 : 0.15;
    clipping.translate(e.deltaY < 0 ? step : -step);
  },
  { capture: true, passive: false },
);

/* ---------- VR ---------- */

const input = new VrInput(renderer, rig);
const vrPicker = new VrPicker(selection, canvas);

const panel = new VrPanel(manager, storeys, {
  onTool: (mode) => ui.setTool(mode),
  onClipFlip: () => clipping.flip(),
  onClipOff: () => clipping.setEnabled(false),
  onMeasureClear: () => measure.clear(),
  getTool: () => tool,
});

const locomotion = new Locomotion(rig, camera, input, scene, async () => {
  const right = input.controller("right");
  if (!right) return null;
  const hit = await vrPicker.pick(right.ray);
  return hit?.normal ? { point: hit.point, normal: hit.normal } : null;
});

// Laser am rechten Controller (Zielhilfe)
const laser = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -6),
  ]),
  new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }),
);
laser.visible = false;

if (navigator.xr) {
  void navigator.xr.isSessionSupported("immersive-vr").then((ok) => {
    if (ok) ui.showVrButton();
  });
}

async function startVr(): Promise<void> {
  try {
    const session = await navigator.xr!.requestSession("immersive-vr", {
      optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking"],
    });
    renderer.xr.setReferenceSpaceType("local-floor");
    await renderer.xr.setSession(session);
  } catch (e) {
    console.error("VR-Start fehlgeschlagen:", e);
    alert("VR-Sitzung konnte nicht gestartet werden.");
  }
}

renderer.xr.addEventListener("sessionstart", () => {
  ui.setSidebarVisible(false);

  // Nutzer vor das Modell stellen (Rig-Ursprung = Fußboden bei local-floor)
  const box = modelsBox();
  if (!box.isEmpty()) {
    const center = box.getCenter(new THREE.Vector3());
    rig.position.set(center.x, Math.max(box.min.y, 0), box.max.z + 3);
    rig.rotation.set(0, 0, 0);
  }

  const left = input.controller("left") ?? input.slots[0];
  panel.attachTo(left.grip);
  panel.mesh.visible = true;

  const right = input.controller("right") ?? input.slots[1];
  right.ray.add(laser);
  laser.visible = true;
});

renderer.xr.addEventListener("sessionend", () => {
  ui.setSidebarVisible(true);
  laser.visible = false;
  rig.position.set(0, 0, 0);
  rig.rotation.set(0, 0, 0);
  controls.frameBox(modelsBox());
});

/* ---------- VR-Interaktion pro Frame ---------- */

const panelRaycaster = new THREE.Raycaster();
const tmpMat = new THREE.Matrix4();
let panelHit: { x: number; y: number } | null = null;
let vrPickBusy = false;

function updateVrPointer(): void {
  panelHit = null;
  const right = input.controller("right");
  if (!right || !panel.visible) {
    panel.setHover(null);
    return;
  }
  tmpMat.identity().extractRotation(right.ray.matrixWorld);
  panelRaycaster.ray.origin.setFromMatrixPosition(right.ray.matrixWorld);
  panelRaycaster.ray.direction.set(0, 0, -1).applyMatrix4(tmpMat);
  const hits = panelRaycaster.intersectObject(panel.mesh, false);
  if (hits.length && hits[0].uv) {
    panelHit = panel.uvToPixel(hits[0].uv);
    panel.setHover(panelHit);
  } else {
    panel.setHover(null);
  }
}

function handleVrButtons(): void {
  // X-Taste links: Menü ein/aus
  if (input.justPressed("left", 4)) panel.toggle();

  // Y-Taste links: Auswahl aufheben (A/B rechts sind hoch/runter)
  if (input.justPressed("left", 5)) void selection.clear();

  // Trigger rechts: Panel-Klick oder Werkzeug-Aktion
  if (input.justPressed("right", 0)) {
    if (panelHit) {
      panel.click(panelHit);
    } else if (!vrPickBusy) {
      vrPickBusy = true;
      void vrToolAction().finally(() => {
        vrPickBusy = false;
      });
    }
  }

  // Grip links gedrückt + Schnitt-Werkzeug: Ebene folgt dem Controller
  if (tool === "clip" && input.isDown("left", 1)) {
    const left = input.controller("left");
    if (left) {
      const point = new THREE.Vector3().setFromMatrixPosition(left.grip.matrixWorld);
      const normal = new THREE.Vector3(0, 0, -1).applyMatrix4(
        tmpMat.identity().extractRotation(left.grip.matrixWorld),
      );
      clipping.setFromPointAndNormal(point, normal);
    }
  }
}

async function vrToolAction(): Promise<void> {
  const right = input.controller("right");
  if (!right) return;
  if (tool === "measure") {
    const hit = await vrPicker.pickSnapped(right.ray);
    if (hit) measure.addPoint(hit.point);
    return;
  }
  if (tool === "clip") {
    const hit = await vrPicker.pick(right.ray);
    if (hit) clipping.setFromPointAndNormal(hit.point, hit.normal ?? new THREE.Vector3(0, 1, 0));
    return;
  }
  const hit = await vrPicker.pick(right.ray);
  if (hit) await selection.select(hit.fragments, hit.localId);
  else await selection.clear();
}

/* ---------- Renderloop ---------- */

// Debug-Zugriff für die Browser-Konsole
(window as unknown as Record<string, unknown>).__ifcvr = {
  manager,
  storeys,
  selection,
  host,
  camera,
  clipping,
  measure,
  controls,
  THREE,
  pick: (x: number, y: number) => handlePick(new THREE.Vector2(x, y)),
};

const clock = new THREE.Clock();
renderer.setAnimationLoop((time: number) => {
  const dt = Math.min(clock.getDelta(), 0.05);
  host.tick(time);

  if (renderer.xr.isPresenting) {
    locomotion.update(dt, time);
    updateVrPointer();
    handleVrButtons();
    input.latch();
  } else {
    controls.update(dt);
  }

  renderer.render(scene, camera);
});
