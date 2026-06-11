# IFC VR – BIM-Modelle im Browser und auf der Meta Quest 3

Eine kostenlose Web-App für unser Büro: IFC-Modelle am PC-Browser betrachten
(Besprechungen, Beamer) **und** in VR auf der Meta Quest 3 begehen – standalone,
ohne PC, ohne App-Installation. Alle Modelldaten bleiben auf den eigenen Geräten,
nichts wird hochgeladen.

## So funktioniert der Arbeitsablauf

```
1. KONVERTIEREN (einmal pro Modell, am Büro-PC)
   convert.html öffnen → IFC/IFCZIP hineinziehen → .frag herunterladen
   (Die .frag-Datei ist nur ~5–15 % so groß wie die IFC.)

2. AUF DIE BRILLE BRINGEN
   .frag-Datei per HiDrive-Freigabelink (im Quest-Browser öffnen → herunterladen)
   oder per USB-Kabel in den Downloads-Ordner der Quest kopieren.

3. ANSCHAUEN
   Viewer-Webseite im (Quest-)Browser öffnen → „Modelle laden" → .frag auswählen
   → am PC: mit Maus navigieren | auf der Quest: „VR starten"
```

## Bedienung

### Desktop (jeder PC-Browser)

| Aktion | Bedienung |
|---|---|
| Drehen/Zoomen | Maus (Orbit-Modus) |
| Durchlaufen | „Begehen (WASD)" → Klick ins Bild, dann WASD + Maus, Umschalt = schneller, E/Q = hoch/runter, Esc = Maus freigeben |
| Bauteil-Infos | Werkzeug „Auswählen" → Bauteil anklicken |
| Messen | Werkzeug „Messen" → zwei Punkte anklicken |
| Schnitt | Werkzeug „Schnitt" → auf eine Fläche klicken; Mausrad verschiebt die Ebene (Umschalt = fein), „Umkehren"/„Schnitt aus" darunter |
| Drehpunkt | Angeklickter Punkt wird automatisch neues Orbit-Zentrum |
| Geschosse/Teilmodelle | Häkchen in der Seitenleiste |

### VR (Meta Quest 3)

| Aktion | Bedienung |
|---|---|
| Gehen | Linker Daumenstick |
| Drehen | Rechter Stick links/rechts (45°-Schritte) |
| Teleport | Rechten Stick nach vorn drücken, zielen, loslassen |
| Bauteil-Infos | Mit rechtem Controller zielen + Trigger |
| Menü ein/aus | X-Taste (linker Controller) – Werkzeuge, Geschosse, Teilmodelle, Eigenschaften |
| Menü bedienen | Mit rechtem Laser zielen + Trigger |
| Hoch/runter schweben | B-Taste = hoch, A-Taste = runter (rechter Controller, gedrückt halten) |
| Schnittebene setzen | Werkzeug „Schnitt" im Menü, dann linke Grip-Taste halten und Hand bewegen |
| Auswahl aufheben | Y-Taste (linker Controller) |

**Tipp für große Projekte (z. B. 25 Teilmodelle):** Nicht alle auf einmal laden –
nur die Gewerke, die gerade gebraucht werden. Nachladen/Entladen geht jederzeit,
auch mitten in der VR-Sitzung über das Menü.

### Projekte (dauerhaft gespeichert)

Einmal importierte Modelle werden im Browser-Speicher des Geräts abgelegt
(IndexedDB – lokal, nichts geht ins Internet). Beim nächsten Öffnen stellt der
Viewer das zuletzt benutzte Projekt automatisch wieder her – kein Neuimport nötig.

**Ganzes Projekt in einem Rutsch auf die Quest:** Im Konverter „Alle als ZIP
herunterladen" → das ZIP auf HiDrive legen → auf der Quest herunterladen →
im Viewer „Modelle hinzufügen" und das ZIP auswählen. Alle Teilmodelle landen
mit einem einzigen Import im Projekt (die Quest-Dateiauswahl kann keine
Mehrfachauswahl – so braucht sie nur eine Datei).

- **Neues Projekt** anlegen → „Modelle hinzufügen" importiert in dieses Projekt
- **✕** entlädt ein Teilmodell aus der Szene (bleibt gespeichert, „Laden" holt es zurück)
- **🗑** löscht es endgültig aus dem Browser-Speicher
- Gespeichert wird **pro Gerät und Browser** – die Quest hat also ihre eigenen Projekte

## Entwicklung

```bash
npm install        # holt Abhängigkeiten + kopiert WASM/Worker nach public/
npm run dev        # Entwicklungsserver auf http://localhost:5173
npm run build      # Produktions-Build nach dist/
```

- **Stack:** Vite + TypeScript + Three.js + [@thatopen/fragments](https://docs.thatopen.com/)
  (WebXR direkt über Three.js, bewusst ohne @thatopen/components)
- **Konverter per Kommandozeile:** `node scripts/convert-cli.mjs modell.ifc` (für Stapelverarbeitung)
- **Beispielmodell:** `public/samples/FZK-Haus.frag` (KIT-Forschungsgebäude) zum Ausprobieren
- **Test auf der Quest ohne Deployment:** Quest per USB verbinden, dann
  `adb reverse tcp:5173 tcp:5173` – im Quest-Browser `http://localhost:5173` öffnen
- **VR-Test ohne Brille:** Chrome-Erweiterung [Immersive Web Emulator](https://chromewebstore.google.com/detail/immersive-web-emulator/cgffilbpcibhmcfbgggfhfolhkfbhmik)

## Veröffentlichung (GitHub Pages)

Der Workflow `.github/workflows/deploy.yml` baut und veröffentlicht die App
automatisch bei jedem Push auf `main`. Einmalig nötig:

1. Repository auf GitHub anlegen (öffentlich – Pages ist dann kostenlos) und pushen
2. Auf GitHub: **Settings → Pages → Source: „GitHub Actions"** wählen
3. Danach ist die App unter `https://<benutzername>.github.io/<repo>/` erreichbar –
   diese Adresse im Quest-Browser als Lesezeichen speichern

Es wird nur der Programmcode veröffentlicht – Modelle wählt jeder Nutzer lokal
von seinem Gerät aus, sie verlassen es nie.
