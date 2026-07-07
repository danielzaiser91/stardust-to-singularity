# TODO — Aktuelle Session

Längerfristige/optionale Punkte stehen in [BACKLOG.md](BACKLOG.md).

## Erledigt (Stand 2026-07-07, vierte Runde)

- [x] ~~**"Coalescence" im Deutschen zu "Verschmelzung" vereinheitlicht.**~~ — erledigt:
      `stat.coalescences` war bereits "Verschmelzungen", aber 8 weitere Stellen
      (`nova.reFeOn`/`reFeLocked`, `galaxy.autoNovaLock`, `perk.8d`, `ms.u.gal`,
      `ms.gal2`/`3`/`4`/`6`) sagten noch "Coalescence(s)". Alle auf "Verschmelzung"/
      "Verschmelzungen" umgestellt. Englisch bleibt "Coalescence" — nur die deutsche
      Lokalisierung war gemeint.

## Offen

- [ ] **"Füttere die Leere" (Feed the Void) überarbeiten — fühlt sich aktuell schlecht an.**
      Manuelles Button-Drücken mit kaum spürbarem Effekt (Akkretions-Bonus wächst nur
      logarithmisch mit der gefütterten Masse, `FEED_ACCRETION_EXP` in `formulas.ts`).
      Ideenskizze vom Spieler: automatisch/passiv füttern statt Knopfdruck — z. B. permanent
      50 % des gesamten Ressourcen-Gewinns abzweigen und direkt in den Akkretions-Bonus
      umwandeln, statt manuell auf 0 zu setzen. Braucht eine echte Design-Entscheidung (Formel,
      Balance-Auswirkung, ob der Button dann noch existiert oder nur noch der Fütterungs-
      Fortschritt angezeigt wird) — kein reiner Constants-Tweak.

- [ ] **Nebelgarten-Gesamtbonus nicht ressourcenfarbig hervorgehoben.**
      `gardenTotal` (`panels.ts`, Text `nova.gardenTotal`/`nova.gardenTotalFe`) nutzt reines
      `setText` ohne `resTag` — anders als die Ignite/Nova/Coalesce/Collapse-Gewinn-Labels, die
      genau diese Art Bonus-Wert farbig+iconisiert zeigen. Auf `setHTML` +
      `resTag('dust', ...)`/`resTag('plasma', ...)` umstellen, analog zum kürzlich gefixten
      "Füttere die Leere"-Text.

- [ ] **Auto-Supernova soll wie Auto-Zündung umgesetzt werden.**
      Aktuell ist Auto-Supernova eine schlichte HTML-Checkbox + Label in `GalaxyPanel`
      (`autoChk`/`autoRow`) — UND sitzt auf einem anderen Tab (Galaxy) als der eigentliche
      SUPERNOVA-Button (Star-Tab), obwohl Auto-Zündung als hübscher `seg-btn auto-btn`-Toggle
      direkt NEBEN dem ZÜNDEN-Button in `DustPanel` sitzt (mit Active/Dim-States + Tooltip).
      Auto-Supernova auf dasselbe Toggle-Button-Muster umstellen und neben den
      SUPERNOVA-AUSLÖSEN-Button in `StarPanel` verschieben, statt in der
      Galaxy-Konstellations-Ansicht zu leben.
