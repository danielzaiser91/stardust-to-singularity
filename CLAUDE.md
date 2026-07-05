# Stardust to Singularity — Projektregeln

3D-Incremental-Game (Browser/Mobile). Live: https://danielzaiser91.github.io/stardust-to-singularity/
Vollständiger Plan: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)

## Architektur-Invarianten

- `src/core/` ist **pur**: kein DOM-, Three- oder Audio-Import. Alles läuft headless (Sim, Tests, Offline-Progress nutzen exakt denselben `tick()`).
- **Alle Balance-Zahlen** stehen ausschließlich in `src/core/constants.ts`. Balance-Änderung = nur dort anfassen, dann Sim laufen lassen.
- Render (`src/render/`) und UI (`src/ui/`) lesen den State nur; Mutationen ausschließlich über `src/core/actions.ts`.
- RNG ist seedbar (`rngState` im GameState) — Determinismus nicht brechen (kein `Math.random()` im Core).
- Save-Format-Änderungen: neues Feld einfach in `initialState()` ergänzen (Template-Revive füllt Defaults); semantische Änderungen brauchen eine Migration in `src/core/save.ts` + `SAVE_VERSION`-Bump.

## Workflows

```bash
npm test          # Unit- + Balance-Tests (müssen vor jedem Push grün sein; CI blockt Deploy)
npm run sim -- --until endgame --profile active --maxDays 30   # Voll-Progression
npm run sim -- --until supernova_1 --profile idle              # gezielter Abschnitt
npm run dev       # Dev-Server; Browser-Konsole: dev.state(), dev.grant('dust.amount','1e30')
```

- Deploy: Push auf `main` → GitHub Actions (Test → Build → Pages). Kein manueller Deploy.
- CI nutzt `npm install` (nicht `ci`) — Windows-Lockfile lässt Linux-Optionals aus.
- Balance-Zielbänder stehen in `tests/balance.test.ts` (schnell) und IMPLEMENTATION_PLAN §5 (voll).

## Stolpersteine

- beforeunload-Autosave: Save-Löschung/-Ersetzung immer über `hardReset()`/`replaceSave()` (storage.ts), sonst überschreibt der Handler den Save wieder.
- `frame()`-Offline-Pfad: nach `simulateOffline` muss `last = performance.now()` neu gesetzt werden (sonst Re-Entry-Spirale).
- Additive Partikel-Shader übersteuern schnell: Alpha niedrig halten, Bloom-Threshold ≥ 0.6.
- Preview-Panel drosselt rAF, wenn unsichtbar → UI-Updates/Screenshots stehen; ist kein Spielfehler.
