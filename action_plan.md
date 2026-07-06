# Action Plan — offene Punkte nach Priorität

Veröffentlichungsplattformen (Steam, itch.io, Netlify/Vercel, Newgrounds, CrazyGames, Poki, Armor
Games, Kongregate, galaxy.click, Reddit-Launch-Post) sind hier bewusst ausgeklammert — siehe
[todo.md](todo.md) für die vollständige Liste.

Fortschritt-Legende: ⬜ offen · 🔄 in Arbeit · ✅ erledigt · ⏸️ blockiert/wartet auf User

## P1 — Balance-Absicherung

| Aufgabe | Dein Zeitaufwand | Ablauf | Fortschritt |
|---|---|---|---|
| Endgame-Sim validieren (`--until endgame --profile active --maxDays 40`) | ~0 min | Erster Lauf (Seed 42): nur 2 Kollapse in 40 Tagen, Endgame NICHT erreicht — Kollaps-Leiter läuft dem Hawking-Motor davon (genau das im todo.md befürchtete Risiko). Fix angewendet: `PERK_COST_GROWTH[1]` (Hawking-Level-Kosten) 4→3, siehe BALANCE.md. Re-Validierungslauf läuft jetzt im Hintergrund | 🔄 Fix angewendet, Re-Validierung läuft |
| Idle-Voll-Progression bis Endgame simulieren | ~0 min | Läuft parallel im Hintergrund (mit altem Perk-Kostenwert gestartet — vor dem Hawking-Fix; Ergebnis dient als Referenz, nicht als finale Freigabe) | 🔄 läuft im Hintergrund |

## P2 — Kleinkram: Screenshots/GIF fürs README

| Aufgabe | Dein Zeitaufwand | Ablauf | Fortschritt |
|---|---|---|---|
| Screenshots der 5 Szenen einfangen | ~5 min | Preview hochfahren, Spielstände je Ebene setzen, automatisiert Screenshots schießen, ins README einbauen; du schaust kurz drüber | ⏸️ blockiert — `preview_screenshot` hängt zuverlässig (bekannter rAF-Drosselungs-Effekt bei unsichtbarem Panel, kein Spielfehler, s. CLAUDE.md). Braucht manuellen Screenshot von dir aus dem echten Browser, oder ich versuche später einen anderen Ansatz |

## P3 — Feature: Challenge-Schwierigkeitsstufen (User-Idee)

| Schritt | Dein Zeitaufwand | Was passiert | Fortschritt |
|---|---|---|---|
| Design-Fragen klären | ~10–15 min | 2 Stufen, Hard = nur höheres Ziel (gleiche Restriktion), Belohnung pro Challenge individuell entschieden, Freischaltung über Coalescence-Meilenstein (5) + Normal muss zuerst stehen | ✅ erledigt |
| Implementierung | ~0 min | State-Migration (`completed: boolean[]` → `completedTier: number[]`, Save v3→v4), Formeln (Belohnung stapelt je Challenge individuell), UI (Hard-Button + Info-Zeilen, reserviert Platz), Tests (40 grün), Sim-Sanity-Check, Deploy | ✅ erledigt |
| Review nach Deploy | ~5 min | Kurz anspielen, Feedback | ⬜ — steht noch aus, sobald live |

## P4 — Zurückgestellte Features (nur auf Zuruf, nach Aufwand sortiert)

| Feature | Dein Zeitaufwand | Warum diese Reihenfolge | Fortschritt |
|---|---|---|---|
| Notation-Optionen (Buchstaben/Log/Blind wie AD) | ~2 min | Reines Feature, keine Infrastruktur | ⬜ |
| Statistik-Panel (Ressourcen über Zeit) | ~5 min | Nur UI + Datenpunkte, kein Backend | ⬜ |
| Discord-Release-Notifications | ~10–15 min | Setup-Skript existiert schon (`/ai-implement-discord-news-automation`) | ⬜ |
| Weitere Sprachen (FR/ES/PT) | ~20–30 min/Sprache (Gegenlesen) oder ~2 min (Vertrauen) | i18n-System vorbereitet | ⬜ |
| Cloud-Saves (Supabase/Firebase) | ~30–45 min | Braucht Account + API-Keys, Anbieter-Entscheidung, Auth-Flow | ⬜ |
| Leaderboards (NG+/Endless) | ~10 min zusätzlich nach Cloud-Saves | Baut auf demselben Backend auf | ⬜ |
| Steam-Release (Electron/Tauri) | — | Veröffentlichung — ausgeklammert | ⬜ |

## Gesamtzeit von dir

- **P1 + P2:** ~5 Minuten, Rest läuft autonom
- **P3:** ~15–20 Minuten für ein neues Spiel-Feature
- **P4:** gestaffelt, nur auf Zuruf — Cloud-Saves/Leaderboards einziger Block mit echtem Infrastruktur-Aufwand
