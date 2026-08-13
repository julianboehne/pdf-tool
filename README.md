# PDF Tool

Client-seitiges PDF-Werkzeug (Next.js), umgesetzt nach `pdf-tool-spezifikation.md`.
Dieser Stand deckt **Phase 1 (Spezifikation 4.1)** vollständig ab und zieht zwei
Werkzeuge aus Phase 2 vor: Bearbeiten und Signieren.

Die gesamte PDF-Verarbeitung läuft im Browser. Es gibt keinen Upload, keinen
Server-Endpunkt für Dateien und keine Speicherung. Der Server liefert
ausschließlich statisches HTML/JS aus.

---

## Schnellstart

Auf diesem Rechner ist kein Node installiert — die Entwicklung läuft über Docker
(analog `yard-hosting-website`).

```bash
docker compose up --build        # Dev-Server auf http://localhost:8083
```

`docker-compose.yml` hält `node_modules` in einem **Named Volume**, damit die
Host-Installation die des Containers nicht überschattet. Docker befüllt ein
solches Volume aber **nur beim erstmaligen Anlegen** aus dem Image:
`docker compose up --build` baut das Image neu und lässt das Volume unberührt.
Jede später hinzugefügte Abhängigkeit wäre damit zur Laufzeit schlicht nicht da
— der Dev-Server meldet dann `Module not found` für ein Paket, das
nachweislich in `package.json` steht.

Deshalb gleicht `scripts/dev-entrypoint.sh` die Abhängigkeiten bei **jedem
Start** mit `package.json` ab. Das kostet ein bis zwei Sekunden, wenn sich
nichts geändert hat, und macht das Volume selbstheilend. Ein
`docker compose down -v` ist nicht nötig.

Einzelne Befehle ohne Compose:

```bash
docker run --rm -v "$PWD":/app -w /app node:22-alpine npm install
docker run --rm -v "$PWD":/app -w /app node:22-alpine npm run test:smoke
docker run --rm -v "$PWD":/app -w /app node:22-alpine npx tsc --noEmit
docker run --rm -v "$PWD":/app -w /app node:22-alpine npm run build
```

Produktion (Traefik, Netzwerk `traefik-public` muss existieren):

```bash
echo "PDF_TOOL_HOST=pdf.example.com" > .env
docker compose -f docker-compose.prod.yml up -d --build
```

---

## Funktionsumfang

Phase 1 (Spezifikation 4.1) plus zwei vorgezogene Werkzeuge aus Phase 2.

| Route | Funktion | Umsetzung |
|---|---|---|
| `/merge` | PDFs kombinieren | Seitenraster über **alle** Dateien: Seiten dateiübergreifend sortieren, drehen, entfernen |
| `/split` | PDF splitten | Visuell mit Schnittmarken · Seitenbereich · alle N Seiten · seitenweise; Vorschau zeigt die Farbbänder der Ergebnisdateien |
| `/organize` | Seiten löschen/umsortieren/rotieren/extrahieren | Dasselbe Seitenraster, einzelnes Dokument |
| `/compress` | Komprimieren | Zwei Modi, siehe unten |
| `/watermark` | Wasserzeichen | Diagonal / horizontal / gekachelt; **WYSIWYG-Livevorschau** |
| `/page-numbers` | Seitenzahlen | 6 Positionen, 3 Formate, Startnummer; **WYSIWYG-Livevorschau** |
| `/edit` | PDF bearbeiten | Office-artige Leiste: formatierter Text direkt auf der Seite, Marker, Bilder (auch Strg+V), Formen-Menü, Ausrichtungshilfslinien, Texterkennung |
| `/sign` | PDF signieren | Unterschrift zeichnen / tippen / hochladen, dann positionieren |
| `/protect` | Passwortschutz setzen/entfernen | Benutzer-/Besitzerpasswort, 4 Berechtigungen |

Sprachlogik nach Spezifikation 2.1 (verifiziert):
`Accept-Language: de*` → `/de`, alles andere → `/en`, manuelle Umschaltung
überschreibt die Erkennung via `NEXT_LOCALE`-Cookie.

### Vorschauen

Drei verschiedene Vorschau-Arten, je nach dem, was die Entscheidung des Nutzers
tatsächlich braucht:

- **Seitenraster** (`merge`, `organize`) — Thumbnails aller Seiten, per
  `usePageThumbnails` **pro Datei zwischengespeichert**: eine fünfte Datei zum
  Merge hinzuzufügen rendert die ersten vier nicht neu.
- **Schnittvorschau** (`split`) — Farbbänder pro Ergebnisdatei. Vorschau und
  Export lesen dieselbe Funktion `buildGroups`, die Bänder sind also keine
  Annäherung, sondern genau die Dateien, die entstehen.
- **Livevorschau** (`watermark`, `page-numbers`) — führt die *echte* Operation
  auf einer extrahierten Einzelseite aus und rastert das Ergebnis mit pdf.js.
  Kein CSS-Nachbau, der vom Export abweichen könnte. Entprellt (350 ms).

### Der Editor (`/edit`)

Aufgebaut wie eine Office-Anwendung: eine mitlaufende Leiste, obere Zeile für
das Einfügen, untere Zeile für das Formatieren der Auswahl.

- **Text** — wird **direkt auf der Seite** getippt: ein neues Feld öffnet sich
  sofort im Schreibmodus, ein vorhandenes per Doppelklick (oder Enter/F2).
  Schriftart, Größe, Fett/Kursiv, Ausrichtung, Textfarbe und Hintergrundfüllung
  in der Formatzeile. Zeilenumbruch wird gegen die *gemessene* Breite der
  tatsächlichen Schrift gerechnet, nicht geschätzt; Ausrichtung ist selbst
  gerechnet, weil `pdf-lib` beim Umbruch immer linksbündig setzt.
- **Formen** — Rechteck, Ellipse, Linie und Pfeil in einem Aufklappmenü, mit
  Kontur, Füllung, Stärke und Deckkraft. Linien und Pfeile merken sich, entlang
  welcher Diagonale gezogen wurde, damit die Pfeilspitze am richtigen Ende
  sitzt. Die Spitze besteht aus zwei Strichen statt aus einer gefüllten Fläche —
  so passt sie immer exakt zu Farbe, Stärke und Deckkraft des Schafts.
- **Marker** — über die Seite ziehen. Gezeichnet im Blendmodus **Multiply**,
  damit der Text darunter lesbar bleibt. Ein deckendes Rechteck würde ihn
  begraben, ein transparentes ihn ausbleichen. Markierungen werden immer zuerst
  gezeichnet, damit ein später gesetzter Marker nichts überdeckt.
- **Bilder** — über Dateiauswahl oder **Strg+V** direkt aus der Zwischenablage
  (Screenshots landen dort als Bild-Blob). Ein Einfügen, das auf ein echtes
  Eingabefeld zielt, wird nicht abgefangen.
- **Tastatur und Zwischenablage** — Entf löscht das ausgewählte Element,
  Strg+C/Strg+X/Strg+V kopieren, schneiden und duplizieren es. Strg+V fügt
  weiterhin Bilder aus der System-Zwischenablage ein; enthält diese ein Bild,
  hat das Vorrang vor dem internen Duplikat.
- **Ausrichtungshilfslinien** — beim Ziehen vergleicht `lib/pdf/guides.ts` die
  Kanten und die Mitte des Elements mit Seitenmitte, Seitenrändern und allen
  anderen Elementen; der nächstliegende Treffer innerhalb von 6 px zieht das
  Element auf die Linie. Die Toleranz wird über den Maßstab gerechnet, das
  Einrasten fühlt sich also bei jeder Zoomstufe gleich an. Pfeiltasten umgehen
  das Einrasten bewusst — sie sind das Werkzeug für „fast richtig".

#### Texterkennung

Der Knopf **Text erkennen** liest die vorhandene Textebene über
`pdf.js getTextContent` und gruppiert sie zu Zeilen. Die Koordinaten kommen
direkt aus `transform` und liegen bereits in PDF-Punkten — dasselbe System wie
die Annotationen, es wird nichts umgerechnet.

Ein Klick auf eine erkannte Zeile **deckt sie ab und öffnet sie als Textfeld**
mit dem Originalwortlaut, geschätzter Größe und passender Schriftfamilie.

Warum abdecken statt ersetzen: `pdf-lib` kann Content-Streams nicht umschreiben,
ein „ersetze dieses Wort" existiert nicht. Daraus folgen zwei Grenzen, die die
Oberfläche benennt statt zu verschweigen:

- Die Abdeckfarbe wird aus dem Ring **um** die Zeile herum abgetastet
  (`sampleBackground`). Streuen diese Messpunkte zu stark, ist der Hintergrund
  nicht einfarbig — dann erscheint eine Warnung, weil das Abdecken einen
  sichtbaren Fleck hinterlässt.
- Der neue Text nutzt die gewählte Schrift, nicht die Originalschrift. Eingebettete
  Schriften sind meist Subsets und enthalten nur die bereits benutzten Zeichen.

**Kein OCR.** Seiten ohne Textebene (Scans) melden das ausdrücklich, statt ein
leeres Ergebnis zu zeigen. OCR bleibt Phase 3, offener Punkt 5.2.

#### Schriften

Helvetica, Times und Courier je in vier Schnitten — in jedem Reader vorhanden,
null Ladekosten, decken Deutsch vollständig ab. Zusätzlich **Noto Sans**,
nachgeladen erst wenn es gewählt wird (~560 kB) und mit `subset: true`
eingebettet, sodass nur die benutzten Glyphen in der Ausgabedatei landen.

Verifizierte Abdeckung von Noto Sans: **Latein, Griechisch, Kyrillisch — kein
CJK, keine Emoji.** Ein CJK-fähiger Zeichensatz wäre mehrere MB groß. Die
Oberfläche prüft den Text gegen die Abdeckung der gewählten Schrift und verweist
bei Bedarf auf Noto Sans.

### Signieren

`/edit` und `/sign` teilen sich `components/editor/`: eine `Stage` (Seite als
maßstabsgetreue Fläche) und `DraggableBox` (verschiebbar, skalierbar).
Geometrie wird in
**PDF-Punkten mit Ursprung unten links** gehalten — also im selben System, in dem
pdf-lib zeichnet. Umgerechnet wird nur zur Anzeige, dadurch sammelt sich beim
Ziehen kein Rundungsfehler an.

Zwei bewusste Einschränkungen, beide in der Oberfläche benannt:

- Elemente werden **fest in den Seiteninhalt gezeichnet**, nicht als
  PDF-Annotationen angehängt. Nach dem Export sind sie nicht mehr verschiebbar.
- `/sign` setzt eine **visuelle** Unterschrift. Das ist keine kryptografische
  oder qualifizierte elektronische Signatur nach eIDAS.

Die Unterschrift wird auf ihre tatsächliche Tinte zugeschnitten (`trimToInk`) und
als PNG mit Transparenz eingebettet — sonst zöge man beim Platzieren einen
überwiegend leeren Kasten über die Seite.

---

## Abweichungen von der Spezifikation

Beide Abweichungen sind sachlich begründet, nicht kosmetisch.

### 1. `@cantoo/pdf-lib` statt `pdf-lib`

Die Spezifikation nennt `pdf-lib` (4.1) für „Passwortschutz setzen/entfernen".
**`pdf-lib` 1.17.1 kann keine Verschlüsselung schreiben** — es kann verschlüsselte
Dokumente nur mit `ignoreEncryption` öffnen. Das Feature wäre damit nicht
umsetzbar gewesen.

`@cantoo/pdf-lib` ist ein gepflegter, API-kompatibler Fork mit:

- `doc.encrypt({ userPassword, ownerPassword, permissions })`
- `PDFDocument.load(bytes, { password })` zum Entschlüsseln
- `doc.isEncrypted`

Der Fork wird durchgängig für alle Phase-1-Operationen verwendet, nicht nur für
den Passwortschutz — zwei PDF-Bibliotheken parallel wären unnötiger Ballast.

**Nebenwirkung mit Konsequenz:** Der Fork verwirft Zeichen, die WinAnsi nicht
darstellen kann (CJK, Emoji, Griechisch), *stillschweigend* — anders als das
Original, das wirft. Ein Wasserzeichen „機密" wäre also unbemerkt leer geblieben.
Deshalb prüft `lib/pdf/text.ts` den Text vorab und meldet einen klaren Fehler;
die Wasserzeichen-Oberfläche warnt bereits während der Eingabe.

### 2. `pdfjs-dist` statt `pdfium` (WASM) für die Kompression

Die Spezifikation nennt einen `pdfium`-WASM-Build (3.) für „feinere
Rekompression". Für den MVP zurückgestellt: pdf.js ist für die Seitenvorschau
ohnehin im Bundle und deckt den Rasterpfad ab, ohne eine zweite WASM-Nutzlast zu
laden.

`/compress` bietet stattdessen zwei ehrliche Modi statt eines Magie-Reglers:

- **Verlustfrei** — Neuschreiben mit Objekt- und Querverweis-Streams. Text bleibt
  Text, Ersparnis typisch 5–20 % und stark vom Original abhängig.
- **Stark** — Jede Seite wird über pdf.js neu gerendert und als JPEG eingebettet
  (Qualität, Auflösung, Graustufen einstellbar). Große Ersparnis bei Scans, aber
  **das Ergebnis enthält keinen durchsuchbaren Text mehr.** Die Oberfläche weist
  darauf explizit hin.

Wenn echte Bild-Rekompression *unter Erhalt des Textlayers* gefordert ist, ist
`pdfium` oder ein qpdf-WASM-Build der nächste Schritt — das ist eine eigene
Aufgabe, kein Nachziehen hier.

---

## Architektur

```
app/[locale]/            Routen (statisch vorgeneriert, 27 Seiten)
components/tools/        Eine Client-Komponente je Werkzeug + geteilte Bausteine
components/editor/       Stage, DraggableBox, Seitennavigation — von /edit und /sign geteilt
components/ui/           Dropzone, Button, Felder, Fortschritt, Icons
lib/pdf/                 Reine Funktionen: Uint8Array rein, Uint8Array raus
lib/pdf/guides.ts        Einrast-Geometrie der Hilfslinien (ohne React, testbar)
lib/pdf/textLayer.ts     Textextraktion via pdf.js, zu Zeilen gruppiert
lib/pdf/fonts.ts         Standardschriften + Noto Sans (Lazy Load, Subset)
public/fonts/            Noto Sans (OFL 1.1, Lizenz liegt daneben)
lib/tools.ts             Registry, die Navigation, Startseite und Titel speist
i18n/, messages/         next-intl: Routing, Locale-Auflösung, EN/DE-Texte
scripts/smoke-test.mts   Funktionstest für lib/pdf (40 Prüfungen)
scripts/check-messages.mts  Prüft EN/DE auf Schlüsselgleichstand
```

Tragende Entscheidungen:

- **`lib/pdf` kennt kein React.** Jede Operation ist eine reine Funktion über
  Bytes — deshalb ist sie in Node testbar, ohne Browser oder DOM.
- **Fehler tragen Schlüssel, keine Sätze.** `PdfToolError('wrongPassword')` wird
  in der Oberfläche über `errors.wrongPassword` übersetzt. Dadurch bleiben
  Bibliothek und Sprache getrennt.
- **pdf.js wird per `import()` nachgeladen**, nie beim SSR und nie auf Seiten
  ohne Vorschau. Der Worker liegt unter `/pdf.worker.min.mjs`, kopiert von
  `scripts/copy-pdf-worker.mjs` in `predev`/`prebuild`.
- **Bedienung ohne Maus.** Umsortieren geht überall auch per Schaltfläche, nicht
  nur per Drag-and-Drop; im Editor verschieben die Pfeiltasten (mit Shift in
  10-pt-Schritten) und Entf löscht — sonst wäre die WCAG-Grundlage aus
  Abschnitt 6 verfehlt.
- **Ein Menü statt einer Linkleiste.** Die Werkzeugliste ist aus einer
  Inline-Navigation herausgewachsen: die deutschen Labels überfüllten die
  Kopfzeile. Das aufklappbare Menü bleibt in jeder Sprache gleich breit und
  trägt auch die restlichen Phase-2-Werkzeuge.

---

## Tests

### Funktionstest der PDF-Operationen (schnell, ohne Browser)

```bash
docker run --rm -v "$PWD":/app -w /app node:22-alpine npm run test:smoke
docker run --rm -v "$PWD":/app -w /app node:22-alpine npm run test:messages
```

`scripts/smoke-test.mts` — 40 Prüfungen: Zusammenfügen, dateiübergreifendes
Komponieren, Splitten (4 Modi), Bereichs-Parser inkl. Fehlerfällen,
Seitenoperationen mit Rotation, Wasserzeichen, Seitenzahlen, verlustfreie
Kompression, Annotationen (Text/Marker/Formen/Bild), Zeilenumbruch,
Zeichenabdeckung je Schrift, Einrast-Geometrie sowie Verschlüsseln/Entschlüsseln
mit richtigem und falschem Passwort.

`scripts/check-messages.mts` — prüft die Übersetzungen auf zwei Arten:

1. **EN gegen DE** — ein Schlüssel, den nur eine Sprache kennt, erscheint sonst
   als roher `MISSING_MESSAGE`-Fehler, und zwar erst dann, wenn jemand zufällig
   diese Seite in dieser Sprache öffnet.
2. **Code gegen Katalog** — der Quelltext wird nach `useTranslations`-Namensräumen
   und den darauf aufgerufenen Schlüsseln durchsucht; jeder davon muss auflösbar
   sein. Prüfung 1 allein reicht nicht: fehlt ein Schlüssel in *beiden* Sprachen,
   sind die Kataloge weiterhin deckungsgleich. Genau so erreichte
   `tools.edit.strokeLabel` den Browser.

### End-to-End im Browser

23 Prüfungen für das, was ohne echtes Canvas nicht testbar ist: pdf.js-Worker,
Thumbnail-Rendering, Raster-Kompression, Download-Pfad, dateiübergreifendes
Sortieren im Merge-Raster, Schnittmarken im Split, Aktualisierung der
Livevorschau, Marker im Multiply-Modus, **Nachladen und Subsetting von Noto Sans
im Browser**, Einrasten auf die Seitenmitte samt Verschwinden der Hilfslinie,
Bearbeiten direkt auf der Seite, Doppelklick zum Wiederöffnen, Entf-Taste,
Strg+C/Strg+V, Formen-Menü mit gezogenem Pfeil, Einfügen aus der
Zwischenablage, Texterkennung mit Ersetzen einer Zeile, Unterschrift zeichnen
und platzieren — sowie die Kopfzeile auf Überlauf bei
360/768/1280 px in der längeren der beiden Sprachen.

Der Test „keine JavaScript-Fehler" ist nicht Beiwerk: er hat zweimal einen
fehlenden Übersetzungsschlüssel gefunden, den weder Typecheck noch Build sehen
konnten. Beim zweiten Mal wurde daraus Prüfung 2 in `check-messages.mts`, die
diese Fehlerklasse jetzt ohne Browser abfängt.

Gezogen wird über `dragOnStage()`: `locator.click()` scrollt sein Ziel selbst in
den sichtbaren Bereich, `page.mouse` nicht — und eine A4-Bühne ist höher als das
Fenster. Der Helfer positioniert die Seite vorher und **wirft mit klarer
Begründung**, wenn ein Ziehpunkt außerhalb des Fensters läge, statt in einen
Timeout zu laufen, dessen Meldung nichts über die Ursache sagt.

```bash
# 1. Fixture erzeugen (einmalig)
docker run --rm -v "$PWD":/app -w /app node:22-alpine npm run test:fixture

# 2. Anwendung starten
docker build -t pdf-tool:test .
docker network create pdfnet
docker run -d --name pdf-test --network pdfnet pdf-tool:test

# 3. Tests fahren
docker run --rm --network pdfnet -e BASE_URL=http://pdf-test:3000 \
  -v "$PWD":/work -w /work \
  mcr.microsoft.com/playwright:v1.62.1-noble node tests/browser.mjs

# 4. Aufräumen
docker rm -f pdf-test && docker network rm pdfnet
```

Die Playwright-Version in `devDependencies` ist bewusst **exakt gepinnt** — sie
muss zum Browser-Bundle des Container-Images passen, sonst startet Chromium
nicht.

---

## Vor dem Launch zu erledigen

1. **Rechtstexte füllen.** `messages/{de,en}.json` enthält unter `privacy` und
   `imprint` mit `[TODO: …]` markierte Abschnitte: Server-Logs, Werbenetzwerk,
   Verantwortlicher, Impressumsangaben. Die technischen Aussagen zur
   client-seitigen Verarbeitung sind bereits korrekt formuliert.
2. **Werbeausspielung** (Spezifikation 5.4) — Netzwerk wählen, dann Ad-Slots und
   Consent-Mechanismus ergänzen und den Datenschutzabschnitt nachziehen.
3. **`PDF_TOOL_HOST`** in `.env` für die Traefik-Router-Regel setzen.
4. **Favicon / Open-Graph-Bild** ergänzen (`app/icon.png`).
5. **Schriftlizenz**: `public/fonts/LICENSE-NotoSans.txt` (OFL 1.1) liegt bereits
   bei und muss beim Ausliefern erhalten bleiben.

## Offene Punkte aus der Spezifikation (Abschnitt 5)

Unverändert offen und für Phase 1 nicht blockierend: AcroForm-Umfang (5.1),
OCR-Performance auf Mobilgeräten (5.2), Diff-Algorithmus (5.3),
Rate-Limiting-Parameter der LibreOffice-Queue (5.5). Letztere wird erst in
Phase 3 relevant — bis dahin existiert im Projekt kein Server-Backend.
