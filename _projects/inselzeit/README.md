# Inselzeit

Ein spielbarer Browser-MVP für ein seedbasiertes 3D-Aufbauspiel. Fünf Menschen erreichen eine Insel per Schiff; aus ihren Vorräten entsteht eine Siedlung mit Wohnraum, Landwirtschaft und Rohstoffproduktion. Die Spielregeln und der Spielstand sind von der Three.js-Darstellung getrennt.

## Starten

Voraussetzung: Node.js 22.12 oder neuer innerhalb Version 22, Node.js 24 oder Node.js 26+ und npm.

```bash
npm install
npm run dev
```

Die von Vite ausgegebene lokale Adresse im Browser öffnen. Für einen Test auf dem iPhone müssen Computer und Telefon im selben Netzwerk sein; die ausgegebene Netzwerkadresse verwenden. Für die Installation als PWA und Offlinebetrieb ist HTTPS (oder localhost) erforderlich.

```bash
npm test        # automatisierte Tests
npm run build   # Produktionsdateien in dist/
npm run preview # gebaute Version lokal prüfen
```

Für die Veröffentlichung den Inhalt von `dist/` auf einen statischen HTTPS-Webserver hochladen. Die Pfade sind relativ, sodass auch ein Unterverzeichnis möglich ist. Auf dem iPhone in Safari über **Teilen → Zum Home-Bildschirm** installieren. Nach dem ersten vollständigen Laden stehen die App-Dateien auch offline zur Verfügung; lokale Spielstände verbleiben im Browser auf diesem Gerät.

## Spielen

1. Seed eingeben und ein neues Spiel starten. Derselbe Seed erzeugt dieselbe Insel.
2. Das Schiff erreicht nach etwa elf Sekunden die Küste und bringt fünf Erwachsene sowie Holz, Stein und Nahrung mit. Bis dahin ist der Bau mangels Vorräten gesperrt.
3. Unten links den Bau-Shop öffnen und ein Gebäude wählen. Auf eine geeignete Stelle tippen und **Hier bauen** bestätigen. Grün bedeutet baubar; Rot zeigt einen ungültigen Platz. Ein Gebäude ohne aktiven Baumodus antippen, um seine Daten anzusehen.
4. Für alle fünf Menschen werden zwei Wohnhäuser benötigt. Einen Bauernhof auf fruchtbarem Boden bauen. Holzfäller, Steinbruch und Mine benötigen entsprechende Vorkommen in der Nähe. Die Erklärung im Baupanel nennt den Grund für ungültige Standorte.
5. Die Spielgeschwindigkeit mit `1×` umschalten, mit `Ⅱ` pausieren und mit `↓` manuell speichern. Es gibt einen lokalen Speicherplatz; regelmäßiges Autosave und ein zusätzlicher Speicherversuch beim Verlassen sichern den aktuellen Zustand. Das Hauptmenü lädt diesen Spielstand.

**Steuerung:** Ein Finger verschiebt die Kamera; zwei Finger zoomen und drehen. Am Desktop verschiebt die linke Maustaste, die rechte dreht, das Mausrad zoomt; WASD/Pfeile und Q/E funktionieren ebenfalls. Ein Ziehen löst keinen Bau aus. Unter Einstellungen kann die Bildrate auf 30 FPS begrenzt werden.

## Simulation

Eine reale Minute bei 1× entspricht einem Spieljahr; die Simulation wird in festen Sekundenschritten unabhängig von der Bildrate aktualisiert. Die Anzeigen `+ / − pro Jahr` zeigen tatsächlich zuletzt erzeugte beziehungsweise verbrauchte Mengen. Erwachsene werden automatisch Arbeitsplätzen zugewiesen, Bauernhöfe zuerst. Produktion hängt von Arbeitskräften und lokalen Vorkommen beziehungsweise der Bodenfruchtbarkeit ab; Nahrung wird von der Bevölkerung verbraucht. Lager fassen anfangs 200 Einheiten je Ressource und können erweitert werden. Fehlende Versorgung senkt die Zufriedenheit und anhaltender Hunger kostet Menschenleben. Bei ausreichend Nahrung und Wohnraum können Kinder geboren werden; sie werden nach 18 Spieljahren arbeitsfähig. Menschen altern und sterben. Bei freien Plätzen und genügend Nahrung kann nach einiger Zeit ein weiteres Schiff eintreffen.

Der Seed generiert das Gelände deterministisch neu. Gespeichert werden der Simulationszustand einschließlich Ressourcen, Bevölkerung und Alter, Gebäude, Spielzeit, Produktionsraten und Ankunftsereignis. IndexedDB ist geräte- und browserlokal; Löschen der Website-Daten entfernt auch den Spielstand. Beim Schließen eines mobilen Browsers kann ein abschließender asynchroner Speicherversuch vom Betriebssystem abgebrochen werden; das letzte erfolgreiche Autosave bleibt erhalten.

## Aufbau

- `src/world/`: Seed, Gelände, Wasser, Klima, Vorkommen und räumliche Chunks
- `src/simulation/`: Gebäuderegeln, Ressourcen, Bevölkerung und feste Simulationsticks
- `src/render/`: prozedurale Three.js-Darstellung
- `src/input/`: Maus-, Tastatur- und Touchkamera
- `src/storage/`: versionierter IndexedDB-Spielstand
- `src/main.ts` und `src/style.css`: UI und Zusammenspiel der Systeme
- `tests/`: deterministische Welt, Wirtschaft, Bevölkerung und Spielstand-Fortsetzung

Der MVP enthält eine Insel und ein lokales Reich. Chunks strukturieren das Gelände bereits für spätere Erweiterungen; die gesamte Insel wird derzeit gerendert und simuliert. Terrainbearbeitung, weitere Staaten, Diplomatie und Militär sind bewusst noch nicht implementiert.



## GitHub Pages unter `/wgv1/`

Dieses Projekt liegt im Repository `LODS` unter `_projects/inselzeit`. Vite baut es fest für `/wgv1/`. Im Entwicklungsserver die ausgegebene Adresse mit `/wgv1/` öffnen. Bei Push auf `main` testet und baut `.github/workflows/pages.yml` das Spiel, kopiert den unveränderten Website-Stand und den Spiel-Build in ein gemeinsames Pages-Artefakt und veröffentlicht es. Bei einem fehlgeschlagenen Test oder Build wird nicht deployed. Das generierte `dist/` wird nicht eingecheckt. Änderungen an der Hauptwebsite, `CNAME` und anderen bestehenden veröffentlichten Dateien bleiben beim Zusammenstellen des Artefakts erhalten.

Der Service Worker hat ausschließlich den Scope `/wgv1/`; sein Cache trägt den Präfix `inselzeit-wgv1-`. Spielstände liegen in der IndexedDB-Datenbank `inselzeit` auf derselben Browser-Origin. Der Server muss den Spielpfad unter HTTPS ausliefern. Andere Pfade und deren Caches werden nicht vom Spiel-Service-Worker verwaltet.
Nach dem ersten Online-Aufruf muss der Service Worker fertig installiert sein, bevor der Offline-Start verfügbar ist. Zum Prüfen des Produktions-Builds npm run preview starten und /wgv1/ aufrufen. Der Actions-Workflow erstellt die Build-Dateien bei jedem Push auf main neu.
