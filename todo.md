# TODO — Aktuelle Session

Längerfristige/optionale Punkte stehen in [BACKLOG.md](BACKLOG.md).

## Nächste Session — Rest-Bug + UI-Politur (Stand 2026-07-07)

- [x] ~~**"Max"-Button manchmal wirkungslos beim ersten Klick.**~~ — untersucht (2026-07-07):
      Kernlogik ist deterministisch (30 identische Testläufe bei moderater UND bei
      MAX_COUNTER-naher Größenordnung — immer dasselbe Ergebnis, kein Bug in
      `affordGeometric`/`buyGeneratorMax`). Ursache ist die 10-Hz-Update-Lücke: der
      `disabled`-Zustand wird nur alle 100 ms neu berechnet, während Autobuyer/Produktion jeden
      Frame (60 Hz) den Staub verändern — knapp an der Kostengrenze kann ein Klick auf einen
      Button treffen, der gerade eben (still) unbezahlbar geworden ist. Fix: kein Race-Fix nötig,
      sondern Feedback bei Fehlschlag — `flashDenied()` in `dom.ts` (kurzes Schütteln + Rot-Rand,
      `button.denied` in `style.css`) auf alle Kauf-Buttons verdrahtet (Generatoren, Kompression,
      Reaktoren), damit ein wirkungsloser Klick sichtbar als "gerade nicht leistbar" statt als
      Aussetzer wirkt.

- [x] ~~**"Maximum"-Badge auf die Reaktor-Buttons ausweiten.**~~ — erledigt (2026-07-07): gleiches
      `buy-wrap`/`cap-badge`-Muster wie bei Generatoren/Kompression jetzt auch für die
      Fusionsreaktor-Buttons in `StarPanel`, Bedingung `s.star.reactors[e] >= MAX_COUNTER`.

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

- [x] ~~**Challenge-Karten grundlegend überarbeiten (Normal/Hart-Toggle raus).**~~ — erledigt
      (2026-07-07): manueller Toggle komplett entfernt, `chNextTier()` bestimmt automatisch die
      anzuzeigende Stufe (null = nichts zu tun: Hart fertig ODER Hart noch nicht freigeschaltet).
      Umgesetzt als **Variante B**: eigene "✓ Aktiver Effekt"-Zeile (bester geschaffter Bonus,
      grün beschriftet) getrennt von "🏆 Belohnung" (Vorschau der nächsten Stufe) — kein
      Zahlen-Vergleich in einer Zeile nötig. Start-Button-Label nennt die Zielstufe ("Normal
      starten"/"Hart starten"). Vier Zustände live geprüft: nichts geschafft, Normal fertig
      (Hart gesperrt → nur Aktiver-Effekt, kein Ziel), Normal fertig + Hart freigeschaltet
      (Aktiver Effekt + Hart-Ziel/Belohnung/Start), Hart fertig (nur Aktiver Effekt, Endzustand).
      Auch **Challenges-Sektion einklappbar** umgesetzt: Klick auf Überschrift toggelt
      `s.ui.challengesCollapsed` (persistiert), Farb-Punkt + Tooltip zeigen den
      Gesamtstatus (grün = alle freigeschalteten fertig, gelb = noch was offen — kippt exakt
      dann auf Gelb, wenn Hart für irgendeine Challenge freigeschaltet wird, wie festgelegt).

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
