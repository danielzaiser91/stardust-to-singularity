# TODO — Nach dem Launch

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

## Balance: Singularitäts-Endgame-Redesign (v1 spielbar bis Ebene 5 ~Tag 11)

- [ ] **Endgame-Durchstich per Langzeit-Sim validieren.** Der geometrische Motor ist
      eingebaut (Hawking-Strahlung: H-Rate ×2,5 je Level; Befund dazu in BALANCE.md:
      polynomielle Ökonomie vs. geometrische Leitern → Kriechgang nach Kollaps #1 ~Tag 11).
      Offen ist der Nachweis, dass der Motor die Kollaps-Kadenz ab #2/#3 trägt und das
      Endgame (2500 Entropie) in ~Tag 20–30 fällt: `npm run sim -- --until endgame
      --profile active --maxDays 40` (~30–60 min Rechenzeit). Falls die Hawking-Kosten
      (3×4^Level) dem Einkommen davonlaufen: Kostenwachstum 4→3 oder PERK_HAWKING_H 2,5→3.
- [ ] Idle-Voll-Progression bis Endgame simulieren (bisher bis Galaxie validiert: ~1,7× langsamer)

## Kleinkram

- [ ] Screenshots/GIF der 5 Szenen ins README (Browser-Capture; Preview-Panel war während der Entwicklung rAF-gedrosselt)

## Features (bewusst v1 ausgeklammert)

- [ ] Cloud-Saves (z. B. via Supabase/Firebase oder Google-Drive-Export)
- [ ] Leaderboards für NG+/Endless Mode
- [ ] Weitere Sprachen (FR/ES/PT — i18n-System ist vorbereitet)
- [ ] Steam-Release via Electron/Tauri-Wrapper
- [ ] Notation-Optionen (Buchstaben, Logarithmisch, Blind) wie AD
- [ ] Statistik-Panel mit Graphen (Ressourcen über Zeit)
- [ ] Discord-Release-Notifications (siehe globales Setup `/ai-implement-discord-news-automation`)
