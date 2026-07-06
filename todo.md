# TODO — Nach dem Launch

## Nächste Session — Rest-Bug + UI-Politur (Stand 2026-07-07)

- [ ] **"Max"-Button manchmal wirkungslos beim ersten Klick.** Nutzer-Report: Klick auf "Max"
      tut manchmal nichts; nach mehrmaligem Klicken (auch dazwischen auf andere Buttons) klappt
      es dann doch. Der Binärsuche-Fix vom 2026-07-07 (`affordGeometric` in
      `src/core/decimal.ts`) behebt den reproduzierbaren Fall (Protostern bei
      `1e8488739272450767` Staub — "Max" ging konsequent nicht, "Kaufe 1" schon), aber es gibt
      offenbar einen zusätzlichen FLAKY-Fall obendrauf, der noch nicht verstanden ist.
      Hypothesen zu prüfen:
      - Wettlauf zwischen UI-Update (10 Hz, `hud.update`) und Klick-Handler: Der
        `disabled`-Zustand wird periodisch neu berechnet, der Klick-Handler nutzt aber den
        Live-`dust.amount` zum Klickzeitpunkt — bei Werten hauchdünn an der Kostengrenze könnte
        ein Klick kurz vor einem Update-Tick auf leicht veralteten Daten aufsetzen.
      - `genMaxAfford`/`buyGeneratorMax` werden mehrfach mit potenziell leicht
        unterschiedlichem `dust.amount` aufgerufen (einmal für die Anzeige, einmal beim Klick) —
        die neue Binärsuche reagiert bei extremen Werten evtl. empfindlicher auf
        Mini-Schwankungen als die alte log()-Schätzung.
      - Reproduzieren: Save mit einer Stufe knapp unterhalb der "Max"-Kosten bauen, dann
        Schritt für Schritt vergleichen, was sich zwischen "klappt nicht" und "klappt nach
        mehreren Klicks" am State tatsächlich unterscheidet (evtl. Debug-Logging im
        Klick-Handler vs. im Update-Loop).

- [ ] **"Maximum"-Badge auf die Reaktor-Buttons ausweiten.** Das goldene "✦ Maximum!"-Badge
      (2026-07-06 eingeführt) muss die beiden zugehörigen Kauf-Buttons IMMER vollständig
      verdecken — bei den Staub-Generatoren und bei Kompression ist das bereits so gelöst
      (`.buy-wrap` + `.cap-badge`, position:absolute/inset:0, in `panels.ts`/`style.css`). Beim
      Durchgehen aber aufgefallen: Die Fusionsreaktor-Buttons im Stern-Panel (`reactorBtns`,
      `⚛ Reaktor` + `Max`) haben das Badge NICHT bekommen, obwohl `star.reactors[i]` über
      denselben `addCounter`-Mechanismus genauso bei `MAX_COUNTER` gedeckelt wird. Nachziehen:
      gleiches Muster (`buy-wrap`/`cap-badge`) auch für die Reaktor-Buttons in `StarPanel`
      einbauen, Bedingung `s.star.reactors[e] >= MAX_COUNTER`.

- [ ] **Nebelgarten-Tooltips kürzen.** Die Hex-Node-Tooltips (Emissions-/Reflexions-/
      Dunkelnebel) erklären aktuell zu ausführlich, u. a. mit "Dieser Nebel..."-Einleitung. Der
      ×2-pro-Nachbar-Mechanismus des Dunkelnebels ist selbsterklärend genug, muss nicht in
      jedem einzelnen Node-Tooltip wiederholt werden. Neues Ziel:
      - "Dieser Nebel..."-Einleitung weg.
      - Stattdessen kurz + prominent der EFFEKTIVE Gesamt-Multiplikator statt der Herleitung,
        z. B. "×8 Plasma- & Eisen-Gewinn".
      - Dunkelnebel-Tooltip knapp: "×2 für alle Nachbarn, die kein Dunkelnebel sind."
      - Generell: kurze Texte, maximaler Informationsgehalt, wichtigste Info zuerst + prominent
        (gleiche Linie wie die Tooltip-Überarbeitung vom 2026-07-06 — resTag/numTag-Hervorhebung
        nutzen wo sinnvoll).
      - Betroffene Stellen: `src/ui/panels.ts` Hex-Grid-Tooltips, i18n-Keys `nova.hexEmTip`,
        `nova.hexReTip`, `nova.hexReTipFe`, `nova.hexDarkTip`, `nova.hexDarks` in
        `src/i18n/de.ts` + `en.ts`.

- [ ] **Challenge-Karten grundlegend überarbeiten (Normal/Hart-Toggle raus).** Ausgangsproblem:
      Spieler ignorieren Hard tendenziell, weil die Normal-Kachel schon grün + Häkchen zeigt
      ("fertig, weiter geht's") — das Hart-Toggle geht in der Kachel visuell unter. Statt nur
      einen Hinweis obendrauf zu setzen, den manuellen Normal/Hart-Toggle-Button komplett
      entfernen und durch ein Design ersetzen, das den Zustand automatisch zeigt. Nur zwei
      Zustände statt manuellem Umschalten:
      1. **Hart noch nicht freigeschaltet** — Karte zeigt wie bisher nur die normale Challenge.
      2. **Hart freigeschaltet** (Normal ist dann per Definition immer schon geschafft) — Karte
         zeigt automatisch die HARTE Challenge als nächstes Ziel: Einschränkung/Ziel-Text und
         Start-Button-Label wechseln auf Hart (Label muss sichtbar machen, dass Hart gestartet
         wird — kein Rätselraten, kein manueller Switch mehr nötig). Bei der Belohnung soll der
         Sprung von der bereits aktiven (Normal-)Belohnung zur neuen (Hart-)Belohnung sichtbar
         sein. Zwei Gestaltungs-Optionen abwägen (Beispiel Singulärer Fokus: Attraktoren ×8 → ×16):
         - **Variante A:** Eine Zeile "Belohnung: ×8 → ×16", wobei ×16 (neu/Ziel) prominenter
           gestylt ist als ×8 (bereits aktiv/besessen).
         - **Variante B:** Zwei getrennte Bereiche — "Aktiver Effekt: ×8" (was gerade wirkt) und
           "Belohnung: ×16" (schlicht wie aktuell, kein Vergleich nötig, da schon im eigenen
           Bereich als Ziel erkennbar).
      Wenn Hart ebenfalls geschafft ist: vollständig abgeschlossenen Endzustand zeigen (kein
      weiterer Handlungsbedarf, aber Karte bleibt informativ). Betroffene Stelle:
      `src/ui/panels.ts` Challenge-Karten (`hardUnlockable`-Logik, `.ch-toggle`-Segment,
      `viewTier`-State komplett überdenken/entfernen).

- [ ] **Meta-Texte raus, die den Spieler direkt ansprechen — durch immersive Texte ersetzen.**
      Fällt aus dem Ton des Spiels: z. B. der Maximum-Tooltip "Diesen Punkt zu sehen ist selten:
      gut gespielt!" (`misc.capReachedTip`, 2026-07-06 eingeführt) spricht den Spieler direkt an
      wie eine Erfolgsmeldung/UI-Copy, statt in der Spielwelt zu bleiben (Staub/Sterne/Physik-
      Fiktion). Zwei Teilaufgaben:
      1. Gezielt `misc.capReachedTip` (und ggf. ähnliche Stellen wie Achievement-/Lore-Toasts)
         auf direkte Anrede prüfen und durch einen Text ersetzen, der in der Fiktion bleibt
         (z. B. Beschreibung eines physikalischen Grenzzustands statt Meta-Kommentar zum
         Spielverhalten).
      2. **Generell einmal alle Texte durchgehen** (`src/i18n/de.ts` + `en.ts`, beide Sprachen
         synchron halten) und wo nötig durch bessere, zum Setting passende, immersive
         Formulierungen ersetzen — nicht nur die eine Stelle. Kandidaten zuerst prüfen: alles,
         was diese Session neu/geändert wurde (Tooltip-Überarbeitung, Cap-Badges,
         Automation-Beschreibungen), da dort am ehesten Meta-Ton reingerutscht ist.

- [ ] **Challenges-Sektion einklappbar machen.** Der "CHALLENGES"-Bereich im Supernova-Panel
      (`panels.ts`, `NovaPanel`) soll ein-/ausklappbar sein (Klick auf die Überschrift o. ä.),
      damit er nicht dauerhaft Platz wegnimmt, wenn man ihn nicht braucht. Der Klapp-Zustand muss
      im Savegame persistiert werden (überlebt Reload) — neues Feld in `GameState.ui`
      (z. B. `challengesCollapsed: boolean`), einfach in `initialState()` ergänzen (Template-
      Revive füllt bei alten Saves automatisch den Default, keine Migration nötig laut
      CLAUDE.md-Regel für additive Save-Felder).
      Zusätzlich: solange eingeklappt, braucht die Überschrift einen Farb-Indikator + Tooltip,
      damit man im eingeklappten Zustand nicht vergisst, dass da noch was offen ist:
      - **Grün**: alle (aktuell freigeschalteten/erreichbaren) Challenges abgeschlossen.
      - **Gelb/Orange o. ä.**: mindestens eine offen — Signal "hier gibt's noch was zu tun".
      - Tooltip zeigt den konkreten Stand (z. B. "X/8 Challenges abgeschlossen" bzw. welche
        noch offen sind).
      - **Entschieden:** gesperrte Hart-Stufen zählen NICHT mit (kein Gelb nur weil Hart noch
        nicht freigeschaltet ist); freigeschaltete Hart-Stufen zählen mit (noch offenes
        freigeschaltetes Hart hält den Indikator auf Gelb, auch wenn alle Normal-Stufen fertig
        sind). Konkreter Übergang: Sind alle Normal-Stufen fertig, ist der Indikator GRÜN — sobald
        aber Hart für (mind.) eine Challenge freigeschaltet wird, kippt er direkt auf die
        "noch offen"-Farbe (Gelb/Orange), auch wenn der Spieler die Hart-Stufe noch gar nicht
        angefasst hat. Erst wenn auch alle freigeschalteten Hart-Stufen geschafft sind, wird er
        wieder grün.

- [ ] **`/ai-improve-learnings` ausführen.** Diese Session hatte einiges an nicht-offensichtlichen
      Lehren (Decimal-Präzisionsgrenzen bei extremen Skalen in drei verschiedenen Ausprägungen,
      Versionsschema-Umstellung, verwaiste Hintergrundprozesse) — in die generischen
      Agent-Learnings einpflegen, bevor sie wieder vergessen werden.

## Weitere Deploy-Plattformen (zum Testen nach GitHub Pages)

- [ ] **Netlify** — Drag&Drop des `dist/`-Ordners oder Repo-Verknüpfung; Build: `npm run build`, Publish-Dir: `dist`, Base im Vite-Config auf `/` stellen (env-Variable `DEPLOY_BASE` vorbereitet). Kostenlos, eigene Subdomain `*.netlify.app`.
- [ ] **Vercel** — Repo importieren, Framework-Preset „Vite", sonst wie Netlify. Subdomain `*.vercel.app`.
- [ ] **itch.io** — bekannteste Indie-/Web-Game-Plattform mit großer Incremental-Community. ZIP von `dist/` (mit `base: './'` gebaut) hochladen, „HTML-Game" + „Played in browser" aktivieren. Tags: incremental, idle, clicker, 3d. Butler-CLI für automatisierte Uploads: `butler push dist danielzaiser91/stardust-to-singularity:html`.
- [ ] **Newgrounds** — klassische Web-Game-Plattform, HTML5-Upload, eigene Incremental-Szene.
- [ ] **CrazyGames** — großes Web-Gaming-Portal, nimmt Idle/Clicker aktiv an (Submission-Review, QualityGate; SDK-Integration optional für Save-Sync).
- [ ] **Poki** — kuratiertes Web-Game-Portal, hohe Reichweite, Submission nötig.
- [ ] **Armor Games** — Submission-basiert, Idle-Kategorie vorhanden.
- [ ] **Kongregate** — historisch DIE Incremental-Plattform (Anti-Idle etc.), nimmt weiterhin HTML5-Uploads.
- [ ] **galaxy.click** — neue, von der Incremental-Community betriebene Plattform (Nachfolger-Spirit von Kongregate), sehr passende Zielgruppe.
- [ ] Reddit r/incremental_games — kein Hoster, aber Launch-Post („WIP Wednesday" / „Feedback Friday") für erste Spieler.

## Balance: Singularitäts-Endgame-Redesign — VALIDIERT, Problem bestätigt, braucht Design-Entscheidung

- [x] ~~Endgame-Durchstich per Langzeit-Sim validieren~~ — erledigt: 40-Tage-Lauf (aktiv, Seed 42)
      erreicht nur 2 Kollapse, Endgame (2500 Entropie) NICHT erreicht.
- [x] ~~Idle-Voll-Progression bis Endgame simulieren~~ — erledigt: 60-Tage-Lauf, nur 1 Kollaps.
- [ ] **Echten Fix finden (Design-Entscheidung nötig, kein Constants-Tweak mehr versuchen).**
      Zwei Hawking-Kosten-Fixes wurden geprüft und beide verworfen (einer wirkungslos, einer
      schädlich — Details + Diagnose in BALANCE.md „Endgame-Kalibrierung"). Das Problem ist
      strukturell: Die quadratische Kollaps-Leiter wächst schneller, als das Entropie-finanzierte
      Perk-System aufholen kann, UND alle Perks konkurrieren um dasselbe knappe Frühspiel-Budget.
      Kandidaten-Hebel (siehe BALANCE.md für Details, einer oder mehrere nötig):
      1. Eigener, höherer Gain-Clamp für Entropie speziell (Rückwirkung auf NG+-Pacing prüfen)
      2. Hawking aus der Perk-Kosten-Konkurrenz lösen (separates Finanzierungsmodell)
      3. Kollaps-Leiter entschärfen (`COLLAPSE_REQ_GROWTH` senken/Exponent ändern)
      4. Akzeptieren: Endgame liegt bewusst > Tag 40, Zielsetzung entsprechend anpassen
      Braucht eine Entscheidung, welcher Hebel gezogen wird, bevor weiter umgesetzt wird.

## Kleinkram

- [ ] Screenshots/GIF der 5 Szenen ins README (Browser-Capture; Preview-Panel war während der Entwicklung rAF-gedrosselt)

## Feature-Ideen (User)

- [x] ~~**Challenge-Schwierigkeitsstufen**~~ — erledigt (2026-07-06): Hard-Tier pro Challenge
      ab 5 Coalescences, `nova.completedTier: number[]`, eigene Ziel-Multiplikatoren
      (`CH_GOAL_MULT_TIER2`), Karten-UI mit Normal/Hart-Toggle.

## Features (bewusst v1 ausgeklammert)

- [ ] Cloud-Saves (z. B. via Supabase/Firebase oder Google-Drive-Export)
- [ ] Leaderboards für NG+/Endless Mode
- [ ] Weitere Sprachen (FR/ES/PT — i18n-System ist vorbereitet)
- [ ] Steam-Release via Electron/Tauri-Wrapper
- [ ] Notation-Optionen (Buchstaben, Logarithmisch, Blind) wie AD
- [ ] Statistik-Panel mit Graphen (Ressourcen über Zeit)
- [ ] Discord-Release-Notifications (siehe globales Setup `/ai-implement-discord-news-automation`)
