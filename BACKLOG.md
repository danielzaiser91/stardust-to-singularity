# Backlog — Später prüfen

Längerfristige/optionale Punkte, keine akute Session-Arbeit. Verschoben aus `todo.md` am 2026-07-07,
damit dort nur die aktuell laufende Session-Liste steht.

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
