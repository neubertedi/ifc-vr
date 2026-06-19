# IFC VR – Abschlussdokumentation

*Stand: 19. Juni 2026 · eberhardt – die ingenieure GmbH*

Diese Dokumentation fasst zusammen, was gebaut wurde, wie man es benutzt, wie es
technisch funktioniert und was noch offen ist. Sie ist so geschrieben, dass auch
jemand ohne Programmierkenntnisse den Überblick behält – die technischen Abschnitte
am Ende sind für die spätere Weiterentwicklung gedacht.

---

## 1. Was ist das?

Ein selbst gebauter **Betrachter für IFC-Modelle (BIM)** – kostenlos, ohne
Lizenzgebühren, ohne fremde Server für die Modelldaten. Er läuft an zwei Orten:

- **Im PC-Browser** – für Besprechungen, Beamer, Kunden ohne VR-Brille. Mehrere
  Leute schauen gleichzeitig auf den Bildschirm.
- **In VR auf der Meta Quest 3** – das Gebäude in Originalgröße begehen,
  standalone (ohne angeschlossenen PC).

Beides ist **dieselbe Webseite**: https://neubertedi.github.io/ifc-vr/

**Datenschutz-Versprechen:** Die Modelle bleiben immer auf euren eigenen Geräten.
Veröffentlicht ist nur das Programm selbst – niemals eure Modelldaten.

---

## 2. Der tägliche Arbeitsablauf

```
1. KONVERTIEREN (einmal pro Modell, am Büro-PC)
   convert.html öffnen → IFC- oder IFCZIP-Datei hineinziehen → warten
   → fertige .frag-Datei(en) herunterladen
   (Die .frag-Datei ist nur ca. 5–15 % so groß wie die IFC – deshalb läuft
    sie überhaupt erst flüssig auf der Brille.)

2. AUF DIE BRILLE BRINGEN
   "Alle als ZIP herunterladen" → das ZIP auf HiDrive legen → auf der Quest
   herunterladen.

3. ANSCHAUEN
   Viewer öffnen → "Modelle hinzufügen" → das ZIP auswählen → fertig.
   Beim nächsten Mal merkt sich der Viewer das Projekt von selbst.
```

Warum der Umweg über das Konvertieren? Eure IFC-Dateien sind zu groß, als dass
ein Browser sie direkt auf der Brille verarbeiten könnte. Das `.frag`-Format ist
klein, lädt schnell und behält trotzdem alle Bauteil-Informationen und die
Geschossstruktur.

---

## 3. Bedienung am PC (Desktop)

| Aktion | Bedienung |
|---|---|
| Drehen / Zoomen | Maus (Orbit-Modus) |
| Durchlaufen | „Begehen (WASD)" → ins Bild klicken, dann W/A/S/D + Maus, Umschalt = schneller, E/Q = hoch/runter, Esc = Maus freigeben |
| Bauteil-Infos | Werkzeug „Auswählen" → Bauteil anklicken (zeigt Typ, Material, Geschoss, alle Eigenschaften) |
| Drehpunkt | Der angeklickte Punkt wird automatisch zum neuen Drehzentrum |
| Messen | Werkzeug „Messen" → zwei Punkte anklicken |
| Schnitt | Werkzeug „Schnitt" → auf eine Fläche klicken; Mausrad verschiebt die Ebene (Umschalt = fein) |
| Geschosse / Teilmodelle | Häkchen in der Seitenleiste |
| Detailstufe | Hoch / Mittel / Niedrig |

## 4. Bedienung in VR (Meta Quest 3)

| Aktion | Bedienung |
|---|---|
| Gehen | Linker Daumenstick |
| Drehen | Rechter Stick links/rechts (in 45°-Schritten) |
| Teleport | Rechten Stick nach vorn drücken, zielen (türkiser Ring), loslassen |
| Hoch / runter schweben | B-Taste = hoch, A-Taste = runter (rechter Controller, halten) |
| Bauteil-Infos | Mit rechtem Controller zielen + Trigger |
| Menü ein/aus | X-Taste (linker Controller) – hängt am linken Handgelenk |
| Menü bedienen | Mit rechtem Laser zielen + Trigger |
| Schnittebene setzen | Werkzeug „Schnitt" im Menü, dann linke Grip-Taste halten und Hand bewegen |
| Auswahl aufheben | Y-Taste (linker Controller) |

**Für andere sichtbar machen (Besprechung):** Die Quest kann ihr Bild live an
einen PC senden – Schnellmenü → Kamera → Übertragen → Computer, am PC dann
horizon.meta.com/casting öffnen. Dafür ist kein eigener Code nötig.

---

## 5. Was der Viewer alles kann (Funktionsumfang)

- **Konverter** mit Stapelverarbeitung (mehrere Dateien / ganzes IFCZIP auf einmal)
  und Klassen-Ausschluss (Möblierung, Bewehrung, TGA, Kleinteile weglassen)
- **Zwei vollwertige Bedien-Modi:** Desktop (Maus/Tastatur) und VR (Controller)
- **Mehrere Teilmodelle** gleichzeitig, einzeln ein-/ausblendbar (Gewerke-Workflow)
- **Bauteil-Eigenschaften** auf Deutsch (Kategorie, Name, Material, Geschoss,
  Property-Sets)
- **Geschoss-Filter** über alle Teilmodelle hinweg gebündelt
- **Messen** (zwei Punkte, mit Vertex-/Kanten-Fang) und **Schnittebenen**
- **Projekte mit Gedächtnis:** Einmal importierte Modelle bleiben auf dem Gerät
  gespeichert; das zuletzt benutzte Projekt wird beim Start automatisch geladen
- **Detailstufen-Regler** (Hoch/Mittel/Niedrig) zum Abwägen zwischen
  Vollständigkeit und flüssiger Bildrate – pro Gerät gespeichert

---

## 6. Technischer Aufbau (für die Weiterentwicklung)

Vite + TypeScript + three.js + **@thatopen/fragments 3.4.5** (exakt gepinnt).
Bewusst **ohne** @thatopen/components (maus-/DOM-orientiert, verträgt sich nicht
mit dem VR-Renderer).

```
convert.html + src/convert/   → Konverter (IFC/IFCZIP → .frag), rein im Browser
index.html  + src/viewer/
  core/    → Logik ohne Bildschirm-Bezug (von Desktop UND VR genutzt):
             fragments-setup (kapselt die ThatOpen-API), models, projects
             (Speicherung im Browser), selection, storeys, tools/
  desktop/ → Maus/WASD-Steuerung + HTML-Seitenleiste
  vr/      → Fortbewegung, Controller-Auswahl, Menü als gemaltes Panel
scripts/   → Hilfsprogramme (Asset-Kopie, Kommandozeilen-Konverter)
```

Der **WebXR-Worker und das WASM** werden selbst gehostet (im `public/`-Ordner),
nie von einem fremden CDN geladen.

Die wichtigsten, mühsam erarbeiteten Erkenntnisse stehen ausführlich in der Datei
[CLAUDE.md](CLAUDE.md) – die liest Claude beim Start automatisch und vermeidet so,
dieselben Fallen erneut zu treten. Kurzfassung der größten Stolpersteine:

- **GPU-Budget & Detailstufen:** Die Engine schätzt ihren Grafikspeicher und ihre
  Detailtiefe aus der Fenstergröße – auf der Quest viel zu niedrig, weshalb Teile
  (z. B. Schrauben) verschwanden. Gelöst über gezielte Eingriffe in
  `vite.config.ts` und den Schalter `model.setLodMode(ALL_GEOMETRY)` in der
  Detailstufe „Hoch".
- **VR ist 8- bis 10-mal aufwändiger als der 2D-Browser** (zwei Bilder, höhere
  Auflösung, harte 72-Hz-Vorgabe) – deshalb dort der Detailstufen-Regler.
- **VR-Menü** nur neu zeichnen, wenn sich der markierte Knopf ändert (sonst
  Ruckeln), und erst nach gemeldeter Controller-Händigkeit an die linke Hand hängen.

---

## 7. Veröffentlichung & Wartung

- **Hosting:** GitHub Pages, kostenlos. Repo: https://github.com/neubertedi/ifc-vr
  (GitHub-Konto „neubertedi").
- **Automatik:** Jeder Push auf den `main`-Zweig baut und veröffentlicht die App
  von selbst (eingerichtet in `.github/workflows/deploy.yml`). Nach 1–2 Minuten
  ist die Änderung live.
- **Laufende Kosten:** keine.
- **Befehle für die Entwicklung:**
  - `npm install` – Abhängigkeiten holen + Worker/WASM kopieren
  - `npm run dev` – lokaler Testserver auf Port 5173
  - `npm run build` – Prüfung + fertiges Paket

---

## 8. Was noch offen / geplant ist

**Modelle zentral vom Firmenserver** (statt auf jedes Gerät einzeln zu kopieren):
Dafür existiert ein fertig durchdachter, aber noch **nicht umgesetzter** Plan
(gespeichert unter `~/.claude/plans/`). Kernidee: Die Modelle liegen einmal in
einem Ordner auf dem Firmenserver, alle Geräte holen sie sich automatisch und
aktualisieren nur, was sich geändert hat.

Vor der Umsetzung muss mit dem IT-Admin geklärt werden, welcher Weg möglich ist:

- **Variante A – auch von unterwegs (ohne VPN):** über einen „Cloudflare Tunnel"
  (Server baut nur ausgehende Verbindungen auf, kein offener Port). Bequem, aber
  die Modelldaten fließen verschlüsselt durch einen US-Dienstleister.
- **Variante B – nur im Büro-Netz:** ein kleiner interner Webserver. Maximal
  sicher, von außen aber nur per VPN erreichbar.

Solange das nicht eingerichtet ist, bleibt der heutige Weg (Konvertieren →
HiDrive → einmal importieren) der gültige – und er funktioniert einwandfrei.

---

## 9. Ehrliche Grenzen

- Die **physikalischen Grenzen der Quest 3** sind ausgereizt. Das größte Projekt
  (25 Teilmodelle) läuft standalone nur sinnvoll, wenn man **nicht alle Gewerke
  gleichzeitig** und mit passender Detailstufe lädt – genau wie man auch in
  Navisworks nur die relevanten Gewerke einblendet.
- Wer das **komplette Riesenprojekt in voller Detailtiefe** in VR sehen will,
  nutzt den **PC-VR-Modus** (Quest per Link-Kabel/Air Link an einen starken PC,
  dieselbe Webseite im Desktop-Browser, „VR starten"). Dann rechnet der PC – kein
  zusätzlicher Code nötig.
- Ein direkter Abruf von **HiDrive** durch den Viewer ist nicht möglich (eine
  Browser-Sicherheitssperre namens CORS verhindert das). HiDrive bleibt deshalb
  reiner Verteilkanal zum Herunterladen.
```
