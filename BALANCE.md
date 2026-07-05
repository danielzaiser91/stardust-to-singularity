# Balance-Modell

Wie „Stardust to Singularity" sein Pacing erzwingt — und warum. Alle Zahlen leben in
[src/core/constants.ts](src/core/constants.ts), validiert durch `npm run sim` und `tests/balance.test.ts`.

## Die vier Pacing-Mechanismen

Incremental-Engines mit Buy-Max-Autobuyern wachsen **super-exponentiell** — jede naive Formel
explodiert (das haben unsere Simulationen wiederholt bewiesen: Singularität nach 5 Stunden,
NaN-Overflows, 47.000 Zündungen/Tag). Vier Mechanismen halten die Progression in Form:

1. **Softcaps auf Prestige-Gains** (`GAIN_SOFTCAP`, `GAIN_TAIL_EXP`):
   `gain = ratio^exp` gilt nur bis ratio 1e3, darüber nur noch `^0.2`.
   Verhindert, dass ein einzelner Overkill-Run eine Ebene trivialisiert.
   Der wichtigste Einzelfall: **Plasma** — ohne diesen Cap divergiert die Schleife
   Plasma → Staubproduktion → Plasma binnen Minuten (empirisch: e4 → e131 in 20 Runs).

2. **Gain-Clamp** (`GAIN_CLAMP_MULT`): Kein Reset kann die Gesamtsumme einer Prestige-Währung
   mehr als vervierfachen (`gain ≤ total×3 + 10`). Damit ist Layer-Leapfrogging *mathematisch
   unmöglich*, egal wie sehr die Engine darunter explodiert. Wachstum = Reset-Kadenz.

3. **Aufladezeiten** (`*_MIN_TIME`): Voller Gain erst 10 min (Supernova) / 40 min (Galaxie) /
   2 h (Kollaps) nach dem letzten Reset der Ebene. Setzt der Kadenz einen Boden;
   thematisch: der Kern muss sich anreichern.

4. **Eskalierende Anforderungen** (`*_REQ_GROWTH`): Jede Supernova ×2,5 Fe, jede Galaxie ×6
   Scherben, jeder Kollaps ×12 DM. Die Engine wächst schneller als die Anforderung —
   aber die Gains sind geclampt, also bleibt die Kadenz der Taktgeber.

## Kaskade ohne Whiplash

Jede Prestige-Währung boostet die Ebenen darunter — aber auf Basis von **Lifetime-Summen**
(`stats.lifetimeShards`, `stats.lifetimeDM`, `sing.totalEntropy`), die nie zurückgesetzt werden.
Ein Prestige fühlt sich dadurch nie wie ein Rückschritt an (früher Fehler: nach dem ersten
Kollaps war das Spiel *langsamer* als davor, weil die Passiveffekte am Run-Total hingen).

## Gelernte Anti-Patterns (nicht wieder einführen!)

- **Effekte in Exponenten stapeln**: Dunkelnebel verdoppelten ursprünglich den *Exponenten*
  der Nachbarzellen → 3^64 ≈ 1e30 Boost aus einem Hexfeld. Effekte immer multiplikativ
  und linear stapeln.
- **`Math.pow` für unbeschränkte Zähler**: `Math.pow(1.25, compression)` überläuft bei
  ~5000 Stufen zu `Infinity` und vergiftet den State mit NaN. Für alles Unbeschränkte
  `Decimal.pow` nutzen.
- **Challenge = voller Layer-Reset**: Der Bot (und echte Spieler) verlieren sonst beim
  Betreten alles und stecken in einer Frust-Schleife. Challenges resetten nur die Dust-Ebene
  und haben eigene, eskalierende Ziele (`CH_GOAL_MULT`) plus Freischaltung über
  Supernova-Zähler (`CH_UNLOCK_NOVAE`).

## Ziel-Timeline (aktives Spiel, per Sim validiert)

| Meilenstein | Ziel |
|---|---|
| Erste Ignition | 20–60 min |
| Erste Supernova | ~4 h |
| Erste Galaxie | Tag 0,5–1 |
| Erste Singularität | Tag 1–3 |
| Endgame (Neues Universum) | Tag 6–14 |

Idle-Profil entsprechend ~1,5–2,5× langsamer. Prüfen mit:
`npx tsx src/sim/run.ts --until endgame --profile active --maxDays 30`
