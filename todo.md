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

- [x] ~~**Nebelgarten-Tooltips kürzen.**~~ — erledigt (2026-07-07): "Dieser Nebel..."-Einleitung
      raus, Tooltips zeigen jetzt direkt den Effekt (`{v} Staub-Produktion` etc.). Dunkelnebel:
      "{v} für alle Nachbarn, die kein Dunkelnebel sind" (v = numTag-hervorgehobener Bonus).
      `hexDarks`/`hexDarkTip` auf reine Live-Zahl gekürzt (Nachbarn-Anzahl), ohne die
      ×2-Erklärung zu wiederholen.

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

- [x] ~~**Meta-Texte raus, die den Spieler direkt ansprechen.**~~ — erledigt (2026-07-07):
      `misc.capReachedTip` ("...gut gespielt!") ersetzt durch eine Beschreibung des physikalischen
      Grenzzustands ("Am Rand der Zahlendarstellung — diese Größenordnung lässt sich technisch
      nicht weiter steigern."), bleibt in der Fiktion statt den Spieler zu loben. Breiter
      Grep über `de.ts`/`en.ts` nach ähnlichen Mustern (gespielt/Respekt/beeindruckend/well
      played/impressive/congrat*) fand keine weiteren Treffer — war offenbar die einzige Stelle
      dieser Art. Die restlichen heute geänderten Texte (Automation-Beschreibungen, Cap-Badge,
      Reward-Label) sind sachliche System-/Mechanik-Beschreibungen wie der Rest des
      Upgrade-Texts im Spiel, keine Meta-Kommentare — keine weitere Umformulierung nötig.

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
