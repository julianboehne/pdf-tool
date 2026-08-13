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
| `/edit` | PDF bearbeiten | Text, Abdecken, Rechteck, Ellipse, Bild frei platzieren |
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

### Bearbeiten und Signieren

Beide teilen sich `components/editor/`: eine `Stage` (Seite als maßstabsgetreue
Fläche) und `DraggableBox` (verschiebbar, skalierbar). Geometrie wird in
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
lib/tools.ts             Registry, die Navigation, Startseite und Titel speist
i18n/, messages/         next-intl: Routing, Locale-Auflösung, EN/DE-Texte
scripts/smoke-test.mts   Funktionstest für lib/pdf (31 Prüfungen)
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
```

`scripts/smoke-test.mts` — 31 Prüfungen: Zusammenfügen, dateiübergreifendes
Komponieren, Splitten (4 Modi), Bereichs-Parser inkl. Fehlerfällen,
Seitenoperationen mit Rotation, Wasserzeichen, Seitenzahlen, verlustfreie
Kompression, Annotationen (Text/Formen/Bild) sowie Verschlüsseln/Entschlüsseln
mit richtigem und falschem Passwort.

### End-to-End im Browser

14 Prüfungen für das, was ohne echtes Canvas nicht testbar ist: pdf.js-Worker,
Thumbnail-Rendering, Raster-Kompression, Download-Pfad, dateiübergreifendes
Sortieren im Merge-Raster, Schnittmarken im Split, Aktualisierung der
Livevorschau, Platzieren von Text und Unterschrift — sowie die Kopfzeile auf
Überlauf bei 360/768/1280 px in der längeren der beiden Sprachen.

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

## Offene Punkte aus der Spezifikation (Abschnitt 5)

Unverändert offen und für Phase 1 nicht blockierend: AcroForm-Umfang (5.1),
OCR-Performance auf Mobilgeräten (5.2), Diff-Algorithmus (5.3),
Rate-Limiting-Parameter der LibreOffice-Queue (5.5). Letztere wird erst in
Phase 3 relevant — bis dahin existiert im Projekt kein Server-Backend.
