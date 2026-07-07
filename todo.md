# TODO — Aktuelle Session

Längerfristige/optionale Punkte stehen in [BACKLOG.md](BACKLOG.md).

## Erledigt (Stand 2026-07-07, fünfte Runde)

- [x] ~~**"Coalescence" im Deutschen zu "Verschmelzung" vereinheitlicht.**~~ — erledigt:
      `stat.coalescences` war bereits "Verschmelzungen", aber 8 weitere Stellen
      (`nova.reFeOn`/`reFeLocked`, `galaxy.autoNovaLock`, `perk.8d`, `ms.u.gal`,
      `ms.gal2`/`3`/`4`/`6`) sagten noch "Coalescence(s)". Alle auf "Verschmelzung"/
      "Verschmelzungen" umgestellt. Englisch bleibt "Coalescence" — nur die deutsche
      Lokalisierung war gemeint.

- [x] ~~**Tooltip-"?"-Eckmarker überlappt den Text.**~~ — erledigt: `.has-tip::after` in
      `style.css` von `right: 4px` auf `right: -8px` verschoben — Marker sitzt jetzt außerhalb
      der Textbox statt darüber.

- [x] ~~**Nebelgarten-Gesamtbonus nicht ressourcenfarbig hervorgehoben.**~~ — erledigt:
      `gardenTotal` nutzt jetzt `setHTML` + `resTag('dust', ...)`/`resTag('plasma', ...)` statt
      reinem `setText`; `nova.gardenTotal`/`gardenTotalFe`-Texte entsprechend auf Platzhalter
      ohne eigenes "×" umgestellt (das "×" steckt jetzt im resTag-Wert).

- [x] ~~**Reset-Vorschau-Zeile: ganze Zeile hoverbar + Deckel-erreicht-Info dauerhaft +
      Gewinn-Zahl auffälliger.**~~ — erledigt: `attachTip` sitzt jetzt auf der ganzen
      `.reset-row` (Gewinn UND Deckel-Spalte), nicht mehr nur auf dem Label. Neue dritte Zeile
      `.reset-need` zeigt die "Deckel erreicht ab X (bisher Y)"-Info permanent (via neuen
      `capNeedText()`-Helper, geteilt mit dem — jetzt rein erklärenden — Tooltip-Body). Die
      Gewinn-Zahl trägt jetzt `.reset-gain`: eine pulsierende Rahmen-Pille (`@keyframes
      reset-gain-glow`), deutlich auffälliger als der schlichte Deckel-Text daneben. Betrifft
      alle vier Boxen (Ignite/Supernova/Coalesce/Collapse), live geprüft.

- [x] ~~**Auto-Supernova soll wie Auto-Zündung umgesetzt werden.**~~ — erledigt: schlichte
      HTML-Checkbox in `GalaxyPanel` entfernt, durch denselben `seg-btn auto-btn`-Toggle wie
      Auto-Zündung ersetzt — jetzt direkt neben dem SUPERNOVA-AUSLÖSEN-Button in `StarPanel`
      (vorher: anderer Tab, keine Verbindung zum eigentlichen Reset-Button). Aktiv/Dim-States +
      Tooltip identisch zum Auto-Zündung-Muster.

- [x] ~~**Collapse (Galaxie-Reset) setzt jetzt die Verschmelzungs-Meilensteine zurück — mit
      wachsendem Ausgleichs-Bonus.**~~ — erledigt: `resetGalaxyLayer()` setzt
      `stats.coalescences` bei jedem Collapse auf 0. Neuer `coalescenceBonusMult(s) = 1 +
      collapses` (Konstante `COALESCENCE_BONUS_PER_COLLAPSE`) und `effectiveCoalescences(s) =
      roh × Bonus` in `formulas.ts` — ersetzt den rohen Zähler überall im Gating
      (`autoNovaUnlocked`, `feNebulaMult`, Hard-Challenge-Freischaltung, Nebelgarten-/
      Challenge-Tier-/Supernova-Meilenstein-Persistenz) UND in der Anzeige (Achievements,
      `chNextTier`, Nebel-Tooltips, `gardenTotal`). Neue Sektion ganz oben im Singularity-Tab
      zeigt den aktuellen Bonus-Multiplikator mit Erklär-Tooltip. Die Verschmelzungs-
      Meilenstein-Zeile in `NovaPanel` zeigt jetzt den EFFEKTIVEN Wert (z. B. "20× Coalescences"
      bei 10 rohen + ×2-Bonus) mit Hover-Aufschlüsselung ("Actual 10 — × 2 galaxy-reset bonus").
      Live durchgespielt: Collapse ausgelöst, roh→0 bestätigt, Bonus ×2 bestätigt, Auto-Supernova-
      Freischaltung bei effektiv ≥10 (roh ≥5 mit Bonus) bestätigt.

- [x] ~~**"Füttere die Leere" überarbeiten — fühlt sich schlecht an.**~~ — umgesetzt, aber
      **bewusst abgeschwächt gegenüber der Ideenskizze** (Details unten): neuer
      Auto-Füttern-Toggle (`sing.autoFeed`, gleiches Muster wie Auto-Zündung/-Supernova) neben
      dem Knopf. Zahlt pro Tick anteilig die AKTUELLE `feedMass` in `fed` ein (wächst mit dem
      Bestand weiter, kein sofortiges Wischen), bis der Akkumulator bei 100 % einen echten Feed
      auslöst (Ressourcen → 0, wie der manuelle Knopf). Takt: `AUTO_FEED_RATE = 1/120`, also ein
      voller Zyklus alle ~2 Minuten. Der manuelle Knopf bleibt parallel nutzbar (sofortiger
      Feed jederzeit).
      **Abweichung von der Ideenskizze:** "50 % des gesamten Ressourcen-Gewinns dauerhaft
      abzweigen" (also die Produktionsrate selbst halbieren) wäre eine deutlich größere
      Balance-Änderung gewesen — `dust`/`plasma`/`shards`/`dm` haben unterschiedliche
      Produktionswege (kontinuierlich vs. nur über Resets/Auto-Trickle), und eine dauerhafte
      Halbierung ALLER Produktion ist potenziell ein Fallstrick-Feature (schwacher
      log-skalierter Ertrag vs. hoher, permanenter Kosten), das eine eigene, sim-geprüfte
      Balance-Passage verdient. Stattdessen: derselbe "Trickle-zu-echtem-Reset"-Mechanismus wie
      die anderen Auto-Funktionen — automatisch statt Knopfdruck (die eigentliche Beschwerde),
      ohne Risiko für die Wachstumskurve. Falls die stärkere Variante (Produktionsrate wirklich
      dauerhaft halbieren) weiterhin gewünscht ist, braucht das einen eigenen Anlauf mit
      Sim-Validierung — hier absichtlich nicht mit-umgesetzt.

## Erledigt (Stand 2026-07-07, sechste Runde)

- [x] ~~**"Steigt der Coalesce-Gewinn auch ohne neue Scherben — Bug?"**~~ — geprüft, KEIN Bug:
      `dmGain`/`shardGain`/`entropyGain` multiplizieren mit einer `charge` (0..1), die rein mit
      der Echtzeit seit dem letzten Reset wächst (`GALAXY_MIN_TIME` = 40 min für Coalesce) —
      Anti-Spam-Mechanik, unabhängig vom Ressourcen-Bestand. War aber nirgends erklärt. Neuer
      `chargeFrac()`-Helper (ersetzt 3× duplizierte Inline-Berechnung) + Tooltip zeigt jetzt
      "Aufladung seit letztem Reset: X %", wenn < 100 %.

- [x] ~~**Konstellations-"Spielgeschwindigkeit"-Node fühlt sich wirkungslos an.**~~ — echter Bug
      gefunden: `m.speed` wird in `tick.ts` korrekt auf `gdt` angewendet (Simulation lief immer
      schon richtig schnell), aber DREI "/s"-Anzeigen multiplizierten nie mit `m.speed` —
      `dustPerSecond()`, die Pro-Stufe-Rate in `DustPanel` und die "H: +X/s"-Anzeige in
      `StarPanel`. Ergebnis: Speed-Nodes wirkten real, aber keine einzige Zahl im UI zeigte es.
      Alle drei Stellen um `.mul(m.speed)` ergänzt; live geprüft (Perk „Frame Drag" auf Stufe 8 →
      alle drei Anzeigen exakt ×3, wie erwartet).

- [x] ~~**Zeitdilatation: von Knopf/Cooldown zu dauerhaftem Bonus.**~~ — erledigt: Button,
      Aktiv-Timer und Cooldown (`sing.dilation`-State, `activateDilation()`) komplett entfernt.
      Neue `dilationMult(s)` in `formulas.ts`: `1 + DILATION_ACCRETION_FRAC × (accretionMult(s)
      − 1)` — wächst automatisch mit dem Akkretions-Bonus aus "Füttere die Leere", kein
      Knopfdruck mehr nötig. `accretionMult(s)` als gemeinsame Formel extrahiert (vorher an 2
      Stellen dupliziert). Neue Info-Box im Singularity-Tab zeigt den aktuellen Bonus permanent.
      Alt-Saves mit dem jetzt entfernten `dilation`-Feld laden weiterhin sauber (geprüft).

- [x] ~~**Sternen-Upgrades: einklappbare Sektion + Indikator (wie Challenges).**~~ — erledigt:
      `ch-section-head`/`ch-indicator`/`ch-chevron`-CSS auf generische `collapse-*`-Namen
      umbenannt (von Challenges UND Star-Upgrades genutzt). Neues `s.ui.upgradesCollapsed`,
      Klick auf die Überschrift klappt "Plasma-Upgrades" + "Automation" gemeinsam ein/aus.
      Grüner Punkt, wenn alle 15 Plasma-Upgrades gekauft sind, sonst gelb mit Hover-Tooltip
      ("X/15 Plasma-Upgrades gekauft").

## Erledigt (Stand 2026-07-07, siebte Runde)

- [x] ~~**Offline-Bonus: blanker/eingefrorener Bildschirm während der Berechnung.**~~ — erledigt:
      `simulateOffline()` lief beim Start UND beim Tab-Resume synchron in einer blockierenden
      While-Schleife (bis zu 2000 `tick()`-Aufrufe am Stück) — bei langer Abwesenheit fror das
      den Tab spürbar ein. Neue `simulateOfflineGen()` (Generator, pure Core-Funktion, `offline.ts`
      bleibt DOM-frei) yielded nach jedem Chunk; `simulateOffline()` treibt ihn synchron durch
      (Tests/Altverhalten unverändert — Äquivalenz-geprüft: 2000/2000 identische Yields,
      bit-identisches Endergebnis zum alten synchronen Pfad). `main.ts` treibt den Generator jetzt
      asynchron: neuer Fortschrittsdialog (`hud.showOfflineProgress()`/`updateOfflineProgress()`/
      `hideOfflineProgress()`, `.bar-offline`) läuft ÜBER der bereits laufenden Spielszene
      (RAF-Loop startet jetzt VOR dem Offline-Check, Ladebildschirm blendet entsprechend früher
      aus) statt über einem zweiten blanken Screen. Yield-Punkt nutzt `setTimeout` statt
      `requestAnimationFrame` — rAF pausiert komplett in Hintergrund-/unfokussierten Tabs (live
      im Preview-Panel reproduziert: mit rAF blieb der Fortschritt bei document.hidden=true
      hart bei 4,4 % stehen; mit setTimeout lief er durch). Live geprüft via neuem
      `dev.offline(seconds)`-Hook: Dialog erscheint, Balken füllt sich, Zusammenfassung folgt.

- [x] ~~**Sims dauern zu lange.**~~ — zwei sichere, verlustfreie Fixes (Details in
      [BALANCE.md](BALANCE.md#sim-performance-stand-2026-07-07)): `botStep()` bekam die von
      `tick()` schon berechneten `Mults` als Parameter statt sie selbst nochmal zu berechnen
      (ein kompletter `computeMults()`-Durchlauf pro simulierter Sekunde gespart); vier kleine,
      wiederholt neu konstruierte Decimal-Konstanten (`D(10)`, `D(2)`, `D(C.ACH_MULT)`,
      `D(C.PERK_HAWKING_H)`) als Modul-Konstanten gecacht. Per Node-CPU-Profiler verifiziert,
      dass die verbleibenden Kosten (>85 %) tief in `break_eternity.js` selbst stecken
      (Decimal-Allokation + ein Babel-Transpile-Artefakt, das in beiden mitgelieferten Builds
      steckt) — nicht weiter ohne Library-Patch oder größere Architektur-Änderung reduzierbar.
      Gemessen: 3-Tage-Sim 122,2 s → 109,4 s. Kurze/mittlere Sims (bis ~10 Tage, der übliche
      Fall) jetzt klar im 1-2-Minuten-Bereich; 30-Tage-Läufe bleiben bei ~18 Min hochgerechnet
      spürbar langsam, aber immerhin fertig durchlaufbar (vorher musste ich zwei 30-Tage-Läufe
      diese Session manuell abbrechen).

## Erledigt (Stand 2026-07-07, neunte Runde)

- [x] ~~**Tooltip-Meta-Text "Kein Knopf mehr nötig" — Spieler sollen sowas nicht lesen.**~~ —
      erledigt: `sing.dilateTip` (DE+EN) erklärte den Umbau selbst statt die Spielwelt zu
      beschreiben. Umformuliert auf rein diegetischen Text ("Ein dauerhafter Bonus, der mit
      jeder Fütterung des Schwarzen Lochs weiter wächst.").

- [x] ~~**"Füttere die Leere" komplett neu: kein Knopf/Toggle mehr, sofortiger Konsum bei
      jedem Gewinn statt periodischem Voll-Wischen.**~~ — die in Runde 5 *bewusst
      abgeschwächte* Variante (Trickle-zu-Voll-Wisch, siehe Runde-5-Eintrag oben) wurde jetzt
      durch die ursprünglich skizzierte, stärkere Variante ersetzt: **JEDER** Ressourcen-Gewinn
      (Dust/Plasma/Scherben/DM) wird nach Singularitäts-Unlock sofort 50/50 gesplittet — die
      Hälfte bleibt Spielwährung, die andere Hälfte nährt `sing.fed` (log-gewichtet nach
      Ressourcenstufe: dust=1, plasma=10, shards=100, dm=1000 — dieselbe Gewichtung wie das alte
      `feedMass()`). Neuer `feedSplit()`-Helper in `actions.ts`, angewendet an ALLEN 9 Gewinn-
      Stellen (Klick, Sonnensegel, Zündung, Auto-Zündung, Hawking-Trickle, Supernova, Auto-
      Supernova, Verschmelzung — Entropie/Kollaps bleibt ungesplittet, ist keine der vier
      "gefütterten" Ressourcen). Wichtig: `dust.total`/`star.totalPlasma`/`nova.totalShards`/
      `galaxy.totalDM` und die Lifetime-Stats bekommen weiterhin den VOLLEN, ungesplitteten
      Gewinn — nur der tatsächlich gutgeschriebene Spielstand wird halbiert. Das hält Ignite-/
      Supernova-/Coalesce-/Collapse-Anforderungen (die auf `total*` basieren) und alle Kaskaden-
      Passiveffekte (die auf Lifetime-Stats basieren) unverändert von diesem Umbau. Knopf
      (`feedBlackHole`), Toggle (`autoFeed`-State) und die alte Tick-Trickle-Logik komplett
      entfernt; `SingPanel` zeigt jetzt eine reine Info-Box ("THE VOID"/"DIE LEERE") nach dem
      Muster von Zeitdilatation/Galaxie-Reset-Bonus. Bot (`sim/bot.ts`) verlor die jetzt
      hinfällige manuelle Fütter-Logik (Cooldown-Map entfernt).
      **Erklärt vermutlich den gemeldeten Bug** "Scherben fallen kurz nach einer Supernova auf
      0": die alte Trickle-Logik wischte bei 100 % Akkumulation ALLE vier Ressourcen (inkl.
      Scherben) auf 0 — wenn der Akkumulator kurz nach einer Supernova-Auszahlung kippte, sah es
      so aus, als würden frisch gewonnene Scherben sofort wieder verschwinden. Mit der neuen
      Logik gibt es kein Voll-Wischen mehr, nur noch den 50/50-Split bei jedem einzelnen Gewinn.
      tsc/vitest (46/46) grün, Build grün, live im Preview verifiziert (Info-Box rendert korrekt
      ohne Buttons, Zeitdilatation weiterhin korrekt gedeckelt bei ×50).
      ⚠ Balance-Risiko: dauerhafte 50%-Halbierung des Spielstands (nicht der Fortschritts-Basis)
      nach Singularitäts-Unlock ist eine spürbare Verschärfung ggü. Runde 5 — betrifft direkt das
      bereits offene "Endgame-Kalibrierung"-Problem (siehe `constants.ts` Zeile ~121 und
      BALANCE.md). Sim-Spotcheck (10 Tage, aktiv) lief zur Verifikation; falls sich das Problem
      verschärft, braucht es eine eigene Balance-Passage (nicht Teil dieser Änderung).

- [x] ~~**Konstellationen: einklappbare Sektion wie Challenges/Sternen-Upgrades.**~~ — erledigt:
      neues `s.ui.constellationsCollapsed`, `collapse-head`/`collapse-indicator`/
      `collapse-chevron`-Muster (schon generisch aus Runde 6) auf `GalaxyPanel`s Konstellations-
      Baum angewendet. Grüner Punkt, wenn alle 45 Nodes gekauft sind, sonst gelb mit Hover-
      Tooltip ("X/45 Konstellations-Nodes freigeschaltet"). Live geprüft: Auf-/Zuklappen
      funktioniert, Indikator wird grün bei allen Nodes gekauft.

## Erledigt (Stand 2026-07-07, zehnte Runde)

- [x] ~~**Hawking-Strahlung: passives Plasma komplett entfernt** (war in Runde 5 nur hinter
      Auto-Supernova gegated statt entfernt, wie ursprünglich gewünscht).~~ — Trickle-Block in
      `tick.ts` entfernt, `perk.1d`-Text bereinigt. Die anderen zwei Hawking-Effekte
      (H-Rate-Multiplikator, `plasmaGainMult`/`shardGainMult`-Boost) bleiben unverändert — nur
      um den passiven Plasma-Zufluss ging es.

- [x] ~~**Sternen-Gedächtnis (Perk 9): Boni waren redundant mit Meilensteinen.**~~ — L1
      (Plasma-Upgrades überleben Supernova) war längst über die `MS_NOVA_KEEP`-Leiter erreichbar
      (alle Upgrades permanent ab 50 Supernovae, dank Verschmelzungs-Bonus-Mult aus Runde 6
      inzwischen schnell erreichbar), L3 (Nebelgarten übersteht Verschmelzung) war 1:1 identisch
      mit `MS_GALAXY[7]`. Neu: L1 = Reaktoren überleben Supernova/Verschmelzung/Kollaps (der
      einzige vorher schon einzigartige Effekt, jetzt eine Stufe früher) · L2/L3 = 10 %/25 % des
      Fusionsmaterials (He/C/O/Si — nicht H, nicht Fe) übersteht eine Supernova (komplett neu,
      keine Meilenstein-Entsprechung). Test `stellar memory perk protects...` entsprechend
      umgeschrieben.

- [x] ~~**Nebelgarten: einklappbare Sektion wie Challenges/Sternen-Upgrades/Konstellationen.**~~
      — `s.ui.nebulaCollapsed` + generisches `collapse-head`-Muster. Grün, wenn alle 19
      Nebel-Token gekauft sind.

- [x] ~~**"Kollapse" → "Kollaps" (Deutsch).**~~ — zwei Fundstellen (`stat.collapses`,
      `ms.u.col`) korrigiert; die drei bereits korrekten Singular-Stellen (Lore, Achievement,
      altes `ms.col3`) blieben unangetastet.

- [x] ~~**Spezial-Meilensteine: Level 1 erreicht → grüner Text + Häkchen statt normalem
      Icon.**~~ — beide Spezial-Meilenstein-Boxen (Staub-Generatoren in `DustPanel`, Remnant-
      Stufen in `StarPanel`) nutzen jetzt exakt das `ms-row`/`ms-icon`/`.done`-Muster der
      generischen `milestoneSection()` (○ → ✓, Text wird grün) — keine neue CSS nötig, nur
      Wiederverwendung.

- [x] ~~**Bug: Verschmelzen-Warnung erschien trotz deaktivierter Bestätigung / trotz
      Verschmelzungs-Vorerfahrung.**~~ — echter Bug gefunden: der "nur beim ersten Mal warnen"-
      Check für Verschmelzen nutzte `s.stats.coalescences === 0`, aber genau dieser Zähler wird
      seit Runde 6 bei JEDEM Kollaps auf 0 zurückgesetzt (Ausgleichs-Bonus-System) — nach jedem
      Kollaps sah die erste Verschmelzung danach wieder wie die "allererste" aus. Fix: Check
      läuft jetzt gegen `s.stats.lifetimeDM` (resettet nie, ist nur > 0 nach mindestens einer
      erfolgreichen Verschmelzung, jemals).

- [x] ~~**Neue Automation: Plasma-Upgrades automatisch kaufen, ab 2. Kollaps.**~~ — neues
      `s.star.autoUpgrades`, in `tick.ts` gegated hinter `MS_COLLAPSE[1]`. Kompakter "Auto"-
      Toggle direkt im "Plasma-Upgrades"-Klapp-Header (neue `.seg-btn.sm`-CSS-Variante für
      Inline-Buttons in Überschriften). Live geprüft: kauft zuverlässig alle bezahlbaren
      Upgrades, Klick auf den Toggle klappt die Sektion NICHT versehentlich zu (`btn()`s
      eingebautes `stopPropagation` funktioniert korrekt — ein per Koordinaten simulierter Klick
      des Testwerkzeugs hatte kurzzeitig etwas anderes vermuten lassen, ein direkter `.click()`
      bestätigte: kein echter Bug).

- [x] ~~**Neuer 4-Kollaps-Meilenstein: Supernova-Überreste überleben Verschmelzung UND
      Kollaps.**~~ — `MS_COLLAPSE` von `[1,2,3,5]` auf `[1,2,3,4,5]` erweitert (Keystones-Check
      dadurch von Index 3 auf Index 4 verschoben). Ohne diesen Meilenstein wurden `nova.remnants`
      bei JEDER Verschmelzung auf `[0,0,0]` zurückgesetzt — die Spezial-Meilenstein-Leiter für
      Remnants (ab 2 Kollapsen, je 10 eines Typs) konnte dadurch nie über einen einzelnen
      Galaxie-Run hinaus wachsen. Neuer i18n-Key `ms.col3` (alter `ms.col3` → `ms.col4`).

- [x] ~~**Auto-Toggles (Auto-Zündung, Auto-Supernova): unsichtbar, bis die Freischaltbedingung
      je erreicht wurde.**~~ — konkreter, vom User gemeldeter Bug: `autoNovaBtn` in `StarPanel`
      hatte GAR KEIN Sichtbarkeits-Gating (nur Dim/Aktiv-Klassen) — wer Auto-Supernova nie
      freigeschaltet hatte, sah trotzdem einen deaktivierten Knopf. Neue Lifetime-Flags
      `stats.autoIgniteSeen`/`autoNovaSeen` (einmal wahr, für immer wahr, gesetzt in `tick.ts`),
      ersetzen das vorherige `s.nova.unlocked`-Kriterium bei `autoBtn` (das nur lose mit der
      echten Freischaltung korrelierte) und werden neu bei `autoNovaBtn` angewendet. Danach
      bleibt der Knopf sichtbar, zeigt aber wieder den Dim-Zustand, falls die Bedingung durch
      einen späteren Reset (z. B. Kollaps) erneut unterschritten wird — genau wie gewünscht.

  tsc/vitest (46/46)/Build grün für die gesamte Runde. 10-Tage-Aktiv-Sim als Balance-Spotcheck
  gelaufen (siehe Ergebnis unten, falls dokumentiert).

## Erledigt (Stand 2026-07-07, elfte Runde)

- [x] ~~**Kritischer Bug: Dust bleibt dauerhaft bei 0 hängen (User-Save angehängt).**~~ — Save
      geladen und mit dem echten Core durchgetickt (gleiche Methodik wie beim Zeitdilatations-Bug):
      `dustPerSecond` war astronomisch hoch (gesund), aber `dust.amount` blieb exakt `0`, egal wie
      viele Ticks. Root Cause gefunden: `feedSplit()` (Runde 9, neuer Void-Split-Mechanismus)
      berechnete den Spielanteil als `gain.sub(gain.mul(FRAC))` — bei tetrationsgroßen Zahlen
      (`"eeX"`-Notation, hier `ee16.74`) sind `gain` und `gain × 0,5` intern UNUNTERSCHEIDBAR
      (Kapazität der Mantisse reicht bei dieser Größenordnung nicht mehr aus), die Subtraktion
      löscht sich komplett aus → exakt 0, bei JEDEM Tick, für immer. Betraf potenziell auch
      Plasma/Scherben/DM sobald sie dieselbe Größenordnung erreichen. Fix: direkte Multiplikation
      `gain.mul(1 - FRAC)` statt Subtraktion zweier fast identischer Werte — reine
      Mantissen-Skalierung, an jeder Größenordnung sicher. Neuer Regressionstest
      (`feedSplit credits a nonzero amount even at tetrational magnitudes`) reproduziert exakt
      diesen Fall. Mit dem echten User-Save über 500 Ticks nachverifiziert: Dust/Plasma/Scherben/
      DM/`sing.fed` wachsen jetzt alle wieder normal.

- [x] ~~**Auto-Supernova erzeugt immer Schwarze Löcher statt des gewählten Remnants + Scherben-
      Vorschau springt vor dem Deckel auf 0 (Video angehängt).**~~ — zwei Bugs, eine Ursache:
      der Auto-Trickle löste bei 100 % Akkumulation einen ECHTEN `supernovaReset()` aus (Fe/
      Elemente/Plasma komplett gewischt) UND nutzte dafür `lastRemnantChoice()` — eine Heuristik
      (häufigster bisheriger Typ), NICHT `s.ui.nextRemnant` (die tatsächliche Spieler-Auswahl,
      die der manuelle Knopf nutzt). Bei schnellem Trickle (Auto-Supernova feuert oft/Sekunde)
      wischte das ständig Fe — sah aus wie "Scherben-Gewinn resettet sich selbst", war aber Fe.
      Fix nach demselben Muster wie Auto-Zündung (die den Dust-Layer NIE resettet): Auto-
      Supernova löst bei 100 % keinen Reset mehr aus, zählt nur noch Meilenstein-Zähler
      (`supernovae`, `novaMs`) UND `nova.remnants[s.ui.nextRemnant]` hoch — Fe/Elemente/Plasma
      bleiben unangetastet, wachsen kontinuierlich weiter (Deckel wirkt weiterhin über die
      bestehende `shardClampMult`-Formel, jetzt aber ohne Wisch-Unterbrechung). Manuelles
      Auslösen bleibt ein echter Reset. Test entsprechend neu geschrieben + erweitert.

- [x] ~~**Pulsar-Spezialmeilenstein zeigt endlos weiter wachsende Dauer, auch nachdem der
      Pulsar längst permanent aktiv ist (kein Cooldown mehr übrig).**~~ — `remnantParams().
      pulsarDur` wuchs unbegrenzt mit der Remnant-Stufe weiter, obwohl ab Erreichen des vollen
      60-s-Zyklus (Stufe 5, 50 Pulsare) keine zusätzliche Dauer mehr etwas bewirkt (Burst ist ab
      da ohnehin permanent aktiv). Jetzt hart an `C.REMNANT_PULSAR_PERIOD` gedeckelt — Anzeige
      suggeriert keinen nicht-existenten weiteren Nutzen mehr. Test erweitert (Stufe 10 → weiterhin
      60 s statt roher 110 s).

- [x] ~~**Sauerstoff-Boost-Text umbricht zweizeilig und lässt alle Element-Reihen in der Höhe
      springen.**~~ — `.el-row .sub` bekommt jetzt eine feste `min-height` für zwei Zeilen
      (`2.4em`), unabhängig von der tatsächlichen Textlänge — betrifft alle sechs Element-Reihen
      gleichermaßen, nicht nur Sauerstoff, damit auch künftige (ggf. längere) Texte in beiden
      Sprachen keine Höhen-Sprünge mehr verursachen.

- [x] ~~**Galaxie-Reset-Bonus-Tooltip umformulieren + denselben Ausgleichs-Bonus auf die zwei
      Ebenen darunter anwenden.**~~ — Tooltip-Text nennt jetzt die REGEL statt nur die rohe
      Kollaps-Zahl ("wächst um +1 pro Kollaps, aktuell {n}" statt "aus {n} Collapse(s)").
      Zusätzlich: neue `effectiveIgnMs()`/`effectiveNovaMs()` in `formulas.ts` (derselbe
      `coalescenceBonusMult()`, jetzt auch auf die Zündungs- und Supernova-Meilenstein-Zähler
      angewendet) — ersetzen den rohen `stats.ignMs`/`stats.novaMs` überall im Gating
      (`autoIgniteUnlocked`, Kompressions-Persistenz, Plasma-Upgrade-Leiter, Max-Button-
      Freischaltungen) UND in der Anzeige (Meilenstein-Listen inkl. neuer Aufschlüsselungs-
      Tooltips, Achievement-Checks) — exakt dasselbe Muster wie `effectiveCoalescences` aus
      Runde 6, nur zwei Ebenen weiter unten angewendet. Live geprüft: `novaMs=4` bei 2 Kollapsen
      (Bonus ×3) zeigt korrekt "12× supernovae" statt roher "4×".

  Kritischer Fund dieser Runde: die `feedSplit()`-Katastrophe (Auslöschung bei tetrationsgroßen
  Zahlen) war ein waschechter, durch ein reales User-Save reproduzierter Bug aus Runde 9 — hätte
  ohne den angehängten Save vermutlich noch lange unentdeckt geblieben, da normale Sims (10 Tage)
  diese Größenordnung nicht erreichen. tsc/vitest (47/47)/Build grün. Save mit 500 Ticks
  nachverifiziert. 5-Tage-Sim als abschließender Balance-Spotcheck gelaufen.

## Erledigt (Stand 2026-07-07, zwölfte Runde — Performance)

- [x] ~~**Supernova-Tab wird bei aktivem Auto-Nova mit vielen Remnants extrem laggy
      (Screenshot: durchgängig weiß ausgebrannte Szene).**~~ — echter Speicher-Leak gefunden:
      `rebuildRemnants()` in `supernova.ts` baute PRO REMNANT eine komplett neue Geometrie/
      Material, beim Neutronenstern sogar eine eigene 128×128-CanvasTexture (`radialTexture()`,
      pro Aufruf frisch gerendert, nie gecacht) — und `remnantGroup.clear()` beim nächsten
      Rebuild gibt davon NICHTS frei (`.clear()` entfernt Kinder aus der Szene, disposed aber
      nichts). Bei aktivem Auto-Supernova ändert sich der Remnant-Count laufend → jeder Rebuild
      häufte ungenutzte GPU-Texturen/Geometrien weiter auf, nie freigegeben. Fix: Geometrien/
      Materialien/Texturen jetzt EINMAL im Konstruktor gebaut und über alle Remnant-Instanzen
      geteilt (`rebuildRemnants()` erzeugt nur noch leichte Mesh/Sprite/Group-Hüllen, nichts
      Einzigartiges mehr zu disposen). Zusätzlich pro Typ auf `MAX_RENDERED_PER_TYPE = 24`
      gedeckelt — ab da verschmelzen die additiv geblendeten Glows ohnehin optisch zu einem
      gesättigten Klumpen (exakt das Bild im gemeldeten Screenshot), mehr Objekte ändern am
      Ergebnis nichts mehr, kosten aber linear mehr Speicher/CPU. Live mit 500 Remnants pro Typ
      (1500 gesamt) geprüft: Szene bleibt klar erkennbar statt ausgebrannt, keine Konsolenfehler.

- [x] ~~**Warum ~1,5 GB Speicherverbrauch + hohe CPU-Last?**~~ — Engine/andere Szenen
      durchsucht: `engine.ts` (Composer, fester Burst-Partikel-Pool, ein Starfield) sowie
      Dust-/Star-/Galaxy-Szene sind sauber (feste Objekt-Anzahl, einmalig gebaut, keine
      Pro-Frame-Allokationen in `update()`) — der Supernova-Remnant-Leak oben war der einzige
      gefundene echte Leak und vermutlich der Hauptverursacher (wächst unbegrenzt über eine
      lange Session mit aktivem Auto-Nova, genau wie gemeldet).

- [x] ~~**~2 % CPU im Hintergrund-Tab, auch wenn nichts sichtbar ist.**~~ — `requestAnimationFrame`
      pausiert im Hintergrund-Tab zuverlässig (bereits diese Session bestätigt), ABER die
      Hintergrundmusik (`<audio loop>` + `AudioContext`-Graph in `audio/engine.ts`) läuft
      bewusst über Tab-Wechsel hinweg weiter — das ist der Hauptverursacher der gemeldeten
      Dauerlast, da Audio-Dekodierung/-Mixing auf einem eigenen, von rAF unabhängigen Thread
      läuft. Fix: `visibilitychange`-Handler in `AudioEngine` pausiert bei ausgeblendetem Tab
      sowohl die `<audio>`-Elemente als auch den `AudioContext` (`.suspend()`) und setzt beides
      beim Zurückkehren fort. Zusätzlich: der 2-Sekunden-Hint-Check-Timer in `main.ts` überspringt
      seine Arbeit jetzt ebenfalls bei `document.hidden` (kleinerer, aber kostenloser Zusatzfix).

  tsc/vitest (47/47)/Build grün. Live geprüft: 1500 Remnants rendern sichtbar undegradiert statt
  ausgebrannt; `visibilitychange`-Handler wirft keine Fehler.

## Offen

- [ ] **Challenges neu balancieren — aktuell viel zu leicht durch Automationen.** Sobald
      Auto-Attractor/-Accretion/-Compression/-Reaktoren, Auto-Zündung oder Auto-Supernova
      freigeschaltet sind (was bei den meisten Challenges, besonders Hard-Stufen ab 5 effektiven
      Verschmelzungen, längst der Fall ist), läuft die Challenge quasi von selbst durch —
      `enterChallenge()` in `actions.ts` setzt nur die Dust-Ebene zurück (`resetDustLayer`),
      Plasma-Upgrades UND alle Automationen bleiben aktiv und lösen die Challenge nahezu sofort.
      Braucht eine Design-Entscheidung: Automationen während Challenges deaktivieren? Challenge-
      Ziele relativ zur eigenen Automations-Stärke skalieren? Oder Automationen im Challenge-Modus
      bewusst schwächer/langsamer laufen lassen? Betrifft auch Hard-Stufen, die eigentlich die
      höhere Hürde sein sollen.

- [ ] **Projektordner umbenennen — blockiert, braucht eine Session außerhalb dieses Ordners.**
      `mv`/`Rename-Item` auf `3d incremental` → `stardust-to-singularity` scheitert mit
      "in Verwendung", sowohl über Bash als auch PowerShell — bestätigt per Test, dass ein
      Unterordner problemlos umbenennbar ist, nur der WURZEL-Ordner nicht: die aktuelle
      Claude-Code-Session hat genau diesen Ordner als Working Directory verankert, und der
      Harness stellt das nach jedem Tool-Aufruf automatisch wieder her (auch über `cd` hinweg
      nicht dauerhaft verlassbar). Umbenennen geht nur von AUSSERHALB dieses Ordners — entweder
      manuell (Explorer/Terminal, nachdem diese Session beendet ist) oder in einer neuen
      Claude-Code-Session mit Working Directory `C:\code\ai` statt `C:\code\ai\3d incremental`.
      Zielname `stardust-to-singularity` steht fest (passt zu `package.json`, GitHub-Repo,
      CLAUDE.md-Titel).

## Erledigt (Stand 2026-07-07, achte Runde)

- [x] ~~**Kritischer Regressions-Bug: Auto-Supernova verursachte Flackern + Fusionselemente immer
      0.**~~ — vom User per Screenshot gemeldet, direkte Folge des heutigen Zeitdilatations-Umbaus
      (Runde 6): `dilationMult(s)` wächst mit dem — selbst UNBEGRENZTEN — Akkretions-Bonus
      (`(log10(fed)+1)^2`), landete also für Saves mit sehr hohem `fed` bei absurden Werten. Per
      Test bestätigt: bei `fed=1e13000` (plausibel für den gemeldeten Save, Plasma stand bei
      `6.42e13941`) ergibt sich `speed ≈ 16,9 Mio.` — `gdt` (Spielzeit/Frame) sprengt dadurch JEDEN
      Sekunden-Akkumulator um Größenordnungen; der Auto-Supernova-Trickle überschreitet seine
      100-%-Schwelle nicht einmal, sondern um Tausende PRO FRAME → ein neuer Supernova-Reset bei
      praktisch jedem gerenderten Frame (60/s). Erklärt beide Symptome: Fusionselemente werden vor
      jeder sichtbaren Anzeige sofort wieder auf 0 zurückgesetzt, und die ständigen Resets
      verursachen das gemeldete Flackern. Fix: `DILATION_MAX_MULT = 50` in `constants.ts`,
      `dilationMult()` hart gedeckelt. Live verifiziert (`fed=1e13000` nachgestellt): vorher wäre
      das binnen 1 simulierter Sekunde ~60 Resets gewesen, nach dem Fix **0** — Wasserstoff
      akkumuliert wieder normal statt bei 0 zu kleben.
      **Dritte gemeldete Beobachtung ("Auto-Supernova zeigt nie Gelb") ist vermutlich KEIN Bug:**
      Styling-Logik live geprüft (`autoNovaUnlocked` true → Button zeigt korrekt `.active`/Gelb;
      false → korrekt `.dim`) — funktioniert wie im Code vorgesehen. Wahrscheinlichste Erklärung:
      der Save hat kürzlich einen Collapse gemacht (heutige Runde 6: Collapse setzt
      `stats.coalescences` zurück, der Ausgleichs-Bonus-Multiplikator muss erst durch neue
      Verschmelzungen wieder auf die 10-effektive-Verschmelzungen-Schwelle aufholen) — in der Zeit
      ist der Button absichtlich gesperrt/dim, kein separater Fehler. Müsste der User bestätigen,
      falls er einen Collapse gemacht hat.
