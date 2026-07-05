# Stardust to Singularity — Implementationsplan

> 3D-Incremental-Game für Browser & Mobile. Vom Staubkorn zur Singularität.
> Live: https://danielzaiser91.github.io/stardust-to-singularity/

---

## 1. Vision & Säulen

**Elevator Pitch:** Du beginnst als einzelnes Staubkorn im Nichts. Durch Anziehung, Fusion, Supernovae und Gravitation wächst du über fünf kosmische Skalen bis zur Singularität — und jede Skala sieht spektakulär aus, spielt sich anders und wird durch einen Prestige-Reset erreicht.

**Design-Säulen:**
1. **Beeindruckende Grafik** — jede Ebene ist eine eigene, animierte 3D-Szene (Neon/Glow, Bloom, GPU-Partikel, prozedurale Shader). Kein Standbild: alles pulsiert, strömt, reagiert auf Fortschritt.
2. **Abwechslungsreichtum** — jeder Reset-Layer führt eine komplett neue Kernmechanik ein (wie NGU Idle), kein „gleicher Shop mit größeren Zahlen".
3. **Explosive Zahlen** — break_eternity.js, e-Notation, das Genre-Gefühl von Antimatter Dimensions / IMR.
4. **Testbarkeit als Architekturprinzip** — die komplette Spiellogik ist headless simulierbar; Balance wird durch automatisierte Bot-Simulationen gemessen, nicht geschätzt.
5. **Mobile-first-tauglich** — Touch-Bedienung, PWA, Qualitätsstufen für schwache GPUs, voller Offline-Progress.

**Referenzen:** NGU Idle (Feature-Vielfalt pro Layer), Revolution Idle (Eleganz), Incremental Mass Rewritten (Skalen-Eskalation), Antimatter Dimensions (Generator-Kette, Challenges).

---

## 2. Game Design

### 2.1 Die fünf Ebenen (Übersicht)

| # | Ebene | Reset heißt | Währung | Kernmechanik | Ziel-Erstreichung* |
|---|-------|-------------|---------|--------------|--------------------|
| 0 | **Dust** | — | Dust | Generator-Kette + aktives Klicken | Spielstart |
| 1 | **Star** | **Ignition** | Plasma | Fusionskette H→Fe, Sternklassen | ~30–60 min |
| 2 | **Supernova** | **Supernova** | Nova Shards | Nebel-Seeding, Remnants, Challenges | ~4–8 h |
| 3 | **Galaxy** | **Coalescence** | Dark Matter | Konstellations-Skilltree | ~1,5–3 Tage |
| 4 | **Singularity** | **Collapse** | Entropy | Endlos-Prestige, Akkretion | ~5–8 Tage |
| — | Endgame/NG+ | „New Universe" | — | Endlos-Skalierung + Abschluss-Lore | ~2 Wochen |

*aktiv gespielt; idle entsprechend länger. Werte werden per Simulation kalibriert (§5).

### 2.2 Ebene 0 — Dust (Basisschicht)

- **Währung:** Dust. Produziert von einer 8-stufigen Generator-Kette (jede Stufe produziert die darunter):
  1. Attractor → produziert Dust
  2. Cluster → produziert Attractors
  3. Aggregate, 4. Planetesimal, 5. Protoplanet, 6. Planet, 7. Gas Giant, 8. **Protostar**
- Stufen werden nacheinander freigeschaltet (Kosten ~×1e3 pro Stufe). Kostenwachstum pro Kauf: ×1.15–×2.0 (per Sim kalibriert). Jede 10er-Packung verdoppelt die Produktion der Stufe (AD-Prinzip).
- **Compression:** wiederkaufbares Upgrade, beschleunigt alle Generatoren global (Tickspeed-Analogon).
- **Aktive Mechanik:** Tippen/Klicken auf die Staubwolke erzeugt Dust-Burst (skaliert mit Produktion, damit Klicken nie irrelevant/nie zwingend ist). Gelegentlich fliegt ein **Komet** durch die Szene — antippen = temporärer Boost (×3 Produktion für 30 s).
- **Ignition-Reset:** ab 1e30 Dust (Startwert, wird kalibriert). Plasma-Gewinn ≈ `(dust / 1e30)^0.5`-Kurve.

### 2.3 Ebene 1 — Star (Reset: Ignition)

- **Währung:** Plasma (bleibt über Ignitions erhalten, reset bei Supernova).
- **Neue Mechanik — Fusionskette:** Der Stern fusioniert Elemente: H → He → C → O → Si → **Fe**. Jedes Element ist eine Ressource; **Fusion Reactors** (pro Element kaufbar) wandeln automatisch um. Jedes Element gibt einen spezifischen Boost auf Ebene 0 (z. B. He: ×Dust-Produktion, C: billigere Generatoren, O: stärkere Kometen, Si: Compression-Effekt↑).
- **Eisen ist Gift:** Fe boostet nichts — es akkumuliert im Kern und ist die *einzige* Ressource, die den **Supernova**-Reset freischaltet (physikalisch korrekt: Eisenfusion beendet Sterne). Spannung: mehr Fe = näher an Supernova, aber Fe-Produktion frisst Si, das man auch für Boosts will.
- **Sternklassen:** Bei jeder Ignition wählbar: Roter Zwerg (×0,5 Tempo, ×2 Plasma-Effekt), Gelber Stern (neutral), Blauer Riese (×2 Tempo, ×0,5 Plasma-Effekt). Variiert Runs, lehrt Trade-offs.
- **Plasma-Upgrades:** ~12 Upgrades (Dust-Start-Boost, Generator-Autobuyer I, Kometen-Frequenz, Fusionstempo …).

### 2.4 Ebene 2 — Supernova (Reset: Supernova)

- **Währung:** Nova Shards ≈ `(Fe / Schwelle)^0.4`.
- **Neue Mechanik — Nebel-Seeding:** Shards werden in ein hexagonales **Nebula-Grid** (≈19 Zellen) investiert. Jede Zelle wird mit einem Nebeltyp bepflanzt: Emission (produziert passiv Dust), Reflection (boostet Plasma), Dark (boostet benachbarte Zellen ×2 — Platzierungs-Puzzle!). Nebel wachsen in Echtzeit sichtbar in der 3D-Szene.
- **Remnant-Wahl:** Jede Supernova hinterlässt wählbar: **Neutronenstern** (+Fusionstempo), **Pulsar** (periodische Global-Bursts alle 60 s), **Schwarzes Loch (klein)** (+Shard-Gewinn). Sammeln sich sichtbar in der Szene an.
- **Challenges (8 Stück):** Spezial-Runs mit Restriktionen (z. B. „No Compression", „nur 4 Generator-Stufen", „Fusion ×0,1") → permanente Belohnungen (Autobuyer II, Startressourcen, Multiplikatoren). Vorbild Antimatter Dimensions.
- **Autobuyer II:** Auto-Ignition mit konfigurierbarer Schwelle.

### 2.5 Ebene 3 — Galaxy (Reset: Coalescence)

- **Währung:** Dark Matter ≈ log-basiert auf Gesamt-Nova-Shards.
- **Neue Mechanik — Konstellations-Skilltree:** Eine interaktive 3D-Sternkarte (~45 Nodes in 3 Ästen): **Gravity** (Produktion/Kosten), **Time** (Tickrate, Offline-Bonus, Zeitraffer-Charges), **Light** (Klick/Komet/Visual-Boosts, QoL). Nodes sind Sterne, Kanten werden als Konstellationslinien gezogen — der Skilltree IST die Galaxie.
- **Galaxientypen** pro Coalescence wählbar (Spiral/Elliptisch/Irregulär) mit Run-Modifikatoren.
- **Auto-Supernova**, Nebel-Presets, Challenge-Auto-Complete bei ×10 Overkill.

### 2.6 Ebene 4 — Singularity (Reset: Collapse)

- **Währung:** Entropy. **Mechanik — Akkretion:** Alle bisherigen Ressourcen können ins Schwarze Loch „geworfen" werden (Konvertierung mit Multiplikator-Feedback-Loop). Entropy kauft **Singularity-Perks** (Endlos-Prestige mit steigenden Kosten): permanente Exponenten-Boosts auf alle Ebenen, „Time Dilation" (Alles ×N für M Minuten, Cooldown).
- **Endgame:** Bei 1e9 Entropy (kalibriert): finale Sequenz „New Universe" — Lore-Abschluss + **NG+/Endless Mode** (weiterspielen mit Skalierungs-Kurve, Leaderboard-ready).

### 2.7 Querschnittssysteme

- **Achievements (~60):** Raster mit Icons, je +2 % Global-Produktion, Meilensteine aller Ebenen + versteckte (z. B. „benenne deinen Stern").
- **Lore:** ~30 kurze atmosphärische Schnipsel (DE/EN) bei Meilensteinen, erzählen die Reise („Journey") — als einblendende Toasts + nachlesbar im Journal.
- **Offline-Progress:** volle Simulation der Abwesenheit in Chunks (max. 24 h, adaptive Chunk-Größe); Zusammenfassungs-Dialog beim Rückkehren.
- **Sound:** prozedural via Web Audio — Ambient-Drone je Ebene (Layer-Crossfade), UI-Blips, Kauf-/Reset-/Achievement-Sounds. Master-Mute + Lautstärke.
- **i18n:** DE/EN, key-basiert, umschaltbar zur Laufzeit, Sprache in Save.

### 2.8 Formel-Philosophie

Alle Formeln zentral in `core/formulas.ts`, ausschließlich über benannte Konstanten in `core/constants.ts` (dem **Balance-Sheet**). Kein Magic Number im Code — die Sim (§5) mutiert nur `constants.ts`. Kostenkurven: geometrisch früh, ab Schwellen polynomial-verschärft (Softcaps), dokumentiert im Balance-Sheet.

---

## 3. Architektur

### 3.1 Grundprinzip: Pure Core, dumme Schale

```
┌─────────────────────────────────────────────────┐
│ main.ts — Game Loop (requestAnimationFrame)      │
│   1. accumulate dt → core.tick(state, dt)        │
│   2. render.update(state)   (liest nur)          │
│   3. ui.update(state)       (liest nur)          │
│   User-Input → core.dispatch(state, action)      │
└─────────────────────────────────────────────────┘
        │                │               │
   ┌────▼────┐      ┌────▼────┐     ┌────▼───┐
   │  core/  │      │ render/ │     │  ui/   │
   │ PURE TS │      │ Three.js│     │  DOM   │
   │ 0 Deps  │◄─────│ liest   │     │ liest  │
   │ auf DOM │      │ State   │     │ State  │
   └─────────┘      └─────────┘     └────────┘
        ▲
   ┌────┴────┐
   │  sim/   │  ← Headless-Bot, Node, ohne Browser
   └─────────┘
```

- **`core/`** ist reines TypeScript ohne DOM-/Three-/Audio-Import. Deterministisch: `tick(state, dtSeconds)` mutiert den State reproduzierbar; RNG mit seedbarem PRNG (mulberry32). Dadurch: identische Logik im Spiel, im Test und in der Balance-Sim.
- **Offline-Progress** = dieselbe `tick`-Funktion mit großen dt-Chunks. Kein zweiter Codepfad.
- **`render/` & `ui/`** sind reine Projektionen des States. Kommunikation zurück nur über `dispatch(action)`.

### 3.2 Modulstruktur

```
src/
├── core/
│   ├── decimal.ts        # break_eternity Re-Export + Helpers (D(), fmt-frei)
│   ├── constants.ts      # ★ BALANCE-SHEET: alle Zahlen des Spiels
│   ├── state.ts          # GameState-Typ + initialState()
│   ├── formulas.ts       # Kosten/Produktion/Prestige-Gain
│   ├── tick.ts           # tick(state, dt) — der Herzschlag
│   ├── actions.ts        # dispatch: buy/reset/select/toggle …
│   ├── layers/           # dust.ts star.ts supernova.ts galaxy.ts singularity.ts
│   ├── achievements.ts   # Definitionen + Check-Fn
│   ├── challenges.ts
│   ├── lore.ts
│   ├── offline.ts        # simulateOffline(state, seconds) → Summary
│   ├── rng.ts            # mulberry32, seed im State
│   └── save.ts           # (de)serialize + Versions-Migrationen (kein localStorage!)
├── sim/
│   ├── bot.ts            # Strategie-Bot: kauft greedy, resettet bei Gewinn
│   ├── run.ts            # CLI: npx tsx src/sim/run.ts --until singularity
│   └── report.ts         # Meilenstein-Timeline als Tabelle/JSON
├── render/
│   ├── engine.ts         # Renderer, Composer (Bloom), Resize, Quality-Tiers
│   ├── camera.ts         # Orbit + sanfte Auto-Rotation, Touch
│   ├── quality.ts        # low/med/high: Partikelzahl, Bloom, DPR
│   ├── scenes/           # dustCloud.ts star.ts supernova.ts galaxy.ts blackhole.ts
│   │                     # + transition.ts (Kamera-Flug zwischen Ebenen)
│   └── shaders/          # GLSL: corona, nebula, accretion, lensing …
├── ui/
│   ├── dom.ts            # Mini-Helper (el(), Reaktivität über dirty-flags)
│   ├── format.ts         # Zahlformatierung (1.23e45, K/M/B unter e6)
│   ├── hud.ts            # Ressourcen-Leiste, Tabs, Reset-Button
│   ├── panels/           # je Ebene + settings, achievements, journal, help
│   └── toasts.ts
├── audio/engine.ts       # Web-Audio-Graph, prozedurale Synths je Ebene
├── i18n/ (index.ts de.ts en.ts)
├── storage.ts            # localStorage-Autosave (30 s) + Export/Import Base64
└── main.ts
tests/                    # Vitest: unit + balance
public/                   # PWA: manifest, icons, favicon
.github/workflows/deploy.yml
```

### 3.3 Tech-Stack

| Bereich | Wahl | Begründung |
|---|---|---|
| Build | **Vite 7 + TypeScript** | schnell, GH-Pages-`base` trivial, Vitest-Integration |
| Big Numbers | **break_eternity.js** | Genre-Standard bis 10^^1e308, klein (~30 KB) |
| 3D | **Three.js** (+ UnrealBloomPass) | reif, mobil erprobt, volle Shader-Kontrolle |
| UI | **Vanilla TS + Mini-Reaktivität** | kein Framework-Overhead im RAF-Loop; UI-Update über dirty-flags, DOM-Writes nur bei Änderung |
| Tests | **Vitest** | Unit + Balance-Assertions in einem Runner |
| PWA | manifest + Service Worker (handgeschrieben, cache-first) | installierbar, offline spielbar |
| Sound | Web Audio API pur | 0 KB Assets, prozedural |

Bewusst **kein** React/Svelte: Die UI ist ein Overlay über einem RAF-Loop; direkte, gezielte DOM-Updates sind einfacher zu budgetieren (Ziel: UI-Update < 2 ms/Frame) und halten das Bundle < 500 KB gzip.

### 3.4 Save-System

- Autosave alle 30 s + bei `visibilitychange` (Mobile!) in localStorage.
- Format: `{ version: number, savedAt: epoch, state: … }`, Decimal als String serialisiert.
- **Migrationskette** `migrations[vN→vN+1]` ab Tag 1 — Saves überleben jedes Update.
- Export/Import als Base64-String (Settings-Panel). Cloud-Save: bewusst out of scope (todo.md).

### 3.5 Performance-Budget (Mobile)

- Ziel: 60 fps Desktop, ≥ 30 fps Mid-Range-Phone. Core-Tick < 3 ms, UI < 2 ms.
- GPU-Partikel als BufferGeometry + Shader-Material (keine Sprites einzeln), Instancing für Planeten/Remnants.
- Quality-Tiers (auto-detect via `navigator.hardwareConcurrency` + erste-Frames-Timing, manuell übersteuerbar): low = 5k Partikel/kein Bloom, med = 25k, high = 100k + Bloom + Lensing.
- Tab im Hintergrund: RAF pausiert, Rückkehr → Offline-Progress-Pfad.

---

## 4. Visual Design (pro Ebene)

Gemeinsame Sprache: dunkler Raum (#050510), Neon-Akzente pro Ebene (Dust: Cyan, Star: Orange/Gold, Supernova: Magenta, Galaxy: Violett/Blau, Singularity: Weiß/Rot), additives Blending, Bloom, Vignette. Kamera: langsame Auto-Rotation, Orbit per Drag/Touch, sanfte FOV-Pulse bei Käufen.

| Ebene | Szene & Animationen |
|---|---|
| Dust | Wirbelnde Partikelwolke (Curl-Noise-Flow), verdichtet sich sichtbar mit log(Dust); je Generator-Stufe erscheinen orbitierende Körper (Planetesimale→Gasriesen); Kometen fliegen als klickbare Objekte mit Schweif durch |
| Star | Prozeduraler Plasma-Shader (FBM-Noise, Farbtemperatur = Sternklasse), Korona-Billboard, Protuberanzen (animierte Bézier-Loops), Fusions-Ringe pulsieren je Element; Fe-Anteil färbt Kern bedrohlich dunkel |
| Supernova | Reset = 3-Sekunden-Sequenz: Kollaps → Blitz → expandierende Schockwellen-Sphäre; danach Nebula-Hexgrid als leuchtende Volumen-Billboards, die wachsen; Remnants orbitieren (Pulsar mit rotierenden Lichtkegeln!) |
| Galaxy | 100k-Partikel-Spirale (logarithmische Arme, differentielle Rotation), Skilltree-Nodes als anwählbare helle Sterne mit Konstellationslinien; Coalescence = Kamera-Rückflug, Nebel saugen sich zur Spirale zusammen |
| Singularity | Schwarzes Loch: Photonenring + Akkretionsscheibe (Doppler-gefärbt) + **Gravitational-Lensing-Screenspace-Shader**; geopferte Ressourcen spiralen sichtbar hinein; Endsequenz: alles kollabiert → weißer Punkt → neues Universum blüht auf |

Ebenen-Übergänge: Kamera fliegt nahtlos (Dust-Wolke → hinein → Stern entzündet sich …). Die Szene der aktuellen Ebene ist Hauptansicht; ein Ebenen-Switcher erlaubt Zurückschauen.

---

## 5. Balancing- & Test-Strategie (Kernstück)

### 5.1 Headless-Simulation

`npx tsx src/sim/run.ts` führt den Bot mit `tick(state, 1s)` in Schleife aus (≈ 500k Ticks/s real):
- **Bot-Strategie:** kauft günstigste Aktion mit bestem Grenznutzen (einfache Heuristik pro Ebene, z. B. „billigsten Generator, außer Upgrade < 10 % des Kontostands"), führt Resets aus, sobald Gain-Formel > Schwelle. Zwei Profile: **aktiv** (Klicks + Kometen simuliert) und **idle** (keine Klicks).
- **Output:** Timeline aller Meilensteine (`erste Ignition @ 41 min`, `Challenge 3 @ 9,2 h` …) als Tabelle + JSON-Artefakt (`sim/reports/`).

### 5.2 Automatisierte Balance-Assertions (Vitest)

```
tests/balance.test.ts — Beispiele:
✓ Erste Ignition (aktiv):      20–60 min
✓ Erste Ignition (idle):       < 3 h
✓ Erste Supernova:             4–8 h aktiv
✓ Galaxy:                      1,5–3 Tage
✓ Singularity:                 5–8 Tage
✓ Endgame erreichbar:          < 21 Tage idle
✓ Kein Dead-End: Bot kommt aus jeder Challenge wieder raus
✓ Kein Layer-Skip: Progression monoton, keine Ebene < 15 min „durchgefallen"
✓ Offline(8 h) ≈ Online(8 h idle) ± 5 %
```

Balance-Änderung = nur `constants.ts` anfassen → Sim laufen lassen → Assertions grün. Jede Progression-Regression fällt sofort auf. **Die Sim läuft in CI bei jedem Push.**

### 5.3 Unit- & Integrationstests

- Formeln (Kosten, Gains, Softcaps) mit Fixwerten; Save-Roundtrip + alle Migrationen; Offline-Chunking-Äquivalenz; Achievement-/Challenge-Trigger; Determinismus (2 Runs mit gleichem Seed → identischer State-Hash).
- Manuelle Verifikation im Browser via Preview (Desktop + Mobile-Viewport) je Phase; Dev-Cheat-Konsole (`window.dev.grant(…)`, nur in Dev-Build) für Spot-Checks später Spielphasen.

---

## 6. UI/UX

- **Desktop:** 3D füllt den Screen; links schmale Ressourcen-Leiste, rechts andockbares Panel (Tabs: aktuelle Ebene, frühere Ebenen, Achievements, Journal, Settings). Panels halbtransparent/blurred, Szene bleibt sichtbar.
- **Mobile (Portrait):** 3D oben (~45 %), darunter swipebare Tab-Panels; Reset-Buttons als große Touch-Targets (≥ 44 px); Bottom-Nav.
- Zahlen: < 1e6 mit K/M-Suffix, darüber `1.23e45`; Settings-Option für reine e-Notation.
- Kauf-Feedback: Button-Puls + Partikel-Burst in Szene + Sound-Blip (alles < 100 ms Latenz).
- Reset-Buttons zeigen Gain-Preview („Ignite: +42 Plasma"), Bestätigungsdialog nur bei erstem Mal je Ebene.
- Onboarding: kontextuelle Hint-Toasts statt Tutorial-Wall; Hilfe-Panel mit Mechanik-Erklärungen je Ebene.

---

## 7. Deployment

- **GitHub Pages** via Actions: Push auf `main` → `npm ci && npm test && npm run build` → Pages-Artefakt. Test-Fail = kein Deploy.
- Vite `base: '/stardust-to-singularity/'`, Hash-freies Routing (Single Page, kein Router).
- PWA: `manifest.webmanifest` + Service Worker (cache-first, Version-Bump pro Deploy → Update-Toast).
- Weitere Plattformen (Netlify/Vercel/itch.io/…): siehe [todo.md](todo.md).

---

## 8. Implementierungsphasen

| Phase | Inhalt | Fertig-Kriterium |
|---|---|---|
| **P0 Fundament** | Vite+TS+Vitest-Scaffold, decimal, state, tick, save+Migrationen, storage, RAF-Loop, CI-Workflow | Tests grün in CI, leere Szene deployt auf Pages |
| **P1 Dust spielbar** | Generator-Kette, Compression, Klick, Kometen, Dust-UI, Dust-Szene (Partikelwolke), Format, i18n-Gerüst | Sim: Dust wächst plausibel; im Browser spielbar |
| **P2 Ignition/Star** | Ignition-Reset, Plasma, Fusionskette, Sternklassen, Plasma-Upgrades, Stern-Szene, Übergangs-Animation | Balance-Assertion „Ignition 20–60 min" grün |
| **P3 Supernova** | Supernova-Reset, Shards, Nebula-Grid, Remnants, Challenges 1–8, Autobuyer II, Explosions-Sequenz, Nebel-Szene | „Supernova 4–8 h" grün; alle Challenges lösbar (Bot) |
| **P4 Galaxy** | Coalescence, Dark Matter, Skilltree (45 Nodes), Galaxientypen, Auto-Supernova, Galaxien-Szene | „Galaxy 1,5–3 d" grün; Skilltree voll begehbar |
| **P5 Singularity** | Collapse, Entropy, Akkretions-Mechanik, Perks, Time Dilation, Black-Hole-Szene + Lensing, Endsequenz, NG+ | „Singularity 5–8 d" grün; Endgame erreichbar < 21 d |
| **P6 Querschnitt** | Achievements, Lore/Journal, Offline-Dialog, Audio-Engine, vollständige i18n DE/EN | Alle Systeme in beiden Sprachen bedienbar |
| **P7 Mobile & Polish** | Touch-Layout, Quality-Tiers, PWA, Performance-Pass, Onboarding-Hints, Settings komplett | 30 fps auf Mobile-Preset, Lighthouse PWA ✓ |
| **P8 Endabnahme** | Voll-Sim aktiv+idle, manueller Playthrough-Spotcheck aller Ebenen, README/Screenshots, finaler Deploy | Alle Balance-Assertions grün, Live-Link steht |

Phasen werden sequenziell committet & gepusht (CI deployt kontinuierlich — das Spiel ist ab P1 öffentlich anspielbar).

---

## 9. Risiken & Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| Mobile-GPU zu schwach für Bloom/Lensing | Quality-Tiers ab Tag 1; Effekte additiv-optional |
| Balance kippt bei späten Multiplikator-Stacks | Sim läuft in CI über die *gesamte* Progression; Softcaps im Balance-Sheet |
| break_eternity-Ops im Hot Path zu teuer | Produktions-Pipeline cached abgeleitete Multiplikatoren pro Tick-Sektion; Profiling in P7 |
| Scope-Creep bei 5 einzigartigen Mechaniken | Mechaniken sind in §2 fix spezifiziert; Neues → todo.md |
| Save-Bruch durch Updates | Migrationskette + Roundtrip-Tests ab P0 |

---

## 10. Offene Punkte / bewusst ausgeklammert

→ [todo.md](todo.md): weitere Deploy-Plattformen (Netlify, Vercel, itch.io, …), Cloud-Saves, Steam-Wrapper, Leaderboards, weitere Sprachen.
