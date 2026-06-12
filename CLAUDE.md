# IFC VR – Projektwissen für Claude

## Worum es geht

BIM-Viewer für eberhardt – die ingenieure GmbH (kleines deutsches Ingenieurbüro):
IFC-Modelle im Desktop-Browser (Besprechungen) und in VR auf der Meta Quest 3
betrachten – standalone, ohne PC. Alle Modelldaten bleiben auf den Geräten der
Nutzer, nichts wird hochgeladen. Diese Zusage niemals brechen (keine externen
Dienste/Proxies für Modelldaten einbauen).

**Nutzer-Kontext:** Die Anwender sind Ingenieure, keine Programmierer – Antworten
auf Deutsch, ohne Fachjargon erklären. Größtes Projekt: 25 Teilmodelle als
IFCZIP, ~250 MB gezippt. Die physikalischen Grenzen der Quest gelten als
ausgereizt – keine weiteren Performance-Aktionen ohne ausdrücklichen Wunsch.

## Wichtige Adressen

- Live-App: https://neubertedi.github.io/ifc-vr/ (Viewer) und /convert.html (Konverter)
- Repo: https://github.com/neubertedi/ifc-vr (GitHub-Konto: neubertedi)
- Deploy: automatisch bei jedem Push auf `main` (.github/workflows/deploy.yml, GitHub Pages)

## Befehle

- `npm install` – Abhängigkeiten + kopiert web-ifc-WASM und Fragments-Worker nach public/ (scripts/copy-assets.mjs)
- `npm run dev` – Dev-Server auf :5173
- `npm run build` – Typecheck + Produktions-Build
- `node scripts/convert-cli.mjs modell.ifc` – Konvertierung per Kommandozeile

## Architektur

Vite + TypeScript + three.js + **@thatopen/fragments 3.4.5** (exakt gepinnt!).
Bewusst OHNE @thatopen/components (Maus/DOM-orientiert, kollidiert mit renderer.xr).

- `convert.html` + `src/convert/` – IFC/IFCZIP → .frag, komplett clientseitig, Stapelverarbeitung, Klassen-Ausschluss
- `index.html` + `src/viewer/` – Viewer:
  - `core/` – headless: fragments-setup (kapselt ThatOpen-API!), models, projects (IndexedDB-Persistenz), selection, storeys, tools/
  - `desktop/` – Orbit/WASD-Steuerung + HTML-Seitenleiste
  - `vr/` – Lokomotion, Dummy-Kamera-Picking, CanvasTexture-Panel
- Worker + WASM werden selbst gehostet (public/), NIE von unpkg laden

## Hart erarbeitete Erkenntnisse (nicht erneut hineinfallen!)

1. **fragments-API:** `model.raycast({camera, mouse, dom})` erwartet PIXEL-Koordinaten
   (event.clientX/Y), NICHT NDC. VR-Picking: Dummy-Kamera auf Controller-Pose +
   Canvas-Mittelpunkt in Pixeln.
2. **getSpatialStructure():** Baum wechselt Kategorie-Knoten (localId=null) und
   Instanz-Knoten (category=null) ab; Geschoss-Instanzen sind KINDER des
   IFCBUILDINGSTOREY-Knotens. Kategorie eines Items steckt als `_category` in
   getItemsData; `getItem(id).getCategory()` wirft Fehler.
3. **Engine-Patches in vite.config.ts** (keine öffentliche API vorhanden; Needles
   brechen den Build absichtlich, wenn eine neue Bibliotheksversion sie ändert):
   - GPU-Budget: Engine schätzt aus Fenstergröße → auf Quest nur ~100 MB →
     Teile dauerhaft weg. Patch: 512-MB-Untergrenze + Override via
     `globalThis.__IFCVR_GPU_BUDGET`. >512 MB erzeugt Grafikfehler auf der Quest!
   - viewSize: Override via `globalThis.__IFCVR_VIEWSIZE` (wird bei VR-Start auf
     echte Framebuffer-Größe gesetzt). Achtung: größeres VR-Sichtfeld kompensiert
     viewSize in derselben Formel fast exakt.
   - `optimizeDeps.exclude` für @thatopen/fragments ist nötig, damit die Patches
     auch im Dev-Server greifen.
4. **Verschwundene Schrauben/Kleinteile:** Worker-LOD-Logik zeichnet Objekte <2 m
   nur als Drahtgitter/unsichtbar. DER Hebel ist die öffentliche API
   `model.setLodMode(LodMode.ALL_GEOMETRY)` – Detailstufe „Hoch" nutzt das.
   Detail-Presets in core/fragments-setup.ts koppeln LodMode + Qualität +
   GPU-Budget + VR-Renderauflösung (setFramebufferScaleFactor vor Sitzungsstart).
5. **VR-Panel:** CanvasTexture-Neuzeichnen lädt ~5 MB zur GPU – NIEMALS pro
   Hover-Pixelbewegung neu zeichnen, nur bei Wechsel des markierten Bereichs.
6. **Controller-Händigkeit** kommt erst NACH sessionstart ('connected'-Event, auch
   nach Standby erneut). Handspezifisches (Menü links, Laser rechts) nur über
   den onConnected-Callback anbringen, nie über slots[i]-Fallback.
7. **Quest-Tasten:** B liegt ÜBER A (rechter Controller) → B=hoch, A=runter.
   Quest-Dateiauswahl kennt keine Mehrfachauswahl → Viewer akzeptiert .zip mit
   mehreren .frag. HiDrive-Direktabruf scheitert an CORS (kein Proxy einbauen –
   siehe Datenschutz-Zusage oben).
8. **2D-Browser flüssig, VR nicht** ist normal: Stereo × ~2× Auflösung × harte
   72-Hz-Deadline ≈ 8–10-fache Last.

## Arbeitsabläufe des Büros

- Konvertieren am PC → „Alle als ZIP" → ZIP auf Strato HiDrive → auf der Quest
  herunterladen → einmal in den Viewer importieren (Projekt-Speicher = IndexedDB,
  pro Gerät; zuletzt benutztes Projekt wird beim Start wiederhergestellt)
- VR-Spiegelung für Besprechungen: Meta-Casting (horizon.meta.com/casting), kein eigener Code
