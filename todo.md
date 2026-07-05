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

## Features (bewusst v1 ausgeklammert)

- [ ] Cloud-Saves (z. B. via Supabase/Firebase oder Google-Drive-Export)
- [ ] Leaderboards für NG+/Endless Mode
- [ ] Weitere Sprachen (FR/ES/PT — i18n-System ist vorbereitet)
- [ ] Steam-Release via Electron/Tauri-Wrapper
- [ ] Notation-Optionen (Buchstaben, Logarithmisch, Blind) wie AD
- [ ] Statistik-Panel mit Graphen (Ressourcen über Zeit)
- [ ] Discord-Release-Notifications (siehe globales Setup `/ai-implement-discord-news-automation`)
