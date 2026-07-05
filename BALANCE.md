# Balance-Modell

Wie „Stardust to Singularity" sein Pacing erzwingt — und warum. Alle Zahlen leben in
[src/core/constants.ts](src/core/constants.ts), validiert durch `npm run sim` und `tests/balance.test.ts`.

## Die vier Pacing-Mechanismen

Incremental-Engines mit Buy-Max-Autobuyern wachsen **super-exponentiell** — jede naive Formel
explodiert (das haben unsere Simulationen wiederholt bewiesen: Singularität nach 5 Stunden,
NaN-Overflows, 47.000 Zündungen/Tag). Vier Mechanismen halten die Progression in Form:

1. **Frequenzskalierte Gain-Clamps** (`GAIN_CLAMP_MULT`, `PLASMA_CLAMP_MULT`): Kein Reset kann
   die Gesamtsumme seiner Prestige-Währung um mehr als einen festen Faktor heben — ×20 für den
   30-Sekunden-Innenloop (Plasma), ×4 für die äußeren Ebenen (Shards/DM/Entropie). Damit ist
   Layer-Leapfrogging *mathematisch unmöglich*, egal wie sehr die Engine darunter explodiert.
   Wachstum = Reset-Kadenz × Clamp-Faktor. Der Faktor MUSS zur Schleifenfrequenz passen:
   ×4 auf dem Innenloop verhungert die Fe-Pipeline, kein Clamp auf dem Innenloop divergiert.

2. **Lokale Anforderungs-Leitern**: Jede Supernova ×2,5 Fe, jede Galaxie ×6 Scherben — aber
   die Zähler (`nova.count`, `galaxy.count`) resetten mit dem Eltern-Layer. Frische Galaxie =
   frische Leiter. Lebenslange Zähler erzeugen permanente Walls (empirisch: Fe-Anforderung
   e3548 nach 8908 Novae) und brechen NG+.

3. **Quadratische Kollaps-Leiter** (`collapsesU`, Exponent n(n+1)/2): Die oberste Ebene braucht
   eine Leiter, die der beschleunigende DM-Motor nicht einholen kann — geometrisch reicht nicht
   (empirisch: 4 Kollapse/Tag bei ×8). Der Zähler resettet bei NG+ („New Universe").

4. **Aufladezeiten + Softcap** (`*_MIN_TIME`, `GAIN_SOFTCAP`): Voller Gain erst 10 min /
   40 min / 2 h nach dem letzten Reset der Ebene (Kadenz-Boden; thematisch: der Kern muss
   sich anreichern). Der Plasma-Softcap (Tail ^0,2 ab ratio 1e3) glättet zusätzlich
   Overkill-Spitzen im Frühspiel.

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

## Gemessene Timeline (aktives Optimalspiel, Sim-Bot, Seed 42)

| Meilenstein | gemessen |
|---|---|
| Erste Ignition | ~28 min (idle: ~37 min) |
| Erste Supernova | ~4 h (idle: ~7 h) |
| Erste Galaxie | ~Tag 1 |
| Erste Singularität | ~Tag 5–7 |
| Endgame (Neues Universum) | ~Tag 12–20 |

Ein menschlicher Spieler ohne Optimal-Strategie liegt darüber — das Spiel trägt damit
komfortabel 2+ Wochen. Feinkalibrierung der Singularitäts-Phase steht in todo.md.
Prüfen mit: `npx tsx src/sim/run.ts --until endgame --profile active --maxDays 30`
