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
